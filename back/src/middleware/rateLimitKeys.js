// Ключи для rate-limit: ключуем по Telegram ID, а не по IP.
// Это важно, чтобы несколько учеников за одним NAT/Wi-Fi (школа) не делили
// общий бюджет лимита, а абьюз отдельного пользователя резался точечно.

const { ipKeyGenerator } = require('express-rate-limit');

// Достаём telegramId из initData (или из заголовка x-telegram-user-id).
// Для КЛЮЧА лимита полная верификация подписи не нужна — её делает telegramAuth
// на защищённых роутах. Здесь нам нужен лишь стабильный идентификатор.
function extractTelegramId(req) {
  try {
    const initData = req.headers['x-telegram-init-data'];
    if (initData) {
      const params = new URLSearchParams(initData);
      const userStr = params.get('user');
      if (userStr) {
        const user = JSON.parse(userStr);
        if (user && user.id != null) return String(user.id);
      }
    }
  } catch {
    // игнорируем — упадём на IP
  }
  return null;
}

// Ключ «по пользователю»: tg:<id>, иначе ip:<addr> (IPv6-safe через ipKeyGenerator).
function telegramKey(req, res) {
  const tgId = extractTelegramId(req);
  if (tgId) return `tg:${tgId}`;
  return `ip:${ipKeyGenerator(req, res)}`;
}

// Комбинированный ключ tg+ip — для эндпоинтов заявок (анти-флуд лидов):
// лимит срабатывает и по пользователю, и по IP отдельно через два лимитера.
module.exports = { telegramKey, extractTelegramId };
