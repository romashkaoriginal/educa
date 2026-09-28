const test = require('node:test');
const assert = require('node:assert/strict');
const { createParentReportPreviewToken, readParentReportPreviewToken } = require('../src/services/parentReportPreview');

test('signed report preview preserves the exact messages for confirmation', () => {
  const originalSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'test-preview-secret';
  try {
    const messages = ['📊 <b>Еженедельный отчёт</b>\nРешено задач: <b>7</b>', 'Расписание на следующую неделю'];
    const token = createParentReportPreviewToken({
      parentId: 42,
      reportType: 'weekly',
      period: { startDate: '2026-09-18', endDate: '2026-09-24' },
      messages,
      telegramId: '123456'
    });

    const preview = readParentReportPreviewToken(token);
    assert.equal(preview.parentId, 42);
    assert.equal(preview.reportType, 'weekly');
    assert.deepEqual(preview.messages, messages);
    assert.deepEqual(preview.period, { startDate: '2026-09-18', endDate: '2026-09-24' });
  } finally {
    if (originalSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalSecret;
  }
});
