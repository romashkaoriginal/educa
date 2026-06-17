const express = require('express');
const router = express.Router();
const statsController = require('../controllers/statsController');
const { requireRole, assertSelfOrStaff } = require('../middleware/telegramAuth');

const isStaff = requireRole(['admin', 'manager', 'teacher']);

// Статистика ученика (все разделы)
router.get('/student/:studentId', assertSelfOrStaff('studentId'), statsController.getStudentStats);

// Статистика для админа с фильтрами
router.get('/admin', isStaff, statsController.getAdminStats);

// Список учеников для фильтра
router.get('/students', isStaff, statsController.getStudentsForFilter);

module.exports = router;
