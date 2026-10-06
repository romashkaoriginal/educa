const { UserSubject } = require('../models');

const ACCESS_EXPIRED_CODE = 'ACCESS_EXPIRED';
const ACCESS_EXPIRED_MESSAGE = 'Доступ закончился. Необходимо продлить доступ на следующий месяц — свяжитесь с менеджером.';

// Каждый запрос ученика проходит через requireUser, а на занятии это сотни
// запросов в секунду. Короткий кэш держит нагрузку на БД на уровне одного
// запроса в TTL на ученика; после продления доступа блокировка снимается за это же время.
const CACHE_TTL_MS = 15 * 1000;
const CACHE_MAX_SIZE = 5000;
const cache = new Map();

// Ученик заблокирован, если у него есть записи доступа к предметам, но ни одна
// сейчас не действует (истёк срок, ещё не начался или отключена). Ученика вообще
// без записей не блокируем: у него доступ никогда не выдавался, это не «продлите».
async function computeAccessExpired(userId, { SubjectAccess = UserSubject, now = new Date() } = {}) {
  const rows = await SubjectAccess.findAll({
    where: { userId },
    attributes: ['isActive', 'accessStartDate', 'accessEndDate'],
    raw: true
  });
  if (!rows.length) return false;
  return !rows.some((row) => row.isActive
    && (!row.accessStartDate || new Date(row.accessStartDate) <= now)
    && (!row.accessEndDate || new Date(row.accessEndDate) > now));
}

async function isStudentAccessExpired(userId, options = {}) {
  const now = Date.now();
  const cached = cache.get(userId);
  if (cached && cached.until > now) return cached.expired;

  const expired = await computeAccessExpired(userId, options);
  if (cache.size >= CACHE_MAX_SIZE) cache.clear();
  cache.set(userId, { expired, until: now + CACHE_TTL_MS });
  return expired;
}

function invalidateStudentAccess(userId) {
  if (userId == null) cache.clear();
  else cache.delete(userId);
}

// Блокировка касается только учеников. Персонал и гости (у них свой 24-часовой
// доступ) сюда не попадают.
const isAccessControlledStudent = (user) => Boolean(user)
  && user.role === 'student'
  && !user.isGuest;

module.exports = {
  ACCESS_EXPIRED_CODE,
  ACCESS_EXPIRED_MESSAGE,
  computeAccessExpired,
  isStudentAccessExpired,
  invalidateStudentAccess,
  isAccessControlledStudent
};
