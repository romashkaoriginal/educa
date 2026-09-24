const test = require('node:test');
const assert = require('node:assert/strict');

const {
  classifyHomework,
  getPreviousMonthPeriod,
  getForcedPeriod,
  getPreviousWeekPeriod,
  isSubjectAccessActive,
  clipReportPeriodToSubjectAccess,
  classifyPracticeTopics,
  formatSubjectReport,
  getManagerContactKeyboard,
  splitTelegramText
} = require('../src/services/parentWeeklyReport');
const {
  isMondayReportDue,
  isMonthlyReportDue,
  getNextWeeklyReportAt,
  getNextMonthlyReportAt
} = require('../src/services/parentReportScheduler');
const { normalizeTelegramId, normalizeTelegramUsername } = require('../src/services/parentIdentity');

test('weekly period uses the previous Monday through Sunday in Minsk', () => {
  const period = getPreviousWeekPeriod(new Date('2026-09-07T15:30:00.000Z'));
  assert.equal(period.startDate, '2026-08-31');
  assert.equal(period.endDate, '2026-09-06');
  assert.equal(period.startUtc.toISOString(), '2026-08-30T21:00:00.000Z');
  assert.equal(period.endExclusiveUtc.toISOString(), '2026-09-06T21:00:00.000Z');
});

test('scheduler becomes due only on Monday from 18:00 Minsk', () => {
  assert.equal(isMondayReportDue(new Date('2026-09-07T14:59:00.000Z')), false);
  assert.equal(isMondayReportDue(new Date('2026-09-07T15:00:00.000Z')), true);
  assert.equal(isMondayReportDue(new Date('2026-09-08T15:00:00.000Z')), false);
});

test('monthly report is due on the first Monday of a month at 18:00 Minsk', () => {
  assert.equal(isMonthlyReportDue(new Date('2026-09-07T14:59:00.000Z')), false);
  assert.equal(isMonthlyReportDue(new Date('2026-09-07T15:00:00.000Z')), true);
  assert.equal(isMonthlyReportDue(new Date('2026-09-14T15:00:00.000Z')), false);
});

test('next parent report schedule is calculated in Minsk time', () => {
  const beforeFirstMonday = new Date('2026-09-04T10:00:00.000Z');
  assert.equal(getNextWeeklyReportAt(beforeFirstMonday).toISOString(), '2026-09-07T15:00:00.000Z');
  assert.equal(getNextMonthlyReportAt(beforeFirstMonday).toISOString(), '2026-09-07T15:00:00.000Z');
  assert.equal(getNextMonthlyReportAt(new Date('2026-09-08T10:00:00.000Z')).toISOString(), '2026-10-05T15:00:00.000Z');
});

test('monthly period uses the previous complete calendar month in Minsk', () => {
  const period = getPreviousMonthPeriod(new Date('2026-09-09T10:00:00.000Z'));
  assert.equal(period.startDate, '2026-08-01');
  assert.equal(period.endDate, '2026-08-31');
  assert.equal(period.startUtc.toISOString(), '2026-07-31T21:00:00.000Z');
  assert.equal(period.endExclusiveUtc.toISOString(), '2026-08-31T21:00:00.000Z');
  assert.equal(period.nextEndExclusiveUtc.toISOString(), '2026-09-30T21:00:00.000Z');
});

test('forced weekly period is a rolling seven-day interval ending today', () => {
  const period = getForcedPeriod('weekly', new Date('2026-09-10T10:00:00.000Z'));
  assert.equal(period.startDate, '2026-09-04');
  assert.equal(period.endDate, '2026-09-10');
  assert.equal(period.startUtc.toISOString(), '2026-09-03T21:00:00.000Z');
  assert.equal(period.endExclusiveUtc.toISOString(), '2026-09-10T21:00:00.000Z');
});

test('forced monthly period covers exactly the last 30 calendar days', () => {
  const period = getForcedPeriod('monthly', new Date('2026-09-10T10:00:00.000Z'));
  assert.equal(period.startDate, '2026-08-12');
  assert.equal(period.endDate, '2026-09-10');
});

test('report period starts at access date when the child has had access for less than 30 days', () => {
  const period = getForcedPeriod('monthly', new Date('2026-09-24T10:00:00.000Z'));
  const clipped = clipReportPeriodToSubjectAccess(period, {
    UserSubject: { accessStartDate: '2026-09-12T08:00:00.000Z', isActive: true }
  });
  assert.equal(clipped.startDate, '2026-09-12');
  assert.equal(clipped.endDate, '2026-09-24');
});

test('homework uses the best on-time submission and ignores a better late attempt', () => {
  const homework = {
    openDate: '2026-09-01T09:00:00.000Z',
    closeDate: '2026-09-05T09:00:00.000Z'
  };
  const result = classifyHomework(homework, [
    { submittedAt: '2026-09-04T09:00:00.000Z', totalScore: 7, maxScore: 10 },
    { submittedAt: '2026-09-06T09:00:00.000Z', totalScore: 10, maxScore: 10 }
  ], new Date('2026-09-07T15:00:00.000Z'));
  assert.deepEqual(result, { status: 'completed', percent: 70 });
});

test('homework without deadline counts a completed attempt', () => {
  const result = classifyHomework({
    openDate: '2026-09-06T09:00:00.000Z',
    closeDate: null
  }, [
    { submittedAt: '2026-09-07T10:00:00.000Z', totalScore: 9, maxScore: 10 }
  ], new Date('2026-09-07T15:00:00.000Z'));
  assert.deepEqual(result, { status: 'completed', percent: 90 });
});

test('report explicitly lists completed homework with the result and time in the weekly schedule', () => {
  const message = formatSubjectReport(
    { name: 'Математика', icon: '📐' },
    {
      passedTopics: ['Степени'],
      homeworkResults: [{ title: 'Урок 1', status: 'completed', percent: 80 }],
      practiceTotal: 3,
      hasPractice: true,
      strongPracticeTopics: [{ name: 'Степени', percent: 100, attempts: 4 }],
      weakPracticeTopics: [{ name: 'Дроби', percent: 33, attempts: 3 }],
      nextSchedule: [{ topic: 'Корни', scheduledAt: '2026-09-14T16:00:00.000Z' }]
    },
    { reportType: 'weekly', days: 7 }
  );

  assert.match(message, /Урок 1 — выполнена, 80% правильных ответов/);
  assert.match(message, /Сильные темы/);
  assert.match(message, /Степени — 100% \(4 задач\)/);
  assert.match(message, /Слабые темы/);
  assert.match(message, /Дроби — 33% \(3 задач\)/);
  assert.match(message, /14 сентября — 19:00 — Корни/);
});

test('practice topic strengths use the student statistics formula within the report period', () => {
  const topics = [{ id: 1, name: 'Степени' }, { id: 2, name: 'Дроби' }];
  const strongAttempts = [
    ...Array.from({ length: 10 }, (_, index) => ({ topicId: 1, questionId: index + 1, isCorrect: true, question: { difficulty: 'easy' } })),
    ...Array.from({ length: 10 }, (_, index) => ({ topicId: 1, questionId: index + 11, isCorrect: true, question: { difficulty: 'medium' } })),
    ...Array.from({ length: 5 }, (_, index) => ({ topicId: 1, questionId: index + 21, isCorrect: true, question: { difficulty: 'hard' } }))
  ];
  const weakAttempts = Array.from({ length: 10 }, (_, index) => ({
    topicId: 2, questionId: index + 31, isCorrect: false, question: { difficulty: 'easy' }
  }));
  const result = classifyPracticeTopics(topics, [...strongAttempts, ...weakAttempts]);

  assert.deepEqual(result.strongPracticeTopics, [{ name: 'Степени', attempts: 25, percent: 100 }]);
  assert.deepEqual(result.weakPracticeTopics, [{ name: 'Дроби', attempts: 10, percent: 0 }]);
});

test('practice topic blocks explain why they are unavailable without practice', () => {
  const message = formatSubjectReport(
    { name: 'Математика', icon: '📐' },
    { passedTopics: [], homeworkResults: [], practiceTotal: 0, hasPractice: false, strongPracticeTopics: [], weakPracticeTopics: [], nextSchedule: [] }
  );

  assert.match(message, /Будут доступны, когда ученик будет решать практику/);
});

test('unfinished homework is pending for two days, then reported as not completed', () => {
  const recent = { openDate: '2026-09-06T09:00:00.000Z', closeDate: '2026-09-20T09:00:00.000Z' };
  const old = { openDate: '2026-09-03T09:00:00.000Z', closeDate: null };
  const now = new Date('2026-09-07T15:00:00.000Z');
  assert.equal(classifyHomework(recent, [], now).status, 'pending');
  assert.equal(classifyHomework(old, [], now).status, 'not_completed');
});

test('parent access follows the current subject access window', () => {
  const now = new Date('2026-09-07T15:00:00.000Z');
  assert.equal(isSubjectAccessActive({ UserSubject: { isActive: true, accessEndDate: '2026-09-08T00:00:00.000Z' } }, now), true);
  assert.equal(isSubjectAccessActive({ UserSubject: { isActive: true, accessEndDate: '2026-09-01T00:00:00.000Z' } }, now), false);
  assert.equal(isSubjectAccessActive({ UserSubject: { isActive: false } }, now), false);
});

test('Telegram identifiers are normalized and validated', () => {
  assert.equal(normalizeTelegramId(' 12345 '), '12345');
  assert.equal(normalizeTelegramUsername(' @Parent_Name '), 'parent_name');
  assert.throws(() => normalizeTelegramId('12x'), /только цифры/);
  assert.throws(() => normalizeTelegramUsername('@a'), /Некорректный/);
});

test('long Telegram report is split below the delivery limit', () => {
  const chunks = splitTelegramText(Array.from({ length: 40 }, (_, index) => `${index} ${'x'.repeat(120)}`).join('\n'), 500);
  assert.ok(chunks.length > 1);
  assert.ok(chunks.every((chunk) => chunk.length <= 500));
});

test('parent report includes a direct manager contact button', () => {
  assert.deepEqual(getManagerContactKeyboard(), {
    inline_keyboard: [[{
      text: 'Связаться с менеджером',
      url: 'https://t.me/kubik_ct'
    }]]
  });
});
