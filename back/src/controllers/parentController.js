const { Parent, ParentReportLog, Subject, User } = require('../models');
const { deactivateGuestForParent, resolveParentIdentity } = require('../services/parentIdentity');
const { sendParentReports, getNextReportSchedule } = require('../services/parentReportScheduler');
const { sendTelegramMessage } = require('../services/telegramDelivery');

const parentInclude = [{
  model: User,
  as: 'student',
  attributes: ['id', 'firstName', 'lastName', 'isActive'],
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

async function notifyParentAssigned(parent, student) {
  if (!parent.telegramId) return;
  const { getBot } = require('../bot');
  const studentName = [student?.firstName, student?.lastName].filter(Boolean).join(' ') || 'ученика';
  const result = await sendTelegramMessage({
    bot: getBot(),
    chatId: parent.telegramId,
    recipient: parent,
    notificationKind: 'parent_assigned',
    context: { studentId: parent.studentId },
    text: `🎉 Вас успешно добавили как родителя ученика ${studentName}.\n\nЕженедельный отчёт приходит каждый понедельник в 18:00 по минскому времени.\nЕжемесячный отчёт приходит в первый понедельник месяца в 18:00 по минскому времени.\n\nДоступ к отчётам действует, пока у ученика есть активный доступ.`
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

exports.sendReports = async (req, res) => {
  try {
    const reportType = req.params.reportType;
    if (!['weekly', 'monthly'].includes(reportType)) {
      return res.status(400).json({ message: 'Неизвестный тип отчёта' });
    }
    const { getBot } = require('../bot');
    const bot = getBot();
    if (!bot) return res.status(503).json({ message: 'Telegram-бот не запущен' });

    const result = await sendParentReports({ bot, reportType, force: true });
    const statuses = result.logs.reduce((summary, log) => {
      summary[log.status] = (summary[log.status] || 0) + 1;
      return summary;
    }, {});
    return res.json({
      message: reportType === 'monthly' ? 'Месячные отчёты обработаны' : 'Недельные отчёты обработаны',
      reportType,
      processed: result.processed,
      statuses
    });
  } catch (error) {
    return handleParentError(res, error, 'Send parent reports error');
  }
};

exports.createParent = async (req, res) => {
  try {
    const studentId = Number(req.body.studentId);
    const student = await requireStudent(studentId);
    const identity = await resolveParentIdentity(req.body);
    const parent = await Parent.create({
      studentId,
      ...identity,
      isActive: true
    });
    await deactivateGuestForParent(parent.telegramId);
    const created = await Parent.findByPk(parent.id, { include: parentInclude });
    await notifyParentAssigned(parent, student);
    res.status(201).json({ message: 'Parent created successfully', parent: created });
  } catch (error) {
    handleParentError(res, error, 'Create parent error');
  }
};

exports.updateParent = async (req, res) => {
  try {
    const parent = await Parent.findByPk(req.params.parentId);
    if (!parent) return res.status(404).json({ message: 'Родитель не найден' });

    const studentId = req.body.studentId === undefined ? parent.studentId : Number(req.body.studentId);
    await requireStudent(studentId);
    const identity = await resolveParentIdentity({
      telegramId: req.body.telegramId === undefined ? parent.telegramId : req.body.telegramId,
      telegramUsername: req.body.telegramUsername === undefined ? parent.telegramUsername : req.body.telegramUsername,
      firstName: req.body.firstName === undefined ? parent.firstName : req.body.firstName,
      lastName: req.body.lastName === undefined ? parent.lastName : req.body.lastName
    });
    await parent.update({
      studentId,
      ...identity,
      isActive: true
    });
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
    const logs = await ParentReportLog.findAll({
      include: [
        { model: Parent, as: 'parent', attributes: ['id', 'firstName', 'lastName', 'telegramUsername', 'telegramId'] },
        { model: User, as: 'student', attributes: ['id', 'firstName', 'lastName'] }
      ],
      order: [['createdAt', 'DESC']],
      limit: 100
    });
    res.json({ logs });
  } catch (error) {
    handleParentError(res, error, 'Get parent report logs error');
  }
};
