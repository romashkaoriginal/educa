const express = require('express');
const botUserController = require('../controllers/botUserController');

const router = express.Router();

// Получить всех пользователей бота (с фильтрами)
router.get('/', botUserController.getAllBotUsers);

// Зарегистрировать/обновить пользователя бота
router.post('/register', botUserController.registerOrUpdateBotUser);

// Синхронизировать статусы isAssigned
router.post('/sync', botUserController.syncAssignedStatus);

module.exports = router;