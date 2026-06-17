const express = require('express');
const subjectController = require('../controllers/subjectController');
const { assertSelfOrStaff } = require('../middleware/telegramAuth');

const router = express.Router();

// Получить все предметы
router.get('/', subjectController.getAllSubjects);

// Получить предметы студента
router.get('/student/:userId', assertSelfOrStaff('userId'), subjectController.getStudentSubjects);

module.exports = router;