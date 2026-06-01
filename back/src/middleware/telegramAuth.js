const crypto = require('crypto');
const { User } = require('../models');

// Верификация Telegram initData
function verifyTelegramInitData(initData) {
  try {
    const botToken = process.env.BOT_TOKEN;
    if (!botToken) return null;

    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    if (!hash) return null;

    // Собираем data-check-string
    params.delete('hash');
    const dataCheckString = [...params.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join('\n');

    // Проверяем подпись
    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
    const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

    if (calculatedHash !== hash) return null;

    // Парсим user из initData
    const userStr = params.get('user');
    if (!userStr) return null;
    return JSON.parse(userStr);
  } catch {
    return null;
  }
}

// Middleware — проверяет initData и находит пользователя в БД
exports.telegramAuth = async (req, res, next) => {
  try {
    const initData = req.headers['x-telegram-init-data'];
    
    console.log(`[Auth] ${req.method} ${req.path} | initData: ${initData ? initData.slice(0, 50) + '...' : 'MISSING'}`);
    
    if (!initData) {
      return res.status(401).json({ message: 'No Telegram auth data' });
    }

    const telegramUser = verifyTelegramInitData(initData);
    if (!telegramUser) {
      console.log(`[Auth] Invalid initData hash`);
      return res.status(401).json({ message: 'Invalid Telegram auth data' });
    }

    console.log(`[Auth] ✅ telegramId: ${telegramUser.id}, role: ${telegramUser.role || 'unknown'}`);
    req.telegramUser = telegramUser;

    // Ищем пользователя в БД по telegramId
    const dbUser = await User.findOne({
      where: { telegramId: telegramUser.id },
      attributes: ['id', 'role', 'isActive', 'telegramId']
    });

    req.dbUser = dbUser;
    next();
  } catch (error) {
    console.error('Telegram auth error:', error);
    res.status(500).json({ message: 'Auth error' });
  }
};

// Middleware — только для зарегистрированных пользователей
exports.requireUser = (req, res, next) => {
  if (!req.dbUser) {
    return res.status(403).json({ message: 'User not registered in system' });
  }
  if (!req.dbUser.isActive) {
    return res.status(403).json({ message: 'Account is deactivated' });
  }
  next();
};

// Middleware — только для админов
exports.requireAdmin = (req, res, next) => {
  if (!req.dbUser || req.dbUser.role !== 'admin') {
    return res.status(403).json({ message: 'Admin access required' });
  }
  next();
};