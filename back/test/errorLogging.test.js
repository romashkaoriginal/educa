const test = require('node:test');
const assert = require('node:assert/strict');
const { Op } = require('sequelize');
const {
  getRequestDetails,
  inferAction,
  inferArea,
  makeFingerprint,
  normalizePath,
  redactText,
  sanitize
} = require('../src/services/errorLogging');
const { parseErrorLogQuery } = require('../src/services/errorLogQuery');

test('sanitize скрывает токены, пароли и ответы, сохраняя безопасный контекст', () => {
  const result = sanitize({
    homeworkId: 15,
    title: 'Контрольная',
    password: 'qwerty',
    selectedAnswer: 3,
    nested: { authorization: 'Bearer secret', subjectId: 9 }
  });

  assert.equal(result.homeworkId, 15);
  assert.equal(result.title, 'Контрольная');
  assert.equal(result.password, '[СКРЫТО]');
  assert.equal(result.selectedAnswer, '[СКРЫТО]');
  assert.equal(result.nested.authorization, '[СКРЫТО]');
  assert.equal(result.nested.subjectId, 9);
  assert.doesNotMatch(redactText('payload answers: [{"answer":"42"}] token=abc'), /42|abc/);
});

test('определяет раздел, действие и объект из HTTP-запроса', () => {
  const details = getRequestDetails({
    method: 'POST',
    originalUrl: '/api/homework/42/submit?debug=1',
    params: { homeworkId: '42' },
    body: { studentId: 7, answers: [{ questionId: 1, answer: 'секрет' }] }
  });

  assert.equal(details.area, 'homework');
  assert.equal(details.action, 'submit');
  assert.equal(details.path, '/api/homework/42/submit');
  assert.deepEqual(details.identifiers, { homeworkId: 42, studentId: 7 });
  assert.equal(normalizePath('socket://student:submit-answer'), 'socket://student:submit-answer');
  assert.equal(inferArea('/api/lesson-admin/lessons/1'), 'lesson');
  assert.equal(inferAction('DELETE', '/api/practice/topics/3'), 'delete');
});

test('fingerprint одинаков для одинаковой ошибки и различается между пользователями', () => {
  const base = { source: 'backend', message: 'DB timeout', path: '/api/homework', userId: 2 };
  assert.equal(makeFingerprint(base), makeFingerprint({ ...base }));
  assert.notEqual(makeFingerprint(base), makeFingerprint({ ...base, userId: 3 }));
});

test('фильтр периода строит безопасный диапазон и поиск', () => {
  const now = new Date('2026-08-30T12:00:00.000Z');
  const parsed = parseErrorLogQuery({ preset: '3h', search: 'домашка', limit: '500', page: '2' }, now);

  assert.equal(parsed.from.toISOString(), '2026-08-30T09:00:00.000Z');
  assert.equal(parsed.to.toISOString(), now.toISOString());
  assert.equal(parsed.limit, 100);
  assert.equal(parsed.page, 2);
  assert.equal(parsed.offset, 100);
  assert.ok(parsed.where[Op.or]);
});

test('произвольный период ограничен сроком хранения', () => {
  assert.throws(() => parseErrorLogQuery({
    preset: 'custom',
    from: '2026-07-01T00:00:00.000Z',
    to: '2026-08-30T00:00:00.000Z'
  }), /30 дней/);
});
