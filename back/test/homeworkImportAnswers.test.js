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

test('homework import accepts a quiz spreadsheet without a type column', () => {
  const result = parseHomeworkRow({ question: 'Чему равно |-7| + |3| - |-2|?', a: '6', b: '8', c: '12', d: '-6', correct: 'b', time: 30, points: 1 });
  assert.equal(result.error, undefined);
  assert.equal(result.question.questionType, 'single_choice');
  assert.equal(result.question.options[result.question.correctAnswer], '8');
  assert.equal(result.question.points, 1);
});
