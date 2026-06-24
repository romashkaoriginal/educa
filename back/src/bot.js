const axios = require('axios');
const TelegramBot = require('node-telegram-bot-api');
const { User, BotUser, Application } = require('./models');
const { refreshWebAppUrl, getWebAppUrlSync } = require('./utils/webAppUrl');
const { parseUtm } = require('./utils/utm');
const { getBotUserUtmFields } = require('./services/botUserUtm');
const guestAccess = require('./services/guestAccess');

const token = process.env.BOT_TOKEN;

let bot = null;

function isHttpsWebAppUrl(url) {
  return typeof url === 'string' && url.startsWith('https://');
}

function getAppOpenButton() {
  const url = getWebAppUrlSync();
  if (!url || !isHttpsWebAppUrl(url.split('?')[0])) return null;
  return { text: '📚 Открыть приложение', web_app: { url } };
}

function getAppOpenKeyboard() {
  const button = getAppOpenButton();
  if (!button) return null;
  return { inline_keyboard: [[button]] };
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
    const [botUser, created] = await BotUser.findOrCreate({
      where: { telegramId: user.id },
      defaults: {
        telegramId: user.id,
        telegramUsername: user.username || null,
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
        telegramUsername: user.username || botUser.telegramUsername
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
  if (!token) {
    console.warn('⚠️ BOT_TOKEN не указан в .env - бот не запущен');
    return;
  }

  bot = new TelegramBot(token, { polling: true });
  console.log('🤖 Telegram бот запущен');

  refreshWebAppUrl(true).then((url) => {
    if (url) console.log('📱 WebApp URL:', url);
  }).catch(() => {});
  setInterval(() => refreshWebAppUrl(true), 5 * 60 * 1000);

  bot.deleteWebHook().catch((error) => {
    console.error('Не удалось удалить webhook:', error.message);
  });

  resetChatMenuButton().catch((error) => {
    console.error('Не удалось сбросить menu button:', error.message);
  });

  // /start
  bot.onText(/\/start(?:\s+(.+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const user = msg.from;
    const firstName = user.first_name || 'Пользователь';
    const startParam = match?.[1]?.trim() || null;
    const utm = parseUtm(startParam);

    if (isStartThrottled(user.id)) {
      if (utm) {
        registerBotUser(user, utm).catch((e) => console.error('[UTM] throttled save error:', e.message));
      }
      return;
    }

    try {
      await registerBotUser(user, utm);
      const systemUser = await checkUserRole(user.id);

      // ===== Ученик / сотрудник =====
      if (systemUser) {
        if (!systemUser.isActive) {
          await resetChatMenuButton(chatId);
          return sendStartMessage(chatId, `❌ Ваш аккаунт деактивирован.\n\nОбратитесь к администратору.`);
        }

        const roleEmoji = { admin: '👨‍💼', teacher: '👨‍🏫', manager: '📊', student: '👨‍🎓' };
        const roleNames = { admin: 'Администратор', teacher: 'Преподаватель', manager: 'Менеджер', student: 'Ученик' };

        const welcomeText = `👋 Привет, ${firstName}!\n\n${roleEmoji[systemUser.role]} Роль: ${roleNames[systemUser.role]}\n\n🎓 Добро пожаловать в KUBIK!`;
        const replyMarkup = getAppOpenKeyboard();

        await resetChatMenuButton(chatId);

        if (!replyMarkup) {
          return sendStartMessage(
            chatId,
            `${welcomeText}\n\n⚠️ Web App пока недоступен: нужен HTTPS-домен на сервере.`
          );
        }

        return sendStartMessage(chatId, welcomeText, { reply_markup: replyMarkup });
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
              ]]
            }
          }
        );
      }

      // Первый/повторный заход в активный доступ (ТЗ §2)
      const replyMarkup = getAppOpenKeyboard();
      const text = 'Ты ещё не учишься у нас, но можешь глянуть, как тут всё устроено. У тебя 24 часа.';

      if (!replyMarkup) {
        return sendStartMessage(
          chatId,
          `${text}\n\n⚠️ Приложение пока недоступно: нужен HTTPS-домен на сервере.`
        );
      }

      return sendStartMessage(chatId, text, { reply_markup: replyMarkup });
    } catch (error) {
      console.error('Ошибка /start:', error.message);
      await bot.sendMessage(chatId, '❌ Не удалось обработать команду /start. Попробуйте ещё раз через минуту.');
    }
  });

  // /help
  bot.onText(/\/help/, async (msg) => {
    const chatId = msg.chat.id;
    await registerBotUser(msg.from);
    const systemUser = await checkUserRole(msg.from.id);

    if (systemUser) {
      bot.sendMessage(chatId, `📚 <b>Помощь</b>\n\n/start - Открыть приложение\n/help - Справка\n/info - Информация об аккаунте`, { parse_mode: 'HTML' });
    } else {
      bot.sendMessage(chatId, `📚 <b>Помощь</b>\n\n/start - Открыть приложение в гостевом режиме\n/help - Справка`, { parse_mode: 'HTML' });
    }
  });

  // /info
  bot.onText(/\/info/, async (msg) => {
    const chatId = msg.chat.id;
    const user = msg.from;
    await registerBotUser(user);
    const systemUser = await checkUserRole(user.id);

    if (systemUser) {
      const roleNames = { admin: 'Администратор', teacher: 'Преподаватель', manager: 'Менеджер', student: 'Ученик' };
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
  bot.on('callback_query', async (query) => {
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
  });

  // Контакт из Mini App (WebApp.requestContact) или reply-кнопки «Поделиться номером».
  // Telegram присылает номер боту сервис-сообщением msg.contact. Сохраняем его в
  // BotUser, чтобы Mini App мог подтянуть и подставить в форму заявки.
  bot.on('contact', async (msg) => {
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

  // Текстовые сообщения — сбор заявки в боте (ТЗ §17)
  bot.on('message', async (msg) => {
    if (msg.text && msg.text.startsWith('/')) return;
    if (!msg.text) return;

    const chatId = msg.chat.id;
    await registerBotUser(msg.from);

    // Сотрудники/ученики игнорируются
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

  bot.on('polling_error', (error) => {
    if (error.code === 'EFATAL' || error.code === 'ECONNRESET') return;
    console.error('❌ Polling error:', error.message);
  });
  bot.on('error', (error) => console.error('❌ Bot error:', error));
}

function stopBot() {
  if (bot) {
    console.log('🛑 Остановка бота...');
    bot.stopPolling();
  }
}

module.exports = { startBot, stopBot, getBot: () => bot, sendGuestReminder };
