const { Parent, ParentReportLog, ParentReportDispatchLog, Subject, User } = require('../models');
const { Op } = require('sequelize');
const { sendTelegramMessage } = require('./telegramDelivery');
const {
  buildReportMessages,
  getPreviousMonthPeriod,
  getForcedPeriod,
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
  // Месячный отчёт — это скользящее окно «последние 30 дней», а не
  // календарный месяц: иначе ученику, подключившемуся, скажем, три недели
  // назад, календарный месяц ничего не покрывает и отчёт пуст. Клиппинг под
  // дату начала доступа (clipReportPeriodToSubjectAccess) сокращает его до
  // фактического периода занятий, если он короче 30 дней.
  if (reportType === 'monthly') return getForcedPeriod(reportType, now);
  if (force) return getForcedPeriod(reportType, now);
  return getPreviousWeekPeriod(now);
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
  return { period, messages, firstStudentId: students[0]?.id ?? null };
}

async function deliverPreparedReport(parent, { bot, reportType, period, messages, log }) {
  try {
    let sentCount = 0;
    for (const [index, text] of messages.entries()) {
      const result = await sendTelegramMessage({
        bot,
        chatId: parent.telegramId,
        text,
        options: {
          parse_mode: 'HTML',
          ...(index === messages.length - 1 ? { reply_markup: getManagerContactKeyboard() } : {})
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

async function getManualReportLog(parent, { reportType, period, firstStudentId, manualTrigger }) {
  const manualMetadata = {
    manualTriggeredByUserId: manualTrigger.userId,
    manualTriggeredByName: manualTrigger.name,
    manualTriggerScope: manualTrigger.scope
  };
  const [log, created] = await ParentReportLog.findOrCreate({
    where: { parentId: parent.id, reportType, periodStart: period.startDate, deliveryKind: 'manual_single' },
    defaults: { studentId: firstStudentId, periodEnd: period.endDate, deliveryKind: 'manual_single', status: 'processing', ...manualMetadata }
  });
  if (!created) {
    await log.update({ studentId: firstStudentId, periodEnd: period.endDate, status: 'processing', messageCount: 0, sentAt: null, error: null, ...manualMetadata });
  }
  return log;
}

// Отправляет уже подготовленный и подтверждённый снимок предпросмотра, а не
// пересчитывает статистику заново — увиденное в предпросмотре обязано совпасть
// с тем, что уйдёт в Telegram.
async function sendPreparedParentReport(parent, { bot, reportType, period, messages, firstStudentId, manualTrigger }) {
  const log = await getManualReportLog(parent, { reportType, period, firstStudentId, manualTrigger });
  const result = await deliverPreparedReport(parent, { bot, reportType, period, messages, log });
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
    status: result.status,
    messageCount: result.messageCount,
    sentAt: result.sentAt,
    error: result.error
  });
  return result;
}

async function processParent(parent, { bot, now = new Date(), reportType = 'weekly', force = false, manualTrigger = null, deliveryKindOverride = null }) {
  const period = getReportPeriod(reportType, now, force);
  const deliveryKind = deliveryKindOverride || getDeliveryKind(manualTrigger);
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
        batchId: manualTrigger.batchId || null,
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
    const values = {
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
    };
    if (!force) {
      // Подтверждение Telegram и очередной tick могут восстановить один отчёт
      // одновременно. Только один процесс получает право на отправку.
      const [claimed] = await ParentReportLog.update(values, { where: { id: log.id, status: log.status } });
      if (!claimed) return log;
    } else {
      await log.update(values);
    }
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
    where: { isActive: true, ...(parentId ? { id: parentId } : {}) },
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
function getMissedScheduledReports(logs, now = new Date()) {
  const latest = new Map();
  for (const log of [...logs].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))) {
    if (log.deliveryKind !== 'scheduled') continue;
    const key = `${log.parentId}:${log.reportType}`;
    if (!latest.has(key)) latest.set(key, log);
  }
  return [...latest.values()].filter((log) => {
    if (log.status !== 'skipped_no_telegram') return false;
    const sentFor = new Date(log.createdAt);
    const due = log.reportType === 'monthly' ? isMonthlyReportDue(sentFor)
      : log.reportType === 'weekly' && isMondayReportDue(sentFor);
    const maxAge = (log.reportType === 'monthly' ? 35 : 7) * 24 * 60 * 60 * 1000;
    const age = now - sentFor;
    return due && age >= 0 && age < maxAge;
  });
}

async function retryMissedReportsAfterTelegramConfirmation(parentId, now = new Date(), { bot: providedBot } = {}) {
  const logs = await ParentReportLog.findAll({
    where: { parentId, deliveryKind: 'scheduled' },
    attributes: ['parentId', 'reportType', 'deliveryKind', 'periodStart', 'status', 'createdAt'],
    order: [['createdAt', 'DESC']]
  });
  const missed = getMissedScheduledReports(logs, now);
  if (!missed.length) return [];

  const [parent] = await getActiveParents(parentId);
  if (!parent?.telegramId) return [];

  const { getBot } = require('../bot');
  const bot = providedBot || getBot();
  if (!bot) throw new Error('Telegram bot is not running');

  return Promise.all(missed.map((log) => processParent(parent, {
    bot,
    // Восстанавливаем исходный плановый период и его запись. Новый период
    // при каждом входе создавал бы дубликаты и менял содержание отчёта.
    now: new Date(log.createdAt),
    reportType: log.reportType,
    force: false
  })));
}

async function retryConfirmedParentReports(bot, now) {
  const logs = await ParentReportLog.findAll({
    where: {
      deliveryKind: 'scheduled', status: 'skipped_no_telegram',
      createdAt: { [Op.gte]: new Date(now.getTime() - 35 * 24 * 60 * 60 * 1000) }
    },
    attributes: ['parentId']
  });
  const ids = [...new Set(logs.map((log) => log.parentId))];
  if (!ids.length) return;
  const parents = await Parent.findAll({
    where: { id: ids, isActive: true, telegramId: { [Op.ne]: null } }, attributes: ['id']
  });
  for (const parent of parents) {
    await retryMissedReportsAfterTelegramConfirmation(parent.id, now, { bot });
  }
}

let tickRunning = false;
async function tick(now = new Date()) {
  if (tickRunning) return { due: false, processed: 0, reason: 'already_running' };
  tickRunning = true;
  try {
    const weeklyDue = isMondayReportDue(now);
    const monthlyDue = isMonthlyReportDue(now);
    const { getBot } = require('../bot');
    const bot = getBot();
    if (!bot) return { due: weeklyDue || monthlyDue, processed: 0, reason: 'bot_not_running' };

    // ID могли восстановить через админку после понедельника, без нового /start.
    await retryConfirmedParentReports(bot, now);
    if (!weeklyDue && !monthlyDue) return { due: false, processed: 0 };

    const weekly = weeklyDue
      ? await sendParentReports({ bot, now, reportType: 'weekly', force: false })
      : { processed: 0 };
    const monthly = monthlyDue
      ? await sendParentReports({ bot, now, reportType: 'monthly', force: false })
      : { processed: 0 };
    return { due: true, processed: weekly.processed + monthly.processed };
  } finally {
    tickRunning = false;
  }
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
  getReportPeriod,
  prepareParentReport,
  sendPreparedParentReport,
  processParent,
  sendParentReports,
  retryMissedReportsAfterTelegramConfirmation,
  getMissedScheduledReports,
  tick,
  startParentReportScheduler,
  stopParentReportScheduler
};
