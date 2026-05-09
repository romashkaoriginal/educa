require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');

const token = process.env.BOT_TOKEN;
const webAppUrl = process.env.WEB_APP_URL;

const bot = new TelegramBot(token, { polling: true });

console.log('🤖 Бот запущен и ожидает команды...');
console.log('📱 Web App URL:', webAppUrl); // ДОБАВЬТЕ ЭТУ СТРОКУ

// Команда /start
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const firstName = msg.from.first_name || 'Ученик';

  console.log(`📩 Получена команда /start от ${firstName} (ID: ${chatId})`);
  console.log('🔗 Отправляю URL:', webAppUrl); // И ЭТУ

  bot.sendMessage(
    chatId,
    `👋 Привет, ${firstName}!\n\n🎓 Добро пожаловать в образовательную платформу EDme!\n\nНажми на кнопку ниже, чтобы открыть приложение:`,
    {
      reply_markup: {
        keyboard: [
          [{ text: '📚 Открыть приложение', web_app: { url: webAppUrl } }]
        ],
        resize_keyboard: true
      }
    }
  );
});

// Обработка ошибок
bot.on('polling_error', (error) => {
  console.error('❌ Ошибка polling:', error);
});