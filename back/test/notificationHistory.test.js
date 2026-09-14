const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const notifyPath = require.resolve('../src/routes/notify');

function loadHistoryHandler({ logs, users }) {
  const originalLoad = Module._load;
  delete require.cache[notifyPath];
  Module._load = function load(request, parent, isMain) {
    if (request === '../bot') return { getBot: () => null };
    if (request === '../services/notificationTarget') return { parseNotificationTarget: () => ({}) };
    if (request === '../services/telegramDelivery') return { sendTelegramMessage: async () => ({ ok: true }) };
    if (parent?.filename === notifyPath) {
      if (request === '../models') {
        return {
          User: { findAll: async () => users },
          Subject: {},
          UserSubject: {},
          HomeworkSubmission: {},
          Homework: {},
          NotificationLog: { findAll: async () => logs }
        };
      }
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    const router = require(notifyPath);
    const route = router.stack.find((layer) => layer.route?.path === '/history');
    return route.route.stack.at(-1).handle;
  } finally {
    Module._load = originalLoad;
  }
}

test('notification history converts legacy delivery records into named sent and failed recipients', async () => {
  const handler = loadHistoryHandler({
    logs: [{
      id: 67,
      recipients: [
        { ok: true, userId: 88 },
        { ok: false, userId: 135, reason: 'Bad Request: chat not found' },
        { id: 42, name: 'Иван Иванов', status: 'sent' }
      ]
    }],
    users: [
      { id: 88, firstName: 'Мария', lastName: 'Петрова' },
      { id: 135, firstName: 'Анна', lastName: 'Сидорова' }
    ]
  });

  let response;
  await handler({}, { json: (payload) => { response = payload; } });

  assert.deepEqual(response.logs[0].recipients, [
    { id: 88, name: 'Мария Петрова', status: 'sent' },
    { id: 135, name: 'Анна Сидорова', status: 'failed', reason: 'Bad Request: chat not found' },
    { id: 42, name: 'Иван Иванов', status: 'sent' }
  ]);
});
