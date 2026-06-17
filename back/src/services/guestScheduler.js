// Планировщик гостевого доступа (ТЗ §16, §19).
// setInterval-паттерн уже используется в проекте (keepalive, refreshWebAppUrl),
// поэтому без новых зависимостей.

const { Op } = require('sequelize');
const { User } = require('../models');
const { GUEST_REMINDER_BEFORE_MS } = require('./guestAccess');

// Как часто проверять. 5 минут достаточно: напоминание шлётся в окне за 4ч до конца.
const TICK_MS = 5 * 60 * 1000;

let timer = null;

async function tick() {
  try {
    const now = new Date();
    const reminderThreshold = new Date(now.getTime() + GUEST_REMINDER_BEFORE_MS);

    // ===== Напоминание за 4 часа (через ~20 часов после старта) =====
    // Берём активных гостей, которым ещё не слали напоминание и до конца <= 4ч.
    const expiringSoon = await User.findAll({
      where: {
        isGuest: true,
        guestStatus: 'guest_active',
        guestReminderSentAt: { [Op.is]: null },
        guestExpiresAt: { [Op.gt]: now, [Op.lte]: reminderThreshold }
      },
      attributes: ['id', 'telegramId']
    });

    if (expiringSoon.length) {
      // Ленивый require, чтобы избежать цикла зависимостей bot <-> scheduler
      const { sendGuestReminder } = require('../bot');
      for (const guest of expiringSoon) {
        let ok = false;
        if (guest.telegramId) {
          ok = await sendGuestReminder(guest.telegramId);
        }
        await guest.update({
          guestReminderSentAt: now,
          guestStatus: 'guest_expiring'
        });
        if (!ok && guest.telegramId) {
          console.warn(`Не удалось отправить напоминание гостю ${guest.telegramId}`);
        }
      }
    }

    // ===== Истечение доступа через 24 часа =====
    // Помечаем guest_expired всех, у кого срок вышел и кто ещё не expired/converted.
    // lead_sent тоже переводим в expired по истечении (доступ к практике закрывается).
    const [expiredCount] = await User.update(
      { guestStatus: 'guest_expired' },
      {
        where: {
          isGuest: true,
          guestStatus: { [Op.notIn]: ['guest_expired', 'converted_to_student'] },
          guestExpiresAt: { [Op.lte]: now }
        }
      }
    );

    if (expiredCount) {
      console.log(`⏳ Гостевой доступ истёк у ${expiredCount} пользователей`);
    }
  } catch (error) {
    console.error('Ошибка планировщика гостей:', error.message);
  }
}

function startGuestScheduler() {
  if (timer) return;
  // Первый прогон сразу (на случай рестарта сервера), затем по интервалу
  tick().catch(() => {});
  timer = setInterval(() => tick().catch(() => {}), TICK_MS);
  console.log('⏰ Планировщик гостевого доступа запущен');
}

function stopGuestScheduler() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

module.exports = { startGuestScheduler, stopGuestScheduler };
