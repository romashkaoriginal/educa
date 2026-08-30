// Старое значение оставлено как безопасный fallback для уже работающего VPS.
// На новых окружениях задаётся через .env.production, чтобы не менять код при
// смене super-admin. Этот же ID использует production monitor.
const SUPER_ADMIN_TELEGRAM_ID = String(
  process.env.SUPER_ADMIN_TELEGRAM_ID || '1218874137'
);

exports.requireSuperAdmin = (req, res, next) => {
  const tgId = String(req.telegramUser?.id || req.dbUser?.telegramId || '');
  if (tgId !== SUPER_ADMIN_TELEGRAM_ID) {
    return res.status(403).json({ message: 'Доступ только для главного администратора' });
  }
  next();
};

exports.SUPER_ADMIN_TELEGRAM_ID = SUPER_ADMIN_TELEGRAM_ID;
