const express = require('express');
const { Op, fn, col, QueryTypes } = require('sequelize');
const {
  sequelize, User, Subject, UserSubject, TeacherSubject,
  Lesson, LessonPoll, LessonPollOption, LessonPollAnswer,
  LessonQuiz, LessonQuizQuestion, LessonQuizAnswer, LessonQuizDelivery, LessonQuizParticipant, PracticeQuestion, PracticeImage,
  LessonQuestion, LessonReaction, LessonAttendance, LessonMaterial, Homework
} = require('../models');
const {
  activeAccessWhere, teacherCanManageLesson
} = require('../middleware/lessonAccess');
const { startLessonById, startInstantLesson, finishLessonById } = require('../services/lessonSession');
const { getPollResults, lessonInclude } = require('../services/lessonState');
const { emitToLesson, emitToLessonAdmins } = require('../services/lessonRealtime');
const { nextQuestionState } = require('../services/lessonQuizFlow');
const {
  WEEKLY_SQL, buildLessonQuizLeaderboard, withQuestionTimeLimits, presentLessonQuiz
} = require('../services/streamPresentation');

const router = express.Router();
const quizQuestionTimers = new Map();

function clearQuizQuestionTimer(quizId) {
  const timer = quizQuestionTimers.get(Number(quizId));
  if (timer) clearTimeout(timer);
  quizQuestionTimers.delete(Number(quizId));
}

// Таймер — серверный: после дедлайна вопрос закрывается даже если преподаватель
// не держит открытым экран трансляции. Повторная проверка защищает от старого
// таймера после перехода к следующему вопросу или завершения викторины.
function scheduleQuizQuestionClose(quiz, question) {
  if (!quiz?.questionStartedAt || !question?.timeLimit) return;
  clearQuizQuestionTimer(quiz.id);
  const startedAt = new Date(quiz.questionStartedAt).getTime();
  const delay = Math.max(0, startedAt + Number(question.timeLimit) * 1000 - Date.now());
  const timer = setTimeout(async () => {
    quizQuestionTimers.delete(Number(quiz.id));
    try {
      const current = await LessonQuiz.findByPk(quiz.id);
      if (!current || current.status !== 'active' || current.questionRevealState !== 'question'
        || Number(current.currentQuestionIndex) !== Number(quiz.currentQuestionIndex)
        || new Date(current.questionStartedAt).getTime() !== startedAt) return;
      await current.update({ questionRevealState: 'answer' });
      emitToLesson(current.lessonId, 'quiz:answer-revealed', { quizId: current.id, closed: true, reason: 'timer' });
    } catch (error) {
      console.error('Close lesson quiz question by timer', error);
    }
  }, delay + 20);
  quizQuestionTimers.set(Number(quiz.id), timer);
}

const POLL_TEMPLATES = {
  clear_unclear: { question: 'Всё понятно?', options: ['Понятно', 'Непонятно'] },
  yes_no: { question: 'Вы согласны?', options: ['Да', 'Нет'] },
  pace: { question: 'Какой темп занятия?', options: ['Быстрее', 'Нормально', 'Медленнее'] },
  repeat_or_continue: { question: 'Что делаем дальше?', options: ['Повторить', 'Идём дальше'] },
  keeping_up: { question: 'Успеваете?', options: ['Успеваю', 'Не успеваю'] }
};

const bad = (res, message, status = 400) => res.status(status).json({ message });
const parseHttpUrl = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return { ok: true, value: null };
  try {
    const url = new URL(raw);
    return ['http:', 'https:'].includes(url.protocol)
      ? { ok: true, value: url.toString() }
      : { ok: false };
  } catch {
    return { ok: false };
  }
};
const fail = (res, error, label) => {
  console.error(label, error);
  if (error.name === 'SequelizeValidationError' || error.name === 'SequelizeUniqueConstraintError') {
    return res.status(400).json({ message: error.errors?.[0]?.message || error.message });
  }
  return res.status(500).json({ message: 'Ошибка сервера' });
};

// ТЗ §3.1: преподаватель определяется автоматически по аккаунту. Для админа —
// преподаватель, назначенный на предмет; если такого нет, занятие остаётся без
// явного преподавателя и им управляет админ.
async function resolveLessonTeacherId(user, subjectId) {
  if (user.role === 'teacher') return user.id;
  const assignment = await TeacherSubject.findOne({
    where: { subjectId }, attributes: ['teacherId'], raw: true
  });
  return assignment ? Number(assignment.teacherId) : null;
}

// Предметы, доступные преподавателю для расписания и запуска занятий.
async function manageableSubjectIds(user) {
  if (user.role === 'admin' || user.role === 'superadmin') return null;
  const rows = await TeacherSubject.findAll({
    where: { teacherId: user.id }, attributes: ['subjectId'], raw: true
  });
  return [...new Set(rows.map((row) => Number(row.subjectId)))];
}

async function requireLessonAccess(req, res, next) {
  try {
    const lessonId = Number(req.params.id || req.params.lessonId || req.lessonId);
    if (!lessonId) return bad(res, 'Некорректный id занятия');
    if (!(await teacherCanManageLesson(req.dbUser, lessonId))) return bad(res, 'Нет прав на это занятие', 403);
    req.lessonId = lessonId;
    next();
  } catch (error) {
    fail(res, error, 'Teacher lesson access');
  }
}

async function resolveParentLesson(req, res, next) {
  try {
    let lessonId = null;
    if (req.params.pollId) lessonId = (await LessonPoll.findByPk(req.params.pollId, { attributes: ['lessonId'] }))?.lessonId;
    if (req.params.quizId) lessonId = (await LessonQuiz.findByPk(req.params.quizId, { attributes: ['lessonId'] }))?.lessonId;
    if (req.params.questionId && !req.params.quizId) lessonId = (await LessonQuestion.findByPk(req.params.questionId, { attributes: ['lessonId'] }))?.lessonId;
    if (req.params.materialId) lessonId = (await LessonMaterial.findByPk(req.params.materialId, { attributes: ['lessonId'] }))?.lessonId;
    if (!lessonId) return bad(res, 'Объект не найден', 404);
    req.lessonId = Number(lessonId);
    if (!(await teacherCanManageLesson(req.dbUser, lessonId))) return bad(res, 'Нет прав на это занятие', 403);
    next();
  } catch (error) {
    fail(res, error, 'Resolve lesson parent');
  }
}

router.get('/stream/weekly', async (req, res) => {
  try {
    const requestedSubjectId = req.query.subjectId ? Number(req.query.subjectId) : null;
    const periodDays = Number(req.query.periodDays || 7);
    if (!Number.isInteger(requestedSubjectId) || ![7, 30].includes(periodDays)) return bad(res, 'Выберите предмет и период 7 или 30 дней');
    const allowedSubjectIds = await manageableSubjectIds(req.dbUser);
    if (allowedSubjectIds && requestedSubjectId && !allowedSubjectIds.includes(requestedSubjectId)) {
      return bad(res, 'Нет доступа к этому предмету', 403);
    }
    if (allowedSubjectIds?.length === 0) {
      return res.json({
        title: 'Лидеры недели', phase: 'weekly', serverNow: Date.now(),
        periodDays, participantCount: 0, leaderboard: []
      });
    }
    const until = new Date();
    const since = new Date(until.getTime() - periodDays * 24 * 60 * 60 * 1000);
    const rows = await sequelize.query(WEEKLY_SQL, {
      type: QueryTypes.SELECT,
      replacements: {
        since, until, subjectId: requestedSubjectId,
        restrictSubjects: Boolean(allowedSubjectIds),
        allowedSubjectIds: allowedSubjectIds?.length ? allowedSubjectIds : [0]
      }
    });
    res.json({
      title: `Лидеры за ${periodDays} дней`, phase: 'weekly', serverNow: until.getTime(), periodDays,
      participantCount: rows.length,
      leaderboard: rows.map((row, index) => {
        const previous = rows[index - 1];
        const samePlace = previous
          && Number(previous.totalScore) === Number(row.totalScore)
          && Number(previous.homeworkScore) === Number(row.homeworkScore);
        return {
          id: Number(row.id), name: row.name || 'Участник', totalScore: Number(row.totalScore) || 0,
          place: samePlace ? rows.findIndex((item) => Number(item.totalScore) === Number(row.totalScore) && Number(item.homeworkScore) === Number(row.homeworkScore)) + 1 : index + 1
        };
      })
    });
  } catch (error) { fail(res, error, 'Get weekly stream leaderboard'); }
});

router.get('/teacher-subjects', async (req, res) => {
  if (!['admin', 'superadmin'].includes(req.dbUser.role)) return bad(res, 'Только администратор видит назначения', 403);
  try {
    const assignments = await TeacherSubject.findAll({
      include: [
        { model: User, as: 'teacher', attributes: ['id', 'firstName', 'lastName'] },
        { model: Subject, as: 'subject', attributes: ['id', 'name'] }
      ]
    });
    res.json({ assignments });
  } catch (error) { fail(res, error, 'Get teacher assignments'); }
});

// Преподаватель назначается напрямую на предмет — групп больше нет.
router.post('/teacher-subjects', async (req, res) => {
  if (!['admin', 'superadmin'].includes(req.dbUser.role)) return bad(res, 'Только администратор назначает преподавателей', 403);
  try {
    const [teacher, subject] = await Promise.all([
      User.findByPk(req.body.teacherId), Subject.findByPk(req.body.subjectId)
    ]);
    if (!teacher || teacher.role !== 'teacher' || !subject) return bad(res, 'Некорректный преподаватель или предмет');
    const [assignment, created] = await TeacherSubject.findOrCreate({
      where: { teacherId: teacher.id, subjectId: subject.id },
      defaults: { teacherId: teacher.id, subjectId: subject.id }
    });
    await assignment.reload({ include: [{ model: Subject, as: 'subject', attributes: ['id', 'name'] }] });
    res.status(created ? 201 : 200).json({ assignment });
  } catch (error) { fail(res, error, 'Create teacher assignment'); }
});

router.delete('/teacher-subjects/:id', async (req, res) => {
  if (!['admin', 'superadmin'].includes(req.dbUser.role)) return bad(res, 'Только администратор меняет назначения', 403);
  try {
    await TeacherSubject.destroy({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (error) { fail(res, error, 'Delete teacher assignment'); }
});

router.get('/lessons', async (req, res) => {
  try {
    const where = {};
    if (req.query.subjectId) where.subjectId = req.query.subjectId;
    if (req.query.status) where.status = req.query.status;
    if (req.query.dateFrom || req.query.dateTo) {
      where.scheduledAt = {};
      if (req.query.dateFrom) where.scheduledAt[Op.gte] = new Date(req.query.dateFrom);
      if (req.query.dateTo) where.scheduledAt[Op.lte] = new Date(req.query.dateTo);
    }
    // Преподаватель видит занятия только по своим предметам (ТЗ §3.1).
    const subjectIds = await manageableSubjectIds(req.dbUser);
    if (subjectIds) {
      where[Op.and] = [
        ...(where[Op.and] || []),
        { [Op.or]: [{ subjectId: { [Op.in]: subjectIds } }, { teacherId: req.dbUser.id }] }
      ];
    }
    if (req.query.fromSchedule === '1') where.fromSchedule = true;
    const lessons = await Lesson.findAll({ where, include: lessonInclude, order: [['scheduledAt', 'DESC']] });
    res.json({ lessons });
  } catch (error) { fail(res, error, 'Get admin lessons'); }
});

router.get('/lessons/:id/state', requireLessonAccess, async (req, res) => {
  try {
    const lesson = await Lesson.findByPk(req.lessonId, { include: lessonInclude });
    if (!lesson) return bad(res, 'Занятие не найдено', 404);
    const [polls, quizzes, materials] = await Promise.all([
      LessonPoll.findAll({
        where: { lessonId: lesson.id },
        include: [{ model: LessonPollOption, as: 'options' }],
        order: [['createdAt', 'DESC']]
      }),
      LessonQuiz.findAll({
        where: { lessonId: lesson.id },
        include: [{ model: LessonQuizQuestion, as: 'questions' }],
        order: [['createdAt', 'DESC']]
      }),
      LessonMaterial.findAll({ where: { lessonId: lesson.id }, order: [['createdAt', 'DESC']] })
    ]);
    res.json({ lesson, polls, quizzes, materials });
  } catch (error) { fail(res, error, 'Get lesson admin state'); }
});

// Викторины готовятся в отдельном разделе. В карточке занятия преподаватель
// только выбирает уже привязанную викторину и управляет её проведением.
router.get('/standalone-quizzes', async (req, res) => {
  try {
    const allowedSubjectIds = await manageableSubjectIds(req.dbUser);
    const where = {};
    if (allowedSubjectIds) where.subjectId = { [Op.in]: allowedSubjectIds };
    const lessons = await Lesson.findAll({
      where,
      include: [{
        model: LessonQuiz,
        as: 'quizzes',
        include: [{ model: LessonQuizQuestion, as: 'questions' }]
      }, { model: Subject, as: 'subject', attributes: ['id', 'name', 'icon'] }],
      order: [['scheduledAt', 'DESC']]
    });
    const quizzes = lessons.flatMap((lesson) => (lesson.quizzes || []).map((quiz) => ({
      ...quiz.toJSON(),
      lesson: {
        id: lesson.id,
        subjectId: lesson.subjectId,
        subject: lesson.subject,
        topic: lesson.topic,
        scheduledAt: lesson.scheduledAt,
        status: lesson.status,
        teacherId: lesson.teacherId
      }
    })));
    res.json({ quizzes });
  } catch (error) { fail(res, error, 'Get standalone lesson quizzes'); }
});

router.get('/scheduled-lessons-for-quizzes', async (req, res) => {
  try {
    const allowedSubjectIds = await manageableSubjectIds(req.dbUser);
    const where = { status: 'scheduled' };
    if (allowedSubjectIds) where.subjectId = { [Op.in]: allowedSubjectIds };
    const lessons = await Lesson.findAll({
      where,
      include: [
        { model: Subject, as: 'subject', attributes: ['id', 'name', 'icon'] },
        { model: LessonQuiz, as: 'quizzes', attributes: ['id', 'title'] },
        { model: User, as: 'teacher', attributes: ['id', 'firstName', 'lastName'] }
      ],
      order: [['scheduledAt', 'ASC']]
    });
    res.json({ lessons: lessons.map((lesson) => ({
      ...lesson.toJSON(),
      hasQuiz: (lesson.quizzes || []).length > 0,
      quizId: lesson.quizzes?.[0]?.id || null
    })) });
  } catch (error) { fail(res, error, 'Get scheduled lessons for quizzes'); }
});

// ТЗ §3.1/§8.7-8.9: в расписании указываются только дата, время и тема.
// Ни групп, ни выбора преподавателя, ни ссылки на трансляцию здесь нет —
// преподаватель определяется по аккаунту, предмет по выбранному разделу.
router.post('/lessons', async (req, res) => {
  try {
    const { subjectId, scheduledAt, topic } = req.body;
    const subject = await Subject.findByPk(subjectId);
    const date = new Date(scheduledAt);
    if (!subject || Number.isNaN(date.getTime())) return bad(res, 'Укажите предмет и корректную дату');
    const teacherId = await resolveLessonTeacherId(req.dbUser, subject.id);
    const lesson = await Lesson.create({
      subjectId: subject.id,
      teacherId,
      scheduledAt: date,
      topic: String(topic || '').trim() || null,
      fromSchedule: true,
      createdBy: req.dbUser.id
    });
    await lesson.reload({ include: lessonInclude });
    res.status(201).json({ lesson });
  } catch (error) { fail(res, error, 'Create lesson'); }
});

// ТЗ §7: преподаватель может отредактировать дату, время и тему записи расписания.
router.patch('/lessons/:id', requireLessonAccess, async (req, res) => {
  try {
    const lesson = await Lesson.findByPk(req.lessonId);
    if (lesson.status === 'live') return bad(res, 'Сначала завершите занятие', 409);
    const patch = {};
    if (req.body.topic !== undefined) patch.topic = String(req.body.topic || '').trim() || null;
    if (req.body.scheduledAt) {
      const date = new Date(req.body.scheduledAt);
      if (Number.isNaN(date.getTime())) return bad(res, 'Некорректная дата');
      patch.scheduledAt = date;
    }
    await lesson.update(patch);
    await lesson.reload({ include: lessonInclude });
    res.json({ lesson });
  } catch (error) { fail(res, error, 'Update lesson'); }
});

router.post('/lessons/:id/postpone', requireLessonAccess, async (req, res) => {
  try {
    const lesson = await Lesson.findByPk(req.lessonId);
    if (lesson.status !== 'scheduled') return bad(res, 'Переносить можно только запланированное занятие', 409);
    const scheduledAt = new Date(req.body.scheduledAt);
    if (Number.isNaN(scheduledAt.getTime())) return bad(res, 'Укажите новую дату');
    await lesson.update({
      originalScheduledAt: lesson.originalScheduledAt || lesson.scheduledAt,
      scheduledAt,
      reminderSentAt: null
    });
    res.json({ lesson });
  } catch (error) { fail(res, error, 'Postpone lesson'); }
});

router.post('/lessons/:id/cancel', requireLessonAccess, async (req, res) => {
  try {
    const lesson = await Lesson.findByPk(req.lessonId);
    if (lesson.status !== 'scheduled') return bad(res, 'Отменить можно только запланированное занятие', 409);
    await lesson.update({ status: 'cancelled' });
    res.json({ lesson });
  } catch (error) { fail(res, error, 'Cancel lesson'); }
});

router.delete('/lessons/:id', requireLessonAccess, async (req, res) => {
  try {
    const lesson = await Lesson.findByPk(req.lessonId);
    if (!lesson) return bad(res, 'Занятие не найдено', 404);
    // ТЗ §7: преподаватель может удалить запись расписания. Идущее занятие
    // сначала нужно завершить.
    if (lesson.status === 'live') return bad(res, 'Сначала завершите занятие', 409);
    await sequelize.transaction(async (transaction) => {
      // All lesson-owned records use ON DELETE CASCADE. The transaction makes
      // the destructive operation atomic if any database constraint rejects it.
      await lesson.destroy({ transaction });
    });
    res.json({ ok: true, deletedLessonId: lesson.id });
  } catch (error) { fail(res, error, 'Delete lesson'); }
});

// ТЗ §3.2/§8.11: занятие запускается из пункта расписания. Ссылка на трансляцию
// указывается именно здесь, тему при необходимости можно изменить.
router.post('/lessons/:id/start', requireLessonAccess, async (req, res) => {
  try {
    const stream = parseHttpUrl(req.body.streamUrl);
    if (!stream.ok || !stream.value) return bad(res, 'Укажите ссылку на трансляцию, начинающуюся с http:// или https://');
    const result = await startLessonById(req.lessonId, {
      streamUrl: stream.value,
      topic: req.body.topic,
      teacherId: req.dbUser.role === 'teacher' ? req.dbUser.id : undefined
    });
    if (result.error) return bad(res, result.error, result.status);
    res.json(result);
  } catch (error) { fail(res, error, 'Start lesson'); }
});

// ТЗ §7 «Отдельный быстрый запуск» / §8.12: занятие вне расписания.
// Тема необязательна, ссылка на трансляцию обязательна.
router.post('/lessons/start-now', async (req, res) => {
  try {
    const subject = await Subject.findByPk(req.body.subjectId);
    if (!subject) return bad(res, 'Выберите предмет занятия');
    const allowedSubjectIds = await manageableSubjectIds(req.dbUser);
    if (allowedSubjectIds && !allowedSubjectIds.includes(Number(subject.id))) {
      return bad(res, 'Нет прав на занятия по этому предмету', 403);
    }
    const stream = parseHttpUrl(req.body.streamUrl);
    if (!stream.ok || !stream.value) return bad(res, 'Укажите ссылку на трансляцию, начинающуюся с http:// или https://');
    const result = await startInstantLesson({
      subjectId: subject.id,
      streamUrl: stream.value,
      topic: req.body.topic,
      teacherId: await resolveLessonTeacherId(req.dbUser, subject.id)
    });
    if (result.error) return bad(res, result.error, result.status);
    res.status(201).json(result);
  } catch (error) { fail(res, error, 'Start instant lesson'); }
});

router.post('/lessons/:id/finish', requireLessonAccess, async (req, res) => {
  try {
    const result = await finishLessonById(req.lessonId);
    if (result.error) return bad(res, result.error, result.status);
    res.json(result);
  } catch (error) { fail(res, error, 'Finish lesson'); }
});

// ТЗ §4.2: преподаватель может временно отключить вопросы от учеников.
router.post('/lessons/:id/questions-toggle', requireLessonAccess, async (req, res) => {
  try {
    const lesson = await Lesson.findByPk(req.lessonId);
    if (!lesson) return bad(res, 'Занятие не найдено', 404);
    await lesson.update({ questionsEnabled: Boolean(req.body.enabled) });
    emitToLesson(lesson.id, 'lesson:questions-toggled', {
      lessonId: lesson.id, questionsEnabled: lesson.questionsEnabled
    });
    res.json({ lesson });
  } catch (error) { fail(res, error, 'Toggle lesson questions'); }
});

router.post('/lessons/:id/polls', requireLessonAccess, async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const lesson = await Lesson.findByPk(req.lessonId, { transaction });
    if (lesson.status !== 'live') { await transaction.rollback(); return bad(res, 'Голосование создаётся только во время занятия', 409); }
    const template = req.body.template || 'custom';
    const preset = POLL_TEMPLATES[template];
    const question = String(preset?.question || req.body.question || '').trim();
    const options = (preset?.options || req.body.options || []).map((item) => String(item).trim()).filter(Boolean);
    if (!question || options.length < 2 || options.length > 6) { await transaction.rollback(); return bad(res, 'Укажите вопрос и от 2 до 6 вариантов'); }
    const durationSec = req.body.durationSec ? Number(req.body.durationSec) : null;
    if (durationSec != null && (!Number.isInteger(durationSec) || durationSec < 10 || durationSec > 7200)) {
      await transaction.rollback(); return bad(res, 'Длительность должна быть от 10 до 7200 секунд');
    }
    const poll = await LessonPoll.create({
      lessonId: lesson.id,
      template,
      question,
      isAnonymous: req.body.isAnonymous == null ? template === 'clear_unclear' : Boolean(req.body.isAnonymous),
      showResultsToStudents: req.body.showResultsToStudents !== false,
      durationSec,
      createdBy: req.dbUser.id
    }, { transaction });
    await LessonPollOption.bulkCreate(options.map((text, order) => ({ pollId: poll.id, text, order })), { transaction });
    await transaction.commit();
    await poll.reload({ include: [{ model: LessonPollOption, as: 'options' }] });
    res.status(201).json({ poll });
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    fail(res, error, 'Create lesson poll');
  }
});

// ТЗ §5 состояние №6: одновременно допускается только одна основная активность.
const ONE_ACTIVITY_MESSAGE = 'Сначала завершите текущее голосование или вопрос викторины.';

router.post('/polls/:pollId/start', resolveParentLesson, async (req, res) => {
  try {
    const [lesson, poll] = await Promise.all([Lesson.findByPk(req.lessonId), LessonPoll.findByPk(req.params.pollId)]);
    if (lesson.status !== 'live' || poll.status !== 'draft') return bad(res, 'Голосование нельзя запустить', 409);
    if (await LessonQuiz.count({ where: { lessonId: lesson.id, status: 'active' } })) {
      return bad(res, ONE_ACTIVITY_MESSAGE, 409);
    }
    await LessonPoll.update({ status: 'closed', closedAt: new Date() }, { where: { lessonId: lesson.id, status: 'active' } });
    const now = new Date();
    await poll.update({
      status: 'active', startedAt: now, closedAt: null,
      autoCloseAt: poll.durationSec ? new Date(now.getTime() + poll.durationSec * 1000) : null
    });
    await poll.reload({ include: [{ model: LessonPollOption, as: 'options' }] });
    emitToLesson(lesson.id, 'poll:started', { poll });
    res.json({ poll });
  } catch (error) { fail(res, error, 'Start lesson poll'); }
});

router.post('/polls/:pollId/close', resolveParentLesson, async (req, res) => {
  try {
    const poll = await LessonPoll.findByPk(req.params.pollId);
    if (poll.status === 'active') await poll.update({ status: 'closed', closedAt: new Date(), autoCloseAt: null });
    emitToLesson(req.lessonId, 'poll:closed', { pollId: poll.id });
    res.json({ poll, results: await getPollResults(poll.id) });
  } catch (error) { fail(res, error, 'Close lesson poll'); }
});

router.post('/polls/:pollId/reveal-results', resolveParentLesson, async (req, res) => {
  try {
    const poll = await LessonPoll.findByPk(req.params.pollId);
    await poll.update({ resultsRevealedAt: new Date(), showResultsToStudents: true });
    const results = await getPollResults(poll.id);
    emitToLesson(req.lessonId, 'poll:results-revealed', { pollId: poll.id, results });
    res.json({ poll, results });
  } catch (error) { fail(res, error, 'Reveal poll results'); }
});

router.post('/polls/:pollId/restart', resolveParentLesson, async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const lesson = await Lesson.findByPk(req.lessonId, { transaction });
    if (!lesson || lesson.status !== 'live') { await transaction.rollback(); return bad(res, 'Новое голосование можно подготовить только во время занятия', 409); }
    const source = await LessonPoll.findByPk(req.params.pollId, { include: [{ model: LessonPollOption, as: 'options' }], transaction });
    const poll = await LessonPoll.create({
      lessonId: source.lessonId, template: source.template, question: source.question,
      isAnonymous: source.isAnonymous, showResultsToStudents: source.showResultsToStudents,
      durationSec: source.durationSec, createdBy: req.dbUser.id
    }, { transaction });
    await LessonPollOption.bulkCreate(source.options.map((option) => ({ pollId: poll.id, text: option.text, order: option.order })), { transaction });
    await transaction.commit();
    await poll.reload({ include: [{ model: LessonPollOption, as: 'options' }] });
    res.status(201).json({ poll });
  } catch (error) { if (!transaction.finished) await transaction.rollback(); fail(res, error, 'Restart lesson poll'); }
});

router.get('/polls/:pollId/results', resolveParentLesson, async (req, res) => {
  try {
    const poll = await LessonPoll.findByPk(req.params.pollId);
    const results = await getPollResults(poll.id);
    if (!poll.isAnonymous) {
      results.answers = await LessonPollAnswer.findAll({
        where: { pollId: poll.id },
        include: [
          { model: User, as: 'user', attributes: ['id', 'firstName', 'lastName'] },
          { model: LessonPollOption, as: 'option', attributes: ['id', 'text'] }
        ]
      });
    }
    res.json({ poll, results });
  } catch (error) { fail(res, error, 'Get poll results'); }
});

router.delete('/polls/:pollId/answers/:userId', resolveParentLesson, async (req, res) => {
  try {
    await LessonPollAnswer.destroy({ where: { pollId: req.params.pollId, userId: req.params.userId } });
    res.json({ ok: true });
  } catch (error) { fail(res, error, 'Reset poll answer'); }
});

router.post('/lessons/:id/quizzes', requireLessonAccess, async (req, res) => {
  try {
    const lesson = await Lesson.findByPk(req.lessonId);
    if (!lesson || !['scheduled', 'live'].includes(lesson.status)) return bad(res, 'Викторину можно привязать только к предстоящему или идущему занятию', 409);
    if (await LessonQuiz.count({ where: { lessonId: lesson.id } })) return bad(res, 'К занятию уже привязана викторина', 409);
    const title = String(req.body.title || '').trim();
    if (!title) return bad(res, 'Укажите название викторины');
    const quiz = await LessonQuiz.create({
      lessonId: req.lessonId, title, mode: 'single_step',
      isAnonymous: Boolean(req.body.isAnonymous),
      showExplanations: req.body.showExplanations !== false,
      createdBy: req.dbUser.id
    });
    res.status(201).json({ quiz });
  } catch (error) { fail(res, error, 'Create lesson quiz'); }
});

// Викторина остаётся редактируемой, пока занятие, в котором она используется,
// не идёт. Перепривязать можно только к будущему занятию без другой викторины.
router.patch('/quizzes/:quizId', resolveParentLesson, async (req, res) => {
  try {
    const quiz = await LessonQuiz.findByPk(req.params.quizId);
    const currentLesson = await Lesson.findByPk(req.lessonId);
    if (!quiz || !currentLesson) return bad(res, 'Викторина или занятие не найдены', 404);
    if (currentLesson.status === 'live') {
      return bad(res, 'Нельзя изменить викторину: занятие уже идёт', 409);
    }

    const patch = {};
    if (req.body.title !== undefined) {
      const title = String(req.body.title || '').trim();
      if (!title) return bad(res, 'Укажите название викторины');
      patch.title = title;
    }

    if (req.body.lessonId !== undefined && Number(req.body.lessonId) !== quiz.lessonId) {
      const targetLessonId = Number(req.body.lessonId);
      const targetLesson = await Lesson.findByPk(targetLessonId);
      if (!targetLesson) return bad(res, 'Занятие для привязки не найдено', 404);
      if (!(await teacherCanManageLesson(req.dbUser, targetLessonId))) {
        return bad(res, 'Нет прав на выбранное занятие', 403);
      }
      if (targetLesson.status !== 'scheduled') {
        return bad(res, 'Перепривязать викторину можно только к предстоящему занятию', 409);
      }
      if (await LessonQuiz.count({ where: { lessonId: targetLessonId } })) {
        return bad(res, 'К выбранному занятию уже привязана викторина', 409);
      }
      patch.lessonId = targetLessonId;
    }

    await quiz.update(patch);
    res.json({ quiz });
  } catch (error) { fail(res, error, 'Update lesson quiz'); }
});

router.delete('/quizzes/:quizId', resolveParentLesson, async (req, res) => {
  try {
    const [quiz, lesson] = await Promise.all([
      LessonQuiz.findByPk(req.params.quizId),
      Lesson.findByPk(req.lessonId)
    ]);
    if (!quiz || !lesson) return bad(res, 'Викторина или занятие не найдены', 404);
    if (lesson.status === 'live') {
      return bad(res, 'Нельзя удалить викторину: занятие уже идёт', 409);
    }
    await quiz.destroy();
    res.json({ ok: true });
  } catch (error) { fail(res, error, 'Delete lesson quiz'); }
});

router.post('/quizzes/:quizId/questions', resolveParentLesson, async (req, res) => {
  try {
    const quiz = await LessonQuiz.findByPk(req.params.quizId);
    if (quiz.status !== 'draft') return bad(res, 'Вопросы меняются только до запуска', 409);
    const count = await LessonQuizQuestion.count({ where: { lessonQuizId: quiz.id } });
    const question = await LessonQuizQuestion.create({
      lessonQuizId: quiz.id,
      questionText: String(req.body.questionText || '').trim() || null,
      questionImageId: req.body.questionImageId || null,
      options: req.body.options,
      correctAnswer: Array.isArray(req.body.correctAnswer) ? req.body.correctAnswer : [req.body.correctAnswer],
      explanation: String(req.body.explanation || '').trim() || null,
      hintImageId: req.body.hintImageId || null,
      timeLimit: req.body.timeLimit === undefined ? 30 : Number(req.body.timeLimit),
      order: req.body.order ?? count
    });
    res.status(201).json({ question });
  } catch (error) { fail(res, error, 'Create lesson quiz question'); }
});

router.patch('/quizzes/:quizId/questions/:questionId', resolveParentLesson, async (req, res) => {
  try {
    const [quiz, question] = await Promise.all([
      LessonQuiz.findByPk(req.params.quizId),
      LessonQuizQuestion.findOne({ where: { id: req.params.questionId, lessonQuizId: req.params.quizId } })
    ]);
    if (!question) return bad(res, 'Вопрос не найден', 404);
    if (quiz.status !== 'draft') return bad(res, 'Вопросы меняются только до запуска', 409);
    const fields = ['questionText', 'questionImageId', 'options', 'correctAnswer', 'explanation', 'hintImageId', 'timeLimit', 'order'];
    const patch = {};
    fields.forEach((field) => { if (req.body[field] !== undefined) patch[field] = req.body[field]; });
    await question.update(patch);
    res.json({ question });
  } catch (error) { fail(res, error, 'Update lesson quiz question'); }
});

router.delete('/quizzes/:quizId/questions/:questionId', resolveParentLesson, async (req, res) => {
  try {
    const quiz = await LessonQuiz.findByPk(req.params.quizId);
    if (quiz.status !== 'draft') return bad(res, 'Вопросы меняются только до запуска', 409);
    await LessonQuizQuestion.destroy({ where: { id: req.params.questionId, lessonQuizId: quiz.id } });
    res.json({ ok: true });
  } catch (error) { fail(res, error, 'Delete lesson quiz question'); }
});

router.post('/quiz-questions/import-from-practice', async (req, res) => {
  try {
    const quiz = await LessonQuiz.findByPk(req.body.quizId);
    if (!quiz || !(await teacherCanManageLesson(req.dbUser, quiz.lessonId))) return bad(res, 'Нет доступа к викторине', 403);
    if (quiz.status !== 'draft') return bad(res, 'Импорт доступен только до запуска', 409);
    const where = { isActive: true };
    if (Array.isArray(req.body.practiceQuestionIds) && req.body.practiceQuestionIds.length) where.id = { [Op.in]: req.body.practiceQuestionIds };
    else if (req.body.topicId) where.topicId = req.body.topicId;
    else return bad(res, 'Укажите topicId или список вопросов');
    const source = await PracticeQuestion.findAll({ where, order: [['id', 'ASC']] });
    const offset = await LessonQuizQuestion.count({ where: { lessonQuizId: quiz.id } });
    const created = await LessonQuizQuestion.bulkCreate(source.map((item, index) => ({
      lessonQuizId: quiz.id, questionText: item.questionText, questionImageId: item.questionImageId,
      options: item.options, correctAnswer: item.correctAnswer, explanation: item.explanation,
      hintImageId: item.hintImageId, order: offset + index, sourcePracticeQuestionId: item.id
    })), { validate: true });
    res.status(201).json({ imported: created.length, questions: created });
  } catch (error) { fail(res, error, 'Import practice questions'); }
});

router.post('/quizzes/:quizId/start', resolveParentLesson, async (req, res) => {
  try {
    const [lesson, quiz] = await Promise.all([Lesson.findByPk(req.lessonId), LessonQuiz.findByPk(req.params.quizId)]);
    if (lesson.status !== 'live' || quiz.status !== 'draft') return bad(res, 'Викторину нельзя запустить', 409);
    if (await LessonPoll.count({ where: { lessonId: lesson.id, status: 'active' } })) {
      return bad(res, ONE_ACTIVITY_MESSAGE, 409);
    }
    if (!await LessonQuizQuestion.count({ where: { lessonQuizId: quiz.id } })) return bad(res, 'Добавьте хотя бы один вопрос');
    await LessonQuiz.update({ status: 'finished', finishedAt: new Date() }, { where: { lessonId: lesson.id, status: 'active' } });
    await quiz.update({
      status: 'active', startedAt: new Date(), finishedAt: null,
      currentQuestionIndex: quiz.mode === 'single_step' ? 0 : -1,
      questionRevealState: quiz.mode === 'single_step' ? 'hidden' : 'question',
      explanationRevealed: false, rosterLocked: quiz.mode !== 'single_step',
      questionStartedAt: null
    });
    emitToLesson(lesson.id, 'quiz:started', { quizId: quiz.id, mode: quiz.mode });
    res.json({ quiz });
  } catch (error) { fail(res, error, 'Start lesson quiz'); }
});

async function updateQuizReveal(req, res, action) {
  try {
    const quiz = await LessonQuiz.findByPk(req.params.quizId, { include: [{ model: LessonQuizQuestion, as: 'questions' }] });
    if (quiz.status !== 'active') return bad(res, 'Действие недоступно', 409);
    const questions = [...quiz.questions].sort((a, b) => a.order - b.order);
    const question = questions[quiz.currentQuestionIndex];
    if (quiz.mode === 'single_step' && !question) return bad(res, 'Вопрос не найден', 404);
    if (action === 'question') {
      if (quiz.mode !== 'single_step') return bad(res, 'В самостоятельном режиме вопросы уже показаны', 409);
      await quiz.update({ questionRevealState: 'question', explanationRevealed: false, questionStartedAt: new Date(), rosterLocked: true });
      scheduleQuizQuestionClose(quiz, question);
      const safe = question.toJSON(); delete safe.correctAnswer; delete safe.explanation; delete safe.hintImageId;
      emitToLesson(quiz.lessonId, 'quiz:question-shown', { quizId: quiz.id, question: safe, index: quiz.currentQuestionIndex });
    } else if (action === 'answer') {
      await quiz.update({ questionRevealState: 'answer' });
      clearQuizQuestionTimer(quiz.id);
      // Закрываем сбор ответов. В эфир и ученический API не попадает ключ ответа.
      emitToLesson(quiz.lessonId, 'quiz:answer-revealed', { quizId: quiz.id, closed: true });
    } else if (action === 'explanation') {
      if (quiz.questionRevealState !== 'answer') return bad(res, 'Сначала покажите правильный ответ', 409);
      await quiz.update({ explanationRevealed: true });
      emitToLesson(quiz.lessonId, 'quiz:explanation-shown', quiz.mode === 'single_step'
        ? {
          quizId: quiz.id, questionId: question.id,
          explanation: quiz.showExplanations ? question.explanation : null,
          hintImageId: quiz.showExplanations ? question.hintImageId : null
        }
        : { quizId: quiz.id, all: true });
    }
    res.json({ quiz, question });
  } catch (error) { fail(res, error, `Quiz reveal ${action}`); }
}

router.post('/quizzes/:quizId/show-question', resolveParentLesson, (req, res) => updateQuizReveal(req, res, 'question'));
router.post('/quizzes/:quizId/show-answer', resolveParentLesson, (req, res) => updateQuizReveal(req, res, 'answer'));
router.post('/quizzes/:quizId/show-explanation', resolveParentLesson, (req, res) => updateQuizReveal(req, res, 'explanation'));

router.post('/quizzes/:quizId/next-question', resolveParentLesson, async (req, res) => {
  try {
    const quiz = await LessonQuiz.findByPk(req.params.quizId);
    if (quiz.status !== 'active' || quiz.mode !== 'single_step') return bad(res, 'Действие недоступно', 409);
    const questions = await LessonQuizQuestion.findAll({
      where: { lessonQuizId: quiz.id }, order: [['order', 'ASC']], attributes: ['id', 'timeLimit']
    });
    if (quiz.currentQuestionIndex + 1 >= questions.length) return bad(res, 'Это последний вопрос', 409);
    if (quiz.questionRevealState !== 'answer') {
      return bad(res, 'Сначала закройте текущий вопрос и покажите рейтинг', 409);
    }
    await quiz.update({ ...nextQuestionState(quiz), questionStartedAt: new Date() });
    scheduleQuizQuestionClose(quiz, questions[quiz.currentQuestionIndex]);
    emitToLesson(quiz.lessonId, 'quiz:next-question', { quizId: quiz.id, index: quiz.currentQuestionIndex });
    res.json({ quiz });
  } catch (error) { fail(res, error, 'Next lesson quiz question'); }
});

router.post('/quizzes/:quizId/finish', resolveParentLesson, async (req, res) => {
  try {
    const quiz = await LessonQuiz.findByPk(req.params.quizId);
    if (quiz.status === 'active') await quiz.update({ status: 'finished', finishedAt: new Date() });
    clearQuizQuestionTimer(quiz.id);
    emitToLesson(quiz.lessonId, 'quiz:finished', { quizId: quiz.id });
    res.json({ quiz });
  } catch (error) { fail(res, error, 'Finish lesson quiz'); }
});

router.get('/quizzes/:quizId/stream', resolveParentLesson, async (req, res) => {
  try {
    const quiz = await LessonQuiz.findByPk(req.params.quizId, {
      include: [{
        model: LessonQuizQuestion,
        as: 'questions',
        include: [{ model: PracticeImage, as: 'questionImage', attributes: ['storageKey', 'width', 'height'] }]
      }]
    });
    if (!quiz) return bad(res, 'Викторина не найдена', 404);
    const [answers, roster] = await Promise.all([
      LessonQuizAnswer.findAll({
        where: { lessonQuizId: quiz.id },
        include: [{ model: User, as: 'user', attributes: ['id', 'firstName', 'lastName'] }]
      }),
      LessonQuizParticipant.findAll({
        where: { lessonQuizId: quiz.id },
        include: [{ model: User, as: 'user', attributes: ['id', 'firstName', 'lastName'] }]
      })
    ]);
    const participants = new Set([
      ...answers.map((answer) => Number(answer.userId)),
      ...roster.map((member) => Number(member.userId))
    ]);
    const questions = [...(quiz.questions || [])].sort((a, b) => a.order - b.order);
    const currentQuestion = quiz.mode === 'single_step' ? questions[quiz.currentQuestionIndex] || null : null;
    const leaderboard = buildLessonQuizLeaderboard(
      withQuestionTimeLimits(answers, questions), roster, quiz.isAnonymous
    );
    res.json(presentLessonQuiz(
      quiz, currentQuestion, leaderboard, questions.length, participants.size, Date.now()
    ));
  } catch (error) { fail(res, error, 'Get lesson quiz stream'); }
});

router.get('/quizzes/:quizId/live-stats', resolveParentLesson, async (req, res) => {
  try {
    const quiz = await LessonQuiz.findByPk(req.params.quizId, { include: [{ model: LessonQuizQuestion, as: 'questions' }] });
    const answers = await LessonQuizAnswer.findAll({
      where: { lessonQuizId: quiz.id },
      include: req.query.withStudents === '1' && !quiz.isAnonymous
        ? [{ model: User, as: 'user', attributes: ['id', 'firstName', 'lastName'] }]
        : []
    });
    const lesson = await Lesson.findByPk(quiz.lessonId, { attributes: ['subjectId'] });
    const totalStudents = await UserSubject.count({
      distinct: true,
      col: 'userId',
      where: { subjectId: lesson.subjectId, ...activeAccessWhere() },
      include: [{
        model: User, as: 'student', required: true, attributes: [],
        where: { role: 'student', isActive: true, isGuest: false }
      }]
    });
    const [deliveries, participants] = await Promise.all([LessonQuizDelivery.findAll({
      where: { lessonQuizId: quiz.id }, attributes: ['questionId', 'userId'], raw: true
    }), LessonQuizParticipant.findAll({
      where: { lessonQuizId: quiz.id },
      include: [{ model: User, as: 'user', attributes: ['id', 'firstName', 'lastName'] }]
    })]);
    const receivedStudents = new Set(deliveries.map((delivery) => Number(delivery.userId))).size;
    const questions = quiz.questions.map((question) => {
      const questionAnswers = answers.filter((answer) => Number(answer.questionId) === Number(question.id));
      const distribution = question.options.map((_, index) => questionAnswers.filter((answer) => (answer.selectedAnswer || []).includes(index)).length);
      const correct = questionAnswers.filter((answer) => answer.isCorrect).length;
      return {
        questionId: question.id,
        received: new Set(deliveries.filter((delivery) => Number(delivery.questionId) === Number(question.id)).map((delivery) => Number(delivery.userId))).size,
        answered: questionAnswers.length,
        distribution, correct, correctPercent: questionAnswers.length ? Math.round(correct / questionAnswers.length * 100) : 0,
        ...(!quiz.isAnonymous ? { answers: questionAnswers } : {})
      };
    });
    res.json({ quiz, totalStudents, receivedStudents, participants, questions });
  } catch (error) { fail(res, error, 'Lesson quiz live stats'); }
});

router.get('/lessons/:id/questions', requireLessonAccess, async (req, res) => {
  try {
    const questions = await LessonQuestion.findAll({
      where: { lessonId: req.lessonId },
      include: [{ model: User, as: 'student', attributes: ['id', 'firstName', 'lastName'] }],
      order: [['status', 'ASC'], ['createdAt', 'ASC']]
    });
    res.json({ questions });
  } catch (error) { fail(res, error, 'Get lesson questions'); }
});

router.patch('/questions/:questionId', resolveParentLesson, async (req, res) => {
  try {
    if (!['pending', 'answering', 'answered', 'deferred'].includes(req.body.status)) return bad(res, 'Некорректный статус');
    const question = await LessonQuestion.findByPk(req.params.questionId);
    await question.update({ status: req.body.status });
    await question.reload({
      include: [{ model: User, as: 'student', attributes: ['id', 'firstName', 'lastName'] }]
    });
    emitToLesson(req.lessonId, 'question:status-changed', { question });
    res.json({ question });
  } catch (error) { fail(res, error, 'Update lesson question'); }
});

router.get('/lessons/:id/reactions/summary', requireLessonAccess, async (req, res) => {
  try {
    const windowMin = Math.min(Math.max(Number(req.query.windowMin) || 10, 1), 120);
    const reactions = await LessonReaction.findAll({
      where: { lessonId: req.lessonId, createdAt: { [Op.gte]: new Date(Date.now() - windowMin * 60 * 1000) } },
      order: [['createdAt', 'DESC']]
    });
    const latest = new Map();
    reactions.forEach((reaction) => { if (!latest.has(Number(reaction.userId))) latest.set(Number(reaction.userId), reaction); });
    const summary = { clear: 0, need_repeat: 0, too_fast: 0, has_question: 0 };
    latest.forEach((reaction) => { summary[reaction.type] += 1; });
    res.json({ summary, total: latest.size, windowMin });
  } catch (error) { fail(res, error, 'Get lesson reactions'); }
});

// Состав занятия теперь определяется доступом к предмету, а не группами (ТЗ §8.8).
router.get('/lessons/:id/attendance', requireLessonAccess, async (req, res) => {
  try {
    const lesson = await Lesson.findByPk(req.lessonId, { attributes: ['id', 'subjectId'] });
    if (!lesson) return bad(res, 'Занятие не найдено', 404);
    const accesses = await UserSubject.findAll({
      where: { subjectId: lesson.subjectId, ...activeAccessWhere() },
      include: [{
        model: User, as: 'student', required: true,
        where: { role: 'student', isActive: true, isGuest: false },
        attributes: ['id', 'firstName', 'lastName']
      }]
    });
    const userMap = new Map(accesses.map((row) => [Number(row.userId), row.student]));
    const attendance = await LessonAttendance.findAll({ where: { lessonId: req.lessonId } });
    const byUser = new Map(attendance.map((row) => [Number(row.userId), row]));
    res.json({
      attendance: [...userMap.entries()].map(([userId, student]) => ({
        userId, student, record: byUser.get(userId) || null, present: Boolean(byUser.get(userId)?.present)
      }))
    });
  } catch (error) { fail(res, error, 'Get lesson attendance'); }
});

router.post('/lessons/:id/materials', requireLessonAccess, async (req, res) => {
  try {
    const lesson = await Lesson.findByPk(req.lessonId);
    if (!lesson || lesson.status !== 'finished') return bad(res, 'Материалы можно прикреплять только после завершения занятия', 409);
    const type = req.body.type;
    if (!['note', 'presentation', 'recording', 'link', 'homework'].includes(type)) return bad(res, 'Некорректный тип материала');
    const title = String(req.body.title || '').trim();
    if (!title) return bad(res, 'Укажите название материала');
    if (type === 'homework') {
      const homework = await Homework.findOne({ where: { id: req.body.homeworkId, subjectId: lesson.subjectId } });
      if (!homework) return bad(res, 'Домашнее задание не найдено');
    } else {
      const materialUrl = parseHttpUrl(req.body.url);
      if (!materialUrl.ok || !materialUrl.value) return bad(res, 'Укажите корректную ссылку на материал');
      req.body.url = materialUrl.value;
    }
    const material = await LessonMaterial.create({
      lessonId: req.lessonId, type, title,
      url: req.body.url || null,
      homeworkId: req.body.homeworkId || null,
      createdBy: req.dbUser.id
    });
    res.status(201).json({ material });
  } catch (error) { fail(res, error, 'Create lesson material'); }
});

router.delete('/materials/:materialId', resolveParentLesson, async (req, res) => {
  try {
    await LessonMaterial.destroy({ where: { id: req.params.materialId } });
    res.json({ ok: true });
  } catch (error) { fail(res, error, 'Delete lesson material'); }
});

module.exports = router;
