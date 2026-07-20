const express = require('express');
const { Op, fn, col } = require('sequelize');
const {
  sequelize, User, Subject, UserSubject, Group, GroupStudent, TeacherSubject,
  Lesson, LessonGroup, LessonPoll, LessonPollOption, LessonPollAnswer,
  LessonQuiz, LessonQuizQuestion, LessonQuizAnswer, PracticeQuestion,
  LessonQuestion, LessonReaction, LessonAttendance, LessonMaterial, Homework
} = require('../models');
const {
  activeAccessWhere, teacherCanManageLesson, validateGroupStudent
} = require('../middleware/lessonAccess');
const { startLessonById, finishLessonById } = require('../services/lessonSession');
const { getPollResults, lessonInclude } = require('../services/lessonState');
const { emitToLesson, emitToLessonAdmins } = require('../services/lessonRealtime');

const router = express.Router();

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

async function teacherGroupIds(user) {
  if (user.role === 'admin') return null;
  const rows = await TeacherSubject.findAll({ where: { teacherId: user.id }, attributes: ['groupId'], raw: true });
  return rows.map((row) => Number(row.groupId));
}

async function validateLessonGroups(user, subjectId, groupIds) {
  const ids = [...new Set((groupIds || []).map(Number).filter(Number.isInteger))];
  if (!ids.length) return { ok: false, message: 'Выберите минимум одну группу' };
  const groups = await Group.findAll({ where: { id: { [Op.in]: ids }, subjectId, isActive: true } });
  if (groups.length !== ids.length) return { ok: false, message: 'Все группы должны быть активны и относиться к предмету занятия' };
  if (user.role === 'teacher') {
    const ownIds = await teacherGroupIds(user);
    if (ids.some((id) => !ownIds.includes(id))) return { ok: false, message: 'Нельзя назначить чужую группу' };
  }
  return { ok: true, ids, groups };
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

router.get('/groups', async (req, res) => {
  try {
    const ownIds = await teacherGroupIds(req.dbUser);
    const groups = await Group.findAll({
      where: ownIds === null ? {} : { id: { [Op.in]: ownIds } },
      include: [
        { model: Subject, as: 'subject', attributes: ['id', 'name', 'icon'] },
        { model: User, as: 'students', attributes: ['id', 'firstName', 'lastName'], through: { attributes: [] } },
        { model: User, as: 'teachers', attributes: ['id', 'firstName', 'lastName'], through: { attributes: [] } }
      ],
      order: [['isActive', 'DESC'], ['name', 'ASC']]
    });
    res.json({ groups });
  } catch (error) { fail(res, error, 'Get lesson groups'); }
});

router.post('/groups', async (req, res) => {
  if (req.dbUser.role !== 'admin') return bad(res, 'Только администратор создаёт группы', 403);
  try {
    const name = String(req.body.name || '').trim();
    const subject = await Subject.findByPk(req.body.subjectId);
    if (!name || !subject) return bad(res, 'Укажите название и предмет');
    const group = await Group.create({ name, subjectId: subject.id });
    res.status(201).json({ group });
  } catch (error) { fail(res, error, 'Create lesson group'); }
});

router.patch('/groups/:id', async (req, res) => {
  if (req.dbUser.role !== 'admin') return bad(res, 'Только администратор изменяет группы', 403);
  try {
    const group = await Group.findByPk(req.params.id);
    if (!group) return bad(res, 'Группа не найдена', 404);
    const patch = {};
    if (req.body.name != null) patch.name = String(req.body.name).trim();
    if (req.body.isActive != null) patch.isActive = Boolean(req.body.isActive);
    await group.update(patch);
    res.json({ group });
  } catch (error) { fail(res, error, 'Update lesson group'); }
});

router.delete('/groups/:id', async (req, res) => {
  if (req.dbUser.role !== 'admin') return bad(res, 'Только администратор удаляет группы', 403);
  try {
    const group = await Group.findByPk(req.params.id);
    if (!group) return bad(res, 'Группа не найдена', 404);
    const linked = await LessonGroup.count({ where: { groupId: group.id } });
    if (linked) return bad(res, 'Группа используется в расписании. Деактивируйте её вместо удаления.', 409);
    await group.destroy();
    res.json({ ok: true });
  } catch (error) { fail(res, error, 'Delete lesson group'); }
});

router.post('/groups/:id/students', async (req, res) => {
  if (req.dbUser.role !== 'admin') return bad(res, 'Только администратор меняет состав групп', 403);
  try {
    const check = await validateGroupStudent(req.params.id, req.body.userId);
    if (!check.ok) return bad(res, check.message);
    const [membership, created] = await GroupStudent.findOrCreate({
      where: { groupId: req.params.id, userId: req.body.userId },
      defaults: { groupId: req.params.id, userId: req.body.userId }
    });
    res.status(created ? 201 : 200).json({ membership });
  } catch (error) { fail(res, error, 'Add group student'); }
});

router.delete('/groups/:id/students/:userId', async (req, res) => {
  if (req.dbUser.role !== 'admin') return bad(res, 'Только администратор меняет состав групп', 403);
  try {
    await GroupStudent.destroy({ where: { groupId: req.params.id, userId: req.params.userId } });
    res.json({ ok: true });
  } catch (error) { fail(res, error, 'Remove group student'); }
});

router.get('/teacher-subjects', async (req, res) => {
  if (req.dbUser.role !== 'admin') return bad(res, 'Только администратор видит назначения', 403);
  try {
    const assignments = await TeacherSubject.findAll({
      include: [
        { model: User, as: 'teacher', attributes: ['id', 'firstName', 'lastName'] },
        { model: Group, as: 'group', attributes: ['id', 'name'] },
        { model: Subject, as: 'subject', attributes: ['id', 'name'] }
      ]
    });
    res.json({ assignments });
  } catch (error) { fail(res, error, 'Get teacher assignments'); }
});

router.post('/teacher-subjects', async (req, res) => {
  if (req.dbUser.role !== 'admin') return bad(res, 'Только администратор назначает преподавателей', 403);
  try {
    const [teacher, group] = await Promise.all([User.findByPk(req.body.teacherId), Group.findByPk(req.body.groupId)]);
    if (!teacher || teacher.role !== 'teacher' || !group) return bad(res, 'Некорректный преподаватель или группа');
    const [assignment, created] = await TeacherSubject.findOrCreate({
      where: { teacherId: teacher.id, groupId: group.id },
      defaults: { teacherId: teacher.id, groupId: group.id, subjectId: group.subjectId }
    });
    if (Number(assignment.subjectId) !== Number(group.subjectId)) await assignment.update({ subjectId: group.subjectId });
    res.status(created ? 201 : 200).json({ assignment });
  } catch (error) { fail(res, error, 'Create teacher assignment'); }
});

router.delete('/teacher-subjects/:id', async (req, res) => {
  if (req.dbUser.role !== 'admin') return bad(res, 'Только администратор меняет назначения', 403);
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
    if (req.dbUser.role === 'teacher') {
      const groupIds = await teacherGroupIds(req.dbUser);
      const links = await LessonGroup.findAll({ where: { groupId: { [Op.in]: groupIds } }, attributes: ['lessonId'], raw: true });
      where.id = { [Op.in]: [...new Set(links.map((row) => row.lessonId))] };
    }
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

router.post('/lessons', async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { subjectId, groupIds, scheduledAt, topic, streamUrl } = req.body;
    const subject = await Subject.findByPk(subjectId, { transaction });
    const date = new Date(scheduledAt);
    if (!subject || Number.isNaN(date.getTime())) { await transaction.rollback(); return bad(res, 'Укажите предмет и корректную дату'); }
    const stream = parseHttpUrl(streamUrl);
    if (!stream.ok) { await transaction.rollback(); return bad(res, 'Ссылка на трансляцию должна начинаться с http:// или https://'); }
    const groupCheck = await validateLessonGroups(req.dbUser, subject.id, groupIds);
    if (!groupCheck.ok) { await transaction.rollback(); return bad(res, groupCheck.message); }
    let teacherId = req.dbUser.role === 'teacher' ? req.dbUser.id : Number(req.body.teacherId) || null;
    if (teacherId) {
      const teacher = await User.findByPk(teacherId, { transaction });
      if (!teacher || !['teacher', 'admin'].includes(teacher.role)) { await transaction.rollback(); return bad(res, 'Преподаватель не найден'); }
    }
    const lesson = await Lesson.create({
      subjectId: subject.id,
      teacherId,
      scheduledAt: date,
      topic: String(topic || '').trim() || null,
      streamUrl: stream.value,
      createdBy: req.dbUser.id
    }, { transaction });
    await LessonGroup.bulkCreate(groupCheck.ids.map((groupId) => ({ lessonId: lesson.id, groupId })), { transaction });
    await transaction.commit();
    await lesson.reload({ include: lessonInclude });
    res.status(201).json({ lesson });
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    fail(res, error, 'Create lesson');
  }
});

router.patch('/lessons/:id', requireLessonAccess, async (req, res) => {
  try {
    const lesson = await Lesson.findByPk(req.lessonId);
    if (lesson.status !== 'scheduled') return bad(res, 'Изменять можно только запланированное занятие', 409);
    const patch = {};
    if (req.body.topic !== undefined) patch.topic = String(req.body.topic || '').trim() || null;
    if (req.body.streamUrl !== undefined) {
      const stream = parseHttpUrl(req.body.streamUrl);
      if (!stream.ok) return bad(res, 'Ссылка на трансляцию должна начинаться с http:// или https://');
      patch.streamUrl = stream.value;
    }
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
  if (req.dbUser.role !== 'admin') return bad(res, 'Удалять занятия может только администратор', 403);
  try {
    const lesson = await Lesson.findByPk(req.lessonId);
    if (!['scheduled', 'cancelled'].includes(lesson.status)) return bad(res, 'Активное или завершённое занятие удалить нельзя', 409);
    await lesson.destroy();
    res.json({ ok: true });
  } catch (error) { fail(res, error, 'Delete lesson'); }
});

router.post('/lessons/:id/start', requireLessonAccess, async (req, res) => {
  try {
    const result = await startLessonById(req.lessonId);
    if (result.error) return bad(res, result.error, result.status);
    res.json(result);
  } catch (error) { fail(res, error, 'Start lesson'); }
});

router.post('/lessons/:id/finish', requireLessonAccess, async (req, res) => {
  try {
    const result = await finishLessonById(req.lessonId);
    if (result.error) return bad(res, result.error, result.status);
    res.json(result);
  } catch (error) { fail(res, error, 'Finish lesson'); }
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

router.post('/polls/:pollId/start', resolveParentLesson, async (req, res) => {
  try {
    const [lesson, poll] = await Promise.all([Lesson.findByPk(req.lessonId), LessonPoll.findByPk(req.params.pollId)]);
    if (lesson.status !== 'live' || poll.status !== 'draft') return bad(res, 'Голосование нельзя запустить', 409);
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
    const title = String(req.body.title || '').trim();
    if (!title || !['single_step', 'self_paced'].includes(req.body.mode)) return bad(res, 'Укажите название и режим викторины');
    const quiz = await LessonQuiz.create({
      lessonId: req.lessonId, title, mode: req.body.mode,
      isAnonymous: Boolean(req.body.isAnonymous),
      showExplanations: req.body.showExplanations !== false,
      createdBy: req.dbUser.id
    });
    res.status(201).json({ quiz });
  } catch (error) { fail(res, error, 'Create lesson quiz'); }
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
    const fields = ['questionText', 'questionImageId', 'options', 'correctAnswer', 'explanation', 'hintImageId', 'order'];
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
    if (!await LessonQuizQuestion.count({ where: { lessonQuizId: quiz.id } })) return bad(res, 'Добавьте хотя бы один вопрос');
    await LessonQuiz.update({ status: 'finished', finishedAt: new Date() }, { where: { lessonId: lesson.id, status: 'active' } });
    await quiz.update({
      status: 'active', startedAt: new Date(), finishedAt: null,
      currentQuestionIndex: quiz.mode === 'single_step' ? 0 : -1,
      questionRevealState: quiz.mode === 'single_step' ? 'hidden' : 'question',
      explanationRevealed: false
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
      await quiz.update({ questionRevealState: 'question', explanationRevealed: false });
      const safe = question.toJSON(); delete safe.correctAnswer; delete safe.explanation; delete safe.hintImageId;
      emitToLesson(quiz.lessonId, 'quiz:question-shown', { quizId: quiz.id, question: safe, index: quiz.currentQuestionIndex });
    } else if (action === 'answer') {
      await quiz.update({ questionRevealState: 'answer' });
      emitToLesson(quiz.lessonId, 'quiz:answer-revealed', quiz.mode === 'single_step'
        ? { quizId: quiz.id, questionId: question.id, correctAnswer: question.correctAnswer }
        : { quizId: quiz.id, answers: questions.map((item) => ({ questionId: item.id, correctAnswer: item.correctAnswer })) });
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
    const count = await LessonQuizQuestion.count({ where: { lessonQuizId: quiz.id } });
    if (quiz.currentQuestionIndex + 1 >= count) return bad(res, 'Это последний вопрос', 409);
    await quiz.update({ currentQuestionIndex: quiz.currentQuestionIndex + 1, questionRevealState: 'hidden', explanationRevealed: false });
    emitToLesson(quiz.lessonId, 'quiz:next-question', { quizId: quiz.id, index: quiz.currentQuestionIndex });
    res.json({ quiz });
  } catch (error) { fail(res, error, 'Next lesson quiz question'); }
});

router.post('/quizzes/:quizId/finish', resolveParentLesson, async (req, res) => {
  try {
    const quiz = await LessonQuiz.findByPk(req.params.quizId);
    if (quiz.status === 'active') await quiz.update({ status: 'finished', finishedAt: new Date() });
    emitToLesson(quiz.lessonId, 'quiz:finished', { quizId: quiz.id });
    res.json({ quiz });
  } catch (error) { fail(res, error, 'Finish lesson quiz'); }
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
    const totalStudents = await GroupStudent.count({
      distinct: true,
      col: 'userId',
      include: [{
        model: Group, as: 'group', required: true, attributes: [],
        include: [{ model: Lesson, as: 'lessons', where: { id: quiz.lessonId }, attributes: [], through: { attributes: [] } }]
      }]
    });
    const { getConnectedStudentCount } = require('../socket/lessonSocket');
    const receivedStudents = getConnectedStudentCount(quiz.lessonId);
    const questions = quiz.questions.map((question) => {
      const questionAnswers = answers.filter((answer) => Number(answer.questionId) === Number(question.id));
      const distribution = question.options.map((_, index) => questionAnswers.filter((answer) => (answer.selectedAnswer || []).includes(index)).length);
      const correct = questionAnswers.filter((answer) => answer.isCorrect).length;
      return {
        questionId: question.id, received: receivedStudents, answered: questionAnswers.length,
        distribution, correct, correctPercent: questionAnswers.length ? Math.round(correct / questionAnswers.length * 100) : 0,
        ...(!quiz.isAnonymous ? { answers: questionAnswers } : {})
      };
    });
    res.json({ quiz, totalStudents, receivedStudents, questions });
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

router.get('/lessons/:id/attendance', requireLessonAccess, async (req, res) => {
  try {
    const links = await LessonGroup.findAll({ where: { lessonId: req.lessonId }, attributes: ['groupId'], raw: true });
    const memberships = await GroupStudent.findAll({
      where: { groupId: { [Op.in]: links.map((row) => row.groupId) } },
      include: [{ model: User, as: 'student', attributes: ['id', 'firstName', 'lastName'] }]
    });
    const userMap = new Map(memberships.map((row) => [Number(row.userId), row.student]));
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
    const type = req.body.type;
    if (!['note', 'presentation', 'recording', 'link', 'homework'].includes(type)) return bad(res, 'Некорректный тип материала');
    const title = String(req.body.title || '').trim();
    if (!title) return bad(res, 'Укажите название материала');
    if (type === 'homework') {
      const homework = await Homework.findOne({ where: { id: req.body.homeworkId, subjectId: (await Lesson.findByPk(req.lessonId)).subjectId } });
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
