// Разовая рассылка «Доступ закончился» всем ученикам с истёкшим доступом.
//   node src/cli/sendAccessExpiredNotices.js            — только показать, кому уйдёт
//   node src/cli/sendAccessExpiredNotices.js --send     — отправить (повторный запуск никому не дублирует)
const { Bot: TelegramBot } = require('node-telegram-bot-api');
const sequelize = require('../config/database');
const { createDeliveryBot } = require('../bot');
const { NOTICE_TEXT, sendAccessExpiredNotices } = require('../services/accessExpiryNotifier');

(async () => {
  const send = process.argv.includes('--send');
  try {
    const bot = send ? createDeliveryBot(new TelegramBot(process.env.BOT_TOKEN)) : null;
    const { pending, results } = await sendAccessExpiredNotices({
      bot, send, sentByName: 'Разовая рассылка об окончании доступа'
    });
    console.log(`Текст:\n${NOTICE_TEXT}\n`);
    console.log(`Получателей: ${pending.length}`);
    if (!send) {
      pending.slice(0, 15).forEach((s) => console.log(` - #${s.id} ${s.firstName || ''} ${s.lastName || ''} (до ${new Date(s.lastEnd).toISOString()})`));
      console.log('Ничего не отправлено. Для отправки добавьте --send');
    } else {
      const sent = results.filter((r) => r.status === 'sent').length;
      console.log(`Отправлено: ${sent}, не доставлено: ${results.length - sent}`);
      results.filter((r) => r.status === 'failed').forEach((r) => console.log(` ! #${r.id} ${r.name}: ${r.reason}`));
    }
  } catch (error) {
    console.error('Ошибка:', error);
    process.exitCode = 1;
  } finally {
    await sequelize.close().catch(() => {});
  }
})();
