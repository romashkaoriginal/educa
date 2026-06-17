const express = require('express');
const router = express.Router();
const guestController = require('../controllers/guestController');

// Мониторинг гостей для админа (вход «под гостем» для проверки).
// Монтируется в app.js под telegramAuth + requireRole(['admin']).
router.get('/list', guestController.adminListGuests);

module.exports = router;
