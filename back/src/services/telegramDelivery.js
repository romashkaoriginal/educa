const { queueErrorLog } = require('./errorLogging');

function getTelegramErrorDetails(error) {
  const statusCode = Number(error?.errorCode || error?.response?.statusCode || error?.code) || null;
  const description = String(
    error?.description || error?.response?.body?.description || error?.message || 'Unknown Telegram delivery error'
  );
  const normalized = description.toLowerCase();

  let code = 'TELEGRAM_DELIVERY_FAILED';
  if (statusCode === 400 && normalized.includes('chat not found')) code = 'TELEGRAM_CHAT_NOT_FOUND';
  if (statusCode === 403 && /(blocked by the user|user is deactivated|bot was blocked)/i.test(description)) {
    code = 'TELEGRAM_BOT_BLOCKED';
  }

  return { statusCode, description, code };
}

async function sendTelegramMessage({
  bot,
  chatId,
  text,
  options,
  req,
  recipient,
  notificationKind = 'message',
  context = {}
}) {
  if (!bot || !chatId) {
    return { ok: false, reason: !bot ? 'Бот не запущен' : 'Нет Telegram ID' };
  }

  try {
    await bot.sendMessage(chatId, text, options);
    return { ok: true };
  } catch (error) {
    const details = getTelegramErrorDetails(error);
    console.warn(`[TelegramDelivery] ${notificationKind}: ${details.description}`);
    queueErrorLog({
      req,
      user: req ? undefined : recipient,
      source: 'backend',
      severity: 'warning',
      statusCode: details.statusCode,
      code: details.code,
      message: `Telegram delivery failed: ${details.description}`,
      area: 'notifications',
      action: 'send',
      path: 'telegram://sendMessage',
      entityType: recipient?.id ? 'user' : null,
      entityId: recipient?.id,
      entityName: [recipient?.firstName, recipient?.lastName].filter(Boolean).join(' ') || null,
      context: { notificationKind, ...context }
    });
    return { ok: false, reason: details.description, code: details.code };
  }
}

module.exports = { getTelegramErrorDetails, sendTelegramMessage };
