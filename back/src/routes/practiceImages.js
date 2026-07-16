const express = require('express');
const router = express.Router();
const practiceController = require('../controllers/practiceController');

// Публичная раздача оптимизированных изображений практики.
// Без telegram-авторизации: тег <img> не может послать заголовок initData,
// а storageKey содержит хеш файла — угадать чужой ключ практически нельзя.
router.get('/:key', practiceController.serveImage);

module.exports = router;
