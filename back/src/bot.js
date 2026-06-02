const TelegramBot = require('node-telegram-bot-api');
const { User, BotUser, BotTest, Subject, Application } = require('./models');

const token = process.env.BOT_TOKEN;
const webAppUrl = process.env.WEB_APP_URL;

let bot = null;

const testSessions = {};
const lastTestResults = {};
const applicationSessions = {};

async function registerBotUser(user) {
  try {
    const [botUser] = await BotUser.findOrCreate({
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
        messageCount: 1
      }
    });
    if (botUser && !botUser._options?.isNewRecord) {
      await botUser.update({
        lastInteractionAt: new Date(),
        messageCount: (botUser.messageCount || 0) + 1,
        telegramUsername: user.username || botUser.telegramUsername
      });
    }
  } catch (e) {
    console.error('Ошибка регистрации:', e.message);
  }
}


// Получить сегодняшнюю дату в формате YYYY-MM-DD (по UTC)
function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

// Проверить и увеличить счётчик. Возвращает true если лимит не превышен
async function checkAndIncrement(telegramId, type, subjectId, limit = 2) {
  try {
    const botUser = await BotUser.findOne({ where: { telegramId } });
    if (!botUser) return true; // новый — пропускаем

    const day = todayKey();
    const key = `${type}_${subjectId}`;
    const limits = { ...(botUser.dailyLimits || {}) };
    if (!limits[day]) limits[day] = {};
    const current = limits[day][key] || 0;

    if (current >= limit) return false; // лимит исчерпан

    limits[day][key] = current + 1;
    await botUser.update({ dailyLimits: limits });
    return true;
  } catch {
    return true; // при ошибке не блокируем
  }
}

// Проверить без увеличения
async function checkLimit(telegramId, type, subjectId, limit = 2) {
  try {
    const botUser = await BotUser.findOne({ where: { telegramId } });
    if (!botUser) return true;
    const day = todayKey();
    const key = `${type}_${subjectId}`;
    const current = botUser.dailyLimits?.[day]?.[key] || 0;
    return current < limit;
  } catch {
    return true;
  }
}

async function checkUserRole(telegramId) {
  try {
    const user = await User.findOne({
      where: { telegramId },
      attributes: ['id', 'firstName', 'lastName', 'role', 'isActive', 'telegramId']
    });
    return user || null;
  } catch {
    return null;
  }
}

async function getSubjects() {
  try {
    return await Subject.findAll({ attributes: ['id', 'name', 'icon'] });
  } catch {
    return [];
  }
}

async function getTestQuestions(subjectId) {
  try {
    return await BotTest.findAll({
      where: { subjectId, isActive: true },
      order: [['order', 'ASC'], ['id', 'ASC']],
      attributes: ['id', 'questionText', 'options', 'correctAnswer', 'explanation']
    });
  } catch {
    return [];
  }
}

// Отправляем вопрос с inline кнопками
async function sendQuestion(chatId, session) {
  const q = session.questions[session.currentIndex];
  const total = session.questions.length;
  const num = session.currentIndex + 1;

  const keyboard = q.options.map((opt, i) => ([{
    text: `${String.fromCharCode(65 + i)}. ${opt}`,
    callback_data: `answer_${i}`
  }]));

  // Добавляем кнопки управления
  keyboard.push([
    { text: '🔄 Перезапустить', callback_data: 'restart' },
    { text: '❌ Выйти из теста', callback_data: 'exit' }
  ]);

  await bot.sendMessage(
    chatId,
    `📝 <b>Вопрос ${num}/${total}</b>\n\n${q.questionText}`,
    {
      parse_mode: 'HTML',
      reply_markup: { inline_keyboard: keyboard }
    }
  );
}

// Загружаем вопросы и запускаем тест
async function startTest(chatId, subjectId, subjectName, telegramId) {
  try {
    // Проверяем лимит теста (2 раза в день на предмет)
    if (telegramId) {
      const allowed = await checkAndIncrement(telegramId, 'test', subjectId, 2);
      if (!allowed) {
        await bot.sendMessage(chatId,
          `⛔ <b>Лимит исчерпан</b>\n\nВы уже прошли тест по <b>${subjectName}</b> 2 раза сегодня.\n\n🕛 Попробуйте завтра!`,
          { parse_mode: 'HTML' }
        );
        return;
      }
    }
    const questions = await getTestQuestions(subjectId);

    if (questions.length === 0) {
      await bot.sendMessage(chatId, `😔 По предмету <b>${subjectName}</b> пока нет вопросов.\n\nВыберите другой предмет или напишите /start.`, { parse_mode: 'HTML' });
      delete testSessions[chatId];
      return;
    }

    testSessions[chatId] = {
      step: 'question',
      subjectId,
      subjectName,
      questions,
      currentIndex: 0,
      score: 0
    };

    await bot.sendMessage(chatId, `🎯 Начинаем тест по <b>${subjectName}</b>!\n\n📊 Вопросов: ${questions.length}\n\n<i>Выбирайте ответ из кнопок ниже:</i>`, { parse_mode: 'HTML' });
    await sendQuestion(chatId, testSessions[chatId]);
  } catch (e) {
    console.error('Ошибка загрузки теста:', e.message);
    await bot.sendMessage(chatId, '❌ Ошибка загрузки теста. Попробуйте позже.');
  }
}

async function showSubjectPicker(chatId, firstName) {
  try {
    const subjects = await getSubjects();

    if (subjects.length === 0) {
      await bot.sendMessage(chatId, '😔 Тесты пока недоступны. Обратитесь к администратору.');
      return;
    }

    testSessions[chatId] = { step: 'subject', subjects };

    const keyboard = subjects.map(s => ([{
      text: `${s.icon} ${s.name}`,
      callback_data: `subject_${s.id}_${s.name}`
    }]));

    await bot.sendMessage(
      chatId,
      `👋 Привет, <b>${firstName}</b>!\n\n🎓 Вы ещё не зарегистрированы в системе, но можете пройти вступительный тест.\n\n📚 Выберите предмет:`,
      { parse_mode: 'HTML', reply_markup: { inline_keyboard: keyboard } }
    );
  } catch (e) {
    console.error('Ошибка загрузки предметов:', e.message);
    await bot.sendMessage(chatId, '❌ Ошибка загрузки. Попробуйте позже.');
  }
}

function startBot() {
  if (!token) {
    console.warn('⚠️ BOT_TOKEN не указан в .env - бот не запущен');
    return;
  }

  bot = new TelegramBot(token, { polling: true });
  console.log('🤖 Telegram бот запущен');

  // /start
  bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const user = msg.from;
    const firstName = user.first_name || 'Пользователь';

    await registerBotUser(user);
    const systemUser = await checkUserRole(user.id);

    if (systemUser) {
      if (!systemUser.isActive) {
        // Убираем кнопку меню
        await bot.setChatMenuButton(chatId, { type: 'default' });
        return bot.sendMessage(chatId, `❌ Ваш аккаунт деактивирован.\n\nОбратитесь к администратору.`);
      }

      // Показываем кнопку меню с апкой
      await bot.setChatMenuButton(chatId, {
        type: 'web_app',
        text: '📚 Открыть приложение',
        web_app: { url: webAppUrl }
      });

      const roleEmoji = { admin: '👨‍💼', teacher: '👨‍🏫', manager: '📊', student: '👨‍🎓' };
      const roleNames = { admin: 'Администратор', teacher: 'Преподаватель', manager: 'Менеджер', student: 'Ученик' };

      return bot.sendMessage(
        chatId,
        `👋 Привет, ${firstName}!\n\n${roleEmoji[systemUser.role]} Роль: ${roleNames[systemUser.role]}\n\n🎓 Добро пожаловать в EDme!`,
        {
          reply_markup: {
            inline_keyboard: [[{ text: '📚 Открыть приложение', web_app: { url: webAppUrl } }]]
          }
        }
      );
    }

    // Неавторизованный — убираем кнопку меню
    await bot.setChatMenuButton(chatId, { type: 'default' });
    await showSubjectPicker(chatId, firstName);
  });

  // /help
  bot.onText(/\/help/, async (msg) => {
    const chatId = msg.chat.id;
    await registerBotUser(msg.from);
    const systemUser = await checkUserRole(msg.from.id);

    if (systemUser) {
      bot.sendMessage(chatId, `📚 <b>Помощь</b>\n\n/start - Открыть приложение\n/help - Справка\n/info - Информация об аккаунте`, { parse_mode: 'HTML' });
    } else {
      bot.sendMessage(chatId, `📚 <b>Помощь</b>\n\n/start - Начать / пройти тест\n/help - Справка\n\nВы не зарегистрированы в системе.\nОбратитесь к администратору.`, { parse_mode: 'HTML' });
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
        `👤 <b>Информация</b>\n\n📛 Имя: ${user.first_name} ${user.last_name || ''}\n🆔 Telegram ID: <code>${user.id}</code>\n\n❌ Не зарегистрированы в системе.`,
        { parse_mode: 'HTML' }
      );
    }
  });

  // Обработка inline кнопок (callback_query)
  bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;
    const firstName = query.from.first_name || 'Пользователь';

    // Убираем "часики" на кнопке
    await bot.answerCallbackQuery(query.id);

    const session = testSessions[chatId];

    // Выбор предмета
    if (data.startsWith('subject_')) {
      const parts = data.split('_');
      const subjectId = parts[1];
      const subjectName = parts.slice(2).join('_');
      await startTest(chatId, subjectId, subjectName, query.from.id);
      return;
    }

    // Перезапуск
    if (data === 'restart') {
      if (session?.subjectId) {
        await bot.sendMessage(chatId, '🔄 Перезапускаем тест...');
        await startTest(chatId, session.subjectId, session.subjectName);
      } else {
        await showSubjectPicker(chatId, firstName);
      }
      return;
    }

    // Выход
    if (data === 'exit') {
      delete testSessions[chatId];
      await bot.sendMessage(
        chatId,
        `👋 Тест прерван.\n\nНапишите /start чтобы начать заново.`
      );
      return;
    }

    // Ответ на вопрос
    if (data.startsWith('answer_') && session?.step === 'question') {
      const answerIndex = parseInt(data.split('_')[1]);
      const q = session.questions[session.currentIndex];
      const isCorrect = answerIndex === q.correctAnswer;

      if (isCorrect) {
        session.score++;
        await bot.sendMessage(chatId, `✅ <b>Правильно!</b>${q.explanation ? `\n\n💡 ${q.explanation}` : ''}`, { parse_mode: 'HTML' });
      } else {
        const correctLetter = String.fromCharCode(65 + q.correctAnswer);
        await bot.sendMessage(
          chatId,
          `❌ <b>Неправильно.</b>\n\nПравильный ответ: <b>${correctLetter}. ${q.options[q.correctAnswer]}</b>${q.explanation ? `\n\n💡 ${q.explanation}` : ''}`,
          { parse_mode: 'HTML' }
        );
      }

      session.currentIndex++;

      if (session.currentIndex < session.questions.length) {
        // Следующий вопрос
        await sendQuestion(chatId, session);
      } else {
        // Тест завершён
        const total = session.questions.length;
        const score = session.score;
        const percent = Math.round(score / total * 100);

        let emoji = '😔';
        let comment = 'Не расстраивайся, попробуй ещё раз!';
        if (percent >= 80) { emoji = '🎉'; comment = 'Отличный результат!'; }
        else if (percent >= 60) { emoji = '👍'; comment = 'Хороший результат!'; }
        else if (percent >= 40) { emoji = '📖'; comment = 'Есть над чем поработать!'; }

        await bot.sendMessage(
          chatId,
          `${emoji} <b>Тест завершён!</b>\n\n📊 Предмет: ${session.subjectName}\n✅ Правильных ответов: ${score} из ${total}\n📈 Результат: ${percent}%\n\n${comment}`,
          {
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [
                [{ text: '📋 Оставить заявку', callback_data: 'leave_application' }],
                [{ text: '🔄 Пройти снова', callback_data: 'restart' }],
                [{ text: '📚 Выбрать другой предмет', callback_data: 'choose_subject' }]
              ]
            }
          }
        );
        lastTestResults[chatId] = { subjectId: session.subjectId, subjectName: session.subjectName, correct: score, total, percent };
        delete testSessions[chatId];
      }
      return;
    }

    // Оставить заявку
    if (data === 'leave_application') {
      applicationSessions[chatId] = {
        step: 'name',
        testResult: lastTestResults[chatId] || null,
        telegramId: query.from.id,
        telegramUsername: query.from.username || null
      };
      await bot.sendMessage(chatId, `📝 <b>Оставить заявку</b>\r\n\r\nНапишите ваше <b>ФИО</b>:`, { parse_mode: 'HTML' });
      return;
    }

    // Выбор другого предмета
    if (data === 'choose_subject') {
      await showSubjectPicker(chatId, firstName);
      return;
    }
  });

  // Текстовые сообщения
  bot.on('message', async (msg) => {
    if (msg.text && msg.text.startsWith('/')) return;
    if (!msg.text) return;

    const chatId = msg.chat.id;
    await registerBotUser(msg.from);

    const systemUser = await checkUserRole(msg.from.id);
    if (systemUser) return; // авторизованные пользователи игнорируем

    // Сбор данных заявки
    const appSession = applicationSessions[chatId];
    if (appSession) {
      if (appSession.step === 'name') {
        appSession.fullName = msg.text.trim();
        appSession.step = 'phone';
        await bot.sendMessage(chatId, `📞 Теперь напишите ваш <b>номер телефона</b>:`, { parse_mode: 'HTML' });
        return;
      }
      if (appSession.step === 'phone') {
        appSession.phone = msg.text.trim();
        // Проверяем лимит заявок (2 раза в день)
        const subjectId = appSession.testResult?.subjectId || 'any';
        const appAllowed = await checkAndIncrement(appSession.telegramId, 'app', subjectId, 2);
        if (!appAllowed) {
          await bot.sendMessage(chatId,
            `⛔ <b>Лимит заявок исчерпан</b>\n\nВы уже отправили 2 заявки сегодня.\n\n🕛 Попробуйте завтра!`,
            { parse_mode: 'HTML' }
          );
          delete applicationSessions[chatId];
          return;
        }
        try {
          const tr = appSession.testResult;
          await Application.create({
            fullName: appSession.fullName,
            phone: appSession.phone,
            telegramId: appSession.telegramId,
            telegramUsername: appSession.telegramUsername,
            subjectId: tr?.subjectId || null,
            subjectName: tr?.subjectName || null,
            testCorrect: tr?.correct || 0,
            testTotal: tr?.total || 0,
            testPercent: tr?.percent || 0,
            testAnswers: tr?.answers || [],
            status: 'new',
            crmStatus: 'pending'
          });
          await bot.sendMessage(chatId, `✅ <b>Заявка отправлена!</b>\r\n\r\nМы свяжемся с вами в ближайшее время.\r\n\r\n👤 ${appSession.fullName}\r\n📞 ${appSession.phone}`, { parse_mode: 'HTML' });
        } catch (e) {
          console.error('Ошибка сохранения заявки:', e.message);
          await bot.sendMessage(chatId, '❌ Ошибка отправки заявки. Попробуйте позже.');
        }
        delete applicationSessions[chatId];
        return;
      }
    }

    const session = testSessions[chatId];

    if (session?.step === 'question') {
      // Пользователь отправил текст вместо нажатия кнопки
      await bot.sendMessage(
        chatId,
        `⚠️ Пожалуйста, выбирайте ответ <b>из кнопок</b>, не отправляйте текст!\n\nЕсли кнопки не видны — прокрутите вверх к вопросу.`,
        { parse_mode: 'HTML' }
      );
    } else if (!session) {
      // Нет активной сессии — предлагаем начать тест
      await showSubjectPicker(chatId, msg.from.first_name || 'Пользователь');
    }
  });

  bot.on('polling_error', (error) => {
    // ECONNRESET и EFATAL - временные сетевые ошибки, бот переподключится сам
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

module.exports = { startBot, stopBot, getBot: () => bot };