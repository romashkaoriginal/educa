const express = require('express');
const { body } = require('express-validator');
const authController = require('../controllers/authController');
const { telegramAuth, assertOwnTelegramId, verifyTelegramInitData } = require('../middleware/telegramAuth');

const router = express.Router();

// Регистрация
router.post('/register', [
  body('email').isEmail().withMessage('Invalid email'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('firstName').notEmpty().withMessage('First name is required'),
  body('lastName').notEmpty().withMessage('Last name is required')
], authController.register);

// Вход
router.post('/login', [
  body('email').isEmail().withMessage('Invalid email'),
  body('password').notEmpty().withMessage('Password is required')
], authController.login);

// Проверка пользователя по Telegram ID (для WebApp)
router.get('/telegram/:telegramId', telegramAuth, assertOwnTelegramId, authController.getUserByTelegramId);

// GET /api/auth/me — студент находит себя по Telegram initData
// Используется StudentApp чтобы не запрашивать весь список студентов
router.get('/me', async (req, res) => {
  try {
    const { User, Subject, UserSubject } = require('../models');

    const initData = req.headers['x-telegram-init-data'];
    if (!initData) return res.status(401).json({ message: 'No auth data' });

    const telegramUser = verifyTelegramInitData(initData);
    if (!telegramUser) return res.status(401).json({ message: 'Invalid signature' });

    const telegramId = telegramUser.id;

    // Ищем студента по telegramId
    const user = await User.findOne({
      where: { telegramId, role: 'student', isActive: true },
      include: [{
        model: Subject,
        as: 'subjects',
        through: { model: UserSubject, attributes: ['accessStartDate', 'accessEndDate'] }
      }]
    });

    if (!user) return res.status(404).json({ message: 'Student not found' });

    res.json({ student: user });
  } catch (error) {
    console.error('Auth me error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;