const { User } = require('../models');
const { verifyTelegramInitData } = require('../middleware/telegramAuth');

function setupSocketAuth(io) {
  io.use(async (socket, next) => {
    try {
      const initData = socket.handshake.auth?.initData
        || socket.handshake.headers['x-telegram-init-data'];
      if (!initData) return next(new Error('Unauthorized'));
      const telegramUser = verifyTelegramInitData(initData);
      if (!telegramUser) return next(new Error('Unauthorized'));
      const dbUser = await User.findOne({
        where: { telegramId: telegramUser.id },
        attributes: ['id', 'role', 'isActive', 'isGuest', 'telegramId', 'firstName', 'lastName']
      });
      if (!dbUser || !dbUser.isActive) return next(new Error('Unauthorized'));
      if (dbUser.isGuest) return next(new Error('Forbidden'));
      socket.data.dbUser = dbUser;
      socket.data.telegramUser = telegramUser;
      next();
    } catch (error) {
      console.error('Socket auth error:', error);
      next(new Error('Unauthorized'));
    }
  });
}

module.exports = setupSocketAuth;
