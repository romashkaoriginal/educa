const test = require('node:test');
const assert = require('node:assert/strict');
const { countOnlineUsers, parseMeminfo } = require('../src/services/systemDiagnostics');

test('parseMeminfo считает занятую память через MemAvailable', () => {
  const result = parseMeminfo([
    'MemTotal:        2000000 kB',
    'MemFree:          100000 kB',
    'MemAvailable:     750000 kB',
  ].join('\n'));

  assert.equal(result.totalBytes, 2000000 * 1024);
  assert.equal(result.availableBytes, 750000 * 1024);
  assert.equal(result.usedBytes, 1250000 * 1024);
  assert.equal(result.usagePercent, 62.5);
});

test('countOnlineUsers не считает несколько соединений одного пользователя дважды', () => {
  const sockets = new Map([
    ['a', { data: { dbUser: { id: 12 } } }],
    ['b', { data: { dbUser: { id: 12 } } }],
    ['c', { data: { dbUser: { id: 18 } } }],
    ['unauthorized', { data: {} }],
  ]);

  assert.equal(countOnlineUsers({ sockets: { sockets } }), 2);
});
