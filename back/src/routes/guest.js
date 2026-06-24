const express = require('express');
const router = express.Router();
const guestController = require('../controllers/guestController');

// Все роуты монтируются под telegramAuth (см. app.js) — нужен только
// верифицированный initData, requireUser НЕ применяется (гость может ещё
// не иметь выбранных предметов, но строка User у него уже есть).

// Состояние гостя/ученика
router.get('/state', guestController.getState);

// UTM из URL Mini App → BotUser (для заявок)
router.post('/utm', guestController.trackUtm);

// Предметы для выбора (пересечение списка ТЗ и активных предметов БД)
router.get('/subjects/available', guestController.getAvailableSubjects);

// Выбор предметов (1..3)
router.post('/subjects', guestController.chooseSubjects);

module.exports = router;
