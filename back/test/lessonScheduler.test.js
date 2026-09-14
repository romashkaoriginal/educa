const test = require('node:test');
const assert = require('node:assert/strict');

const { finishOverdueScheduledLessons, SESSION_DURATION_MS } = require('../src/services/lessonScheduler');

test('finishes overdue scheduled lessons with the standard two-hour session duration', async () => {
  const now = new Date('2026-09-10T16:00:00.000Z');
  const scheduledAt = new Date('2026-09-10T13:00:00.000Z');
  const updates = [];
  const events = [];
  const LessonModel = {
    findAll: async () => [{ id: 18, scheduledAt }],
    update: async (values, options) => {
      updates.push({ values, options });
      return [1];
    }
  };

  const ids = await finishOverdueScheduledLessons(now, {
    LessonModel,
    emit: (...args) => events.push(args)
  });

  assert.deepEqual(ids, [18]);
  assert.equal(updates[0].values.status, 'finished');
  assert.equal(updates[0].values.startedAt.toISOString(), scheduledAt.toISOString());
  assert.equal(
    updates[0].values.finishedAt.toISOString(),
    new Date(scheduledAt.getTime() + SESSION_DURATION_MS).toISOString()
  );
  assert.deepEqual(events, [[18, 'lesson:finished', { lessonId: 18, auto: true, bySchedule: true }]]);
});
