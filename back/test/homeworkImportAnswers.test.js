const test = require('node:test');
const assert = require('node:assert/strict');
const { parseHomeworkRow } = require('../src/utils/parseHomeworkRow');

test('homework import keeps correct answers linked to their columns across gaps', () => {
  const row = { question: 'Масса?', a: 0, b: '', c: '4 г', d: '2 г' };
  const single = parseHomeworkRow({ ...row, type: 'single', correct: 'c' }).question;
  assert.deepEqual(single.options, ['0', '4 г', '2 г']);
  assert.equal(single.options[single.correctAnswer], '4 г');
  const multiple = parseHomeworkRow({ ...row, type: 'multiple', correct: 'a,c,c' }).question;
  assert.deepEqual(multiple.correctAnswer.map(i => multiple.options[i]), ['0', '4 г']);
});

test('homework import rejects an answer pointing at an empty column', () => {
  for (const type of ['single', 'multiple']) {
    const result = parseHomeworkRow({ type, question: 'Масса?', a: '1', c: '4', d: '2', correct: 'b' });
    assert.ok(result.error);
    assert.equal(result.question, undefined);
  }
});
