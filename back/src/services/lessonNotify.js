const { Op } = require('sequelize');
const {
  Lesson, LessonGroup, GroupStudent, User, UserSubject, NotificationLog, Subject
} = require('../models');
const { getBot } = require('../bot');
const { getWebAppUrlSync } = require('../utils/webAppUrl');

async function getLessonRecipients(lessonId) {
  const lesson = await Lesson.findByPk(lessonId, { attributes: ['id', 'subjectId'] });
  if (!lesson) return [];
  const links = await LessonGroup.findAll({ where: { lessonId }, attributes: ['groupId'], raw: true });
  if (!links.length) return [];
  const memberships = await GroupStudent.findAll({
    where: { groupId: { [Op.in]: links.map((row) => row.groupId) } },
    attributes: ['userId'],
    raw: true
  });
  const userIds = [...new Set(memberships.map((row) => Number(row.userId)))];
  if (!userIds.length) return [];
  const now = new Date();
  const accesses = await UserSubject.findAll({
    where: {
      userId: { [Op.in]: userIds },
      subjectId: lesson.subjectId,
      isActive: true,
      [Op.and]: [
        { [Op.or]: [{ accessStartDate: null }, { accessStartDate: { [Op.lte]: now } }] },
        { [Op.or]: [{ accessEndDate: null }, { accessEndDate: { [Op.gt]: now } }] }
      ]
    },
    attributes: ['userId'],
    raw: true
  });
  const allowedIds = accesses.map((row) => Number(row.userId));
  return User.findAll({
    where: { id: { [Op.in]: allowedIds }, isActive: true, isGuest: false },
    attributes: ['id', 'telegramId', 'firstName', 'lastName']
  });
}

const teacherName = (teacher) => [teacher?.firstName, teacher?.lastName].filter(Boolean).join(' ') || 'Преподаватель';

async function sendNotificationBatch(lesson, { reminder = false } = {}) {
  const recipients = await getLessonRecipients(lesson.id);
  const fullLesson = lesson.subject && lesson.teacher
    ? lesson
    : await Lesson.findByPk(lesson.id, {
      include: [
        { model: Subject, as: 'subject', attributes: ['name'] },
        { model: User, as: 'teacher', attributes: ['firstName', 'lastName'] }
      ]
    });
  const subjectName = fullLesson?.subject?.name || 'предмету';
  const text = reminder
    ? `⏰ Через 15 минут начнётся занятие по ${subjectName}.\n\nПреподаватель: ${teacherName(fullLesson?.teacher)}`
    : `🔴 Началось занятие по ${subjectName}\n\nПреподаватель: ${teacherName(fullLesson?.teacher)}\n\nПереходи в приложение — во время занятия будут доступны голосования и викторины.`;
  const bot = getBot();
  const appUrl = getWebAppUrlSync();
  const results = [];

  for (const recipient of recipients) {
    if (!bot || !recipient.telegramId) {
      results.push({ userId: recipient.id, ok: false, reason: 'no_bot_or_telegram_id' });
      continue;
    }
    try {
      await bot.sendMessage(recipient.telegramId, text, appUrl ? {
        reply_markup: { inline_keyboard: [[{ text: 'Перейти к занятию', web_app: { url: appUrl } }]] }
      } : undefined);
      results.push({ userId: recipient.id, ok: true });
    } catch (error) {
      console.error(`Lesson notification failed for user ${recipient.id}:`, error.message);
      results.push({ userId: recipient.id, ok: false, reason: error.message });
    }
  }

  await NotificationLog.create({
    sentBy: fullLesson?.createdBy || fullLesson?.teacherId || 0,
    sentByName: reminder ? 'Планировщик занятий' : teacherName(fullLesson?.teacher),
    sentByRole: reminder ? 'system' : 'teacher',
    text,
    filters: { lessonId: lesson.id, kind: reminder ? 'lesson_reminder' : 'lesson_start' },
    recipientCount: recipients.length,
    successCount: results.filter((item) => item.ok).length,
    failedCount: results.filter((item) => !item.ok).length,
    recipients: results
  });
  return { recipients, results };
}

module.exports = {
  getLessonRecipients,
  sendLessonStartNotifications: (lesson) => sendNotificationBatch(lesson, { reminder: false }),
  sendLessonReminderNotifications: (lesson) => sendNotificationBatch(lesson, { reminder: true })
};
