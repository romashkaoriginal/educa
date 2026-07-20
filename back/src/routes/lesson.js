const express = require('express');
const { Op } = require('sequelize');
const {
  Lesson, LessonGroup, LessonPoll, LessonQuiz, LessonQuestion,
  LessonReaction, LessonMaterial
} = require('../models');
const {
  getAccessibleGroupIds, assertStudentCanAccessLesson
} = require('../middleware/lessonAccess');
const { touchAttendance } = require('../services/lessonAttendance');
const {
  lessonInclude, serializeActivePoll, serializeActiveQuiz, getLessonState
} = require('../services/lessonState');
const {
  LessonActionError, requireLiveAccess, submitPollAnswer, submitQuizAnswer
} = require('../services/lessonActivities');
const {
  emitToLessonAdmins, emitToLesson
} = require('../services/lessonRealtime');

const router = express.Router();

const handleError = (res, error, label) => {
  if (error instanceof LessonActionError) {
    return res.status(error.status).json({ code: error.code, message: error.message });
  }
  console.error(label, error);
  return res.status(500).json({ message: 'Ошибка сервера' });
};

async function accessibleLessonIds(userId) {
  const groupIds = await getAccessibleGroupIds(userId);
  if (!groupIds.length) return [];
  const links = await LessonGroup.findAll({
    where: { groupId: { [Op.in]: groupIds } },
    attributes: ['lessonId'],
    raw: true
  });
  return [...new Set(links.map((row) => Number(row.lessonId)))];
}

async function requireAccess(req, res, next) {
  try {
    const access = await assertStudentCanAccessLesson(req.params.id, req.dbUser.id);
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
    const ids = await accessibleLessonIds(req.dbUser.id);
    if (!ids.length) return res.json({ lesson: null });
    const lesson = await Lesson.findOne({
      where: {
        id: { [Op.in]: ids },
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

router.get('/schedule/upcoming', async (req, res) => {
  try {
    const ids = await accessibleLessonIds(req.dbUser.id);
    if (!ids.length) return res.json({ lesson: null });
    const lesson = await Lesson.findOne({
      where: { id: { [Op.in]: ids }, status: 'scheduled', scheduledAt: { [Op.gte]: new Date() } },
      include: lessonInclude,
      order: [['scheduledAt', 'ASC']]
    });
    res.json({ lesson });
  } catch (error) {
    handleError(res, error, 'Get upcoming lesson');
  }
});

router.get('/schedule/week', async (req, res) => {
  try {
    const ids = await accessibleLessonIds(req.dbUser.id);
    if (!ids.length) return res.json({ lessons: [] });
    const now = new Date();
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    const lessons = await Lesson.findAll({
      where: { id: { [Op.in]: ids }, scheduledAt: { [Op.gte]: start, [Op.lt]: end } },
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
    res.json(await getLessonState(req.params.id, req.dbUser.id));
  } catch (error) {
    handleError(res, error, 'Get lesson state');
  }
});

router.get('/lessons/:id/polls/active', requireAccess, async (req, res) => {
  try {
    res.json({ poll: await serializeActivePoll(req.params.id, req.dbUser.id) });
  } catch (error) {
    handleError(res, error, 'Get active poll');
  }
});

router.post('/polls/:pollId/answer', async (req, res) => {
  try {
    const result = await submitPollAnswer({
      pollId: req.params.pollId,
      optionId: req.body.optionId,
      userId: req.dbUser.id
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
    res.json({ quiz: await serializeActiveQuiz(req.params.id, req.dbUser.id) });
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
      userId: req.dbUser.id
    });
    emitToLessonAdmins(result.lessonId, 'quiz:answer-received', {
      quizId: Number(req.params.quizId),
      questionId: Number(req.params.questionId),
      userId: req.dbUser.id
    });
    emitToLessonAdmins(result.lessonId, 'attendance:updated', { attendance: result.attendance });
    res.status(201).json({ answer: result.answer, quiz: result.activeQuiz });
  } catch (error) {
    handleError(res, error, 'Submit quiz answer');
  }
});

router.post('/lessons/:id/questions', requireAccess, async (req, res) => {
  try {
    await requireLiveAccess(req.params.id, req.dbUser.id);
    const question = await LessonQuestion.create({
      lessonId: req.params.id,
      userId: req.dbUser.id,
      text: String(req.body.text || '').trim() || null
    });
    const attendance = await touchAttendance(req.params.id, req.dbUser.id, 'question');
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
      where: { lessonId: req.params.id, userId: req.dbUser.id },
      order: [['createdAt', 'DESC']]
    });
    res.json({ questions });
  } catch (error) {
    handleError(res, error, 'Get my lesson questions');
  }
});

router.post('/lessons/:id/reactions', requireAccess, async (req, res) => {
  try {
    await requireLiveAccess(req.params.id, req.dbUser.id);
    const allowed = ['clear', 'need_repeat', 'too_fast', 'has_question'];
    if (!allowed.includes(req.body.type)) return res.status(400).json({ message: 'Некорректная реакция' });
    const reaction = await LessonReaction.create({
      lessonId: req.params.id,
      userId: req.dbUser.id,
      type: req.body.type
    });
    const attendance = await touchAttendance(req.params.id, req.dbUser.id, 'reaction');
    emitToLessonAdmins(req.params.id, 'reaction:new', { reaction });
    emitToLessonAdmins(req.params.id, 'attendance:updated', { attendance });
    res.status(201).json({ reaction });
  } catch (error) {
    handleError(res, error, 'Create lesson reaction');
  }
});

router.post('/lessons/:id/attendance/ping', requireAccess, async (req, res) => {
  try {
    const attendance = await touchAttendance(req.params.id, req.dbUser.id, 'open');
    emitToLessonAdmins(req.params.id, 'attendance:updated', { attendance });
    res.json({ attendance });
  } catch (error) {
    handleError(res, error, 'Lesson attendance ping');
  }
});

router.post('/lessons/:id/attendance/stream-click', requireAccess, async (req, res) => {
  try {
    const attendance = await touchAttendance(req.params.id, req.dbUser.id, 'stream');
    emitToLessonAdmins(req.params.id, 'attendance:updated', { attendance });
    res.json({ attendance });
  } catch (error) {
    handleError(res, error, 'Lesson stream click');
  }
});

router.get('/lessons/:id/materials', requireAccess, async (req, res) => {
  try {
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
