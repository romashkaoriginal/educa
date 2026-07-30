const test = require('node:test');
const assert = require('node:assert/strict');
const { nextQuestionState } = require('../src/services/lessonQuizFlow');

test('next question becomes visible immediately', () => {
  assert.deepEqual(nextQuestionState({ currentQuestionIndex: 2 }), {
    currentQuestionIndex: 3,
    questionRevealState: 'question',
    explanationRevealed: false
  });
});
