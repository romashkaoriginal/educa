const crypto = require('crypto');
const { User } = require('../models');

const STAFF_ROLES = ['admin', 'manager', 'teacher'];

function isStaffRole(role) {
  return STAFF_ROLES.includes(role);
}

function parsePositiveInt(value) {
  const id = parseInt(value, 10);
  return Number.isFinite(id) && id > 0 ? id : null;
}

function canAccessStudent(req, studentId) {
  if (!req.dbUser) return false;
  if (isStaffRole(req.dbUser.role)) return true;
  return Number(req.dbUser.id) === Number(studentId);
}

function verifyTelegramInitData(initData) {
  try {
    const botToken = process.env.BOT_TOKEN;
    if (!botToken) return null;

    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    if (!hash) return null;

    const authDate = params.get('auth_date');
    if (authDate) {
      const ageSec = Math.floor(Date.now() / 1000) - parseInt(authDate, 10);
      const maxAge = parseInt(process.env.TELEGRAM_INIT_MAX_AGE_SEC || '86400', 10);
      if (!Number.isFinite(ageSec) || ageSec < 0 || ageSec > maxAge) return null;
    }

    params.delete('hash');
    const dataCheckString = [...params.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join('\n');

    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
    const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

    if (calculatedHash !== hash) return null;

    const userStr = params.get('user');
    if (!userStr) return null;
    return JSON.parse(userStr);
  } catch {
    return null;
  }
}

exports.telegramAuth = async (req, res, next) => {
  try {
    const initData = req.headers['x-telegram-init-data'];
    if (!initData) return res.status(401).json({ message: 'No Telegram auth data' });

    if (!initData) { console.log('[Auth] No initData header'); }
    const telegramUser = verifyTelegramInitData(initData);
    if (!telegramUser) { console.log('[Auth] Invalid initData signature'); return res.status(401).json({ message: 'Invalid Telegram auth data' }); }

    req.telegramUser = telegramUser;

    const dbUser = await User.findOne({
      where: { telegramId: telegramUser.id },
      attributes: ['id', 'role', 'isActive', 'telegramId', 'firstName', 'lastName', 'isGuest', 'guestStatus', 'guestExpiresAt']
    });

    if (!dbUser) console.log('[Auth] User not found in DB, telegramId:', telegramUser?.id);
    req.dbUser = dbUser;
    next();
  } catch (error) {
    console.error('Telegram auth error:', error);
    res.status(500).json({ message: 'Auth error' });
  }
};

exports.requireUser = (req, res, next) => {
  if (!req.dbUser) { console.log('[Auth] requireUser failed - no dbUser'); return res.status(403).json({ message: 'User not registered in system' }); }
  if (!req.dbUser.isActive) return res.status(403).json({ message: 'Account is deactivated' });
  // Гость с истёкшим 24-часовым доступом — закрываем практику/статистику/subjects.
  // Фронт по коду GUEST_EXPIRED показывает экран окончания доступа (ТЗ §19).
  if (req.dbUser.isGuest) {
    const exp = req.dbUser.guestExpiresAt ? new Date(req.dbUser.guestExpiresAt).getTime() : 0;
    if (!exp || exp <= Date.now()) {
      return res.status(403).json({ message: 'Guest access expired', code: 'GUEST_EXPIRED' });
    }
  }
  next();
};

// Запрещаем гостям доступ к разделам только для учеников (Домашка, Викторина) — ТЗ §7, §8, §21.
// Навешивается ПОСЛЕ requireUser на /api/homework и /api/quiz.
exports.blockGuests = (req, res, next) => {
  if (req.dbUser?.isGuest) {
    return res.status(403).json({ message: 'Section available to students only', code: 'GUEST_FORBIDDEN' });
  }
  next();
};

exports.requireAdmin = (req, res, next) => {
  if (!req.dbUser || req.dbUser.role !== 'admin') {
    return res.status(403).json({ message: 'Admin access required' });
  }
  next();
};

// Middleware — для конкретных ролей
exports.requireRole = (roles) => (req, res, next) => {
  if (!req.dbUser) return res.status(403).json({ message: 'User not registered in system' });
  if (!req.dbUser.isActive) return res.status(403).json({ message: 'Account is deactivated' });
  if (!roles.includes(req.dbUser.role)) {
    return res.status(403).json({ message: 'Access denied' });
  }
  next();
};

// Ученик — только свои данные; staff — любые
exports.assertSelfOrStaff = (paramName = 'studentId') => (req, res, next) => {
  const raw = req.params[paramName] ?? req.params.userId;
  const studentId = parsePositiveInt(raw);
  if (!studentId) return res.status(400).json({ message: 'Invalid student id' });
  if (!canAccessStudent(req, studentId)) {
    return res.status(403).json({ message: 'Access denied' });
  }
  next();
};

exports.assertBodyStudentId = (req, res, next) => {
  const studentId = parsePositiveInt(req.body?.studentId);
  if (!studentId) return res.status(400).json({ message: 'Invalid student id' });
  if (!canAccessStudent(req, studentId)) {
    return res.status(403).json({ message: 'Access denied' });
  }
  next();
};

exports.assertQueryStudentIdOptional = (req, res, next) => {
  const q = req.query?.studentId;
  if (q == null || q === '') return next();
  const studentId = parsePositiveInt(q);
  if (!studentId) return res.status(400).json({ message: 'Invalid student id' });
  if (!canAccessStudent(req, studentId)) {
    return res.status(403).json({ message: 'Access denied' });
  }
  next();
};

exports.assertOwnTelegramId = (req, res, next) => {
  const requested = parsePositiveInt(req.params.telegramId);
  if (!requested) return res.status(400).json({ message: 'Invalid telegram id' });
  if (!req.telegramUser) return res.status(401).json({ message: 'No auth data' });
  if (isStaffRole(req.dbUser?.role)) return next();
  if (Number(req.telegramUser.id) !== requested) {
    return res.status(403).json({ message: 'Access denied' });
  }
  next();
};

exports.assertSubmissionOwner = async (req, res, next) => {
  try {
    const submissionId = parsePositiveInt(req.params.submissionId);
    if (!submissionId) return res.status(400).json({ message: 'Invalid submission id' });
    const { HomeworkSubmission } = require('../models');
    const submission = await HomeworkSubmission.findByPk(submissionId, {
      attributes: ['id', 'userId']
    });
    if (!submission) return res.status(404).json({ message: 'Submission not found' });
    if (!canAccessStudent(req, submission.userId)) {
      return res.status(403).json({ message: 'Access denied' });
    }
    next();
  } catch (error) {
    console.error('assertSubmissionOwner:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.isStaffRole = isStaffRole;
exports.verifyTelegramInitData = verifyTelegramInitData;
