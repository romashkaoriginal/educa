const axios = require('axios');
const { Bot: TelegramBot } = require('node-telegram-bot-api');
const { User, BotUser, Application, ProblemReport } = require('./models');
const { refreshWebAppUrl, getWebAppUrlSync } = require('./utils/webAppUrl');
const { parseUtm } = require('./utils/utm');
const { getBotUserUtmFields } = require('./services/botUserUtm');
const guestAccess = require('./services/guestAccess');
const { findParentForTelegramUser } = require('./services/parentIdentity');
const { claimPendingStudent } = require('./services/systemUserIdentity');
const { normalizeTelegramUsername } = require('./services/telegramIdentity');
const problemReportImages = require('./services/problemReportImages');
const { sendTelegramMessage } = require('./services/telegramDelivery');
const { SUPER_ADMIN_TELEGRAM_ID } = require('./middleware/superAdmin');

const token = process.env.BOT_TOKEN;

let bot = null;
let telegramBot = null;

function createDeliveryBot(instance) {
  return {
    sendMessage(chatId, text, options = {}) {
      return instance.api.sendMessage({ chat_id: chatId, text, ...options });
    },
    deleteWebHook(options = {}) {
      return instance.api.deleteWebhook(options);
    },
    answerCallbackQuery(callbackQueryId, options = {}) {
      return instance.api.answerCallbackQuery({ callback_query_id: callbackQueryId, ...options });
    }
  };
}

function isHttpsWebAppUrl(url) {
  return typeof url === 'string' && url.startsWith('https://');
}

function getAppOpenButton() {
  const url = getWebAppUrlSync();
  if (!url || !isHttpsWebAppUrl(url.split('?')[0])) return null;
  return { text: '📚 Открыть приложение', web_app: { url } };
}

const REPORT_PROBLEM_BUTTON = { text: '⚠️ Сообщить о проблеме', callback_data: 'report_problem_start' };

// Кнопка «Сообщить о проблеме» доступна всем ролям всегда (ТЗ этой задачи),
// поэтому не зависит от доступности Web App — в отличие от кнопки «Открыть приложение».
function getAppOpenKeyboard() {
  const button = getAppOpenButton();
  const rows = button ? [[button], [REPORT_PROBLEM_BUTTON]] : [[REPORT_PROBLEM_BUTTON]];
  return { inline_keyboard: rows };
}

async function resetChatMenuButton(chatId) {
  if (!token) return;
  try {
    const payload = { menu_button: { type: 'default' } };
    if (chatId != null) payload.chat_id = chatId;
    await axios.post(`https://api.telegram.org/bot${token}/setChatMenuButton`, payload);
  } catch (error) {
    console.error('Ошибка setChatMenuButton:', error.response?.data?.description || error.message);
  }
}

async function sendStartMessage(chatId, text, options = {}) {
  await bot.sendMessage(chatId, text, options);
}

// Сессии сбора заявки прямо в боте (ТЗ §17): для напоминания за 4 часа
// и для повторного /start после окончания доступа.
// Формат: { step: 'name'|'phone', fullName, telegramId, telegramUsername, source, context }
const applicationSessions = {};

// Сессии «Сообщить о проблеме» — доступно абсолютно всем (гость, ученик,
// сотрудник любой роли, родитель, включая суперадмина).
// Формат: { step: 'text'|'screenshots', text, screenshots: [storageKey], reporterTelegramId, reporterName, reporterRole }
const reportSessions = {};
const MAX_REPORT_SCREENSHOTS = 3;

function skipScreenshotsKeyboard() {
  return { inline_keyboard: [[{ text: 'Пропустить', callback_data: 'report_skip_screenshots' }]] };
}

// Определяет отображаемое имя и роль автора жалобы для карточки в БД.
async function resolveReporterIdentity(fromUser) {
  const parent = await findParentForTelegramUser(fromUser);
  if (parent) {
    const name = [parent.firstName, parent.lastName].filter(Boolean).join(' ') || fromUser.first_name || 'Родитель';
    return { name, role: 'parent' };
  }
  const systemUser = await checkUserRole(fromUser.id);
  if (systemUser) {
    const name = [systemUser.firstName, systemUser.lastName].filter(Boolean).join(' ') || fromUser.first_name;
    return { name, role: systemUser.role };
  }
  const name = [fromUser.first_name, fromUser.last_name].filter(Boolean).join(' ') || 'Гость';
  return { name, role: 'guest' };
}

async function startReportSession(chatId, fromUser) {
  const { name, role } = await resolveReporterIdentity(fromUser);
  reportSessions[chatId] = {
    step: 'text',
    text: null,
    screenshots: [],
    reporterTelegramId: fromUser.id,
    reporterName: name,
    reporterRole: role
  };
  await bot.sendMessage(
    chatId,
    'ℹ️ Обратите внимание: сюда принимаются жалобы только на проблемы с работой платформы (приложения / Mini App). По остальным вопросам обращайтесь к своему менеджеру.\n\nОпишите проблему текстом.'
  );
}

const REPORTER_ROLE_NAMES = {
  superadmin: 'Суперадмин', admin: 'Администратор', teacher: 'Преподаватель',
  manager: 'Менеджер', student: 'Ученик', parent: 'Родитель', guest: 'Гость'
};

// Пуш супер-админу о новой жалобе (ТЗ этой задачи). Не роняет сохранение
// жалобы при сбое доставки — ошибка уже логируется внутри sendTelegramMessage.
async function notifySuperAdminAboutReport(report) {
  if (String(report.reporterTelegramId) === SUPER_ADMIN_TELEGRAM_ID) return; // не пушим самому себе
  const roleName = REPORTER_ROLE_NAMES[report.reporterRole] || report.reporterRole || '—';
  const text = `⚠️ <b>Новая жалоба</b>\n\n👤 ${report.reporterName || 'Не определён'} · ${roleName}\n📝 ${report.text.slice(0, 500)}${report.screenshots.length ? `\n📎 Скриншотов: ${report.screenshots.length}` : ''}\n\nОткройте раздел «Суперадмин» → «Жалобы» в приложении.`;
  await sendTelegramMessage({
    bot,
    chatId: SUPER_ADMIN_TELEGRAM_ID,
    text,
    options: { parse_mode: 'HTML' },
    notificationKind: 'problem_report',
    context: { reportId: report.id }
  });
}

async function finishReportSession(chatId) {
  const session = reportSessions[chatId];
  if (!session) return;
  try {
    const report = await ProblemReport.create({
      text: session.text,
      screenshots: session.screenshots,
      reporterTelegramId: session.reporterTelegramId,
      reporterName: session.reporterName,
      reporterRole: session.reporterRole,
      status: 'new'
    });
    await bot.sendMessage(chatId, '✅ Спасибо! Жалоба отправлена, мы её рассмотрим.');
    notifySuperAdminAboutReport(report).catch((e) => console.error('Ошибка пуша супер-админу о жалобе:', e.message));
  } catch (e) {
    console.error('Ошибка сохранения жалобы:', e.message);
    await bot.sendMessage(chatId, '❌ Не удалось отправить жалобу. Попробуйте ещё раз.');
  } finally {
    delete reportSessions[chatId];
  }
}

// Скачивает файл из Telegram по file_id и возвращает Buffer.
async function downloadTelegramFile(fileId) {
  const file = await telegramBot.api.getFile({ file_id: fileId });
  if (!file?.file_path) throw new Error('file_path не получен от Telegram');
  const url = `https://api.telegram.org/file/bot${token}/${file.file_path}`;
  const response = await axios.get(url, { responseType: 'arraybuffer' });
  return Buffer.from(response.data);
}

// Анти-флуд: дебаунс /start по Telegram ID. Защищает БД от спама /start
// (создание/поиск гостя). Повторный /start чаще, чем раз в N секунд, игнорируется.
const START_DEBOUNCE_MS = 3000;
const lastStartAt = new Map();

function isStartThrottled(telegramId) {
  const now = Date.now();
  const prev = lastStartAt.get(telegramId) || 0;
  if (now - prev < START_DEBOUNCE_MS) return true;
  lastStartAt.set(telegramId, now);
  // Чистим карту, чтобы не росла бесконечно
  if (lastStartAt.size > 5000) {
    for (const [id, ts] of lastStartAt) {
      if (now - ts > 60000) lastStartAt.delete(id);
    }
  }
  return false;
}

async function registerBotUser(user, utm = null) {
  try {
    const telegramUsername = normalizeTelegramUsername(user.username);
    const [botUser, created] = await BotUser.findOrCreate({
      where: { telegramId: user.id },
      defaults: {
        telegramId: user.id,
        telegramUsername,
        firstName: user.first_name || 'Пользователь',
        lastName: user.last_name || '',
        languageCode: user.language_code || 'ru',
        isBot: user.is_bot || false,
        firstInteractionAt: new Date(),
        lastInteractionAt: new Date(),
        messageCount: 1,
        ...(utm ? { ...utm, utmFirstSeenAt: new Date() } : {})
      }
    });
    if (!created) {
      const updateFields = {
        lastInteractionAt: new Date(),
        messageCount: (botUser.messageCount || 0) + 1,
        telegramUsername: telegramUsername || botUser.telegramUsername,
        isBotBlocked: false,
        botBlockedAt: null,
        botLastDeliveryError: null
      };
      if (utm) {
        Object.assign(updateFields, { ...utm, utmFirstSeenAt: new Date() });
      }
      await botUser.update(updateFields);
    }
  } catch (e) {
    console.error('Ошибка регистрации:', e.message);
  }
}

async function checkUserRole(telegramId) {
  try {
    const user = await User.findOne({
      where: { telegramId },
      attributes: ['id', 'firstName', 'lastName', 'role', 'isActive', 'telegramId', 'isGuest']
    });
    // Сотрудники/ученики (не гости) — «зарегистрированы в системе»
    return user && !user.isGuest ? user : null;
  } catch {
    return null;
  }
}

// Клавиатура напоминания/предложения оставить заявку (ТЗ §16, §19, §20)
// Родитель может быть привязан к нескольким детям — собираем их имена в одну строку.
function parentStudentsLabel(parent) {
  return (parent.students || [])
    .map((student) => [student?.firstName, student?.lastName].filter(Boolean).join(' '))
    .filter(Boolean)
    .join(', ');
}

function leaveApplicationKeyboard(yesText = 'Хочу', noData = 'guest_remind_later') {
  return {
    inline_keyboard: [[
      { text: yesText, callback_data: 'guest_remind_yes' },
      { text: 'Позже', callback_data: noData }
    ]]
  };
}

// Запустить сбор заявки в боте (ТЗ §17)
async function startBotApplication(chatId, fromUser, { source, context }) {
  applicationSessions[chatId] = {
    step: 'name',
    telegramId: fromUser.id,
    telegramUsername: fromUser.username || null,
    source: source || 'TG Bot — напоминание за 4 часа',
    context: context || 'trial_expire_reminder'
  };
  await bot.sendMessage(chatId, 'Как тебя зовут?');
}

// Отправить напоминание за 4 часа до окончания (ТЗ §16). Вызывается планировщиком.
async function sendGuestReminder(telegramId) {
  if (!bot) return false;
  try {
    await bot.sendMessage(
      telegramId,
      'Твой доступ закроется через 4 часа.\n\nХочешь оставить заявку и учиться с нами?',
      { reply_markup: leaveApplicationKeyboard() }
    );
    return true;
  } catch (e) {
    console.error('Ошибка отправки напоминания гостю:', e.message);
    return false;
  }
}

function startBot() {
  // Keep BOT_TOKEN available for Mini App authentication in isolated test copies.
  if (process.env.EXTERNAL_DELIVERY_ENABLED === 'false') {
    console.log('Telegram delivery and polling disabled for this environment');
    return;
  }
  if (!token) {
    console.warn('⚠️ BOT_TOKEN не указан в .env - бот не запущен');
    return;
  }

  telegramBot = new TelegramBot(token);
  bot = createDeliveryBot(telegramBot);
  console.log('🤖 Telegram бот запущен');

  refreshWebAppUrl(true).then((url) => {
    if (url) console.log('📱 WebApp URL:', url);
  }).catch(() => {});
  setInterval(() => refreshWebAppUrl(true), 5 * 60 * 1000);

  bot.deleteWebHook()
    .catch((error) => {
      console.error('Не удалось удалить webhook:', error.message);
    })
    .finally(() => {
      telegramBot.startPolling(undefined, {
        retry: true,
        onError: (error) => console.warn('⚠️ Telegram polling retry:', error?.message || error)
      }).catch((error) => {
        console.error('❌ Polling stopped:', error);
      });
    });

  resetChatMenuButton().catch((error) => {
    console.error('Не удалось сбросить menu button:', error.message);
  });

  // /start
  telegramBot.command('start', async (ctx) => {
    const msg = ctx.message;
    const match = ctx.match;
    const chatId = msg.chat.id;
    const user = msg.from;
    const firstName = user.first_name || 'Пользователь';
    const startParam = (typeof match === 'string' ? match : match?.[1])?.trim() || null;
    const utm = parseUtm(startParam);

    if (isStartThrottled(user.id)) {
      if (utm) {
        registerBotUser(user, utm).catch((e) => console.error('[UTM] throttled save error:', e.message));
      }
      return;
    }

    try {
      await registerBotUser(user, utm);
      const parent = await findParentForTelegramUser(user);
      if (parent) {
        await resetChatMenuButton(chatId);
        const studentName = parentStudentsLabel(parent);
        return sendStartMessage(
          chatId,
          `👋 Привет, ${firstName}!\n\nВы подключены к еженедельным отчётам об обучении${studentName ? ` ученика ${studentName}` : ''}.\n\nОтчёт приходит каждый понедельник в 18:00 по минскому времени.`,
          { reply_markup: { inline_keyboard: [[REPORT_PROBLEM_BUTTON]] } }
        );
      }
      const systemUser = await claimPendingStudent(user) || await checkUserRole(user.id);

      // ===== Ученик / сотрудник =====
      if (systemUser) {
        if (!systemUser.isActive) {
          await resetChatMenuButton(chatId);
          return sendStartMessage(
            chatId,
            `❌ Ваш аккаунт деактивирован.\n\nОбратитесь к администратору.`,
            { reply_markup: { inline_keyboard: [[REPORT_PROBLEM_BUTTON]] } }
          );
        }

        const roleEmoji = { superadmin: '🛡️', admin: '👨‍💼', teacher: '👨‍🏫', manager: '📊', student: '👨‍🎓' };
        const roleNames = { superadmin: 'Суперадмин', admin: 'Администратор', teacher: 'Преподаватель', manager: 'Менеджер', student: 'Ученик' };

        const welcomeText = `👋 Привет, ${firstName}!\n\n${roleEmoji[systemUser.role]} Роль: ${roleNames[systemUser.role]}\n\n🎓 Добро пожаловать в KUBIK!`;
        const replyMarkup = getAppOpenKeyboard();
        const appAvailable = !!getAppOpenButton();

        await resetChatMenuButton(chatId);

        return sendStartMessage(
          chatId,
          appAvailable ? welcomeText : `${welcomeText}\n\n⚠️ Web App пока недоступен: нужен HTTPS-домен на сервере.`,
          { reply_markup: replyMarkup }
        );
      }

      // ===== Гость =====
      await resetChatMenuButton(chatId);

      const { expired } = await guestAccess.createOrGetGuest({
        telegramId: user.id,
        telegramUsername: user.username || null,
        firstName
      });

      if (expired) {
        // Повторный запуск после окончания доступа (ТЗ §20)
        return sendStartMessage(
          chatId,
          'Твой гостевой доступ уже закончился.\n\nХочешь оставить заявку и учиться с нами?',
          {
            reply_markup: {
              inline_keyboard: [[
                { text: 'Оставить заявку', callback_data: 'guest_remind_yes' },
                { text: 'Позже', callback_data: 'guest_expired_later' }
              ], [REPORT_PROBLEM_BUTTON]]
            }
          }
        );
      }

      // Первый/повторный заход в активный доступ (ТЗ §2)
      const replyMarkup = getAppOpenKeyboard();
      const appAvailable = !!getAppOpenButton();
      const text = 'Ты ещё не учишься у нас, но можешь глянуть, как тут всё устроено. У тебя 24 часа.';

      return sendStartMessage(
        chatId,
        appAvailable ? text : `${text}\n\n⚠️ Приложение пока недоступно: нужен HTTPS-домен на сервере.`,
        { reply_markup: replyMarkup }
      );
    } catch (error) {
      console.error('Ошибка /start:', error.message);
      await bot.sendMessage(chatId, '❌ Не удалось обработать команду /start. Попробуйте ещё раз через минуту.');
    }
  });

  // /help
  telegramBot.command('help', async (ctx) => {
    const msg = ctx.message;
    const chatId = msg.chat.id;
    await registerBotUser(msg.from);
    const parent = await findParentForTelegramUser(msg.from);
    if (parent) {
      return bot.sendMessage(chatId, '📚 Еженедельный отчёт приходит автоматически по понедельникам в 18:00 по минскому времени.');
    }
    const systemUser = await checkUserRole(msg.from.id);

    if (systemUser) {
      bot.sendMessage(chatId, `📚 <b>Помощь</b>\n\n/start - Открыть приложение\n/help - Справка\n/info - Информация об аккаунте\n/report - Сообщить о проблеме`, { parse_mode: 'HTML' });
    } else {
      bot.sendMessage(chatId, `📚 <b>Помощь</b>\n\n/start - Открыть приложение в гостевом режиме\n/help - Справка\n/report - Сообщить о проблеме`, { parse_mode: 'HTML' });
    }
  });

  // /report — «Сообщить о проблеме» (доступно всем: гость, ученик, любой
  // сотрудник включая суперадмина, родитель).
  telegramBot.command('report', async (ctx) => {
    const msg = ctx.message;
    const chatId = msg.chat.id;
    await registerBotUser(msg.from);
    if (reportSessions[chatId]) {
      await bot.sendMessage(chatId, 'Вы уже начали составлять жалобу. Допишите её или отправьте /cancel, чтобы начать заново.');
      return;
    }
    await startReportSession(chatId, msg.from);
  });

  // /cancel — прервать активную сессию жалобы.
  telegramBot.command('cancel', async (ctx) => {
    const chatId = ctx.message.chat.id;
    if (reportSessions[chatId]) {
      delete reportSessions[chatId];
      await bot.sendMessage(chatId, 'Ок, отменено.');
    }
  });

  // /info
  telegramBot.command('info', async (ctx) => {
    const msg = ctx.message;
    const chatId = msg.chat.id;
    const user = msg.from;
    await registerBotUser(user);
    const parent = await findParentForTelegramUser(user);
    if (parent) {
      const studentName = parentStudentsLabel(parent);
      return bot.sendMessage(
        chatId,
        `👤 Родительский доступ\n\nУченик: ${studentName || 'не указан'}\n🆔 Telegram ID: ${user.id}\n\nДоступ к отчётам определяется доступом учеников.\nОтчёт: понедельник, 18:00 (Минск)`
      );
    }
    const systemUser = await checkUserRole(user.id);

    if (systemUser) {
      const roleNames = { superadmin: 'Суперадмин', admin: 'Администратор', teacher: 'Преподаватель', manager: 'Менеджер', student: 'Ученик' };
      let info = `👤 <b>Информация об аккаунте</b>\n\n`;
      info += `📛 Имя: ${systemUser.firstName} ${systemUser.lastName || ''}\n`;
      info += `🎭 Роль: ${roleNames[systemUser.role]}\n`;
      info += `🆔 Telegram ID: <code>${systemUser.telegramId}</code>\n`;
      info += `✅ Статус: ${systemUser.isActive ? 'Активен' : 'Неактивен'}`;
      bot.sendMessage(chatId, info, { parse_mode: 'HTML' });
    } else {
      bot.sendMessage(
        chatId,
        `👤 <b>Информация</b>\n\n📛 Имя: ${user.first_name} ${user.last_name || ''}\n🆔 Telegram ID: <code>${user.id}</code>\n\n🎓 У тебя гостевой доступ. Напишите /start чтобы открыть приложение.`,
        { parse_mode: 'HTML' }
      );
    }
  });

  // Обработка inline кнопок (callback_query)
  telegramBot.on('callback_query', async (ctx) => {
    const query = ctx.callbackQuery;
    const chatId = query.message.chat.id;
    const data = query.data;

    await bot.answerCallbackQuery(query.id);

    // «Хочу» в напоминании / на экране окончания — собрать заявку в боте (ТЗ §17)
    if (data === 'guest_remind_yes') {
      await startBotApplication(chatId, query.from, {
        source: 'TG Bot — напоминание за 4 часа',
        context: 'trial_expire_reminder'
      });
      return;
    }

    // «Позже» в напоминании за 4 часа (ТЗ §18)
    if (data === 'guest_remind_later') {
      await bot.sendMessage(chatId, 'Ок, доступ ещё активен 4 часа.');
      return;
    }

    // «Позже» на экране окончания доступа
    if (data === 'guest_expired_later') {
      await bot.sendMessage(chatId, 'Хорошо. Если передумаешь — напиши /start.');
      return;
    }

    // «Сообщить о проблеме» — кнопка доступна абсолютно всем (ТЗ этой задачи).
    if (data === 'report_problem_start') {
      if (reportSessions[chatId]) {
        await bot.sendMessage(chatId, 'Вы уже составляете жалобу. Допишите её или отправьте /cancel.');
        return;
      }
      await startReportSession(chatId, query.from);
      return;
    }

    // «Пропустить» на шаге скриншотов — сохраняем жалобу без вложений (0 скринов - ок).
    if (data === 'report_skip_screenshots') {
      const session = reportSessions[chatId];
      if (!session || session.step !== 'screenshots') return;
      await finishReportSession(chatId);
      return;
    }
  });

  // Контакт из Mini App (WebApp.requestContact) или reply-кнопки «Поделиться номером».
  // Telegram присылает номер боту сервис-сообщением msg.contact. Сохраняем его в
  // BotUser, чтобы Mini App мог подтянуть и подставить в форму заявки.
  telegramBot.on('message', async (ctx, next) => {
    const msg = ctx.message;
    if (!msg.contact) return next();
    try {
      const contact = msg.contact;
      // Принимаем только собственный номер пользователя (не пересланный чужой контакт).
      if (!contact || (contact.user_id && Number(contact.user_id) !== Number(msg.from.id))) return;
      const phone = contact.phone_number;
      if (!phone) return;
      // Нормализуем: гарантируем ведущий «+».
      const normalized = phone.startsWith('+') ? phone : `+${phone}`;
      await BotUser.update(
        { phone: normalized, phoneSharedAt: new Date() },
        { where: { telegramId: msg.from.id } }
      );
    } catch (e) {
      console.error('Ошибка сохранения контакта:', e.message);
    }
  });

  // Сбор жалобы «Сообщить о проблеме» — текст и скриншоты (ТЗ этой задачи).
  // Доступно всем ролям, поэтому идёт раньше и независимо от фильтра
  // «сотрудники/ученики игнорируются» в обработчике заявок ниже.
  telegramBot.on('message', async (ctx, next) => {
    const msg = ctx.message;
    const chatId = msg.chat.id;
    const session = reportSessions[chatId];
    if (!session) return next();

    if (session.step === 'text') {
      if (!msg.text || msg.text.startsWith('/')) {
        await bot.sendMessage(chatId, 'Опишите проблему текстом.');
        return;
      }
      const text = msg.text.trim().slice(0, 4000);
      if (text.length < 5) {
        await bot.sendMessage(chatId, 'Слишком коротко. Опишите проблему подробнее.');
        return;
      }
      session.text = text;
      session.step = 'screenshots';
      await bot.sendMessage(
        chatId,
        `Прикрепите скриншоты проблемы (до ${MAX_REPORT_SCREENSHOTS} шт.) или нажмите «Пропустить».`,
        { reply_markup: skipScreenshotsKeyboard() }
      );
      return;
    }

    if (session.step === 'screenshots') {
      if (!msg.photo || !msg.photo.length) {
        await bot.sendMessage(
          chatId,
          `Пришлите фото-скриншот или нажмите «Пропустить».`,
          { reply_markup: skipScreenshotsKeyboard() }
        );
        return;
      }
      if (session.screenshots.length >= MAX_REPORT_SCREENSHOTS) {
        await bot.sendMessage(chatId, `Уже прикреплено максимум (${MAX_REPORT_SCREENSHOTS}). Завершаю отправку.`);
        await finishReportSession(chatId);
        return;
      }
      try {
        // Берём самый большой размер (последний элемент массива PhotoSize).
        const best = msg.photo[msg.photo.length - 1];
        const buffer = await downloadTelegramFile(best.file_id);
        const storageKey = await problemReportImages.storeScreenshot(buffer);
        session.screenshots.push(storageKey);

        if (session.screenshots.length >= MAX_REPORT_SCREENSHOTS) {
          await bot.sendMessage(chatId, 'Максимум скриншотов достигнут. Завершаю отправку.');
          await finishReportSession(chatId);
        } else {
          await bot.sendMessage(
            chatId,
            `Скриншот добавлен (${session.screenshots.length}/${MAX_REPORT_SCREENSHOTS}). Пришлите ещё или нажмите «Пропустить».`,
            { reply_markup: skipScreenshotsKeyboard() }
          );
        }
      } catch (e) {
        console.error('Ошибка сохранения скриншота жалобы:', e.message);
        await bot.sendMessage(
          chatId,
          '❌ Не удалось сохранить скриншот. Попробуйте другое фото или нажмите «Пропустить».',
          { reply_markup: skipScreenshotsKeyboard() }
        );
      }
      return;
    }
  });

  // Текстовые сообщения — сбор заявки в боте (ТЗ §17)
  telegramBot.on('message', async (ctx) => {
    const msg = ctx.message;
    if (msg.text && msg.text.startsWith('/')) return;
    if (!msg.text) return;

    const chatId = msg.chat.id;
    await registerBotUser(msg.from);

    // Сотрудники/ученики игнорируются
    const parent = await findParentForTelegramUser(msg.from);
    if (parent) return;
    const systemUser = await checkUserRole(msg.from.id);
    if (systemUser) return;

    const appSession = applicationSessions[chatId];
    if (!appSession) return;

    if (appSession.step === 'name') {
      const name = msg.text.trim().slice(0, 100);
      if (name.length < 2) {
        await bot.sendMessage(chatId, 'Введите имя.');
        return;
      }
      appSession.fullName = name;
      appSession.step = 'phone';
      await bot.sendMessage(chatId, 'Оставь номер телефона, чтобы менеджер связался с тобой.');
      return;
    }

    if (appSession.step === 'phone') {
      const phone = msg.text.trim();
      if (phone.replace(/\D/g, '').length < 9) {
        await bot.sendMessage(chatId, 'Введите корректный номер телефона.');
        return;
      }
      try {
        // Собираем выбранные гостем предметы (если есть) для заявки
        let selectedSubjects = [];
        let userStatus = 'guest';
        try {
          const guestUser = await User.findOne({
            where: { telegramId: appSession.telegramId },
            include: [{ association: 'subjects', attributes: ['name'], through: { attributes: [] } }]
          });
          if (guestUser) {
            selectedSubjects = (guestUser.subjects || []).map((s) => s.name);
            userStatus = guestAccess.guestUserStatusLabel(guestUser) || 'guest';
          }
        } catch {}

        const utmFields = await getBotUserUtmFields(appSession.telegramId);

        const application = await Application.create({
          fullName: appSession.fullName,
          phone,
          telegramId: appSession.telegramId,
          telegramUsername: appSession.telegramUsername,
          source: appSession.source,
          context: appSession.context,
          selectedSubjects,
          selectedSubjectsCount: selectedSubjects.length,
          userStatus,
          status: 'new',
          crmStatus: 'pending',
          ...utmFields
        });

        await guestAccess.markGuestApplicationSent(appSession.telegramId).catch(() => {});

        // Фоновая отправка в CRM
        const { sendToAmoCRM } = require('./services/amocrm');
        sendToAmoCRM(application).then(async (result) => {
          if (result.ok) {
            await application.update({ crmStatus: 'sent', crmLeadId: result.leadId, crmSentAt: new Date(), crmError: null });
          } else {
            await application.update({ crmStatus: 'error', crmError: result.error });
          }
        }).catch(() => {});

        await bot.sendMessage(chatId, 'Спасибо! Заявка отправлена. Скоро с тобой свяжемся.');
      } catch (e) {
        console.error('Ошибка сохранения заявки из бота:', e.message);
        await bot.sendMessage(chatId, 'Ошибка отправки. Попробуйте ещё раз.');
      }
      delete applicationSessions[chatId];
      return;
    }
  });

  telegramBot.catch((error, ctx) => {
    console.error(`❌ Bot handler error (update ${ctx.update.update_id}):`, error);
  });
}

function stopBot() {
  if (telegramBot) {
    console.log('🛑 Остановка бота...');
    telegramBot.stop();
  }
}

module.exports = { startBot, stopBot, getBot: () => bot, sendGuestReminder, createDeliveryBot };
