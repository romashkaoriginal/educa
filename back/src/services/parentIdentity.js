const { Op } = require('sequelize');
const { Parent, BotUser, User, UserSubject } = require('../models');
const {
  normalizeTelegramId,
  normalizeTelegramUsername,
  telegramUsernameCandidates
} = require('./telegramIdentity');

function usernameLookup(value) {
  return {
    [Op.or]: telegramUsernameCandidates(value).map((candidate) => ({
      telegramUsername: { [Op.iLike]: candidate }
    }))
  };
}

async function resolveParentIdentity(input) {
  let telegramId = normalizeTelegramId(input.telegramId);
  const telegramUsername = normalizeTelegramUsername(input.telegramUsername);
  let botUser = null;

  if (telegramId) {
    botUser = await BotUser.findOne({ where: { telegramId } });
  } else if (telegramUsername) {
    botUser = await BotUser.findOne({ where: usernameLookup(telegramUsername) });
    if (botUser?.telegramId) telegramId = String(botUser.telegramId);
  }

  const canonicalBotUsername = normalizeTelegramUsername(botUser?.telegramUsername);

  if (!telegramId && !telegramUsername) {
    const error = new Error('Укажите Telegram ID или username родителя');
    error.statusCode = 400;
    throw error;
  }

  return {
    telegramId,
    telegramUsername: canonicalBotUsername || telegramUsername,
    firstName: String(input.firstName ?? botUser?.firstName ?? '').trim() || null,
    lastName: String(input.lastName ?? botUser?.lastName ?? '').trim() || null
  };
}

async function deactivateGuestForParent(telegramId) {
  if (!telegramId) return;
  const guest = await User.findOne({ where: { telegramId, isGuest: true } });
  if (guest) {
    // Профиль не удаляем: на него могут ссылаться попытки практики. Но его
    // доступ и предметы должны исчезнуть сразу после назначения родителем.
    await UserSubject.destroy({ where: { userId: guest.id } });
    await guest.update({ isActive: false, guestStatus: 'guest_expired', guestExpiresAt: new Date() });
  }
}

async function findParentForTelegramUser(telegramUser) {
  const telegramId = normalizeTelegramId(telegramUser?.id);
  const telegramUsername = normalizeTelegramUsername(telegramUser?.username);
  let parent = telegramId
    ? await Parent.findOne({ where: { telegramId }, include: [{ association: 'student' }] })
    : null;

  if (!parent && telegramUsername) {
    parent = await Parent.findOne({
      where: {
        [Op.and]: [
          usernameLookup(telegramUsername),
          { [Op.or]: [{ telegramId: null }, { telegramId }] }
        ]
      },
      include: [{ association: 'student' }]
    });
  }

  if (!parent) return null;

  // Родитель не должен сохранять гостевой доступ в Mini App, если он запускал
  // бота до того, как менеджер создал привязку.
  await deactivateGuestForParent(telegramId);

  const updates = {};
  if (!parent.telegramId && telegramId) updates.telegramId = telegramId;
  if (telegramUsername && parent.telegramUsername !== telegramUsername) updates.telegramUsername = telegramUsername;
  if (!parent.firstName && telegramUser?.first_name) updates.firstName = telegramUser.first_name;
  if (!parent.lastName && telegramUser?.last_name) updates.lastName = telegramUser.last_name;
  if (Object.keys(updates).length) await parent.update(updates);
  return parent;
}

module.exports = {
  normalizeTelegramId,
  normalizeTelegramUsername,
  resolveParentIdentity,
  deactivateGuestForParent,
  findParentForTelegramUser
};
