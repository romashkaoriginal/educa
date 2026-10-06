const test = require('node:test');
const assert = require('node:assert/strict');

const modelsPath = require.resolve('../src/models');
const original = require.cache[modelsPath];
require.cache[modelsPath] = { id: modelsPath, filename: modelsPath, loaded: true, exports: { UserSubject: {} } };
const { computeAccessExpired, isAccessControlledStudent } = require('../src/services/studentAccess');
if (original) require.cache[modelsPath] = original; else delete require.cache[modelsPath];

const now = new Date('2026-10-06T20:00:00Z');
const access = (rows) => ({ findAll: async () => rows });
const row = (over) => ({ isActive: true, accessStartDate: null, accessEndDate: null, ...over });

test('ученик без записей доступа не блокируется', async () => {
  assert.equal(await computeAccessExpired(1, { SubjectAccess: access([]), now }), false);
});

test('все предметы истекли — доступ закончился', async () => {
  const rows = [row({ accessEndDate: '2026-09-30T20:51:00Z' }), row({ accessEndDate: '2026-10-06T19:59:00Z' })];
  assert.equal(await computeAccessExpired(1, { SubjectAccess: access(rows), now }), true);
});

test('достаточно одного действующего предмета', async () => {
  const rows = [row({ accessEndDate: '2026-09-30T20:51:00Z' }), row({ accessEndDate: '2026-11-01T00:00:00Z' })];
  assert.equal(await computeAccessExpired(1, { SubjectAccess: access(rows), now }), false);
});

test('бессрочный и отключённый предметы', async () => {
  assert.equal(await computeAccessExpired(1, { SubjectAccess: access([row({})]), now }), false);
  assert.equal(await computeAccessExpired(1, { SubjectAccess: access([row({ isActive: false })]), now }), true);
});

test('доступ, который ещё не начался, не считается действующим', async () => {
  assert.equal(await computeAccessExpired(1, { SubjectAccess: access([row({ accessStartDate: '2026-10-09T00:00:00Z' })]), now }), true);
});

test('блокировка касается только учеников, не гостей и не персонала', () => {
  assert.equal(isAccessControlledStudent({ role: 'student', isGuest: false }), true);
  assert.equal(isAccessControlledStudent({ role: 'student', isGuest: true }), false);
  for (const role of ['teacher', 'admin', 'superadmin', 'manager']) {
    assert.equal(isAccessControlledStudent({ role, isGuest: false }), false);
  }
  assert.equal(isAccessControlledStudent(null), false);
});
