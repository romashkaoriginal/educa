// Сервис гостевого доступа (ТЗ §1–§4, §19–§24)
// Гость — это реальная строка User (role='student', isGuest=true) с временным
// доступом на 24 часа. Благодаря этому весь движок практики/статистики,
// завязанный на studentId=User.id, работает без изменений.

const { Op } = require('sequelize');
const { User, Subject, UserSubject } = require('../models');

// Длительность гостевого доступа — 24 часа
const GUEST_DURATION_MS = 24 * 60 * 60 * 1000;
// За сколько до окончания шлём напоминание — за 4 часа (т.е. через 20 часов)
const GUEST_REMINDER_BEFORE_MS = 4 * 60 * 60 * 1000;

// Фиксированный список предметов из ТЗ §4.1 (порядок сохраняем).
// Реально гостю показываем только пересечение с активными subjects из БД,
// чтобы практика не оказалась пустой (см. getAvailableGuestSubjects).
const GUEST_SUBJECT_NAMES = [
  'Русский язык',
  'Математика',
  'Английский язык',
  'Физика',
  'История Беларуси',
  'Обществоведение',
  'Биология',
  'Химия',
  'Белорусский язык'
];

function isExpired(user) {
  if (!user?.guestExpiresAt) return false;
  return new Date(user.guestExpiresAt).getTime() <= Date.now();
}

function secondsLeft(user) {
  if (!user?.guestExpiresAt) return 0;
  const ms = new Date(user.guestExpiresAt).getTime() - Date.now();
  return Math.max(0, Math.floor(ms / 1000));
}

// Привести userStatus к 'guest'/'trial' для заявок (ТЗ §13).
// guest_expiring трактуем как 'trial' (человек близок к конверсии), остальное — 'guest'.
function guestUserStatusLabel(user) {
  if (!user?.isGuest) return null;
  return user.guestStatus === 'guest_expiring' ? 'trial' : 'guest';
}

// Создать гостевой профиль при первом /start, либо вернуть существующего.
// Возвращает { user, isNew, isStudent, expired }.
async function createOrGetGuest({ telegramId, telegramUsername, firstName }) {
  let user = await User.findOne({ where: { telegramId } });

  // Уже полноценный ученик/сотрудник — гостем не делаем
  if (user && !user.isGuest) {
    return { user, isNew: false, isStudent: true, expired: false };
  }

  if (user && user.isGuest) {
    // Освежаем username/имя при повторном заходе
    const patch = {};
    if (telegramUsername && telegramUsername !== user.telegramUsername) patch.telegramUsername = telegramUsername;
    if (Object.keys(patch).length) await user.update(patch);
    return { user, isNew: false, isStudent: false, expired: isExpired(user) };
  }

  // Новый гость
  const now = new Date();
  user = await User.create({
    telegramId,
    telegramUsername: telegramUsername || null,
    firstName: firstName || 'Гость',
    lastName: null,
    role: 'student',
    isActive: true,
    isGuest: true,
    guestStatus: 'guest_active',
    guestStartedAt: now,
    guestExpiresAt: new Date(now.getTime() + GUEST_DURATION_MS),
    guestSubjectsChosen: false,
    guestApplicationSent: false
  });

  return { user, isNew: true, isStudent: false, expired: false };
}

// Состояние гостя для фронта (вызывается на старте Mini App).
async function getGuestState(telegramId) {
  const user = await User.findOne({ where: { telegramId } });

  if (!user) {
    return { exists: false };
  }

  if (!user.isGuest) {
    return {
      exists: true,
      isStudent: true,
      isGuest: false,
      userId: user.id,
      firstName: user.firstName,
      role: user.role,
      isActive: user.isActive
    };
  }

  const expired = isExpired(user);
  return {
    exists: true,
    isStudent: false,
    isGuest: true,
    userId: user.id,
    firstName: user.firstName,
    status: user.guestStatus,
    expired,
    expiresAt: user.guestExpiresAt,
    secondsLeft: secondsLeft(user),
    subjectsChosen: user.guestSubjectsChosen,
    applicationSent: user.guestApplicationSent
  };
}

// Предметы, доступные гостю = пересечение списка ТЗ и активных subjects в БД.
async function getAvailableGuestSubjects() {
  const subjects = await Subject.findAll({
    where: { isActive: true, name: { [Op.in]: GUEST_SUBJECT_NAMES } },
    attributes: ['id', 'name', 'icon']
  });

  // Сортируем в порядке ТЗ
  const order = new Map(GUEST_SUBJECT_NAMES.map((name, i) => [name, i]));
  return subjects.sort((a, b) => (order.get(a.name) ?? 99) - (order.get(b.name) ?? 99));
}

// Гость выбирает 1..3 предмета (ТЗ §4.2). Привязываем их через UserSubject
// с accessEndDate = guestExpiresAt.
async function chooseSubjects(userId, subjectIds) {
  const user = await User.findByPk(userId);
  if (!user || !user.isGuest) {
    const err = new Error('Гостевой профиль не найден');
    err.code = 'GUEST_NOT_FOUND';
    throw err;
  }
  if (isExpired(user)) {
    const err = new Error('Гостевой доступ закончился');
    err.code = 'GUEST_EXPIRED';
    throw err;
  }

  const ids = Array.isArray(subjectIds) ? [...new Set(subjectIds.map(Number).filter(Boolean))] : [];
  if (ids.length < 1) {
    const err = new Error('Выбери хотя бы один предмет.');
    err.code = 'NO_SUBJECTS';
    throw err;
  }
  if (ids.length > 3) {
    const err = new Error('Можно выбрать максимум 3 предмета.');
    err.code = 'TOO_MANY_SUBJECTS';
    throw err;
  }

  // Разрешаем только предметы из доступного гостю списка
  const available = await getAvailableGuestSubjects();
  const availableIds = new Set(available.map((s) => s.id));
  const validIds = ids.filter((id) => availableIds.has(id));
  if (validIds.length < 1) {
    const err = new Error('Выбери хотя бы один предмет.');
    err.code = 'NO_SUBJECTS';
    throw err;
  }

  // Пересоздаём привязки (на случай повторного выбора)
  await UserSubject.destroy({ where: { userId } });
  for (const subjectId of validIds) {
    await UserSubject.create({
      userId,
      subjectId,
      accessStartDate: user.guestStartedAt,
      accessEndDate: user.guestExpiresAt,
      isActive: true
    });
  }

  await user.update({ guestSubjectsChosen: true });

  return getAvailableGuestSubjects().then(() => validIds);
}

// Отметить, что гость оставил заявку (ТЗ §15, §22).
async function markGuestApplicationSent(telegramId) {
  if (!telegramId) return;
  const user = await User.findOne({ where: { telegramId } });
  if (!user || !user.isGuest) return;
  const patch = { guestApplicationSent: true };
  // lead_sent перебивает только активные статусы (не трогаем converted/expired-историю некорректно)
  if (['guest_active', 'guest_expiring'].includes(user.guestStatus)) {
    patch.guestStatus = 'lead_sent';
  }
  await user.update(patch);
}

module.exports = {
  GUEST_DURATION_MS,
  GUEST_REMINDER_BEFORE_MS,
  GUEST_SUBJECT_NAMES,
  isExpired,
  secondsLeft,
  guestUserStatusLabel,
  createOrGetGuest,
  getGuestState,
  getAvailableGuestSubjects,
  chooseSubjects,
  markGuestApplicationSent
};
