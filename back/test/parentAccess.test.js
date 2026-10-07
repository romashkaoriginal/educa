const test = require('node:test');
const assert = require('node:assert/strict');

const guest = { id: 332, isActive: true, guestStatus: 'guest_expired', update: async (values) => Object.assign(guest, values) };
const parent = { telegramId: '680770053', telegramUsername: 'wowtargetolog', firstName: 'Марина', students: [{ id: 345, firstName: 'София' }] };
const modelsPath = require.resolve('../src/models');
require.cache[modelsPath] = { id: modelsPath, filename: modelsPath, loaded: true, exports: {
  Parent: { findOne: async () => parent },
  User: { findOne: async ({ where }) => {
    assert.equal(where.isGuest, true, 'Родителя нельзя авторизовать через старую ученическую запись');
    return guest;
  } },
  UserSubject: { destroy: async () => 0 }, BotUser: {}, Subject: {}
} };

const auth = require('../src/controllers/authController');
const guests = require('../src/controllers/guestController');
const req = { params: { telegramId: '680770053' }, telegramUser: { id: 680770053, username: 'wowtargetolog' } };
const response = () => ({ statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } });

test('бывший гость получает родительский экран через auth и guest/state', async () => {
  const authResponse = response();
  await auth.getUserByTelegramId(req, authResponse);
  assert.equal(authResponse.statusCode, 200);
  assert.equal(authResponse.body.user.role, 'parent');
  assert.equal(authResponse.body.user.isGuest, false);
  assert.equal(guest.isActive, false);
  const stateResponse = response();
  await guests.getState(req, stateResponse);
  assert.equal(stateResponse.body.isParent, true);
  assert.deepEqual(stateResponse.body.students, [{ id: 345, firstName: 'София', lastName: undefined }]);
});
