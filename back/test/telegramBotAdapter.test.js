const test = require('node:test');
const assert = require('node:assert/strict');

const { createDeliveryBot } = require('../src/bot');

test('Telegram SDK adapter preserves the positional delivery API', async () => {
  const calls = [];
  const adapter = createDeliveryBot({
    api: {
      sendMessage: async (payload) => calls.push(['sendMessage', payload]),
      deleteWebhook: async (payload) => calls.push(['deleteWebhook', payload]),
      answerCallbackQuery: async (payload) => calls.push(['answerCallbackQuery', payload])
    }
  });

  await adapter.sendMessage(42, 'hello', { parse_mode: 'HTML' });
  await adapter.deleteWebHook({ drop_pending_updates: false });
  await adapter.answerCallbackQuery('callback-1', { text: 'ok' });

  assert.deepEqual(calls, [
    ['sendMessage', { chat_id: 42, text: 'hello', parse_mode: 'HTML' }],
    ['deleteWebhook', { drop_pending_updates: false }],
    ['answerCallbackQuery', { callback_query_id: 'callback-1', text: 'ok' }]
  ]);
});
