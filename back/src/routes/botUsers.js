const express = require('express');
const botUserController = require('../controllers/botUserController');
const { telegramAuth, requireRole } = require('../middleware/telegramAuth');

const router = express.Router();

const requireBotSecret = (req, res, next) => {
  const secret = req.headers['x-bot-secret'];
  if (!process.env.BOT_SECRET || secret !== process.env.BOT_SECRET) {
    return res.status(403).json({ message: 'Forbidden' });
  }
  next();
};

// Получить всех пользователей бота для админ-панели (admin + manager)
router.get('/admin-list', telegramAuth, requireRole(['admin', 'manager']), botUserController.getAllBotUsers);

// Получить всех пользователей бота (только бот-сервер)
router.get('/', requireBotSecret, botUserController.getAllBotUsers);

// Зарегистрировать/обновить пользователя бота (только бот-сервер)
router.post('/register', requireBotSecret, botUserController.registerOrUpdateBotUser);

// Синхронизировать статусы isAssigned (только бот-сервер)
router.post('/sync', requireBotSecret, botUserController.syncAssignedStatus);

module.exports = router;