const express = require('express');
const router = express.Router();
const { Quiz, QuizQuestion, QuizParticipant, QuizAnswer, User, Subject } = require('../models');
const { Op } = require('sequelize');

// Генерация уникального кода
function generateAccessCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// Получить все викторины (admin)
router.get('/all', async (req, res) => {
  try {
    const quizzes = await Quiz.findAll({
      include: [
        { model: Subject, as: 'subject' },
        { model: QuizQuestion, as: 'questions' },
        { model: QuizParticipant, as: 'participants' }
      ],
      order: [['createdAt', 'DESC']]
    });
    res.json({ quizzes });
  } catch (error) {
    console.error('Get quizzes error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Создать викторину
router.post('/create', async (req, res) => {
  try {
    const { title, description, subjectId, questions, createdBy } = req.body;

    if (!title || !subjectId || !questions || questions.length === 0) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    // Уникальный код
    let accessCode;
    let isUnique = false;
    while (!isUnique) {
      accessCode = generateAccessCode();
      const exists = await Quiz.findOne({ where: { accessCode } });
      if (!exists) isUnique = true;
    }

    const quiz = await Quiz.create({
      title,
      description,
      subjectId,
      accessCode,
      createdBy: createdBy || 1,
      status: 'draft'
    });

    // Создаём вопросы
    for (let i = 0; i < questions.length; i++) {
      await QuizQuestion.create({
        quizId: quiz.id,
        questionText: questions[i].questionText,
        options: questions[i].options,
        correctAnswer: questions[i].correctAnswer,
        timeLimit: questions[i].timeLimit || 30,
        points: questions[i].points || 1,
        order: i,
        explanation: questions[i].explanation
      });
    }

    res.json({ message: 'Quiz created', quiz });
  } catch (error) {
    console.error('Create quiz error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Получить викторину
router.get('/:id', async (req, res) => {
  try {
    const quiz = await Quiz.findByPk(req.params.id, {
      include: [
        { model: Subject, as: 'subject' },
        { model: QuizQuestion, as: 'questions', order: [['order', 'ASC']] },
        {
          model: QuizParticipant,
          as: 'participants',
          include: [{ model: User, as: 'user', attributes: ['id', 'firstName', 'lastName', 'telegramUsername'] }]
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
router.delete('/:id', async (req, res) => {
  try {
    await Quiz.destroy({ where: { id: req.params.id } });
    res.json({ message: 'Quiz deleted' });
  } catch (error) {
    console.error('Delete quiz error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Найти викторину по коду
router.get('/code/:accessCode', async (req, res) => {
  try {
    const quiz = await Quiz.findOne({
      where: { accessCode: req.params.accessCode.toUpperCase() },
      include: [
        { model: Subject, as: 'subject' },
        { model: QuizQuestion, as: 'questions' }
      ]
    });

    if (!quiz) {
      return res.status(404).json({ message: 'Викторина не найдена' });
    }

    if (quiz.status === 'finished') {
      return res.status(400).json({ message: 'Викторина уже завершена' });
    }

    res.json({ quiz });
  } catch (error) {
    console.error('Find by code error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Получить результаты викторины
router.get('/:id/results', async (req, res) => {
  try {
    const participants = await QuizParticipant.findAll({
      where: { quizId: req.params.id },
      include: [
        { model: User, as: 'user', attributes: ['id', 'firstName', 'lastName', 'telegramUsername'] }
      ],
      order: [['totalScore', 'DESC']]
    });

    const answers = await QuizAnswer.findAll({
      where: { quizId: req.params.id },
      include: [
        { model: QuizQuestion, as: 'question' },
        { model: User, as: 'user', attributes: ['id', 'firstName', 'lastName'] }
      ]
    });

    res.json({ participants, answers });
  } catch (error) {
    console.error('Get results error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;