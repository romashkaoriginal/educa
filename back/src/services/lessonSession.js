const { Op } = require('sequelize');
const { Lesson, LessonGroup, LessonPoll, LessonQuiz } = require('../models');
const { getLessonRecipients, sendLessonStartNotifications } = require('./lessonNotify');
const { emitToLesson, emitToStudents } = require('./lessonRealtime');
const { lessonInclude } = require('./lessonState');

async function startLessonById(lessonId) {
  const lesson = await Lesson.findByPk(lessonId, { include: lessonInclude });
  if (!lesson) return { error: 'Занятие не найдено', status: 404 };
  if (lesson.status === 'live') return { lesson, alreadyLive: true };
  if (lesson.status !== 'scheduled') return { error: 'Можно начать только запланированное занятие', status: 409 };

  const groupIds = (lesson.groups || []).map((group) => group.id);
  if (groupIds.length) {
    const conflict = await LessonGroup.findOne({
      where: { groupId: { [Op.in]: groupIds }, lessonId: { [Op.ne]: lesson.id } },
      include: [{ model: Lesson, as: 'lesson', required: true, where: { status: 'live' }, attributes: ['id'] }]
    });
    if (conflict) return { error: 'Для одной из выбранных групп уже идёт другое занятие', status: 409 };
  }

  const now = new Date();
  const shouldNotify = !lesson.notifiedAt;
  const [started] = await Lesson.update(
    {
      status: 'live',
      startedAt: now,
      sessionEndsAt: new Date(now.getTime() + 2 * 60 * 60 * 1000),
      ...(shouldNotify ? { notifiedAt: now } : {})
    },
    { where: { id: lesson.id, status: 'scheduled' } }
  );
  if (!started) {
    const current = await Lesson.findByPk(lesson.id, { include: lessonInclude });
    if (current?.status === 'live') return { lesson: current, alreadyLive: true };
    return { error: 'Занятие уже изменило статус', status: 409 };
  }
  await lesson.reload({ include: lessonInclude });
  const recipients = await getLessonRecipients(lesson.id);
  const userIds = recipients.map((user) => user.id);
  emitToLesson(lesson.id, 'lesson:started', { lesson });
  emitToStudents(userIds, 'lesson:started', { lesson });
  if (shouldNotify) sendLessonStartNotifications(lesson).catch((error) => console.error('Lesson notifications:', error));
  return { lesson, recipients: userIds.length };
}

async function finishLessonById(lessonId, { auto = false } = {}) {
  const lesson = await Lesson.findByPk(lessonId, { include: lessonInclude });
  if (!lesson) return { error: 'Занятие не найдено', status: 404 };
  if (lesson.status === 'finished') return { lesson, alreadyFinished: true };
  if (lesson.status !== 'live') return { error: 'Занятие не активно', status: 409 };
  const now = new Date();
  const [finished] = await Lesson.update(
    { status: 'finished', finishedAt: now },
    { where: { id: lesson.id, status: 'live' } }
  );
  if (!finished) {
    const current = await Lesson.findByPk(lesson.id, { include: lessonInclude });
    return current?.status === 'finished'
      ? { lesson: current, alreadyFinished: true }
      : { error: 'Занятие уже изменило статус', status: 409 };
  }
  await Promise.all([
    LessonPoll.update({ status: 'closed', closedAt: now }, { where: { lessonId, status: 'active' } }),
    LessonQuiz.update({ status: 'finished', finishedAt: now }, { where: { lessonId, status: 'active' } })
  ]);
  const recipients = await getLessonRecipients(lesson.id);
  emitToLesson(lesson.id, 'lesson:finished', { lessonId: lesson.id, auto });
  emitToStudents(recipients.map((user) => user.id), 'lesson:finished', { lessonId: lesson.id, auto });
  await lesson.reload({ include: lessonInclude });
  return { lesson };
}

module.exports = { startLessonById, finishLessonById };
