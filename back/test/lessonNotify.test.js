const test = require('node:test');
const assert = require('node:assert/strict');

const { buildLessonWebAppUrl, isBotBlockedError } = require('../src/services/lessonNotifyUtils');

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
