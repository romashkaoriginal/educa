const express = require('express');
const multer = require('multer');
const router = express.Router();
const { Quiz, QuizQuestion, QuizParticipant, QuizAnswer, User, Subject } = require('../models');
const { Op } = require('sequelize');
const { requireRole, assertSelfOrStaff, assertBodyStudentId, isStaffRole } = require('../middleware/telegramAuth');
const isAdmin = requireRole(['admin', 'teacher']);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

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
router.get('/student/:studentId/stats', assertSelfOrStaff('studentId'), async (req, res) => {
  try {
    const { studentId } = req.params;
    const { sequelize } = require('../models');

    // Получаем все викторины студента с результатами
    const stats = await sequelize.query(`
      SELECT 
        q.id as "quizId",
        q.title as "quizTitle",
        q.status as "quizStatus",
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
        ) as "totalQuestions",
        (
          SELECT COALESCE(SUM(qq.points), 0)
          FROM quiz_questions qq
          WHERE qq."quizId" = q.id
        ) as "maxScore"
      FROM quiz_participants qp
      INNER JOIN quizzes q ON q.id = qp."quizId"
      INNER JOIN subjects s ON s.id = q."subjectId"
      WHERE qp."userId" = :studentId
        AND q."isDeleted" = false
      ORDER BY COALESCE(q."finishedAt", qp."joinedAt") DESC
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
    res.status(500).json({ message: 'Server error' });
  }
});

// Создать викторину
router.post('/create', isAdmin, async (req, res) => {
  try {
    const { title, description, subjectId, questions, createdBy, showLeaderboardAfterQuestion, showQuestionReview, showExplanations } = req.body;

    if (!title || !subjectId || !questions || questions.length === 0) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    const quiz = await Quiz.create({
      title,
      description,
      subjectId,
      accessCode: null,
      createdBy: createdBy || 1,
      status: 'draft',
      showLeaderboardAfterQuestion: showLeaderboardAfterQuestion !== false,
      showQuestionReview: showQuestionReview !== false,
      showExplanations: showExplanations !== false
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

router.get('/import-template', isAdmin, async (req, res) => {
  try {
    const ExcelJS = require('exceljs');
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Questions');
    sheet.columns = [
      { header: 'question', width: 40 },
      { header: 'a', width: 18 },
      { header: 'b', width: 18 },
      { header: 'c', width: 18 },
      { header: 'd', width: 18 },
      { header: 'correct', width: 10 },
      { header: 'time', width: 8 },
      { header: 'points', width: 8 },
      { header: 'explanation', width: 30 },
    ];
    sheet.addRow(['Чему равно 2+2?', '3', '4', '5', '6', 'b', 30, 1, 'Простое сложение']);
    sheet.addRow(['Столица Франции?', 'Берлин', 'Париж', 'Рим', 'Мадрид', 'b', 20, 1, '']);

    const info = workbook.addWorksheet('Инструкция');
    info.columns = [{ width: 18 }, { width: 80 }];
    [
      ['question', 'Текст вопроса'],
      ['a, b, c, d', 'Четыре варианта ответа (заполните все)'],
      ['correct', 'Буква правильного варианта: a / b / c / d'],
      ['time', 'Время на ответ в секундах (по умолчанию 30)'],
      ['points', 'Баллы за вопрос (по умолчанию 1, можно дробные)'],
      ['explanation', 'Необязательное пояснение к ответу'],
    ].forEach(r => info.addRow(r));

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=quiz_template.xlsx');
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Quiz import template error:', error);
    res.status(500).json({ message: 'Не удалось сформировать шаблон' });
  }
});

// Импорт вопросов викторины из Excel — возвращает распарсенные вопросы клиенту,
// который добавляет их в форму (создание происходит общим /create).
router.post('/import-questions', isAdmin, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'Файл не загружен' });

    const ExcelJS = require('exceljs');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(req.file.buffer);
    const sheet = workbook.worksheets[0];
    if (!sheet) return res.status(400).json({ message: 'В файле нет листов' });

    const headerRow = sheet.getRow(1).values.slice(1).map(h => String(h || '').trim().toLowerCase());
    const rows = [];
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const obj = {};
      row.values.slice(1).forEach((val, i) => { if (headerRow[i]) obj[headerRow[i]] = val ?? ''; });
      if (Object.values(obj).some(v => String(v).trim())) rows.push(obj);
    });

    if (rows.length === 0) return res.status(400).json({ message: 'Файл пустой или не содержит данных' });

    const LETTER_MAP = { a: 0, b: 1, c: 2, d: 3 };
    const questions = [];
    const errors = [];

    rows.forEach((row, i) => {
      const rowNum = i + 2;
      const questionText = String(row.question || '').trim();
      const options = [row.a, row.b, row.c, row.d].map(v => String(v || '').trim());
      const correct = String(row.correct || '').trim().toLowerCase();
      const timeLimit = parseInt(row.time, 10) || 30;
      const points = parseFloat(String(row.points || '').replace(',', '.')) || 1;
      const explanation = String(row.explanation || '').trim() || null;

      if (!questionText) { errors.push({ row: rowNum, reason: 'пустой текст вопроса' }); return; }
      if (options.some(o => !o)) { errors.push({ row: rowNum, reason: 'заполните все 4 варианта (a–d)' }); return; }
      if (!(correct in LETTER_MAP)) {
        errors.push({ row: rowNum, reason: `correct должен быть буквой a / b / c / d, получено "${correct}"` });
        return;
      }

      questions.push({
        questionText,
        options,
        correctAnswer: LETTER_MAP[correct],
        timeLimit,
        points,
        explanation,
      });
    });

    res.json({ imported: questions.length, skipped: errors.length, errors, questions });
  } catch (error) {
    console.error('Import quiz questions error:', error);
    res.status(500).json({ message: 'Ошибка при импорте' });
  }
});

// Найти викторину по коду (до /:id)
router.get('/code/:accessCode', async (req, res) => {
  try {
    const code = req.params.accessCode.toUpperCase();
    const studentId = req.query.studentId ? parseInt(req.query.studentId, 10) : null;

    // Стафф (admin/teacher/manager) может проверять викторину за любого ученика;
    // обычный пользователь — только за себя.
    const isStaff = isStaffRole(req.dbUser?.role);
    if (!studentId || (!isStaff && Number(studentId) !== Number(req.dbUser.id))) {
      return res.status(403).json({ code: 'NO_ACCESS', message: 'Access denied' });
    }

    if (!code || code.length < 4) {
      return res.status(404).json({
        code: 'NOT_FOUND',
        message: 'Викторина с таким кодом не найдена. Проверьте код и попробуйте еще раз.'
      });
    }

    const quiz = await Quiz.findOne({
      where: { accessCode: code, isDeleted: false },
      include: [
        { model: Subject, as: 'subject' },
        { model: QuizQuestion, as: 'questions', separate: true, order: [['order', 'ASC']] }
      ]
    });

    if (!quiz) {
      return res.status(404).json({
        code: 'NOT_FOUND',
        message: 'Викторина с таким кодом не найдена. Проверьте код и попробуйте еще раз.'
      });
    }

    if (quiz.status === 'finished') {
      let participated = false;
      if (studentId) {
        const p = await QuizParticipant.findOne({ where: { quizId: quiz.id, userId: studentId } });
        participated = !!p;
      }
      return res.status(400).json({
        code: 'FINISHED',
        message: 'Эта викторина уже завершена.',
        quizId: quiz.id,
        participated,
        quiz: { id: quiz.id, title: quiz.title, subject: quiz.subject }
      });
    }

    if (studentId) {
      const student = await User.findByPk(studentId, {
        include: [{ model: Subject, as: 'subjects', attributes: ['id'] }]
      });
      if (!student) {
        return res.status(404).json({ code: 'NOT_FOUND', message: 'Ученик не найден' });
      }
      const hasAccess = (student.subjects || []).some((s) => s.id === quiz.subjectId);
      if (!hasAccess) {
        return res.status(403).json({
          code: 'NO_ACCESS',
          message: 'У вас нет доступа к этой викторине.'
        });
      }
    }

    const participantCount = await QuizParticipant.count({ where: { quizId: quiz.id } });

    const safeQuestions = (quiz.questions || []).map((q) => {
      const item = typeof q.toJSON === 'function' ? q.toJSON() : { ...q };
      delete item.correctAnswer;
      return item;
    });

    res.json({
      quiz: {
        id: quiz.id,
        title: quiz.title,
        description: quiz.description,
        status: quiz.status,
        subject: quiz.subject,
        subjectId: quiz.subjectId,
        questions: safeQuestions,
        currentQuestionIndex: quiz.currentQuestionIndex,
        showLeaderboardAfterQuestion: quiz.showLeaderboardAfterQuestion !== false,
        showQuestionReview: quiz.showQuestionReview !== false,
        showExplanations: quiz.showExplanations !== false
      },
      participantCount
    });
  } catch (error) {
    console.error('Find by code error:', error);
    res.status(500).json({ message: 'Server error' });
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

// Найти викторину по коду — см. маршрут выше (перед /:id)

// Получить результаты викторины
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
        { model: QuizQuestion, as: 'question', attributes: ['id', 'questionText', 'correctAnswer', 'order', 'explanation', 'options', 'points'] },
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
router.get('/student/:studentId/subjects', assertSelfOrStaff('studentId'), async (req, res) => {
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