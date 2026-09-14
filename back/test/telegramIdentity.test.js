const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeTelegramId,
  normalizeTelegramUsername,
  telegramUsernameCandidates
} = require('../src/services/telegramIdentity');
const {
  claimPendingStudent,
  resolveStudentIdentity
} = require('../src/services/systemUserIdentity');

test('Telegram username accepts input with or without repeated @ and stores one canonical value', () => {
  assert.equal(normalizeTelegramUsername('  @@Some_User  '), 'some_user');
  assert.deepEqual(telegramUsernameCandidates('@Some_User'), [
    'some_user',
    '@some_user',
    '@@some_user',
    '@@@some_user'
  ]);
  assert.equal(normalizeTelegramId(' 123456 '), '123456');
});

test('student added by username immediately receives a known Telegram ID from BotUser', async () => {
  const botUser = {
    telegramId: '777',
    telegramUsername: '@@Known_User'
  };
  const identity = await resolveStudentIdentity(
    { telegramUsername: '@known_user' },
    { BotUserModel: { findOne: async () => botUser } }
  );

  assert.equal(identity.telegramId, '777');
  assert.equal(identity.telegramUsername, 'known_user');
});

test('/start binds a pending student created only by username', async () => {
  const studentUpdates = [];
  const botUpdates = [];
  const pendingStudent = {
    id: 25,
    isGuest: false,
    telegramId: null,
    telegramUsername: '@@pending_user',
    update: async (values) => {
      studentUpdates.push(values);
      Object.assign(pendingStudent, values);
    }
  };
  const botUser = {
    update: async (values) => botUpdates.push(values)
  };
  const UserModel = {
    findOne: async () => null,
    findAll: async () => [pendingStudent]
  };
  const BotUserModel = { findOne: async () => botUser };
  const sequelizeInstance = { transaction: async (callback) => callback({ id: 'tx' }) };

  const result = await claimPendingStudent(
    { id: 777, username: 'Pending_User' },
    { UserModel, BotUserModel, sequelizeInstance }
  );

  assert.equal(result, pendingStudent);
  assert.deepEqual(studentUpdates, [{ telegramId: '777', telegramUsername: 'pending_user' }]);
  assert.deepEqual(botUpdates, [{
    isAssigned: true,
    userId: 25,
    telegramUsername: 'pending_user'
  }]);
});

test('/start repairs an old guest collision before binding the pending student', async () => {
  const guestUpdates = [];
  const studentUpdates = [];
  const guest = {
    id: 91,
    isGuest: true,
    update: async (values) => guestUpdates.push(values)
  };
  const pendingStudent = {
    id: 92,
    isGuest: false,
    telegramUsername: 'pending_user',
    update: async (values) => studentUpdates.push(values)
  };
  const UserModel = {
    findOne: async () => guest,
    findAll: async () => [pendingStudent]
  };
  const BotUserModel = { findOne: async () => ({ update: async () => {} }) };
  const sequelizeInstance = { transaction: async (callback) => callback({ id: 'tx' }) };

  await claimPendingStudent(
    { id: '777', username: '@pending_user' },
    { UserModel, BotUserModel, sequelizeInstance }
  );

  assert.equal(guestUpdates.length, 1);
  assert.equal(guestUpdates[0].telegramId, null);
  assert.equal(guestUpdates[0].telegramUsername, null);
  assert.equal(guestUpdates[0].isActive, false);
  assert.deepEqual(studentUpdates, [{ telegramId: '777', telegramUsername: 'pending_user' }]);
});
