const express = require('express');
const statsController = require('../controllers/statsController');

const router = express.Router();

// Получить статистику студента
router.get('/students/:studentId', statsController.getStudentStats);

// Получить детальную историю активности
router.get('/students/:studentId/activity', statsController.getStudentActivity);

module.exports = router;