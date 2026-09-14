const { Op } = require('sequelize');
const { Lesson, LessonPoll } = require('../models');
const { SESSION_DURATION_MS, finishLessonById } = require('./lessonSession');
const { sendLessonReminderNotifications } = require('./lessonNotify');
const { emitToLesson } = require('./lessonRealtime');

const TICK_MS = 60 * 1000;
let timer = null;

// Для урока из расписания нет отдельной длительности. Используем ту же
// стандартную длительность, что и у ручной live-сессии. Не отменённый урок
// после этого окна считаем проведённым: так расписание и отчёты не расходятся.
async function finishOverdueScheduledLessons(now = new Date(), { LessonModel = Lesson, emit = emitToLesson } = {}) {
  const threshold = new Date(now.getTime() - SESSION_DURATION_MS);
  const overdue = await LessonModel.findAll({
    where: {
      status: 'scheduled',
      fromSchedule: true,
      scheduledAt: { [Op.lte]: threshold }
    },
    attributes: ['id', 'scheduledAt']
  });

  const finishedIds = [];
  for (const lesson of overdue) {
    const scheduledAt = new Date(lesson.scheduledAt);
    const scheduledEnd = new Date(scheduledAt.getTime() + SESSION_DURATION_MS);
    const [updated] = await LessonModel.update({
      status: 'finished',
      startedAt: scheduledAt,
      sessionEndsAt: scheduledEnd,
      finishedAt: scheduledEnd
    }, {
      where: { id: lesson.id, status: 'scheduled' }
    });
    if (!updated) continue;
    finishedIds.push(lesson.id);
    emit(lesson.id, 'lesson:finished', { lessonId: lesson.id, auto: true, bySchedule: true });
  }
  return finishedIds;
}

async function tick() {
  const now = new Date();
  try {
    const threshold = new Date(now.getTime() + 15 * 60 * 1000);
    const lessons = await Lesson.findAll({
      where: {
        status: 'scheduled',
        reminderSentAt: { [Op.is]: null },
        scheduledAt: { [Op.gt]: now, [Op.lte]: threshold }
      }
    });
    for (const lesson of lessons) {
      const [updated] = await Lesson.update({ reminderSentAt: now }, {
        where: { id: lesson.id, reminderSentAt: { [Op.is]: null } }
      });
      if (updated) sendLessonReminderNotifications(lesson).catch((error) => console.error('Lesson reminder:', error));
    }
  } catch (error) {
    console.error('Lesson reminder scheduler:', error.message);
  }

  try {
    await finishOverdueScheduledLessons(now);
  } catch (error) {
    console.error('Lesson scheduled auto-finish scheduler:', error.message);
  }

  try {
    const expired = await Lesson.findAll({ where: { status: 'live', sessionEndsAt: { [Op.lte]: now } }, attributes: ['id'] });
    for (const lesson of expired) await finishLessonById(lesson.id, { auto: true });
  } catch (error) {
    console.error('Lesson auto-finish scheduler:', error.message);
  }

  try {
    const polls = await LessonPoll.findAll({ where: { status: 'active', autoCloseAt: { [Op.lte]: now } } });
    for (const poll of polls) {
      await poll.update({ status: 'closed', closedAt: now });
      emitToLesson(poll.lessonId, 'poll:closed', { pollId: poll.id });
    }
  } catch (error) {
    console.error('Lesson poll scheduler:', error.message);
  }
}

function startLessonScheduler() {
  if (timer) return;
  tick().catch(() => {});
  timer = setInterval(() => tick().catch(() => {}), TICK_MS);
  console.log('⏰ Планировщик занятий запущен');
}

function stopLessonScheduler() {
  if (timer) clearInterval(timer);
  timer = null;
}

module.exports = {
  SESSION_DURATION_MS,
  finishOverdueScheduledLessons,
  tick,
  startLessonScheduler,
  stopLessonScheduler
};
