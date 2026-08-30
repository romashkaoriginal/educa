const express = require('express');
const multer = require('multer');
const {
  requireRole,
  isStaffRole,
  assertSelfOrStaff,
  assertBodyStudentId,
  assertSubmissionOwner
} = require('../middleware/telegramAuth');
const isAdmin = requireRole(['admin', 'teacher']);
const { Homework, HomeworkQuestion, HomeworkSubmission, HomeworkAnswer, User, Subject, sequelize } = require('../models');
const { Op } = require('sequelize');
const { loadExcelWorkbook, normaliseExcelHeader } = require('../utils/loadExcelWorkbook');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// ВНИМАНИЕ: correctAnswer НЕ скрываем у ученика.
// Домашка использует correctAnswer на клиенте: для вопросов типа
// «порядок/сопоставление» это сами элементы для рендера, плюс мгновенная
// обратная связь. Итоговый балл считается на сервере (checkAnswer при сабмите),
// поэтому скрытие correctAnswer не даёт защиты, но ломает прохождение.
// Функция оставлена как no-op для обратной совместимости вызовов.
function sanitizeHomeworkPayload(homework /* , staff */) {
  return typeof homework.toJSON === 'function' ? homework.toJSON() : { ...homework };
}

async function assertHomeworkReadable(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ message: 'Invalid homework id' });
    if (isStaffRole(req.dbUser?.role)) return next();

    const homework = await Homework.findByPk(id, { attributes: ['id', 'subjectId'] });
    if (!homework) return res.status(404).json({ message: 'Homework not found' });

    const hasSubject = await User.findOne({
      where: { id: req.dbUser.id },
      include: [{
        model: Subject,
        as: 'subjects',
        where: { id: homework.subjectId },
        attributes: ['id'],
        required: true
      }]
    });
    if (!hasSubject) return res.status(403).json({ message: 'Access denied' });
    next();
  } catch (error) {
    console.error('assertHomeworkReadable:', error);
    res.status(500).json({ message: 'Server error' });
  }
}

// Get all homeworks (for admin)
router.get('/all', isAdmin, async (req, res) => {
  try {
    const homeworks = await Homework.findAll({
      include: [
        {
          model: Subject,
          as: 'subject',
          attributes: ['id', 'name', 'icon']
        },
        {
          model: HomeworkQuestion,
          as: 'questions',
          attributes: ['id']
        }
      ],
      order: [['createdAt', 'DESC']]
    });

    res.json({ homeworks });
  } catch (error) {
    console.error('Get all homeworks error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

const HW_TYPE_ALIASES = {
  single: 'single_choice', single_choice: 'single_choice',
  multiple: 'multiple_choice', multiple_choice: 'multiple_choice',
  short: 'short_answer', short_answer: 'short_answer',
  numeric: 'numeric', number: 'numeric',
  matching: 'matching',
  ordering: 'ordering',
  fill: 'fill_blanks', fill_blanks: 'fill_blanks',
  truefalse: 'true_false', true_false: 'true_false', tf: 'true_false',
};

router.get('/import-template', isAdmin, async (req, res) => {
  try {
    const ExcelJS = require('exceljs');
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Questions');

    sheet.columns = [
      { header: 'type', width: 16 },
      { header: 'question', width: 40 },
      { header: 'a', width: 18 },
      { header: 'b', width: 18 },
      { header: 'c', width: 18 },
      { header: 'd', width: 18 },
      { header: 'correct', width: 30 },
      { header: 'tolerance', width: 10 },
      { header: 'points', width: 8 },
      { header: 'explanation', width: 30 },
    ];

    // Примеры по каждому типу вопроса
    sheet.addRow(['single', 'Чему равно 2+2?', '3', '4', '5', '6', 'b', '', 10, 'Простое сложение']);
    sheet.addRow(['multiple', 'Какие числа чётные?', '2', '3', '4', '5', 'a,c', '', 10, '']);
    sheet.addRow(['truefalse', 'Земля круглая?', '', '', '', '', 'true', '', 5, '']);
    sheet.addRow(['short', 'Столица Франции?', '', '', '', '', 'Париж | Paris', '', 10, '']);
    sheet.addRow(['numeric', 'Ускорение свободного падения (м/с²)?', '', '', '', '', '9.8', '0.1', 10, '']);
    sheet.addRow(['ordering', 'Расставьте по возрастанию', '', '', '', '', '1 | 2 | 3 | 4', '', 10, 'Элементы через | в правильном порядке']);
    sheet.addRow(['matching', 'Соедините страну и столицу', '', '', '', '', 'Россия=Москва ; Франция=Париж', '', 10, 'Пары лево=право через ;']);
    sheet.addRow(['fill', 'Столица России — это ___, а Франции — ___', '', '', '', '', 'Москва ; Париж | Paris', '', 10, 'Пропуски через ; , варианты через |']);

    // Лист с инструкцией
    const info = workbook.addWorksheet('Инструкция');
    info.columns = [{ width: 18 }, { width: 80 }];
    const infoRows = [
      ['type', 'Тип вопроса: single, multiple, short, numeric, matching, ordering, fill, truefalse'],
      ['question', 'Текст вопроса. Для fill используйте ___ на месте пропусков'],
      ['a, b, c, d', 'Варианты ответов — только для single и multiple'],
      ['correct', 'Правильный ответ, зависит от типа (см. ниже)'],
      ['', ''],
      ['single', 'correct = буква варианта: a / b / c / d'],
      ['multiple', 'correct = буквы через запятую: a,c'],
      ['truefalse', 'correct = true или false'],
      ['short', 'correct = допустимые ответы через | (вертикальная черта): Париж | Paris'],
      ['numeric', 'correct = число (9.8), tolerance = допустимая погрешность ±'],
      ['ordering', 'correct = элементы в правильном порядке через |: Первый | Второй | Третий'],
      ['matching', 'correct = пары "лево=право" через ; : Россия=Москва ; Франция=Париж'],
      ['fill', 'correct = ответы по пропускам через ; , для каждого пропуска варианты через |: Москва ; Париж | Paris'],
      ['', ''],
      ['points', 'Баллы за вопрос (по умолчанию 10)'],
      ['explanation', 'Необязательное пояснение к ответу'],
    ];
    infoRows.forEach(r => info.addRow(r));

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=homework_template.xlsx');
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Homework import template error:', error);
    res.status(500).json({ message: 'Не удалось сформировать шаблон' });
  }
});

// Парсит одну строку Excel в объект вопроса домашки.
// Возвращает { question } либо { error }.
function parseHomeworkRow(row) {
  const typeRaw = String(row.type || '').trim().toLowerCase();
  const questionText = String(row.question || '').trim();
  const correctRaw = String(row.correct ?? '').trim();
  const points = parseInt(row.points, 10) || 10;
  const explanation = String(row.explanation || '').trim() || null;

  const questionType = HW_TYPE_ALIASES[typeRaw];
  if (!questionType) {
    return { error: `неизвестный тип "${row.type}" (допустимо: single, multiple, short, numeric, matching, ordering, fill, truefalse)` };
  }
  if (!questionText) return { error: 'пустой текст вопроса' };

  const LETTER_MAP = { a: 0, b: 1, c: 2, d: 3 };
  const base = { questionType, questionText, explanation, points };

  switch (questionType) {
    case 'single_choice': {
      const options = [row.a, row.b, row.c, row.d].map(v => String(v || '').trim()).filter(Boolean);
      if (options.length < 2) return { error: 'нужно минимум 2 варианта (колонки a–d)' };
      const idx = LETTER_MAP[correctRaw.toLowerCase()];
      if (idx === undefined || idx >= options.length) return { error: `correct должен быть буквой существующего варианта (a–d), получено "${correctRaw}"` };
      return { question: { ...base, options, correctAnswer: idx } };
    }
    case 'multiple_choice': {
      const options = [row.a, row.b, row.c, row.d].map(v => String(v || '').trim()).filter(Boolean);
      if (options.length < 2) return { error: 'нужно минимум 2 варианта (колонки a–d)' };
      const letters = correctRaw.toLowerCase().split(/[,\s]+/).filter(Boolean);
      const indices = letters.map(l => LETTER_MAP[l]);
      if (indices.length === 0 || indices.some(i => i === undefined || i >= options.length)) {
        return { error: `correct должен быть буквами вариантов через запятую (напр. a,c), получено "${correctRaw}"` };
      }
      return { question: { ...base, options, correctAnswer: indices } };
    }
    case 'true_false': {
      const v = correctRaw.toLowerCase();
      if (!['true', 'false', 'да', 'нет', 'верно', 'неверно'].includes(v)) {
        return { error: `correct должен быть true или false, получено "${correctRaw}"` };
      }
      const isTrue = ['true', 'да', 'верно'].includes(v);
      return { question: { ...base, options: null, correctAnswer: isTrue } };
    }
    case 'short_answer': {
      const variants = correctRaw.split('|').map(s => s.trim()).filter(Boolean);
      if (variants.length === 0) return { error: 'укажите хотя бы один правильный ответ в correct' };
      return { question: { ...base, options: null, correctAnswer: variants } };
    }
    case 'numeric': {
      const value = parseFloat(String(correctRaw).replace(',', '.'));
      if (Number.isNaN(value)) return { error: `correct должен быть числом, получено "${correctRaw}"` };
      const tolerance = parseFloat(String(row.tolerance || '').replace(',', '.')) || 0;
      return { question: { ...base, options: null, correctAnswer: { value, tolerance } } };
    }
    case 'ordering': {
      const items = correctRaw.split('|').map(s => s.trim()).filter(Boolean);
      if (items.length < 2) return { error: 'укажите минимум 2 элемента в correct через | в правильном порядке' };
      return { question: { ...base, options: null, correctAnswer: items } };
    }
    case 'matching': {
      const pairs = correctRaw.split(';').map(s => s.trim()).filter(Boolean).map(p => {
        const [left, right] = p.split('=').map(x => (x || '').trim());
        return { left, right };
      });
      if (pairs.length === 0 || pairs.some(p => !p.left || !p.right)) {
        return { error: 'укажите пары в формате "лево=право" через ; (напр. Россия=Москва ; Франция=Париж)' };
      }
      return { question: { ...base, options: pairs, correctAnswer: pairs } };
    }
    case 'fill_blanks': {
      // Каждый пропуск через ; ; внутри пропуска варианты через |
      const blanks = correctRaw.split(';').map(b => b.split('|').map(s => s.trim()).filter(Boolean)).filter(arr => arr.length);
      if (blanks.length === 0) return { error: 'укажите ответы для пропусков в correct (через ; , варианты через |)' };
      return { question: { ...base, options: null, correctAnswer: blanks } };
    }
    default:
      return { error: 'неподдерживаемый тип' };
  }
}

// Импорт вопросов домашки из Excel — возвращает распарсенные вопросы клиенту,
// который добавляет их в форму (создание/сохранение происходит общим эндпоинтом).
router.post('/import-questions', isAdmin, upload.single('file'), async (req, res) => {
  const logPrefix = `[Homework import-questions] user=${req.dbUser?.id}`;
  try {
    if (!req.file) {
      console.warn(`${logPrefix} FAILED: файл не загружен`);
      return res.status(400).json({ message: 'Файл не загружен' });
    }
    console.log(`${logPrefix} start: file="${req.file.originalname}" size=${req.file.size}b mime=${req.file.mimetype}`);

    const workbook = await loadExcelWorkbook(req.file.buffer);
    const sheet = workbook.worksheets[0];
    if (!sheet) {
      console.warn(`${logPrefix} FAILED: в файле нет листов`);
      return res.status(400).json({ message: 'В файле нет листов' });
    }

    const headerRow = sheet.getRow(1).values.slice(1).map(normaliseExcelHeader);
    console.log(`${logPrefix} sheet="${sheet.name}" rowCount=${sheet.rowCount} headers=${JSON.stringify(headerRow)}`);

    const rows = [];
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const obj = {};
      row.values.slice(1).forEach((val, i) => { if (headerRow[i]) obj[headerRow[i]] = val ?? ''; });
      // пропускаем полностью пустые строки
      if (Object.values(obj).some(v => String(v).trim())) rows.push(obj);
    });

    if (rows.length === 0) {
      console.warn(`${logPrefix} FAILED: файл пустой или не содержит данных`);
      return res.status(400).json({ message: 'Файл пустой или не содержит данных' });
    }

    const questions = [];
    const errors = [];
    rows.forEach((row, i) => {
      const rowNum = i + 2;
      const result = parseHomeworkRow(row);
      if (result.error) errors.push({ row: rowNum, reason: result.error });
      else questions.push(result.question);
    });

    if (errors.length > 0) {
      console.warn(`${logPrefix} done with errors: imported=${questions.length} skipped=${errors.length} errors=${JSON.stringify(errors)}`);
    } else {
      console.log(`${logPrefix} done: imported=${questions.length}`);
    }

    res.json({ imported: questions.length, skipped: errors.length, errors, questions });
  } catch (error) {
    console.error(`${logPrefix} EXCEPTION:`, error);
    res.status(500).json({ message: 'Ошибка при импорте' });
  }
});

// Get homework by ID with questions
router.get('/:id', assertHomeworkReadable, async (req, res) => {
  try {
    const { id } = req.params;
    const staff = isStaffRole(req.dbUser?.role);

    const homework = await Homework.findByPk(id, {
      include: [
        {
          model: Subject,
          as: 'subject',
          attributes: ['id', 'name', 'icon']
        },
        {
          model: HomeworkQuestion,
          as: 'questions',
          order: [['order', 'ASC']]
        }
      ]
    });

    if (!homework) {
      return res.status(404).json({ message: 'Homework not found' });
    }

    res.json({ homework: sanitizeHomeworkPayload(homework, staff) });
  } catch (error) {
    console.error('Get homework error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get homeworks for student (by their subjects)
router.get('/student/:studentId', assertSelfOrStaff('studentId'), async (req, res) => {
  try {
    const { studentId } = req.params;
    const staff = isStaffRole(req.dbUser?.role);

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
    const now = new Date();

    const homeworks = await Homework.findAll({
      where: {
        subjectId: { [Op.in]: subjectIds },
        isActive: true,
        openDate: { [Op.lte]: now },
        closeDate: { [Op.gte]: now }
      },
      include: [
        {
          model: Subject,
          as: 'subject',
          attributes: ['id', 'name', 'icon']
        },
        {
          model: HomeworkQuestion,
          as: 'questions',
          attributes: ['id', 'questionText', 'questionType', 'options', 'correctAnswer', 'points', 'order'],
          order: [['order', 'ASC']]
        }
      ],
      order: [['closeDate', 'ASC']]
    });

    // Get student's submissions to check attempts
    const submissions = await HomeworkSubmission.findAll({
      where: {
        userId: studentId,
        homeworkId: { [Op.in]: homeworks.map(h => h.id) }
      },
      attributes: ['homeworkId', 'attemptNumber', 'totalScore', 'maxScore', 'correctCount'],
      order: [['attemptNumber', 'DESC']]
    });

    const submissionsMap = {};
    submissions.forEach(sub => {
      if (!submissionsMap[sub.homeworkId]) {
        submissionsMap[sub.homeworkId] = {
          attempts: 0,
          bestScore: 0,
          bestCorrectCount: 0,
          maxScore: sub.maxScore
        };
      }
      submissionsMap[sub.homeworkId].attempts++;
      if (sub.totalScore > submissionsMap[sub.homeworkId].bestScore) {
        submissionsMap[sub.homeworkId].bestScore = sub.totalScore;
        submissionsMap[sub.homeworkId].bestCorrectCount = sub.correctCount ?? null;
      }
    });

    const homeworksWithStats = homeworks.map(hw => {
      const payload = sanitizeHomeworkPayload(hw, staff);
      return {
        ...payload,
        stats: submissionsMap[hw.id] || null
      };
    });

    res.json({ homeworks: homeworksWithStats });
  } catch (error) {
    console.error('Get student homeworks error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Create homework
router.post('/create', isAdmin, async (req, res) => {
  const logPrefix = `[Homework create] user=${req.dbUser?.id}`;
  try {
    const { title, description, subjectId, openDate, closeDate, maxAttempts, questions, createdBy } = req.body;

    console.log(`${logPrefix} request: title="${title}" subjectId=${subjectId} openDate=${openDate} closeDate=${closeDate} maxAttempts=${maxAttempts} questions=${Array.isArray(questions) ? questions.length : questions}`);

    if (!title || !subjectId || !openDate || !closeDate || !questions || questions.length === 0) {
      console.warn(`${logPrefix} FAILED: Missing required fields`, {
        hasTitle: !!title, hasSubjectId: !!subjectId, hasOpenDate: !!openDate,
        hasCloseDate: !!closeDate, questionsCount: questions?.length
      });
      return res.status(400).json({ message: 'Missing required fields' });
    }

    const creatorId = createdBy || 1;

    // Create homework
    const homework = await Homework.create({
      title,
      description,
      subjectId,
      openDate,
      closeDate,
      maxAttempts,
      createdBy: creatorId,
      isActive: true
    });

    console.log(`${logPrefix} homework created id=${homework.id} storedOpenDate=${homework.openDate?.toISOString?.() ?? homework.openDate} storedCloseDate=${homework.closeDate?.toISOString?.() ?? homework.closeDate} (now=${new Date().toISOString()})`);

    // Create questions
    const questionPromises = questions.map(q =>
      HomeworkQuestion.create({
        homeworkId: homework.id,
        questionType: q.questionType,
        questionText: q.questionText,
        options: q.options,
        correctAnswer: q.correctAnswer,
        explanation: q.explanation,
        points: q.points || 10,
        order: q.order || 0
      })
    );

    const createdQuestions = await Promise.all(questionPromises);

    console.log(`${logPrefix} done: homeworkId=${homework.id} questionsCreated=${createdQuestions.length}`);

    res.status(201).json({
      message: 'Homework created successfully',
      homeworkId: homework.id
    });
  } catch (error) {
    console.error(`${logPrefix} EXCEPTION:`, error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update homework
router.put('/:id', isAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, subjectId, openDate, closeDate, maxAttempts, questions } = req.body;

    const homework = await Homework.findByPk(id);
    if (!homework) {
      return res.status(404).json({ message: 'Homework not found' });
    }

    await homework.update({
      title,
      description,
      subjectId,
      openDate,
      closeDate,
      maxAttempts
    });

    await HomeworkQuestion.destroy({ where: { homeworkId: id } });

    const questionPromises = questions.map(q => 
      HomeworkQuestion.create({
        homeworkId: id,
        questionType: q.questionType,
        questionText: q.questionText,
        options: q.options,
        correctAnswer: q.correctAnswer,
        explanation: q.explanation,
        points: q.points || 10,
        order: q.order || 0
      })
    );

    await Promise.all(questionPromises);

    res.json({ message: 'Homework updated successfully' });
  } catch (error) {
    console.error('Update homework error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Toggle homework active status
router.patch('/:id/toggle', isAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const homework = await Homework.findByPk(id);
    if (!homework) {
      return res.status(404).json({ message: 'Homework not found' });
    }

    await homework.update({ isActive: !homework.isActive });

    res.json({ message: 'Status updated', isActive: homework.isActive });
  } catch (error) {
    console.error('Toggle homework error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete homework
router.delete('/:id', isAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const homework = await Homework.findByPk(id);
    if (!homework) {
      return res.status(404).json({ message: 'Homework not found' });
    }

    // Каскад в транзакции: answers → submissions/questions → homework.
    // Иначе FK (homework_answers.questionId / submissionId) блокируют удаление.
    await sequelize.transaction(async (t) => {
      const submissions = await HomeworkSubmission.findAll({ where: { homeworkId: id }, attributes: ['id'], transaction: t });
      const submissionIds = submissions.map(s => s.id);
      const questions = await HomeworkQuestion.findAll({ where: { homeworkId: id }, attributes: ['id'], transaction: t });
      const questionIds = questions.map(q => q.id);

      if (submissionIds.length) await HomeworkAnswer.destroy({ where: { submissionId: submissionIds }, transaction: t });
      if (questionIds.length) await HomeworkAnswer.destroy({ where: { questionId: questionIds }, transaction: t });
      await HomeworkSubmission.destroy({ where: { homeworkId: id }, transaction: t });
      await HomeworkQuestion.destroy({ where: { homeworkId: id }, transaction: t });
      await homework.destroy({ transaction: t });
    });

    res.json({ message: 'Homework deleted successfully' });
  } catch (error) {
    console.error('Delete homework error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Submit homework
router.post('/submit', assertBodyStudentId, async (req, res) => {
  try {
    const { homeworkId, studentId, answers, timeSpent } = req.body;

    const homework = await Homework.findByPk(homeworkId, {
      include: [{
        model: HomeworkQuestion,
        as: 'questions',
        order: [['order', 'ASC']]
      }]
    });

    if (!homework) {
      return res.status(404).json({ message: 'Homework not found' });
    }

    const now = new Date();
    if (now < new Date(homework.openDate) || now > new Date(homework.closeDate)) {
      return res.status(400).json({ message: 'Homework is not open for submissions' });
    }

    const submissionCount = await HomeworkSubmission.count({
      where: { homeworkId, userId: studentId }
    });

    if (homework.maxAttempts && submissionCount >= homework.maxAttempts) {
      return res.status(400).json({ message: 'Maximum attempts reached' });
    }

    let totalScore = 0;
    let maxScore = 0;
    const gradedAnswers = [];
    const answersByQuestionId = new Map(
      Array.isArray(answers)
        ? answers
          .filter((answer) => answer && typeof answer === 'object' && !Array.isArray(answer) && answer.questionId != null)
          .map((answer) => [Number(answer.questionId), answer.answer])
        : []
    );

    homework.questions.forEach((question, index) => {
      // Новые клиенты передают ответ вместе с ID вопроса. Это исключает
      // ошибочную проверку, если порядок вопросов в запросах отличается.
      // Массив по индексам оставлен для совместимости со старым фронтендом.
      const userAnswer = answersByQuestionId.has(Number(question.id))
        ? answersByQuestionId.get(Number(question.id))
        : answers[index];
      const isCorrect = checkAnswer(question, userAnswer);
      
      maxScore += question.points;
      if (isCorrect) {
        totalScore += question.points;
      }

      gradedAnswers.push({
        questionId: question.id,
        userAnswer: userAnswer,
        isCorrect: isCorrect
      });
    });

    const correctCount = gradedAnswers.filter(a => a.isCorrect).length;

    const insertResult = await sequelize.query(`
      INSERT INTO homework_submissions
      ("homeworkId", "userId", "attemptNumber", "totalScore", "maxScore", "correctCount", "submittedAt", "timeSpent", "status")
      VALUES (:homeworkId, :userId, :attemptNumber, :totalScore, :maxScore, :correctCount, NOW(), :timeSpent, 'submitted')
      RETURNING *
    `, {
      replacements: {
        homeworkId,
        userId: studentId,
        attemptNumber: submissionCount + 1,
        totalScore,
        maxScore,
        correctCount,
        timeSpent
      }
    });

    const submission = insertResult[0][0];

    if (!submission || !submission.id) {
      console.error('Failed to create submission:', insertResult);
      return res.status(500).json({ message: 'Failed to create submission' });
    }

    const answerPromises = gradedAnswers.map(ans =>
      HomeworkAnswer.create({
        submissionId: submission.id,
        questionId: ans.questionId,
        userAnswer: ans.userAnswer,
        isCorrect: ans.isCorrect
      })
    );

    await Promise.all(answerPromises);

    res.json({
      message: 'Homework submitted successfully',
      submissionId: submission.id,
      totalScore,
      maxScore,
      correctAnswers: correctCount,
      timeSpent,
      attemptsUsed: submissionCount + 1,
      maxAttempts: homework.maxAttempts,
      percentage: Math.round((totalScore / maxScore) * 100)
    });
  } catch (error) {
    console.error('Submit homework error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get homework submission with answers
router.get('/submission/:submissionId', assertSubmissionOwner, async (req, res) => {
  try {
    const { submissionId } = req.params;

    const submission = await HomeworkSubmission.findByPk(submissionId, {
      include: [
        {
          model: Homework,
          as: 'homework',
          include: [
            {
              model: Subject,
              as: 'subject'
            },
            {
              model: HomeworkQuestion,
              as: 'questions',
              order: [['order', 'ASC']]
            }
          ]
        },
        {
          model: HomeworkAnswer,
          as: 'answers',
          include: [{
            model: HomeworkQuestion,
            as: 'question'
          }]
        }
      ]
    });

    if (!submission) {
      return res.status(404).json({ message: 'Submission not found' });
    }

    res.json({ submission });
  } catch (error) {
    console.error('Get submission error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get homework results (for admin)
router.get('/:id/results', isAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const results = await HomeworkSubmission.findAll({
      where: { homeworkId: id },
      include: [{
        model: User,
        as: 'student',
        attributes: ['id', 'firstName', 'lastName', 'telegramUsername']
      }],
      order: [['submittedAt', 'DESC']]
    });

    res.json({ results });
  } catch (error) {
    console.error('Get results error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Helper function to check answers
function checkAnswer(question, userAnswer) {
  switch (question.questionType) {
    case 'single_choice':
      return userAnswer === question.correctAnswer;

    case 'multiple_choice':
      if (!Array.isArray(userAnswer) || !Array.isArray(question.correctAnswer)) return false;
      if (userAnswer.length !== question.correctAnswer.length) return false;
      const sorted1 = [...userAnswer].sort();
      const sorted2 = [...question.correctAnswer].sort();
      return sorted1.every((val, idx) => val === sorted2[idx]);

    case 'short_answer':
      if (!userAnswer) return false;
      const normalizedUser = userAnswer.toString().toLowerCase().trim().replace(/\s+/g, ' ');
      return question.correctAnswer.some(ans => 
        ans.toLowerCase().trim().replace(/\s+/g, ' ') === normalizedUser
      );

    case 'numeric':
      if (typeof userAnswer !== 'number') return false;
      const tolerance = question.correctAnswer.tolerance || 0;
      return Math.abs(userAnswer - question.correctAnswer.value) <= tolerance;

    case 'matching':
      if (!Array.isArray(userAnswer) || !Array.isArray(question.correctAnswer) || userAnswer.length !== question.correctAnswer.length) return false;
      return userAnswer.every((pair, idx) => {
        const correctPair = question.correctAnswer[idx];
        return pair.left === correctPair.left && pair.right === correctPair.right;
      });

    case 'ordering':
      if (!Array.isArray(userAnswer) || !Array.isArray(question.correctAnswer) || userAnswer.length !== question.correctAnswer.length) return false;
      return userAnswer.every((item, idx) => item === question.correctAnswer[idx]);

    case 'fill_blanks':
      if (!Array.isArray(userAnswer)) return false;
      if (!Array.isArray(question.correctAnswer) || userAnswer.length !== question.correctAnswer.length) return false;
      return userAnswer.every((answer, idx) => {
        const normalizedUser = String(answer ?? '').toLowerCase().trim().replace(/\s+/g, ' ');
        const possibleAnswers = question.correctAnswer[idx];
        const variants = Array.isArray(possibleAnswers) ? possibleAnswers : [possibleAnswers];
        return variants.some(ans =>
          String(ans ?? '').toLowerCase().trim().replace(/\s+/g, ' ') === normalizedUser
        );
      });

    case 'true_false':
      return userAnswer === question.correctAnswer;

    default:
      return false;
  }
}

// Get homework statistics for student
router.get('/student/:studentId/stats', assertSelfOrStaff('studentId'), async (req, res) => {
  try {
    const { studentId } = req.params;

    // Get student's subjects
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

    // Get all homeworks for student's subjects
    const homeworks = await Homework.findAll({
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
          model: HomeworkQuestion,
          as: 'questions',
          attributes: ['id', 'questionText', 'questionType', 'options', 'correctAnswer', 'points', 'order'],
          order: [['order', 'ASC']]
        }
      ]
    });

    // Get all submissions for this student
    const submissions = await HomeworkSubmission.findAll({
      where: {
        userId: studentId
      }
    });

    // Get all answers for these submissions to count correct ones
    const submissionIds = submissions.map(s => s.id);
    const allAnswers = submissionIds.length > 0
      ? await HomeworkAnswer.findAll({
          where: { submissionId: { [Op.in]: submissionIds } }
        })
      : [];

    // Calculate stats for each homework
    const homeworksWithStats = homeworks.map(hw => {
      const hwSubmissions = submissions.filter(s => s.homeworkId === hw.id);
      const bestSubmission = hwSubmissions.length > 0
        ? hwSubmissions.reduce((best, current) => 
            current.totalScore > best.totalScore ? current : best
          )
        : null;

      // Считаем правильные ответы для лучшей попытки
      let bestSubmissionWithCorrect = null;
      if (bestSubmission) {
        const answersForBest = allAnswers.filter(a => a.submissionId === bestSubmission.id);
        const correctAnswers = answersForBest.filter(a => a.isCorrect).length;
        bestSubmissionWithCorrect = {
          ...bestSubmission.toJSON(),
          correctAnswers,
          totalAnswers: answersForBest.length
        };
      }

      return {
        ...hw.toJSON(),
        submissionCount: hwSubmissions.length,
        bestSubmission: bestSubmissionWithCorrect
      };
    });

    // Calculate overall stats
    const now = new Date();
    const total = homeworks.length;
    const completed = homeworksWithStats.filter(hw => hw.bestSubmission).length;
    const active = homeworks.filter(hw => 
      new Date(hw.openDate) <= now && new Date(hw.closeDate) >= now
    ).length;

    const avgScore = completed > 0
      ? Math.round(
          homeworksWithStats
            .filter(hw => hw.bestSubmission)
            .reduce((sum, hw) => 
              sum + (hw.bestSubmission.totalScore / hw.bestSubmission.maxScore * 100), 0
            ) / completed
        )
      : 0;

    res.json({
      total,
      completed,
      active,
      avgScore,
      homeworks: homeworksWithStats
    });
  } catch (error) {
    console.error('Get homework stats error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
