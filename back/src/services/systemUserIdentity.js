const { Op } = require('sequelize');
const { User, BotUser, sequelize } = require('../models');
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

async function findBotUserByUsername(username, BotUserModel = BotUser) {
  if (!username) return null;
  return BotUserModel.findOne({ where: usernameLookup(username) });
}

async function resolveStudentIdentity(input, { BotUserModel = BotUser } = {}) {
  let telegramId = normalizeTelegramId(input.telegramId);
  let telegramUsername = normalizeTelegramUsername(input.telegramUsername);
  let botUser = null;

  if (telegramId) {
    botUser = await BotUserModel.findOne({ where: { telegramId } });
  } else if (telegramUsername) {
    botUser = await findBotUserByUsername(telegramUsername, BotUserModel);
    if (botUser?.telegramId) telegramId = String(botUser.telegramId);
  }

  const canonicalBotUsername = normalizeTelegramUsername(botUser?.telegramUsername);
  if (canonicalBotUsername) telegramUsername = canonicalBotUsername;

  if (!telegramId && !telegramUsername) {
    const error = new Error('Укажите Telegram ID или username ученика');
    error.statusCode = 400;
    throw error;
  }

  return { telegramId, telegramUsername, botUser };
}

async function syncBotUser(botUser, systemUser, transaction) {
  if (!botUser) return;
  await botUser.update({
    isAssigned: true,
    userId: systemUser.id,
    telegramUsername: systemUser.telegramUsername || botUser.telegramUsername
  }, { transaction });
}

// Привязывает заранее созданного по username ученика при первом /start.
// Если до исправления бот уже успел создать гостя, гостевая запись сохраняется,
// но отвязывается от Telegram, чтобы не потерять назначенный менеджером доступ.
async function claimPendingStudent(telegramUser, dependencies = {}) {
  const UserModel = dependencies.UserModel || User;
  const BotUserModel = dependencies.BotUserModel || BotUser;
  const database = dependencies.sequelizeInstance || sequelize;
  const telegramId = normalizeTelegramId(telegramUser?.id);
  const telegramUsername = normalizeTelegramUsername(telegramUser?.username);

  if (!telegramId) return null;

  const currentUser = await UserModel.findOne({ where: { telegramId } });
  if (currentUser && !currentUser.isGuest) {
    if (telegramUsername && currentUser.telegramUsername !== telegramUsername) {
      await currentUser.update({ telegramUsername });
    }
    const botUser = await BotUserModel.findOne({ where: { telegramId } });
    await syncBotUser(botUser, currentUser);
    return currentUser;
  }

  if (!telegramUsername) return null;

  const candidates = await UserModel.findAll({
    where: {
      role: 'student',
      isGuest: false,
      [Op.and]: [
        usernameLookup(telegramUsername),
        { [Op.or]: [{ telegramId: null }, { telegramId }] }
      ]
    },
    limit: 2
  });

  if (candidates.length > 1) {
    const error = new Error(`Найдено несколько учеников с username @${telegramUsername}`);
    error.code = 'AMBIGUOUS_TELEGRAM_USERNAME';
    throw error;
  }

  const pendingStudent = candidates[0];
  if (!pendingStudent) return null;

  const botUser = await BotUserModel.findOne({ where: { telegramId } });
  await database.transaction(async (transaction) => {
    if (currentUser?.isGuest) {
      await currentUser.update({
        telegramId: null,
        telegramUsername: null,
        isActive: false,
        guestStatus: 'guest_expired',
        guestExpiresAt: new Date()
      }, { transaction });
    }

    await pendingStudent.update({ telegramId, telegramUsername }, { transaction });
    await syncBotUser(botUser, pendingStudent, transaction);
  });

  return pendingStudent;
}

module.exports = {
  claimPendingStudent,
  findBotUserByUsername,
  resolveStudentIdentity,
  usernameLookup
};
