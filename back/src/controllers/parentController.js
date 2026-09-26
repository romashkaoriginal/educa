const { Parent, ParentReportDispatchLog, ParentReportLog, ParentStudent, Subject, User } = require('../models');
const { deactivateGuestForParent, resolveParentIdentity } = require('../services/parentIdentity');
const { sendParentReports, getNextReportSchedule } = require('../services/parentReportScheduler');
const { getPreviousMonthPeriod, getPreviousWeekPeriod } = require('../services/parentWeeklyReport');
const { sendTelegramMessage } = require('../services/telegramDelivery');

const parentInclude = [{
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
}];

function handleParentError(res, error, label) {
  console.error(`${label}:`, error);
  if (error.statusCode) return res.status(error.statusCode).json({ message: error.message });
  if (error.name === 'SequelizeUniqueConstraintError') {
    return res.status(409).json({ message: 'Этот ученик, Telegram ID или username уже привязан к другому родителю' });
  }
  return res.status(500).json({ message: 'Server error' });
}

async function notifyParentAssigned(parent, students) {
  if (!parent.telegramId) return;
  const { getBot } = require('../bot');
  const names = students.map((student) => [student?.firstName, student?.lastName].filter(Boolean).join(' ')).filter(Boolean);
  const studentsLabel = names.length ? names.join(', ') : 'ученика';
  const result = await sendTelegramMessage({
    bot: getBot(),
    chatId: parent.telegramId,
    recipient: parent,
    notificationKind: 'parent_assigned',
    context: { studentIds: students.map((s) => s.id) },
    text: `🎉 Вас успешно добавили как родителя ученика: ${studentsLabel}.\n\nЕженедельный отчёт приходит каждый понедельник в 18:00 по минскому времени.\nЕжемесячный отчёт приходит в первый понедельник месяца в 18:00 по минскому времени.\n\nДоступ к отчётам действует, пока у ученика есть активный доступ.`
  });
  if (!result.ok) console.warn(`Parent assignment notification was not sent: ${result.reason}`);
}

async function requireStudent(studentId) {
  const student = await User.findByPk(studentId, { attributes: ['id', 'firstName', 'lastName', 'role', 'isGuest'] });
  if (!student || student.role !== 'student' || student.isGuest) {
    const error = new Error('Ученик не найден');
    error.statusCode = 404;
    throw error;
  }
  return student;
}

// Принимает studentIds (массив) либо старый одиночный studentId — не ломает
// клиентов, которые ещё шлют один id. Возвращает уникальный список чисел.
function parseStudentIds(body) {
  const raw = Array.isArray(body.studentIds) ? body.studentIds : (body.studentId !== undefined ? [body.studentId] : []);
  const ids = [...new Set(raw.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0))];
  if (!ids.length) {
    const error = new Error('Выберите хотя бы одного ученика');
    error.statusCode = 400;
    throw error;
  }
  return ids;
}

exports.getAllParents = async (_req, res) => {
  try {
    const parents = await Parent.findAll({ include: parentInclude, order: [['createdAt', 'DESC']] });
    const parentIds = parents.map((parent) => parent.id);
    const logs = parentIds.length
      ? await ParentReportLog.findAll({
          where: { parentId: parentIds },
          order: [['periodStart', 'DESC'], ['createdAt', 'DESC']]
        })
      : [];
    const latestByParent = new Map();
    logs.forEach((log) => {
      if (!latestByParent.has(log.parentId)) latestByParent.set(log.parentId, log);
    });
    res.json({
      manualReportsEnabled: true,
      reportSchedule: getNextReportSchedule(),
      parents: parents.map((parent) => ({
        ...parent.toJSON(),
        lastReport: latestByParent.get(parent.id)?.toJSON() || null
      }))
    });
  } catch (error) {
    handleParentError(res, error, 'Get parents error');
  }
};

function summarizeReportResult(result) {
  return result.logs.reduce((summary, log) => {
    summary[log.status] = (summary[log.status] || 0) + 1;
    return summary;
  }, {});
}

function getManualReportTrigger(req, scope) {
  const user = req.dbUser;
  if (!user?.id) {
    const error = new Error('Не удалось определить пользователя, запустившего отправку');
    error.statusCode = 401;
    throw error;
  }
  const name = [user?.firstName, user?.lastName].filter(Boolean).join(' ') || `Пользователь #${user?.id || 'неизвестен'}`;
  return { userId: user.id, name, scope };
}

exports.sendReports = async (req, res) => {
  try {
    const reportType = req.params.reportType;
    if (!['weekly', 'monthly'].includes(reportType)) {
      return res.status(400).json({ message: 'Неизвестный тип отчёта' });
    }
    const { getBot } = require('../bot');
    const bot = getBot();
    if (!bot) return res.status(503).json({ message: 'Telegram-бот не запущен' });
    const manualTrigger = getManualReportTrigger(req, 'bulk');
    console.info(`[Parent reports] Ручная массовая отправка ${reportType}: ${manualTrigger.name} (userId=${manualTrigger.userId ?? 'unknown'})`);
    const result = await sendParentReports({ bot, reportType, force: true, manualTrigger });
    return res.json({
      message: reportType === 'monthly' ? 'Месячные отчёты обработаны' : 'Недельные отчёты обработаны',
      reportType,
      period: reportType === 'monthly' ? getPreviousMonthPeriod() : getPreviousWeekPeriod(),
      processed: result.processed,
      statuses: summarizeReportResult(result)
    });
  } catch (error) {
    return handleParentError(res, error, 'Send parent reports error');
  }
};

exports.sendReportToParent = async (req, res) => {
  try {
    const parentId = Number(req.params.parentId);
    if (!Number.isSafeInteger(parentId) || parentId <= 0) return res.status(400).json({ message: 'Некорректный ID родителя' });
    const reportType = req.params.reportType;
    if (!['weekly', 'monthly'].includes(reportType)) return res.status(400).json({ message: 'Неизвестный тип отчёта' });
    const parent = await Parent.findByPk(parentId);
    if (!parent) return res.status(404).json({ message: 'Родитель не найден' });
    const { getBot } = require('../bot');
    const bot = getBot();
    if (!bot) return res.status(503).json({ message: 'Telegram-бот не запущен' });

    const manualTrigger = getManualReportTrigger(req, 'parent');
    console.info(`[Parent reports] Ручная отправка ${reportType} родителю #${parent.id}: ${manualTrigger.name} (userId=${manualTrigger.userId ?? 'unknown'})`);
    const result = await sendParentReports({ bot, reportType, force: true, parentId, manualTrigger });
    return res.json({
      message: reportType === 'monthly' ? 'Месячный отчёт обработан' : 'Недельный отчёт обработан',
      reportType,
      period: reportType === 'monthly' ? getPreviousMonthPeriod() : getPreviousWeekPeriod(),
      processed: result.processed,
      statuses: summarizeReportResult(result)
    });
  } catch (error) {
    return handleParentError(res, error, 'Send parent reports error');
  }
};

exports.createParent = async (req, res) => {
  try {
    const studentIds = parseStudentIds(req.body);
    const students = await Promise.all(studentIds.map(requireStudent));
    const identity = await resolveParentIdentity(req.body);
    const parent = await Parent.create({ ...identity, isActive: true });
    await ParentStudent.bulkCreate(studentIds.map((studentId) => ({ parentId: parent.id, studentId })));
    await deactivateGuestForParent(parent.telegramId);
    const created = await Parent.findByPk(parent.id, { include: parentInclude });
    await notifyParentAssigned(parent, students);
    res.status(201).json({ message: 'Parent created successfully', parent: created });
  } catch (error) {
    handleParentError(res, error, 'Create parent error');
  }
};

exports.updateParent = async (req, res) => {
  try {
    const parent = await Parent.findByPk(req.params.parentId);
    if (!parent) return res.status(404).json({ message: 'Родитель не найден' });

    const hasStudentIds = req.body.studentIds !== undefined || req.body.studentId !== undefined;
    let studentIds = null;
    if (hasStudentIds) {
      studentIds = parseStudentIds(req.body);
      await Promise.all(studentIds.map(requireStudent));
    }

    const identity = await resolveParentIdentity({
      telegramId: req.body.telegramId === undefined ? parent.telegramId : req.body.telegramId,
      telegramUsername: req.body.telegramUsername === undefined ? parent.telegramUsername : req.body.telegramUsername,
      firstName: req.body.firstName === undefined ? parent.firstName : req.body.firstName,
      lastName: req.body.lastName === undefined ? parent.lastName : req.body.lastName
    });
    await parent.update({ ...identity, isActive: true });

    if (studentIds) {
      await ParentStudent.destroy({ where: { parentId: parent.id } });
      await ParentStudent.bulkCreate(studentIds.map((studentId) => ({ parentId: parent.id, studentId })));
    }

    await deactivateGuestForParent(parent.telegramId);
    const updated = await Parent.findByPk(parent.id, { include: parentInclude });
    res.json({ message: 'Parent updated successfully', parent: updated });
  } catch (error) {
    handleParentError(res, error, 'Update parent error');
  }
};

exports.deleteParent = async (req, res) => {
  try {
    const parent = await Parent.findByPk(req.params.parentId);
    if (!parent) return res.status(404).json({ message: 'Родитель не найден' });
    await parent.destroy();
    res.json({ message: 'Parent deleted successfully' });
  } catch (error) {
    handleParentError(res, error, 'Delete parent error');
  }
};

exports.getReportLogs = async (_req, res) => {
  try {
    const logs = await ParentReportDispatchLog.findAll({
      include: [
        { model: Parent, as: 'parent', attributes: ['id', 'firstName', 'lastName', 'telegramUsername', 'telegramId'] },
        { model: User, as: 'student', attributes: ['id', 'firstName', 'lastName'] },
        { model: User, as: 'triggeredBy', attributes: ['id', 'firstName', 'lastName', 'role'] }
      ],
      order: [['createdAt', 'DESC']],
      limit: 100
    });
    res.json({ logs });
  } catch (error) {
    handleParentError(res, error, 'Get parent report logs error');
  }
};
