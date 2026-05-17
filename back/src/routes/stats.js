const express = require('express');
const router = express.Router();
const statsController = require('../controllers/statsController');

// Статистика ученика (все разделы)
router.get('/student/:studentId', statsController.getStudentStats);

// Статистика для админа с фильтрами
router.get('/admin', statsController.getAdminStats);

// Список учеников для фильтра
router.get('/students', statsController.getStudentsForFilter);

module.exports = router;