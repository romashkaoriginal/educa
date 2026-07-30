const express = require('express');
const { Op } = require('sequelize');
const {
  Lesson, LessonQuestion, LessonReaction, LessonMaterial, User
} = require('../models');
const {
  getAccessibleSubjectIds, assertStudentCanAccessLesson
} = require('../middleware/lessonAccess');
const { touchAttendance } = require('../services/lessonAttendance');
const {
  lessonInclude, serializeActivePoll, serializeActiveQuiz, getLessonState
} = require('../services/lessonState');
const {
  LessonActionError, requireLiveAccess, submitPollAnswer, submitQuizAnswer, markQuizQuestionReceived
} = require('../services/lessonActivities');
const {
  emitToLessonAdmins, emitToLesson
} = require('../services/lessonRealtime');
const { assertQueryStudentIdOptional } = require('../middleware/telegramAuth');

const router = express.Router();
router.use(assertQueryStudentIdOptional);

const effectiveStudentId = (req) => Number(req.query.studentId || req.dbUser.id);

const handleError = (res, error, label) => {
  if (error instanceof LessonActionError) {
    return res.status(error.status).json({ code: error.code, message: error.message });
  }
  console.error(label, error);
  return res.status(500).json({ message: 'Ошибка сервера' });
};

// ТЗ §8.15: ученик видит занятия только по доступным ему предметам.
const accessibleSubjectFilter = async (userId) => {
  const subjectIds = await getAccessibleSubjectIds(userId);
  return subjectIds.length ? { subjectId: { [Op.in]: subjectIds } } : null;
};

async function requireAccess(req, res, next) {
  try {
    const access = await assertStudentCanAccessLesson(req.params.id, effectiveStudentId(req));
    if (!access.ok) return res.status(access.status).json({ code: 'NO_ACCESS', message: access.message });
    req.lessonAccess = access;
    next();
  } catch (error) {
    console.error('Lesson route access:', error);
    res.status(500).json({ message: 'Ошибка проверки доступа' });
  }
}

router.get('/current', async (req, res) => {
  try {
    const filter = await accessibleSubjectFilter(effectiveStudentId(req));
    if (!filter) return res.json({ lesson: null });
    const lesson = await Lesson.findOne({
      where: {
        ...filter,
        status: 'live',
        [Op.or]: [{ sessionEndsAt: null }, { sessionEndsAt: { [Op.gt]: new Date() } }]
      },
      include: lessonInclude,
      order: [['startedAt', 'DESC']]
    });
    res.json({ lesson });
  } catch (error) {
    handleError(res, error, 'Get current lesson');
  }
});

// ТЗ §4.1: «Ближайшее занятие» — ближайший запланированный пункт расписания.
router.get('/schedule/upcoming', async (req, res) => {
  try {
    const filter = await accessibleSubjectFilter(effectiveStudentId(req));
    if (!filter) return res.json({ lesson: null });
    const lesson = await Lesson.findOne({
      where: {
        ...filter, status: 'scheduled', fromSchedule: true,
        scheduledAt: { [Op.gte]: new Date() }
      },
      include: lessonInclude,
      order: [['scheduledAt', 'ASC']]
    });
    res.json({ lesson });
  } catch (error) {
    handleError(res, error, 'Get upcoming lesson');
  }
});

// ТЗ §4.1/§6: компактный список ближайших занятий. Показываются только будущие
// пункты расписания — прошедшие и отменённые экран не занимают.
router.get('/schedule/upcoming-list', async (req, res) => {
  try {
    const filter = await accessibleSubjectFilter(effectiveStudentId(req));
    if (!filter) return res.json({ lessons: [] });
    const limit = Math.min(Math.max(Number(req.query.limit) || 5, 1), 20);
    const lessons = await Lesson.findAll({
      where: {
        ...filter, status: 'scheduled', fromSchedule: true,
        scheduledAt: { [Op.gte]: new Date() }
      },
      include: lessonInclude,
      order: [['scheduledAt', 'ASC']],
      limit
    });
    res.json({ lessons });
  } catch (error) {
    handleError(res, error, 'Get upcoming lessons');
  }
});

router.get('/schedule/week', async (req, res) => {
  try {
    const filter = await accessibleSubjectFilter(effectiveStudentId(req));
    if (!filter) return res.json({ lessons: [] });
    const now = new Date();
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    const lessons = await Lesson.findAll({
      where: { ...filter, fromSchedule: true, scheduledAt: { [Op.gte]: start, [Op.lt]: end } },
      include: lessonInclude,
      order: [['scheduledAt', 'ASC']]
    });
    res.json({ lessons });
  } catch (error) {
    handleError(res, error, 'Get week lessons');
  }
});

router.get('/lessons/:id/state', requireAccess, async (req, res) => {
  try {
    res.json(await getLessonState(req.params.id, effectiveStudentId(req)));
  } catch (error) {
    handleError(res, error, 'Get lesson state');
  }
});

router.get('/lessons/:id/polls/active', requireAccess, async (req, res) => {
  try {
    res.json({ poll: await serializeActivePoll(req.params.id, effectiveStudentId(req)) });
  } catch (error) {
    handleError(res, error, 'Get active poll');
  }
});

router.post('/polls/:pollId/answer', async (req, res) => {
  try {
    const result = await submitPollAnswer({
      pollId: req.params.pollId,
      optionId: req.body.optionId,
      userId: effectiveStudentId(req)
    });
    emitToLessonAdmins(result.lessonId, 'poll:results-updated', result.results);
    emitToLessonAdmins(result.lessonId, 'attendance:updated', { attendance: result.attendance });
    res.status(201).json({ answer: result.answer, results: result.results });
  } catch (error) {
    handleError(res, error, 'Submit poll answer');
  }
});

router.get('/lessons/:id/quiz/active', requireAccess, async (req, res) => {
  try {
    res.json({ quiz: await serializeActiveQuiz(req.params.id, effectiveStudentId(req)) });
  } catch (error) {
    handleError(res, error, 'Get active lesson quiz');
  }
});

router.post('/lesson-quiz/:quizId/questions/:questionId/answer', async (req, res) => {
  try {
    const result = await submitQuizAnswer({
      quizId: req.params.quizId,
      questionId: req.params.questionId,
      selectedAnswer: req.body.selectedAnswer,
      userId: effectiveStudentId(req)
    });
    emitToLessonAdmins(result.lessonId, 'quiz:answer-received', {
      quizId: Number(req.params.quizId),
      questionId: Number(req.params.questionId),
      userId: effectiveStudentId(req)
    });
    emitToLessonAdmins(result.lessonId, 'attendance:updated', { attendance: result.attendance });
    res.status(201).json({ answer: result.answer, quiz: result.activeQuiz });
  } catch (error) {
    handleError(res, error, 'Submit quiz answer');
  }
});

router.post('/lesson-quiz/:quizId/questions/:questionId/received', async (req, res) => {
  try {
    const result = await markQuizQuestionReceived({
      quizId: req.params.quizId,
      questionId: req.params.questionId,
      userId: effectiveStudentId(req)
    });
    if (result.created) {
      emitToLessonAdmins(result.lessonId, 'quiz:delivery-received', {
        quizId: Number(req.params.quizId),
        questionId: Number(req.params.questionId),
        userId: effectiveStudentId(req)
      });
    }
    res.status(result.created ? 201 : 200).json({ delivery: result.delivery });
  } catch (error) {
    handleError(res, error, 'Mark quiz question received');
  }
});

router.post('/lessons/:id/questions', requireAccess, async (req, res) => {
  try {
    const userId = effectiveStudentId(req);
    const lesson = await requireLiveAccess(req.params.id, userId);
    // ТЗ §4.2: преподаватель может временно отключить вопросы.
    if (lesson.questionsEnabled === false) {
      return res.status(409).json({ code: 'QUESTIONS_DISABLED', message: 'Преподаватель временно отключил вопросы' });
    }
    const question = await LessonQuestion.create({
      lessonId: req.params.id,
      userId,
      text: String(req.body.text || '').trim() || null
    });
    await question.reload({ include: [{ model: User, as: 'student', attributes: ['id', 'firstName', 'lastName'] }] });
    const attendance = await touchAttendance(req.params.id, userId, 'question');
    emitToLessonAdmins(req.params.id, 'question:new', { question });
    emitToLessonAdmins(req.params.id, 'attendance:updated', { attendance });
    res.status(201).json({ question });
  } catch (error) {
    handleError(res, error, 'Create lesson question');
  }
});

router.get('/lessons/:id/questions/mine', requireAccess, async (req, res) => {
  try {
    const questions = await LessonQuestion.findAll({
      where: { lessonId: req.params.id, userId: effectiveStudentId(req) },
      order: [['createdAt', 'DESC']]
    });
    res.json({ questions });
  } catch (error) {
    handleError(res, error, 'Get my lesson questions');
  }
});

router.post('/lessons/:id/reactions', requireAccess, async (req, res) => {
  try {
    const userId = effectiveStudentId(req);
    await requireLiveAccess(req.params.id, userId);
    const allowed = ['clear', 'need_repeat', 'too_fast', 'has_question'];
    if (!allowed.includes(req.body.type)) return res.status(400).json({ message: 'Некорректная реакция' });
    const reaction = await LessonReaction.create({
      lessonId: req.params.id,
      userId,
      type: req.body.type
    });
    await reaction.reload({ include: [{ model: User, as: 'student', attributes: ['id', 'firstName', 'lastName'] }] });
    const attendance = await touchAttendance(req.params.id, userId, 'reaction');
    emitToLessonAdmins(req.params.id, 'reaction:new', { reaction });
    emitToLessonAdmins(req.params.id, 'attendance:updated', { attendance });
    res.status(201).json({ reaction });
  } catch (error) {
    handleError(res, error, 'Create lesson reaction');
  }
});

router.post('/lessons/:id/attendance/ping', requireAccess, async (req, res) => {
  try {
    const userId = effectiveStudentId(req);
    await requireLiveAccess(req.params.id, userId);
    const attendance = await touchAttendance(req.params.id, userId, 'open');
    emitToLessonAdmins(req.params.id, 'attendance:updated', { attendance });
    res.json({ attendance });
  } catch (error) {
    handleError(res, error, 'Lesson attendance ping');
  }
});

router.post('/lessons/:id/attendance/stream-click', requireAccess, async (req, res) => {
  try {
    const userId = effectiveStudentId(req);
    await requireLiveAccess(req.params.id, userId);
    const attendance = await touchAttendance(req.params.id, userId, 'stream');
    emitToLessonAdmins(req.params.id, 'attendance:updated', { attendance });
    res.json({ attendance });
  } catch (error) {
    handleError(res, error, 'Lesson stream click');
  }
});

router.get('/lessons/:id/materials', requireAccess, async (req, res) => {
  try {
    if (req.lessonAccess.lesson.status !== 'finished') {
      return res.status(409).json({ message: 'Материалы доступны после завершения занятия' });
    }
    const materials = await LessonMaterial.findAll({
      where: { lessonId: req.params.id },
      order: [['createdAt', 'DESC']]
    });
    res.json({ materials });
  } catch (error) {
    handleError(res, error, 'Get lesson materials');
  }
});

router.get('/:id', requireAccess, async (req, res) => {
  try {
    const lesson = await Lesson.findByPk(req.params.id, { include: lessonInclude });
    res.json({ lesson });
  } catch (error) {
    handleError(res, error, 'Get lesson');
  }
});

module.exports = router;
