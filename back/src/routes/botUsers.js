const express = require('express');
const botUserController = require('../controllers/botUserController');

const router = express.Router();

// Получить всех пользователей бота (с фильтрами и сортировкой)
// Query params: ?sortBy=firstInteractionAt&order=DESC&filter=unassigned
router.get('/', botUserController.getAllBotUsers);

// Получить статистику по пользователям бота
router.get('/stats', botUserController.getBotUsersStats);

// Зарегистрировать/обновить пользователя бота (вызывается из Telegram бота)
router.post('/register', botUserController.registerOrUpdateBotUser);

module.exports = router;