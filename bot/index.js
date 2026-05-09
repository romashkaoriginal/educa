require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');

const token = process.env.BOT_TOKEN;
const webAppUrl = process.env.WEB_APP_URL;

const bot = new TelegramBot(token, { polling: true });

// Команда /start
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const firstName = msg.from.first_name;

  bot.sendMessage(chatId, `👋 Привет, ${firstName}!\n\nДобро пожаловать в образовательную платформу!`, {
    reply_markup: {
      keyboard: [
        [{ text: '📚 Открыть приложение', web_app: { url: webAppUrl } }]
      ],
      resize_keyboard: true
    }
  });
});

// Обработка данных из Web App
bot.on('web_app_data', (msg) => {
  const chatId = msg.chat.id;
  const data = JSON.parse(msg.web_app_data.data);
  
  console.log('Received data from Web App:', data);
  
  bot.sendMessage(chatId, `✅ Данные получены!`);
});

console.log('🤖 Telegram бот запущен!');