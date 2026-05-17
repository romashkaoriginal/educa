const express = require('express');
const router = express.Router();
const practiceController = require('../controllers/practiceController');

// ========== ТОПИКИ (РАЗДЕЛЫ) ==========

// Получить разделы по предмету
router.get('/topics/:subjectId', practiceController.getTopicsBySubject);

// Создать раздел
router.post('/topics', practiceController.createTopic);

// Обновить раздел
router.put('/topics/:topicId', practiceController.updateTopic);

// Удалить раздел
router.delete('/topics/:topicId', practiceController.deleteTopic);

// ========== ВОПРОСЫ ==========

// Получить вопросы по топику
router.get('/questions/:topicId', practiceController.getQuestionsByTopic);

// Создать вопрос
router.post('/questions', practiceController.createQuestion);

// Обновить вопрос
router.put('/questions/:questionId', practiceController.updateQuestion);

// Включить/выключить вопрос
router.put('/questions/:questionId/toggle', practiceController.toggleQuestion);

// Удалить вопрос
router.delete('/questions/:questionId', practiceController.deleteQuestion);

// ========== СТУДЕНЧЕСКАЯ ЧАСТЬ ==========

// Получить разделы для студента (с фильтром по его предметам)
router.get('/student/:studentId', async (req, res) => {
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

    // Добавляем статистику (последняя попытка по каждому вопросу)
    const topicsWithStats = await Promise.all(
      practiceTopics.map(async (topic) => {
        const topicJSON = topic.toJSON();
        
        // Берём последнюю попытку по каждому вопросу
        const lastAttempts = await sequelize.query(`
          SELECT DISTINCT ON ("questionId") "questionId", "isCorrect"
          FROM practice_attempts
          WHERE "studentId" = :studentId AND "topicId" = :topicId
          ORDER BY "questionId", "createdAt" DESC
        `, {
          replacements: { studentId: parseInt(studentId), topicId: topic.id },
          type: sequelize.QueryTypes.SELECT
        });

        const total = lastAttempts.length;
        const correct = lastAttempts.filter(a => a.isCorrect).length;
        const successRate = total > 0 ? Math.round((correct / total) * 100) : 0;

        return {
          ...topicJSON,
          stats: {
            total,
            correct,
            incorrect: total - correct,
            successRate
          }
        };
      })
    );

    res.json({ practiceTopics: topicsWithStats });
  } catch (error) {
    console.error('Get student practice error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// ========== ПОПЫТКИ И СТАТИСТИКА ==========

// Сохранить попытку
router.post('/attempts', practiceController.saveAttempt);

// Получить статистику студента
router.get('/stats/:studentId', practiceController.getStudentStats);

// Получить статистику по топику
router.get('/topic-stats/:studentId/:topicId', practiceController.getTopicStats);

// Получить вопросы с ошибками
router.get('/incorrect/:studentId/:topicId', practiceController.getIncorrectQuestions);

module.exports = router;