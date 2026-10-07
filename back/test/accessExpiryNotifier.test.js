const test = require('node:test');
const assert = require('node:assert/strict');

const replace = (path, exports) => {
  const filename = require.resolve(path);
  require.cache[filename] = { id: filename, filename, loaded: true, exports };
};
let queries = 0;
let sends = 0;
let writes = 0;
const candidate = { id: 632, telegramId: '1854950499', firstName: 'Арина', lastEnd: '2026-10-01T00:00:00Z' };
replace('../src/config/database', { query: async () => (++queries === 1 ? [candidate] : []) });
replace('../src/models', { User: { update: async () => { writes++; } }, NotificationLog: { create: async () => { writes++; } } });
replace('../src/bot', { getBot: () => ({}) });
replace('../src/services/telegramDelivery', { sendTelegramMessage: async () => { sends++; return { ok: true }; } });
const { sendAccessExpiredNotices } = require('../src/services/accessExpiryNotifier');

test('продление между выборкой и отправкой отменяет уведомление и запись о доставке', async () => {
  const result = await sendAccessExpiredNotices();
  assert.equal(result.pending.length, 1);
  assert.deepEqual(result.results, []);
  assert.equal(sends, 0);
  assert.equal(writes, 0);
});
