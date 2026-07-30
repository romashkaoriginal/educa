const { Op } = require('sequelize');
const { Lesson, LessonPoll, LessonQuiz } = require('../models');
const { getLessonRecipients, sendLessonStartNotifications } = require('./lessonNotify');
const { emitToLesson, emitToStudents } = require('./lessonRealtime');
const { lessonInclude } = require('./lessonState');

// ТЗ §3.2: активная сессия длится 2 часа, после чего завершается автоматически.
const SESSION_DURATION_MS = 2 * 60 * 60 * 1000;

// ТЗ §3.2/§8.10: ссылка на трансляцию указывается непосредственно перед началом,
// тема при запуске из расписания подставляется автоматически, но её можно изменить.
async function startLessonById(lessonId, { streamUrl, topic, teacherId } = {}) {
  const lesson = await Lesson.findByPk(lessonId, { include: lessonInclude });
  if (!lesson) return { error: 'Занятие не найдено', status: 404 };
  if (lesson.status === 'live') return { lesson, alreadyLive: true };
  if (lesson.status !== 'scheduled') return { error: 'Можно начать только запланированное занятие', status: 409 };

  const stream = String(streamUrl || lesson.streamUrl || '').trim();
  if (!stream) return { error: 'Укажите ссылку на трансляцию', status: 400 };

  // Одновременно по одному предмету может идти только одно занятие — иначе ученик
  // с доступом к предмету увидит сразу две активные сессии.
  const conflict = await Lesson.findOne({
    where: { subjectId: lesson.subjectId, status: 'live', id: { [Op.ne]: lesson.id } },
    attributes: ['id']
  });
  if (conflict) return { error: 'По этому предмету уже идёт другое занятие', status: 409 };

  const now = new Date();
  const shouldNotify = !lesson.notifiedAt;
  const nextTopic = topic === undefined ? undefined : (String(topic || '').trim() || null);
  const [started] = await Lesson.update(
    {
      status: 'live',
      streamUrl: stream,
      ...(nextTopic === undefined ? {} : { topic: nextTopic }),
      ...(teacherId && !lesson.teacherId ? { teacherId } : {}),
      startedAt: now,
      sessionEndsAt: new Date(now.getTime() + SESSION_DURATION_MS),
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

// ТЗ §7 «Отдельный быстрый запуск» / §8.12: занятие можно начать вне расписания.
// Тема необязательна, ссылка на трансляцию обязательна, группы и преподаватель не
// выбираются — преподаватель берётся из аккаунта запускающего.
async function startInstantLesson({ subjectId, streamUrl, topic, teacherId }) {
  const stream = String(streamUrl || '').trim();
  if (!stream) return { error: 'Укажите ссылку на трансляцию', status: 400 };
  if (!subjectId) return { error: 'Не удалось определить предмет занятия', status: 400 };

  const conflict = await Lesson.findOne({
    where: { subjectId, status: 'live' },
    attributes: ['id']
  });
  if (conflict) return { error: 'По этому предмету уже идёт другое занятие', status: 409 };

  const now = new Date();
  const lesson = await Lesson.create({
    subjectId,
    teacherId: teacherId || null,
    topic: String(topic || '').trim() || null,
    scheduledAt: now,
    streamUrl: stream,
    fromSchedule: false,
    status: 'live',
    startedAt: now,
    sessionEndsAt: new Date(now.getTime() + SESSION_DURATION_MS),
    notifiedAt: now,
    createdBy: teacherId || null
  });
  await lesson.reload({ include: lessonInclude });
  const recipients = await getLessonRecipients(lesson.id);
  const userIds = recipients.map((user) => user.id);
  emitToLesson(lesson.id, 'lesson:started', { lesson });
  emitToStudents(userIds, 'lesson:started', { lesson });
  sendLessonStartNotifications(lesson).catch((error) => console.error('Lesson notifications:', error));
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

module.exports = {
  SESSION_DURATION_MS, startLessonById, startInstantLesson, finishLessonById
};
