const test = require('node:test');
const assert = require('node:assert/strict');
const { mock } = require('node:test');

const { User } = require('../src/models');
const userController = require('../src/controllers/userController');

function createResponse() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

test('manager cannot change a staff role', async () => {
  const findByPk = mock.method(User, 'findByPk', async () => {
    throw new Error('database must not be queried for a forbidden role change');
  });
  const res = createResponse();

  await userController.updateUser({
    dbUser: { role: 'manager' },
    params: { userId: '2' },
    body: { role: 'admin' },
  }, res);

  assert.equal(res.statusCode, 403);
  assert.match(res.body.message, /Только администратор/);
  assert.equal(findByPk.mock.callCount(), 0);
  mock.restoreAll();
});

test('admin can change a staff role', async () => {
  const user = {
    id: 2,
    telegramId: '200',
    telegramUsername: 'teacher',
    firstName: 'Иван',
    lastName: 'Иванов',
    role: 'teacher',
    isActive: true,
    updatedAt: new Date(),
    save: async () => {},
  };
  mock.method(User, 'findByPk', async () => user);
  const res = createResponse();

  await userController.updateUser({
    dbUser: { role: 'admin' },
    params: { userId: '2' },
    body: { role: 'manager' },
  }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(user.role, 'manager');
  assert.equal(res.body.user.role, 'manager');
  mock.restoreAll();
});
