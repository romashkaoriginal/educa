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
    const { studentId } = req.params;

    // Получаем студента с его предметами
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

    // Получаем активные топики по предметам студента
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

    res.json({ practiceTopics });
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

// Получить вопросы с ошибками
router.get('/incorrect/:studentId/:topicId', practiceController.getIncorrectQuestions);

module.exports = router;