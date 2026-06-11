const express = require('express');
const router = express.Router();
const { Quiz, QuizQuestion, QuizParticipant, QuizAnswer, User, Subject } = require('../models');
const { Op } = require('sequelize');
const { requireRole } = require('../middleware/telegramAuth');
const isAdmin = requireRole(['admin', 'teacher']);

// Генерация уникального кода
function generateAccessCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Получить все викторины (admin)
router.get('/all', isAdmin, async (req, res) => {
  try {
    const quizzes = await Quiz.findAll({
      where: { isDeleted: false }, // ✅ показываем только не удалённые
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

// Статистика викторин студента
router.get('/student/:studentId/stats', async (req, res) => {
  try {
    const { studentId } = req.params;
    const { sequelize } = require('../models');

    // Получаем все викторины студента с результатами
    const stats = await sequelize.query(`
      SELECT 
        q.id as "quizId",
        q.title as "quizTitle",
        q."accessCode",
        s.id as "subjectId",
        s.name as "subjectName",
        s.icon as "subjectIcon",
        qp."totalScore",
        qp."joinedAt",
        q."finishedAt",
        (
          SELECT COUNT(*) 
          FROM quiz_participants qp2 
          WHERE qp2."quizId" = q.id
        ) as "totalParticipants",
        (
          SELECT COUNT(*) + 1
          FROM quiz_participants qp2
          WHERE qp2."quizId" = q.id 
            AND qp2."totalScore" > qp."totalScore"
        ) as "rank",
        (
          SELECT COUNT(DISTINCT qa.id)
          FROM quiz_answers qa
          WHERE qa."quizId" = q.id AND qa."userId" = :studentId AND qa."isCorrect" = true
        ) as "correctAnswers",
        (
          SELECT COUNT(DISTINCT qq.id)
          FROM quiz_questions qq
          WHERE qq."quizId" = q.id
        ) as "totalQuestions"
      FROM quiz_participants qp
      INNER JOIN quizzes q ON q.id = qp."quizId"
      INNER JOIN subjects s ON s.id = q."subjectId"
      WHERE qp."userId" = :studentId
        AND q.status = 'finished'
      ORDER BY q."finishedAt" DESC
    `, {
      replacements: { studentId: parseInt(studentId) },
      type: sequelize.QueryTypes.SELECT
    });

    // Общая статистика
    const totalStats = await sequelize.query(`
      SELECT 
        COUNT(DISTINCT qp."quizId") as "totalQuizzes",
        COALESCE(SUM(qp."totalScore"), 0) as "totalPoints",
        COALESCE(AVG(qp."totalScore"), 0) as "averageScore"
      FROM quiz_participants qp
      INNER JOIN quizzes q ON q.id = qp."quizId"
      WHERE qp."userId" = :studentId
        AND q.status = 'finished'
    `, {
      replacements: { studentId: parseInt(studentId) },
      type: sequelize.QueryTypes.SELECT
    });

    res.json({ 
      quizzes: stats,
      summary: totalStats[0] || { totalQuizzes: 0, totalPoints: 0, averageScore: 0 }
    });
  } catch (error) {
    console.error('Get student quiz stats error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Создать викторину
router.post('/create', isAdmin, async (req, res) => {
  try {
    const { title, description, subjectId, questions, createdBy } = req.body;

    if (!title || !subjectId || !questions || questions.length === 0) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    const quiz = await Quiz.create({
      title,
      description,
      subjectId,
      accessCode: null, // код генерируется отдельно в лобби
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
    const { id } = req.params;

    // Валидация: ID должен быть числом
    if (isNaN(parseInt(id))) {
      return res.status(400).json({ message: 'Invalid quiz ID' });
    }

    const quiz = await Quiz.findByPk(id, {
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

// Удалить викторину каскадно (вопросы, участники, ответы)
router.delete('/:id', isAdmin, async (req, res) => {
  try {
    const quizId = parseInt(req.params.id, 10);
    const quiz = await Quiz.findByPk(quizId);
    if (!quiz) {
      return res.status(404).json({ message: 'Quiz not found' });
    }

    await QuizAnswer.destroy({ where: { quizId } });
    await QuizParticipant.destroy({ where: { quizId } });
    await QuizQuestion.destroy({ where: { quizId } });
    await quiz.destroy();

    res.json({ message: 'Quiz deleted' });
  } catch (error) {
    console.error('Delete quiz error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Найти викторину по коду
router.get('/code/:accessCode', async (req, res) => {
  try {
    const code = req.params.accessCode.toUpperCase();
    if (!code || code.length < 4) {
      return res.status(404).json({ message: 'Неверный код' });
    }

    const quiz = await Quiz.findOne({
      where: { accessCode: code },
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
// Получить детальные результаты викторины
router.get('/:id/results', async (req, res) => {
  try {
    const quiz = await Quiz.findByPk(req.params.id, {
      include: [
        { model: Subject, as: 'subject' },
        { model: User, as: 'creator', attributes: ['id', 'firstName', 'lastName'] },
        { 
          model: QuizQuestion, 
          as: 'questions',
          order: [['order', 'ASC']]
        }
      ]
    });

    if (!quiz) {
      return res.status(404).json({ message: 'Quiz not found' });
    }

    // Участники с результатами
    const participants = await QuizParticipant.findAll({
      where: { quizId: req.params.id },
      include: [
        { model: User, as: 'user', attributes: ['id', 'firstName', 'lastName', 'telegramUsername'] }
      ],
      order: [['totalScore', 'DESC']]
    });

    // Все ответы
    const answers = await QuizAnswer.findAll({
      where: { quizId: req.params.id },
      include: [
        { model: QuizQuestion, as: 'question', attributes: ['id', 'questionText', 'correctAnswer', 'order'] },
        { model: User, as: 'user', attributes: ['id', 'firstName', 'lastName'] }
      ],
      order: [['answeredAt', 'ASC']]
    });

    // Группируем ответы по участникам и вопросам
    const participantsWithAnswers = participants.map(p => {
      const userAnswers = answers.filter(a => a.userId === p.userId);
      const correctCount = userAnswers.filter(a => a.isCorrect).length;
      const totalQuestions = quiz.questions.length;
      const accuracy = totalQuestions > 0 ? (correctCount / totalQuestions * 100).toFixed(0) : 0;
      
      return {
        ...p.toJSON(),
        correctAnswers: correctCount,
        totalQuestions,
        accuracy,
        answers: userAnswers
      };
    });

    // Статистика по вопросам
    const questionStats = quiz.questions.map(q => {
      const questionAnswers = answers.filter(a => a.questionId === q.id);
      const correctAnswers = questionAnswers.filter(a => a.isCorrect).length;
      const totalAnswers = questionAnswers.length;
      const accuracy = totalAnswers > 0 ? (correctAnswers / totalAnswers * 100).toFixed(0) : 0;

      return {
        questionId: q.id,
        questionText: q.questionText,
        order: q.order,
        correctAnswer: q.correctAnswer,
        totalAnswers,
        correctAnswers,
        accuracy
      };
    });

    res.json({ 
      quiz,
      participants: participantsWithAnswers,
      questionStats
    });
  } catch (error) {
    console.error('Get results error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});
// Получить предметы по которым у ученика были викторины
// Получить предметы ученика
router.get('/student/:studentId/subjects', async (req, res) => {
  try {
    const { studentId } = req.params;
    const { User } = require('../models');

    // Используем ассоциацию User → subjects (через UserSubject)
    const user = await User.findByPk(studentId, {
      include: [
        { 
          association: 'subjects', // Это правильная ассоциация из models/index.js
          attributes: ['id', 'name', 'icon']
        }
      ]
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

// POST /api/quiz/:id/generate-code — сгенерировать новый код (старый перестаёт работать)
router.post('/:id/generate-code', isAdmin, async (req, res) => {
  try {
    const quiz = await Quiz.findByPk(req.params.id);
    if (!quiz) return res.status(404).json({ message: 'Викторина не найдена' });

    // Генерируем уникальный код
    let accessCode;
    let isUnique = false;
    while (!isUnique) {
      accessCode = generateAccessCode();
      const exists = await Quiz.findOne({ where: { accessCode } });
      if (!exists) isUnique = true;
    }

    // Сбрасываем викторину в исходное состояние (новый код = новая сессия)
    await quiz.update({
      accessCode,
      status: 'draft',
      currentQuestionIndex: 0,
      startedAt: null,
      finishedAt: null
    });

    res.json({ accessCode, quiz });
  } catch (error) {
    console.error('Generate code error:', error);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

module.exports = router;