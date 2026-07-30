const test = require('node:test');
const assert = require('node:assert/strict');

const { parseNotificationTarget } = require('../src/services/notificationTarget');

test('single mode resolves exactly one student and forbids mass filters', () => {
  assert.deepEqual(
    parseNotificationTarget({ mode: 'single', studentId: '42' }),
    { mode: 'single', studentId: 42, filters: null }
  );
  assert.throws(
    () => parseNotificationTarget({ mode: 'single', studentId: 42, filters: {} }),
    /нельзя передавать массовые фильтры/
  );
});

test('filter mode cannot silently fall back from a selected student', () => {
  assert.throws(
    () => parseNotificationTarget({ mode: 'filter', studentId: 42, filters: {} }),
    /нельзя передавать отдельного ученика/
  );
  assert.deepEqual(
    parseNotificationTarget({ mode: 'filter', filters: { subjectIds: [1] } }),
    { mode: 'filter', studentId: null, filters: { subjectIds: [1] } }
  );
});

test('missing mode is rejected instead of becoming a mass notification', () => {
  assert.throws(
    () => parseNotificationTarget({ filters: {} }),
    /Укажите режим отправки/
  );
});
