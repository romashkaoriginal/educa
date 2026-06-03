const express = require('express');
const { body } = require('express-validator');
const authController = require('../controllers/authController');

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
router.get('/telegram/:telegramId', authController.getUserByTelegramId);

// GET /api/auth/me — студент находит себя по Telegram initData
// Используется StudentApp чтобы не запрашивать весь список студентов
router.get('/me', async (req, res) => {
  try {
    const { User, Subject, UserSubject } = require('../models');
    const crypto = require('crypto');

    const initData = req.headers['x-telegram-init-data'];
    if (!initData) return res.status(401).json({ message: 'No auth data' });

    // Верифицируем initData
    const botToken = process.env.BOT_TOKEN;
    if (!botToken) return res.status(500).json({ message: 'Server config error' });

    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    if (!hash) return res.status(401).json({ message: 'Invalid auth data' });

    params.delete('hash');
    const dataCheckString = [...params.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join('\n');

    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
    const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

    if (calculatedHash !== hash) return res.status(401).json({ message: 'Invalid signature' });

    const userStr = params.get('user');
    if (!userStr) return res.status(401).json({ message: 'No user data' });

    const telegramUser = JSON.parse(userStr);
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