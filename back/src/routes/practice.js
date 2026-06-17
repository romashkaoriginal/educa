const express = require('express');
const multer = require('multer');
const { requireRole, assertSelfOrStaff, assertBodyStudentId, assertQueryStudentIdOptional } = require('../middleware/telegramAuth');
const isAdmin = requireRole(['admin', 'teacher']);
const isStaff = requireRole(['admin', 'teacher', 'manager']);
const router = express.Router();
const practiceController = require('../controllers/practiceController');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// ========== ТОПИКИ (РАЗДЕЛЫ) ==========

// Получить разделы по предмету
router.get('/topics/:subjectId', practiceController.getTopicsBySubject);

// Создать раздел
router.post('/topics', isAdmin, practiceController.createTopic);

// Обновить раздел
router.put('/topics/:topicId', isAdmin, practiceController.updateTopic);

// Удалить раздел
router.delete('/topics/:topicId', isAdmin, practiceController.deleteTopic);

// ========== ВОПРОСЫ ==========

// Шаблон Excel (до /questions/:topicId, иначе import-template попадёт в :topicId)
router.get('/questions/import-template', isAdmin, practiceController.getQuestionsImportTemplate);

// Получить вопросы по топику
router.get('/questions/:topicId', practiceController.getQuestionsByTopic);

// Создать вопрос
router.post('/questions', isAdmin, practiceController.createQuestion);

// Импорт вопросов из Excel
router.post('/questions/:topicId/import', isAdmin, upload.single('file'), practiceController.importQuestionsFromExcel);

// Обновить вопрос
router.put('/questions/:questionId', isAdmin, practiceController.updateQuestion);

// Включить/выключить вопрос
router.put('/questions/:questionId/toggle', isAdmin, practiceController.toggleQuestion);

// Удалить вопрос
router.delete('/questions/:questionId', isAdmin, practiceController.deleteQuestion);

// ========== СТУДЕНЧЕСКАЯ ЧАСТЬ ==========

// Получить разделы для студента (с фильтром по его предметам)
router.get('/student/:studentId', assertSelfOrStaff('studentId'), async (req, res) => {
  try {
    const { User, Subject, PracticeTopic, PracticeQuestion } = require('../models');
    const sequelize = require('../config/database');
    const { studentId } = req.params;

    const student = await User.findByPk(studentId, {
      include: [{
        model: Subject,
        as: 'subjects',
        attributes: ['id', 'name', 'icon']
      }]
    });

    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    const subjectIds = student.subjects.map(s => s.id);

    const practiceTopics = await PracticeTopic.findAll({
      where: {
        subjectId: subjectIds,
        isActive: true
      },
      include: [
        {
          model: Subject,
          as: 'subject',
          attributes: ['id', 'name', 'icon']
        },
        {
          model: PracticeQuestion,
          as: 'questions',
          where: { isActive: true },
          required: false,
          attributes: ['id']
        }
      ],
      order: [['createdAt', 'ASC']]
    });

    // Берём лучшие результаты из PracticeBest
    const { PracticeBest } = require('../models');
    const bests = await PracticeBest.findAll({
      where: { studentId: parseInt(studentId) },
      attributes: ['topicId', 'correct', 'total', 'percent']
    });
    const bestMap = {};
    bests.forEach(b => {
      bestMap[b.topicId] = { correct: b.correct, total: b.total, successRate: b.percent };
    });

    const topicsWithStats = practiceTopics.map(topic => ({
      ...topic.toJSON(),
      stats: bestMap[topic.id] || null
    }));

    res.json({ practiceTopics: topicsWithStats });
  } catch (error) {
    console.error('Get student practice error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ========== ПОПЫТКИ И СТАТИСТИКА ==========

// Сохранить попытку
router.post('/attempts', assertBodyStudentId, practiceController.saveAttempt);

// Сохранить один ответ сразу после вопроса
router.post('/answer', assertBodyStudentId, practiceController.savePracticeAnswer);

// Итог сессии (лучший результат по теме)
router.post('/session-summary', assertBodyStudentId, practiceController.saveSessionSummary);

// Получить статистику студента
router.get('/stats/:studentId', assertSelfOrStaff('studentId'), practiceController.getStudentStats);

// Получить статистику по топику
router.get('/topic-stats/:studentId/:topicId', assertSelfOrStaff('studentId'), practiceController.getTopicStats);

// Получить стрик (дней подряд)
router.get('/streak/:studentId', assertSelfOrStaff('studentId'), practiceController.getStreak);

// Получить вопросы с ошибками
router.get('/incorrect/:studentId/:topicId', assertSelfOrStaff('studentId'), practiceController.getIncorrectQuestions);

// ========== ПРОГНОЗНЫЙ БАЛЛ, ЦЕЛИ, РЕЙТИНГ ==========

router.get('/predicted/:studentId/:subjectId', assertSelfOrStaff('studentId'), practiceController.getPredictedScore);
router.get('/predicted-all/:studentId', assertSelfOrStaff('studentId'), practiceController.getPredictedScoreAll);
router.get('/daily-goal/:studentId', assertSelfOrStaff('studentId'), practiceController.getDailyGoal);
router.get('/leaderboard/:subjectId', assertQueryStudentIdOptional, practiceController.getLeaderboard);
router.get('/weak-topics/:studentId/:subjectId', assertSelfOrStaff('studentId'), practiceController.getWeakTopicsPractice);
router.get('/dashboard/:studentId/:subjectId', assertSelfOrStaff('studentId'), practiceController.getSubjectDashboard);
router.get('/score-history/:studentId/:subjectId', assertSelfOrStaff('studentId'), practiceController.getScoreHistory);
router.get('/admin-predicted/:studentId', isStaff, practiceController.getAdminPredicted);

module.exports = router;