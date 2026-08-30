const { Op } = require('sequelize');
const {
  Lesson, User, UserSubject, NotificationLog, Subject, BotUser
} = require('../models');
const { getBot } = require('../bot');
const { getWebAppUrlSync } = require('../utils/webAppUrl');
const { buildLessonWebAppUrl, isBotBlockedError } = require('./lessonNotifyUtils');

// ТЗ §8.15: уведомление получают все ученики с действующим доступом к предмету
// занятия. Группы в определении получателей больше не участвуют.
async function getLessonRecipients(lessonId) {
  const lesson = await Lesson.findByPk(lessonId, { attributes: ['id', 'subjectId'] });
  if (!lesson) return [];
  const now = new Date();
  const accesses = await UserSubject.findAll({
    where: {
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
  const allowedIds = [...new Set(accesses.map((row) => Number(row.userId)))];
  if (!allowedIds.length) return [];
  const users = await User.findAll({
    where: { id: { [Op.in]: allowedIds }, isActive: true, isGuest: false },
    attributes: ['id', 'telegramId', 'firstName', 'lastName']
  });
  if (!users.length) return [];
  const blockedProfiles = await BotUser.findAll({
    where: {
      isBotBlocked: true,
      [Op.or]: [
        { userId: { [Op.in]: users.map((user) => user.id) } },
        { telegramId: { [Op.in]: users.map((user) => user.telegramId).filter(Boolean) } }
      ]
    },
    attributes: ['userId', 'telegramId'],
    raw: true
  });
  const blockedUserIds = new Set(blockedProfiles.map((profile) => Number(profile.userId)).filter(Boolean));
  const blockedTelegramIds = new Set(blockedProfiles.map((profile) => String(profile.telegramId)).filter(Boolean));
  return users.filter((user) => !blockedUserIds.has(Number(user.id)) && !blockedTelegramIds.has(String(user.telegramId)));
}

const teacherName = (teacher) => [teacher?.firstName, teacher?.lastName].filter(Boolean).join(' ') || 'Преподаватель';

// Тексты уведомлений ставят название предмета после предлога «по», которому
// нужен предложный падеж («по русскому языку», а не «по Русский язык»). Готовые
// падежные формы предметов в БД не хранятся, поэтому известные названия
// склоняются по явному словарю. Неизвестные (например, придуманные админом
// новые предметы) склоняются грубым эвристическим правилом — не идеально
// грамматически, но не ломает фразу так, как именительный падеж «в лоб».
const SUBJECT_DATIVE_OVERRIDES = {
  'русский язык': 'русскому языку',
  'английский язык': 'английскому языку',
  'немецкий язык': 'немецкому языку',
  'французский язык': 'французскому языку',
  'испанский язык': 'испанскому языку',
  'китайский язык': 'китайскому языку',
  'белорусский язык': 'белорусскому языку',
  'физика': 'физике',
  'химия': 'химии',
  'биология': 'биологии',
  'математика': 'математике',
  'алгебра': 'алгебре',
  'геометрия': 'геометрии',
  'информатика': 'информатике',
  'история': 'истории',
  'обществознание': 'обществознанию',
  'география': 'географии',
  'литература': 'литературе',
  'физкультура': 'физкультуре',
  'астрономия': 'астрономии',
  'экономика': 'экономике',
  'право': 'праву',
  'обж': 'ОБЖ',
  'изо': 'ИЗО'
};

function subjectDative(name) {
  const raw = String(name || '').trim();
  if (!raw) return 'предмету';
  const override = SUBJECT_DATIVE_OVERRIDES[raw.toLowerCase()];
  if (override) return override;
  // Аббревиатуры и слова без гласных не склоняем.
  if (raw === raw.toUpperCase() && raw.length <= 5) return raw;
  if (/ий$/i.test(raw)) return raw.replace(/ий$/i, 'ию');
  if (/ика$/i.test(raw) || /ия$/i.test(raw)) return raw.replace(/а$/i, 'е');
  if (/ь$/i.test(raw)) return raw.replace(/ь$/i, 'и');
  if (/[бвгджзклмнпрстфхцчшщ]$/i.test(raw)) return `${raw}у`;
  return raw;
}

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
  const subjectName = subjectDative(fullLesson?.subject?.name);
  const text = reminder
    ? `⏰ Через 15 минут начнётся занятие по ${subjectName}.\n\nПреподаватель: ${teacherName(fullLesson?.teacher)}`
    : `🔴 Началось занятие по ${subjectName}\n\nПреподаватель: ${teacherName(fullLesson?.teacher)}\n\nПереходи в приложение — во время занятия будут доступны голосования и викторины.`;
  const bot = getBot();
  const appUrl = buildLessonWebAppUrl(getWebAppUrlSync(), lesson.id);
  const results = [];

  for (const recipient of recipients) {
    if (!bot || !recipient.telegramId) {
      results.push({ userId: recipient.id, ok: false, reason: 'no_bot_or_telegram_id' });
      continue;
    }
    try {
      await bot.sendMessage(recipient.telegramId, text, (!reminder && appUrl) ? {
        reply_markup: { inline_keyboard: [[{ text: 'Перейти к занятию', web_app: { url: appUrl } }]] }
      } : undefined);
      results.push({ userId: recipient.id, ok: true });
    } catch (error) {
      console.error(`Lesson notification failed for user ${recipient.id}:`, error.message);
      if (isBotBlockedError(error)) {
        await BotUser.findOrCreate({
          where: { telegramId: recipient.telegramId },
          defaults: {
            telegramId: recipient.telegramId,
            userId: recipient.id,
            firstName: recipient.firstName || 'Пользователь',
            lastName: recipient.lastName || null,
            isAssigned: true,
            isBotBlocked: true,
            botBlockedAt: new Date(),
            botLastDeliveryError: error.message
          }
        }).then(([profile, created]) => created ? profile : profile.update({
          userId: profile.userId || recipient.id,
          isBotBlocked: true,
          botBlockedAt: new Date(),
          botLastDeliveryError: error.message
        }));
      }
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
