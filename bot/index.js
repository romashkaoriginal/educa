require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');

const token = process.env.BOT_TOKEN;
const webAppUrl = process.env.WEB_APP_URL;
const apiUrl = process.env.API_URL || 'https://educa-production-a98e.up.railway.app/api';

const bot = new TelegramBot(token, { polling: true });

console.log('🤖 Бот запущен и ожидает команды...');
console.log('📱 Web App URL:', webAppUrl);
console.log('🔗 API URL:', apiUrl);

// Функция регистрации/обновления пользователя в базе
async function registerBotUser(user) {
  try {
    const userData = {
      telegramId: user.id,
      telegramUsername: user.username || null,
      firstName: user.first_name || 'Пользователь',
      lastName: user.last_name || '',
      languageCode: user.language_code || 'ru',
      isBot: user.is_bot || false
    };

    const response = await axios.post(`${apiUrl}/bot-users/register`, userData);
    
    console.log(`✅ Пользователь зарегистрирован: ${userData.firstName} (ID: ${userData.telegramId})`);
    return response.data.botUser;
  } catch (error) {
    console.error('❌ Ошибка регистрации пользователя:', error.response?.data || error.message);
    return null;
  }
}

// Функция проверки роли пользователя
async function checkUserRole(telegramId) {
  try {
    const response = await axios.get(`${apiUrl}/users/telegram/${telegramId}`);
    return response.data.user;
  } catch (error) {
    // Пользователь не найден в системе - это нормально для новых пользователей
    return null;
  }
}

// Команда /start
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const user = msg.from;
  const firstName = user.first_name || 'Пользователь';

  console.log(`📩 Получена команда /start от ${firstName} (ID: ${chatId})`);

  // Регистрируем пользователя в bot_users
  await registerBotUser(user);

  // Проверяем роль пользователя
  const systemUser = await checkUserRole(user.id);

  if (systemUser) {
    // Пользователь есть в системе
    if (!systemUser.isActive) {
      // Аккаунт деактивирован
      bot.sendMessage(
        chatId,
        `❌ Ваш аккаунт деактивирован.\n\nОбратитесь к администратору для получения доступа.`
      );
      return;
    }

    // Проверка доступа для студентов
    if (systemUser.role === 'student') {
      const now = new Date();
      const accessEnd = systemUser.accessEndDate ? new Date(systemUser.accessEndDate) : null;

      if (accessEnd && now > accessEnd) {
        // Доступ истёк
        bot.sendMessage(
          chatId,
          `⏰ Ваш доступ к приложению истёк.\n\n📅 Дата окончания: ${accessEnd.toLocaleDateString('ru-RU')}\n\nСвяжитесь с менеджером для продления доступа.`
        );
        return;
      }
    }

    // Всё ок - даём доступ
    const roleEmoji = {
      admin: '👨‍💼',
      teacher: '👨‍🏫',
      manager: '📊',
      student: '👨‍🎓'
    };

    const roleNames = {
      admin: 'Администратор',
      teacher: 'Преподаватель',
      manager: 'Менеджер',
      student: 'Ученик'
    };

    bot.sendMessage(
      chatId,
      `👋 Привет, ${firstName}!\n\n${roleEmoji[systemUser.role]} Роль: ${roleNames[systemUser.role]}\n\n🎓 Добро пожаловать в образовательную платформу EDme!\n\nНажми на кнопку ниже, чтобы открыть приложение:`,
      {
        reply_markup: {
          inline_keyboard: [
            [{ 
              text: '📚 Открыть приложение', 
              web_app: { url: webAppUrl } 
            }]
          ]
        }
      }
    );
  } else {
    // Пользователь НЕ в системе - неавторизованный
    bot.sendMessage(
      chatId,
      `👋 Привет, ${firstName}!\n\n📝 Вы ещё не зарегистрированы в системе.\n\n💡 Чтобы получить доступ к образовательной платформе, свяжитесь с администратором или менеджером.\n\n📞 Ваш Telegram ID: <code>${user.id}</code>\n(Скопируйте и отправьте администратору)`,
      { parse_mode: 'HTML' }
    );
  }
});

// Команда /help
bot.onText(/\/help/, async (msg) => {
  const chatId = msg.chat.id;
  const user = msg.from;

  // Регистрируем взаимодействие
  await registerBotUser(user);

  const systemUser = await checkUserRole(user.id);

  if (systemUser) {
    bot.sendMessage(
      chatId,
      `📚 <b>Помощь</b>\n\n/start - Открыть приложение\n/help - Показать эту справку\n/info - Информация о вашем аккаунте\n\n${systemUser.role === 'student' ? '📖 Доступные разделы:\n• Практика\n• Домашка\n• Викторины\n• Статистика' : ''}`,
      { parse_mode: 'HTML' }
    );
  } else {
    bot.sendMessage(
      chatId,
      `📚 <b>Помощь</b>\n\n/start - Начать работу\n/help - Показать эту справку\n\nВы не зарегистрированы в системе.\nОбратитесь к администратору для получения доступа.`,
      { parse_mode: 'HTML' }
    );
  }
});

// Команда /info
bot.onText(/\/info/, async (msg) => {
  const chatId = msg.chat.id;
  const user = msg.from;

  // Регистрируем взаимодействие
  await registerBotUser(user);

  const systemUser = await checkUserRole(user.id);

  if (systemUser) {
    const roleNames = {
      admin: 'Администратор',
      teacher: 'Преподаватель',
      manager: 'Менеджер',
      student: 'Ученик'
    };

    let info = `👤 <b>Информация о вашем аккаунте</b>\n\n`;
    info += `📛 Имя: ${systemUser.firstName} ${systemUser.lastName}\n`;
    info += `🎭 Роль: ${roleNames[systemUser.role]}\n`;
    info += `🆔 Telegram ID: <code>${systemUser.telegramId}</code>\n`;
    info += `✅ Статус: ${systemUser.isActive ? 'Активен' : 'Неактивен'}\n`;

    if (systemUser.role === 'student') {
      if (systemUser.accessStartDate) {
        info += `\n📅 Доступ с: ${new Date(systemUser.accessStartDate).toLocaleDateString('ru-RU')}`;
      }
      if (systemUser.accessEndDate) {
        info += `\n⏰ Доступ до: ${new Date(systemUser.accessEndDate).toLocaleDateString('ru-RU')}`;
      } else {
        info += `\n♾️ Доступ: Бессрочный`;
      }
    }

    bot.sendMessage(chatId, info, { parse_mode: 'HTML' });
  } else {
    bot.sendMessage(
      chatId,
      `👤 <b>Информация</b>\n\n📛 Имя: ${user.first_name} ${user.last_name || ''}\n🆔 Telegram ID: <code>${user.id}</code>\n\n❌ Вы не зарегистрированы в системе.\nОбратитесь к администратору для получения доступа.`,
      { parse_mode: 'HTML' }
    );
  }
});

// Обработка любых текстовых сообщений (для регистрации активности)
bot.on('message', async (msg) => {
  // Пропускаем команды (они обрабатываются выше)
  if (msg.text && msg.text.startsWith('/')) return;

  // Регистрируем взаимодействие
  await registerBotUser(msg.from);
});

// Обработка ошибок
bot.on('polling_error', (error) => {
  console.error('❌ Ошибка polling:', error);
});

bot.on('error', (error) => {
  console.error('❌ Ошибка бота:', error);
});