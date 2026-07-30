const express = require('express');
const userController = require('../controllers/userController');
const { requireAdmin } = require('../middleware/telegramAuth');

const router = express.Router();

// Получить всех пользователей системы (админы, учителя, менеджеры)
router.get('/', userController.getAllUsers);

// Получить пользователя по Telegram ID (для авторизации)
router.get('/telegram/:telegramId', userController.getUserByTelegramId);

// Создать пользователя (админ/учитель/менеджер)
router.post('/', requireAdmin, userController.createUser);

// Обновить пользователя
router.put('/:userId', userController.updateUser);

// Переключить статус активности пользователя
router.patch('/:userId/toggle-status', userController.toggleUserStatus);

// Удалить пользователя
router.delete('/:userId', userController.deleteUser);

module.exports = router;
