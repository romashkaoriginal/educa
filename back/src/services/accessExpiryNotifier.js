const { QueryTypes } = require('sequelize');
const sequelize = require('../config/database');
const { User, NotificationLog } = require('../models');
const { getBot } = require('../bot');
const { sendTelegramMessage } = require('./telegramDelivery');

const MANAGER_CONTACT_URL = 'https://t.me/kubik_ct';
const NOTICE_TEXT = [
  '🔒 Доступ к платформе закончился.',
  '',
  'Необходимо продлить доступ на следующий месяц — свяжитесь с нашим менеджером.'
].join('\n');

const TICK_MS = 5 * 60 * 1000;
// На время рестарта backend (деплой) доступ мог истечь «между» проходами планировщика.
const STARTUP_LOOKBACK_MS = 15 * 60 * 1000;
const SEND_DELAY_MS = 60;
// Бот заблокирован или чата нет — повторять бессмысленно, помечаем как обработанного.
const PERMANENT_FAILURE_CODES = new Set(['TELEGRAM_BOT_BLOCKED', 'TELEGRAM_CHAT_NOT_FOUND']);

let timer = null;
let running = false;

// Ученики, у которых закончились все доступы и нет будущего оплаченного периода.
// Будущее начало закрывает вход, но не означает, что нужно продлевать доступ.
// expiredAfter — писать только тем, у кого доступ закончился позже этой даты.
async function listPendingExpiredStudents({ expiredAfter = null, now = new Date(), userId = null } = {}) {
  return sequelize.query(
    `SELECT u.id, u."telegramId", u."firstName", u."lastName", MAX(us."accessEndDate") AS "lastEnd"
       FROM users u
       JOIN user_subjects us ON us."userId" = u.id
      WHERE u.role = 'student' AND u."isGuest" = false AND u."isActive" = true
        AND u."telegramId" IS NOT NULL
        AND (CAST(:userId AS integer) IS NULL OR u.id = :userId)
      GROUP BY u.id
     HAVING COUNT(*) FILTER (
              WHERE us."isActive" = true
                AND (us."accessEndDate" IS NULL OR us."accessEndDate" > :now)
            ) = 0
        AND MAX(us."accessEndDate") IS NOT NULL
        AND MAX(us."accessEndDate") <= :now
        AND (u."accessExpiredNoticeEnd" IS NULL OR u."accessExpiredNoticeEnd" < MAX(us."accessEndDate"))
        AND (CAST(:expiredAfter AS timestamptz) IS NULL OR MAX(us."accessEndDate") > CAST(:expiredAfter AS timestamptz))
      ORDER BY u.id`,
    { replacements: { now, expiredAfter, userId }, type: QueryTypes.SELECT }
  );
}

const fullName = (student) => [student.firstName, student.lastName].filter(Boolean).join(' ') || `Пользователь #${student.id}`;
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function sendAccessExpiredNotices({
  bot = getBot(), expiredAfter = null, now = new Date(), sentByName = 'Планировщик доступа', send = true
} = {}) {
  const pending = await listPendingExpiredStudents({ expiredAfter, now });
  if (!send || !pending.length) return { pending, results: [] };
  if (!bot) return { pending, results: [], skipped: 'Бот не запущен' };

  const results = [];
  for (const student of pending) {
    // Доступ могли продлить после построения списка или между отправками.
    const [current] = await listPendingExpiredStudents({ expiredAfter, now: new Date(), userId: student.id });
    if (!current || String(current.telegramId) !== String(student.telegramId)) continue;
    const delivery = await sendTelegramMessage({
      bot,
      chatId: student.telegramId,
      text: NOTICE_TEXT,
      options: { reply_markup: { inline_keyboard: [[{ text: 'Написать менеджеру', url: MANAGER_CONTACT_URL }]] } },
      recipient: { id: student.id, firstName: student.firstName, lastName: student.lastName },
      notificationKind: 'access_expired'
    });
    if (delivery.ok || PERMANENT_FAILURE_CODES.has(delivery.code)) {
      await User.update({ accessExpiredNoticeEnd: current.lastEnd }, { where: { id: student.id } });
    }
    results.push({
      id: student.id,
      name: fullName(student),
      status: delivery.ok ? 'sent' : 'failed',
      ...(delivery.ok ? {} : { reason: delivery.reason })
    });
    await pause(SEND_DELAY_MS);
  }

  if (!results.length) return { pending, results };
  await NotificationLog.create({
    sentBy: 0,
    sentByName,
    sentByRole: 'system',
    text: NOTICE_TEXT,
    filters: { kind: 'access_expired' },
    recipientCount: results.length,
    successCount: results.filter((item) => item.status === 'sent').length,
    failedCount: results.filter((item) => item.status === 'failed').length,
    recipients: results
  });
  return { pending, results };
}

async function tick(startedAt) {
  if (running) return;
  running = true;
  try {
    await sendAccessExpiredNotices({ expiredAfter: new Date(startedAt.getTime() - STARTUP_LOOKBACK_MS) });
  } catch (error) {
    console.error('Access expiry scheduler:', error.message);
  } finally {
    running = false;
  }
}

// Планировщик пишет только тем, у кого доступ закончился, пока приложение работает
// (с небольшим запасом на рестарт). Всех, кто истёк раньше, один раз обрабатывает
// разовый скрипт src/cli/sendAccessExpiredNotices.js.
function startAccessExpiryScheduler() {
  if (timer) return;
  const startedAt = new Date();
  tick(startedAt).catch(() => {});
  timer = setInterval(() => tick(startedAt).catch(() => {}), TICK_MS);
  console.log('⏰ Планировщик уведомлений об окончании доступа запущен');
}

function stopAccessExpiryScheduler() {
  if (timer) clearInterval(timer);
  timer = null;
}

module.exports = {
  NOTICE_TEXT,
  MANAGER_CONTACT_URL,
  listPendingExpiredStudents,
  sendAccessExpiredNotices,
  startAccessExpiryScheduler,
  stopAccessExpiryScheduler
};
