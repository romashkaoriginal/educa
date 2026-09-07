const test = require('node:test');
const assert = require('node:assert/strict');

const { buildLessonWebAppUrl, isBotBlockedError } = require('../src/services/lessonNotifyUtils');
const { getTelegramErrorDetails } = require('../src/services/telegramDelivery');

test('lesson notification URL keeps version and points to the concrete lesson', () => {
  assert.equal(
    buildLessonWebAppUrl('https://app.example.com/?v=123', 42),
    'https://app.example.com/?v=123&lessonId=42'
  );
});

test('Telegram blocked-user error is recognized', () => {
  assert.equal(isBotBlockedError({
    response: { statusCode: 403, body: { description: 'Forbidden: bot was blocked by the user' } }
  }), true);
  assert.equal(isBotBlockedError(new Error('network timeout')), false);
});

test('Telegram delivery errors are classified without changing recipient state', () => {
  assert.deepEqual(getTelegramErrorDetails({
    response: { statusCode: 400, body: { description: 'Bad Request: chat not found' } }
  }), {
    statusCode: 400,
    description: 'Bad Request: chat not found',
    code: 'TELEGRAM_CHAT_NOT_FOUND'
  });
  assert.equal(getTelegramErrorDetails({
    response: { statusCode: 403, body: { description: 'Forbidden: bot was blocked by the user' } }
  }).code, 'TELEGRAM_BOT_BLOCKED');

  assert.deepEqual(getTelegramErrorDetails({
    errorCode: 403,
    description: 'Forbidden: bot was blocked by the user'
  }), {
    statusCode: 403,
    description: 'Forbidden: bot was blocked by the user',
    code: 'TELEGRAM_BOT_BLOCKED'
  });
});
