const express = require('express');
const { PracticeTopic, PracticeQuestion, User, Subject } = require('../models');
const { Op } = require('sequelize');
const practiceController = require('../controllers/practiceController');

const router = express.Router();

// ========== АДМИН/УЧИТЕЛЬ РОУТЫ ==========

// Топики/разделы
router.get('/topics/:subjectId', practiceController.getTopicsBySubject);
router.post('/topics', practiceController.createTopic);

// Вопросы
router.get('/questions/:topicId', practiceController.getQuestionsByTopic);
router.post('/questions', practiceController.createQuestion);
router.put('/questions/:questionId', practiceController.updateQuestion);
router.put('/questions/:questionId/toggle', practiceController.toggleQuestion);
router.delete('/questions/:questionId', practiceController.deleteQuestion);

// ========== СТУДЕНТ РОУТЫ ==========

// Получить практику для конкретного студента (только по его предметам)
router.get('/student/:studentId', async (req, res) => {
  try {
    const { studentId } = req.params;

    // Получаем предметы студента
    const student = await User.findByPk(studentId, {
      include: [{
        model: Subject,
        as: 'subjects',
        attributes: ['id']
      }]
    });

    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    const subjectIds = student.subjects.map(s => s.id);

    // Получаем практики по предметам студента
    const practiceTopics = await PracticeTopic.findAll({
      where: {
        subjectId: { [Op.in]: subjectIds },
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
      order: [['createdAt', 'DESC']]
    });

    res.json({ practiceTopics });
  } catch (error) {
    console.error('Get student practice error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});


// Сохранить попытку
router.post('/attempts', practiceController.saveAttempt);

// Статистика студента
router.get('/stats/:studentId', practiceController.getStudentStats);

// Вопросы с ошибками
router.get('/incorrect/:studentId/:topicId', practiceController.getIncorrectQuestions);

module.exports = router;