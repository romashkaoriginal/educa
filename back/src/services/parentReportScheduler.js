const { Parent, ParentReportLog, ParentReportDispatchLog, Subject, User } = require('../models');
const { sendTelegramMessage } = require('./telegramDelivery');
const {
  buildReportMessages,
  getPreviousMonthPeriod,
  getPreviousWeekPeriod,
  getManagerContactKeyboard,
  isSubjectAccessActive,
  clipReportPeriodToSubjectAccess,
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
  return reportType === 'monthly' ? getPreviousMonthPeriod(now) : getPreviousWeekPeriod(now);
}

function getDeliveryKind(manualTrigger) {
  return manualTrigger ? `manual_${manualTrigger.scope}` : 'scheduled';
}

function reportPreparationError(status, message) {
  const error = new Error(message);
  error.reportStatus = status;
  return error;
}

// Это единственный генератор текста и статистики для предпросмотра и отправки.
// Не переносим расчёт на клиент: иначе увиденное администратором может отличаться
// от сообщения в Telegram.
async function prepareParentReport(parent, { now = new Date(), reportType = 'weekly', force = false } = {}) {
  const period = getReportPeriod(reportType, now, force);
  const students = parent.students || [];
  if (!parent.telegramId) throw reportPreparationError('skipped_no_telegram', 'Родитель ещё не подтвердил Telegram ID через бота');
  if (!students.length) throw reportPreparationError('skipped_no_access', 'К родителю не привязан ни один ученик');

  const studentsWithSubjects = students
    .filter((student) => student.isActive)
    .map((student) => {
      const subjectPeriods = (student.subjects || [])
        .filter((subject) => isSubjectAccessActive(subject, now))
        .map((subject) => ({ subject, period: clipReportPeriodToSubjectAccess(period, subject) }))
        .filter(({ period: subjectPeriod }) => subjectPeriod);
      const studentPeriod = subjectPeriods.reduce((earliest, item) => (
        !earliest || item.period.startUtc < earliest.startUtc ? item.period : earliest
      ), null);
      return { student, subjectPeriods, studentPeriod };
    })
    .filter(({ subjectPeriods }) => subjectPeriods.length > 0);

  if (!studentsWithSubjects.length) {
    throw reportPreparationError('skipped_no_access', 'Ни у одного ученика нет активного доступа в период отчёта');
  }

  const messages = [];
  for (const { student, subjectPeriods, studentPeriod } of studentsWithSubjects) {
    const report = await buildReportMessages({
      student,
      subjects: subjectPeriods.map(({ subject }) => subject),
      subjectPeriods,
      period: studentPeriod,
      reportType,
      now
    });
    messages.push(...report.messages);
  }
  return { period, messages };
}

async function processParent(parent, { bot, now = new Date(), reportType = 'weekly', force = false, manualTrigger = null }) {
  const period = getReportPeriod(reportType, now, force);
  const deliveryKind = getDeliveryKind(manualTrigger);
  const students = parent.students || [];
  const firstStudentId = students[0]?.id ?? null;
  const [log, created] = await ParentReportLog.findOrCreate({
    where: { parentId: parent.id, reportType, periodStart: period.startDate, deliveryKind },
    defaults: {
      studentId: firstStudentId,
      periodEnd: period.endDate,
      deliveryKind,
      status: 'processing',
      ...(manualTrigger ? {
        manualTriggeredByUserId: manualTrigger.userId,
        manualTriggeredByName: manualTrigger.name,
        manualTriggerScope: manualTrigger.scope
      } : {})
    }
  });

  const finish = async (values) => {
    await log.update(values);
    if (manualTrigger) {
      await ParentReportDispatchLog.create({
        parentReportLogId: log.id,
        parentId: parent.id,
        studentId: firstStudentId,
        reportType,
        periodStart: period.startDate,
        periodEnd: period.endDate,
        triggerScope: manualTrigger.scope,
        triggeredByUserId: manualTrigger.userId,
        triggeredByName: manualTrigger.name,
        status: values.status,
        messageCount: values.messageCount || 0,
        sentAt: values.sentAt || null,
        error: values.error || null
      });
    }
    return log;
  };
  // Если отчёт был пропущен только потому, что у родителя тогда не было
  // Telegram ID (или не было активного доступа у ребёнка), условия могли
  // измениться до следующего запуска планировщика. Такие записи можно
  // безопасно повторить: сообщений при пропуске не отправлялось.
  const retryableSkippedStatus = ['skipped_no_telegram', 'skipped_no_access'].includes(log.status);
  if (!created && !force && !retryableSkippedStatus) return log;
  if (!created) {
    await log.update({
      studentId: firstStudentId,
      periodEnd: period.endDate,
      status: 'processing',
      messageCount: 0,
      sentAt: null,
      error: null,
      ...(manualTrigger ? {
        manualTriggeredByUserId: manualTrigger.userId,
        manualTriggeredByName: manualTrigger.name,
        manualTriggerScope: manualTrigger.scope
      } : {})
    });
  }

  try {
    const { messages: allMessages } = await prepareParentReport(parent, { now, reportType, force });
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
    return finish({ status: 'sent', messageCount: sentCount, sentAt: new Date(), error: null });
  } catch (error) {
    if (error.reportStatus) return finish({ status: error.reportStatus, error: error.message });
    return finish({ status: 'failed', error: String(error.message || error).slice(0, 2000) });
  }
}

async function getActiveParents(parentId = null) {
  return Parent.findAll({
    ...(parentId ? { where: { id: parentId } } : {}),
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

async function sendParentReports({ bot, now = new Date(), reportType = 'weekly', force = false, parentId = null, manualTrigger = null }) {
  if (!['weekly', 'monthly'].includes(reportType)) throw new Error('Unsupported parent report type');
  const parents = await getActiveParents(parentId);
  const logs = [];
  for (const parent of parents) {
    logs.push(await processParent(parent, { bot, now, reportType, force, manualTrigger }));
  }
  return { processed: parents.length, logs };
}

// Вызывается в момент, когда родитель впервые подтвердил аккаунт в Telegram.
// Берём только последний пропущенный отчёт каждого типа: отправка всех старых
// недель разом была бы неожиданной и засорила бы чат родителя.
async function retryMissedReportsAfterTelegramConfirmation(parentId, now = new Date()) {
  const skipped = await ParentReportLog.findAll({
    where: { parentId, status: 'skipped_no_telegram' },
    attributes: ['reportType', 'periodStart'],
    order: [['createdAt', 'DESC']]
  });
  // Ручной запуск 22.09 оставил месячные пропуски с произвольной датой
  // начала периода. Их нельзя автоматически досылать после подтверждения.
  const reportTypes = [...new Set(skipped
    .filter((log) => log.reportType !== 'monthly' || String(log.periodStart).endsWith('-01'))
    .map((log) => log.reportType))];
  if (!reportTypes.length) return [];

  const parent = await Parent.findByPk(parentId, {
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
  if (!parent?.telegramId) return [];

  const { getBot } = require('../bot');
  const bot = getBot();
  if (!bot) throw new Error('Telegram bot is not running');

  return Promise.all(reportTypes.map((reportType) => processParent(parent, {
    bot,
    now,
    reportType,
    force: true
  })));
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
  getDeliveryKind,
  prepareParentReport,
  processParent,
  sendParentReports,
  retryMissedReportsAfterTelegramConfirmation,
  tick,
  startParentReportScheduler,
  stopParentReportScheduler
};
