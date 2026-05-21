const express = require('express');
const router = express.Router();
const { Quiz, QuizQuestion, QuizParticipant, QuizAnswer, User, Subject } = require('../models');
const { Op } = require('sequelize');

// Генерация уникального кода
function generateAccessCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Создать викторину
router.post('/create', async (req, res) => {
  try {
    const { title, subjectId, questions } = req.body;

    if (!title || !questions || questions.length === 0) {
      return res.status(400).json({ message: 'Title and questions required' });
    }

    const accessCode = generateAccessCode();

    const quiz = await Quiz.create({
      title,
      subjectId,
      accessCode,
      status: 'waiting',
      createdBy: req.user?.id || 1
    });

    // Создаём вопросы
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      await QuizQuestion.create({
        quizId: quiz.id,
        questionText: q.questionText,
        options: q.options,
        correctAnswer: q.correctAnswer,
        explanation: q.explanation,
        timeLimit: q.timeLimit || 30,
        points: q.points || 1,
        order: i
      });
    }

    const quizWithQuestions = await Quiz.findByPk(quiz.id, {
      include: [{ model: QuizQuestion, as: 'questions' }]
    });

    res.status(201).json({ quiz: quizWithQuestions });
  } catch (error) {
    console.error('Create quiz error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Получить викторину по коду доступа
router.get('/code/:accessCode', async (req, res) => {
  try {
    const { accessCode } = req.params;

    const quiz = await Quiz.findOne({
      where: { accessCode: accessCode.toUpperCase() },
      include: [
        { 
          model: Subject, 
          as: 'subject',
          attributes: ['id', 'name', 'icon']
        },
        { 
          model: QuizQuestion, 
          as: 'questions',
          attributes: ['id', 'questionText', 'timeLimit', 'points', 'order']
        }
      ]
    });

    if (!quiz) {
      return res.status(404).json({ message: 'Quiz not found' });
    }

    res.json({ quiz });
  } catch (error) {
    console.error('Get quiz by code error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Получить все викторины
router.get('/', async (req, res) => {
  try {
    const quizzes = await Quiz.findAll({
      include: [
        { model: Subject, as: 'subject', attributes: ['name', 'icon'] },
        { model: QuizQuestion, as: 'questions' }
      ],
      order: [['createdAt', 'DESC']]
    });

    res.json({ quizzes });
  } catch (error) {
    console.error('Get quizzes error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Получить викторину по ID
router.get('/:quizId', async (req, res) => {
  try {
    const { quizId } = req.params;

    const quiz = await Quiz.findByPk(quizId, {
      include: [
        { model: Subject, as: 'subject' },
        { model: QuizQuestion, as: 'questions', order: [['order', 'ASC']] },
        { 
          model: QuizParticipant, 
          as: 'participants',
          include: [{ model: User, as: 'user', attributes: ['firstName', 'lastName'] }]
        }
      ]
    });

    if (!quiz) {
      return res.status(404).json({ message: 'Quiz not found' });
    }

    res.json({ quiz });
  } catch (error) {
    console.error('Get quiz error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Удалить викторину
router.delete('/:quizId', async (req, res) => {
  try {
    const { quizId } = req.params;

    const quiz = await Quiz.findByPk(quizId);
    if (!quiz) {
      return res.status(404).json({ message: 'Quiz not found' });
    }

    await quiz.destroy();
    res.json({ message: 'Quiz deleted successfully' });
  } catch (error) {
    console.error('Delete quiz error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Статистика студента по викторинам
router.get('/student/:studentId/stats', async (req, res) => {
  try {
    const { studentId } = req.params;

    const participations = await QuizParticipant.findAll({
      where: { userId: studentId },
      include: [{
        model: Quiz,
        include: [{
          model: Subject,
          as: 'subject',
          attributes: ['name', 'icon']
        }]
      }],
      order: [['createdAt', 'DESC']]
    });

    const quizzes = participations.map(p => ({
      quizId: p.quizId,
      quizTitle: p.Quiz?.title,
      subjectName: p.Quiz?.subject?.name,
      subjectIcon: p.Quiz?.subject?.icon,
      score: p.totalScore || 0,
      participationDate: p.createdAt
    }));

    const totalQuizzes = quizzes.length;
    const totalPoints = quizzes.reduce((sum, q) => sum + parseFloat(q.score || 0), 0);
    const averageScore = totalQuizzes > 0 ? totalPoints / totalQuizzes : 0;

    res.json({
      quizzes,
      summary: {
        totalQuizzes,
        totalPoints,
        averageScore
      }
    });
  } catch (error) {
    console.error('Get student quiz stats error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Получить предметы студента (для выбора викторины)
router.get('/student/:studentId/subjects', async (req, res) => {
  try {
    const { studentId } = req.params;

    const user = await User.findByPk(studentId, {
      include: [{ 
        association: 'subjects',
        attributes: ['id', 'name', 'icon']
      }]
    });

    if (!user) {
      return res.status(404).json({ message: 'Student not found' });
    }

    res.json({ subjects: user.subjects || [] });
  } catch (error) {
    console.error('Get student subjects error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;