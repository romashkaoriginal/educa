const SUPER_ADMIN_TELEGRAM_ID = '1218874137';

exports.requireSuperAdmin = (req, res, next) => {
  const tgId = String(req.telegramUser?.id || req.dbUser?.telegramId || '');
  if (tgId !== SUPER_ADMIN_TELEGRAM_ID) {
    return res.status(403).json({ message: 'Доступ только для главного администратора' });
  }
  next();
};

exports.SUPER_ADMIN_TELEGRAM_ID = SUPER_ADMIN_TELEGRAM_ID;
