const { Parent, ParentReportLog, Subject, User } = require('../models');
const { sendTelegramMessage } = require('./telegramDelivery');
const {
  buildReportMessages,
  getForcedPeriod,
  getPreviousMonthPeriod,
  getPreviousWeekPeriod,
  getManagerContactKeyboard,
  isSubjectAccessActive,
  minskDateParts
} = require('./parentWeeklyReport');

const TICK_MS = 5 * 60 * 1000;
let timer = null;

function isMondayReportDue(now = new Date()) {
  const local = minskDateParts(now);
  const day = new Date(`${local.date}T00:00:00Z`).getUTCDay();
  return day === 1 && local.hour >= 18;
}

function isMonthlyReportDue(now = new Date()) {
  const local = minskDateParts(now);
  const day = new Date(`${local.date}T00:00:00Z`).getUTCDay();
  const dayOfMonth = Number(local.date.slice(-2));
  return day === 1 && dayOfMonth <= 7 && local.hour >= 18;
}

function minskDateAt18(date) {
  return new Date(`${date}T18:00:00+03:00`);
}

function shiftDate(date, days) {
  const shifted = new Date(`${date}T00:00:00Z`);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
}

function getNextWeeklyReportAt(now = new Date()) {
  const local = minskDateParts(now);
  const day = new Date(`${local.date}T00:00:00Z`).getUTCDay();
  const daysUntilMonday = day === 1 && local.hour < 18 ? 0 : ((8 - day) % 7 || 7);
  return minskDateAt18(shiftDate(local.date, daysUntilMonday));
}

function getNextMonthlyReportAt(now = new Date()) {
  let candidate = getNextWeeklyReportAt(now);
  while (Number(minskDateParts(candidate).date.slice(-2)) > 7) {
    candidate = new Date(candidate.getTime() + 7 * 24 * 60 * 60 * 1000);
  }
  return candidate;
}

function getNextReportSchedule(now = new Date()) {
  return {
    weekly: getNextWeeklyReportAt(now).toISOString(),
    monthly: getNextMonthlyReportAt(now).toISOString()
  };
}

function getReportPeriod(reportType, now, force) {
  if (force) return getForcedPeriod(reportType, now);
  return reportType === 'monthly' ? getPreviousMonthPeriod(now) : getPreviousWeekPeriod(now);
}

async function processParent(parent, { bot, now = new Date(), reportType = 'weekly', force = false }) {
  const period = getReportPeriod(reportType, now, force);
  const students = parent.students || [];
  const firstStudentId = students[0]?.id ?? null;
  const [log, created] = await ParentReportLog.findOrCreate({
    where: { parentId: parent.id, reportType, periodStart: period.startDate },
    defaults: {
      studentId: firstStudentId,
      periodEnd: period.endDate,
      status: 'processing'
    }
  });
  if (!created && !force) return log;
  if (!created) {
    await log.update({
      studentId: firstStudentId,
      periodEnd: period.endDate,
      status: 'processing',
      messageCount: 0,
      sentAt: null,
      error: null
    });
  }

  if (!parent.telegramId) {
    await log.update({ status: 'skipped_no_telegram', error: 'Родитель ещё не подтвердил Telegram ID через бота' });
    return log;
  }
  if (!students.length) {
    await log.update({ status: 'skipped_no_access', error: 'К родителю не привязан ни один ученик' });
    return log;
  }

  // Для каждого ребёнка отдельно считаем активные предметы. Отчёт пропускаем
  // целиком, только если НИ у одного ребёнка нет доступа — иначе шлём отчёт
  // по тем детям, у кого доступ есть, одним потоком сообщений.
  const studentsWithSubjects = students
    .filter((student) => student.isActive)
    .map((student) => ({
      student,
      activeSubjects: (student.subjects || []).filter((subject) => isSubjectAccessActive(subject, now))
    }))
    .filter(({ activeSubjects }) => activeSubjects.length > 0);

  if (!studentsWithSubjects.length) {
    await log.update({ status: 'skipped_no_access', error: 'Ни у одного ученика нет активного доступа' });
    return log;
  }

  try {
    const allMessages = [];
    for (const { student, activeSubjects } of studentsWithSubjects) {
      const { messages } = await buildReportMessages({
        student,
        subjects: activeSubjects,
        reportType,
        now
      });
      allMessages.push(...messages);
    }
    let sentCount = 0;
    for (const [index, text] of allMessages.entries()) {
      const result = await sendTelegramMessage({
        bot,
        chatId: parent.telegramId,
        text,
        options: {
          parse_mode: 'HTML',
          ...(index === allMessages.length - 1 ? { reply_markup: getManagerContactKeyboard() } : {})
        },
        recipient: parent,
        notificationKind: `parent_${reportType}_report`,
        context: { parentId: parent.id, reportType, periodStart: period.startDate }
      });
      if (!result.ok) throw new Error(result.reason || 'Не удалось отправить сообщение');
      sentCount += 1;
    }
    await log.update({ status: 'sent', messageCount: sentCount, sentAt: new Date(), error: null });
  } catch (error) {
    await log.update({ status: 'failed', error: String(error.message || error).slice(0, 2000) });
  }
  return log;
}

async function getActiveParents() {
  return Parent.findAll({
    include: [{
      model: User,
      as: 'students',
      attributes: ['id', 'firstName', 'lastName', 'isActive'],
      through: { attributes: [] },
      include: [{
        model: Subject,
        as: 'subjects',
        attributes: ['id', 'name', 'icon'],
        through: { attributes: ['accessStartDate', 'accessEndDate', 'isActive'] }
      }]
    }]
  });
}

async function sendParentReports({ bot, now = new Date(), reportType = 'weekly', force = false }) {
  if (!['weekly', 'monthly'].includes(reportType)) throw new Error('Unsupported parent report type');
  const parents = await getActiveParents();
  const logs = [];
  for (const parent of parents) {
    logs.push(await processParent(parent, { bot, now, reportType, force }));
  }
  return { processed: parents.length, logs };
}

async function tick(now = new Date()) {
  const weeklyDue = isMondayReportDue(now);
  const monthlyDue = isMonthlyReportDue(now);
  if (!weeklyDue && !monthlyDue) return { due: false, processed: 0 };
  const { getBot } = require('../bot');
  const bot = getBot();
  if (!bot) return { due: true, processed: 0, reason: 'bot_not_running' };

  const weekly = weeklyDue
    ? await sendParentReports({ bot, now, reportType: 'weekly', force: false })
    : { processed: 0 };
  const monthly = monthlyDue
    ? await sendParentReports({ bot, now, reportType: 'monthly', force: false })
    : { processed: 0 };
  return { due: true, processed: weekly.processed + monthly.processed };
}

function startParentReportScheduler() {
  if (timer) return;
  tick().catch((error) => console.error('Parent report scheduler:', error));
  timer = setInterval(() => tick().catch((error) => console.error('Parent report scheduler:', error)), TICK_MS);
  console.log('⏰ Планировщик отчётов родителям запущен (понедельник, 18:00 Europe/Minsk)');
}

function stopParentReportScheduler() {
  if (timer) clearInterval(timer);
  timer = null;
}

module.exports = {
  isMondayReportDue,
  isMonthlyReportDue,
  getNextWeeklyReportAt,
  getNextMonthlyReportAt,
  getNextReportSchedule,
  processParent,
  sendParentReports,
  tick,
  startParentReportScheduler,
  stopParentReportScheduler
};
