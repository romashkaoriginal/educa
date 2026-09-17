const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildLessonQuizLeaderboard, withQuestionTimeLimits, presentLessonQuiz, isPracticeAnswerCorrect
} = require('../src/services/streamPresentation');

const quiz = {
  title: 'Алгебра', status: 'active', mode: 'single_step',
  questionRevealState: 'question', questionStartedAt: new Date(1000), currentQuestionIndex: 0
};
const question = {
  id: 1, questionText: '2 + 2', options: ['3', '4'], timeLimit: 30,
  correctAnswer: [1], explanation: 'Секретное решение',
  questionImage: { storageKey: 'safe-image.webp', fileHash: 'private' }
};

test('lesson stream exposes the active task and timer without answer keys', () => {
  const output = presentLessonQuiz(quiz, question, [], 3, 0, 2000);
  assert.equal(output.phase, 'question');
  assert.equal(output.deadline, 31000);
  assert.equal(output.question.questionImage.storageKey, 'safe-image.webp');
  assert.equal(JSON.stringify(output).includes('correctAnswer'), false);
  assert.equal(JSON.stringify(output).includes('Секретное решение'), false);
  assert.equal(JSON.stringify(output).includes('private'), false);
});

test('timer and teacher reveal switch to question standings, finish keeps final standings', () => {
  assert.equal(presentLessonQuiz(quiz, question, [], 3, 0, 30999).phase, 'question');
  assert.equal(presentLessonQuiz(quiz, question, [], 3, 0, 31000).phase, 'leaderboard');
  assert.equal(presentLessonQuiz({ ...quiz, questionRevealState: 'answer' }, question, [], 3, 0, 2000).phase, 'leaderboard');
  assert.equal(presentLessonQuiz({ ...quiz, status: 'finished' }, question, [], 3, 0, 2000).phase, 'finished');
  assert.equal(presentLessonQuiz({ ...quiz, status: 'draft' }, null, [], 3, 0).phase, 'lobby');
});

test('lesson leaderboard is cumulative, top ten, speed-tiebroken and privacy-safe', () => {
  const deliveries = Array.from({ length: 12 }, (_, index) => ({
    userId: index + 1,
    user: { firstName: `Ученик ${index + 1}`, telegramId: 'private' }
  }));
  const answers = [
    { userId: 2, user: deliveries[1].user, isCorrect: true, responseTimeMs: 9000 },
    { userId: 3, user: deliveries[2].user, isCorrect: true, responseTimeMs: 5000 },
    { userId: 1, user: deliveries[0].user, isCorrect: true, responseTimeMs: 5000 },
    { userId: 1, user: deliveries[0].user, isCorrect: true, responseTimeMs: 3000 }
  ];
  const ranked = buildLessonQuizLeaderboard(answers, deliveries, false);
  assert.equal(ranked.length, 10);
  assert.deepEqual(ranked.slice(0, 3).map((entry) => entry.id), [1, 3, 2]);
  assert.equal(ranked[0].correctCount, 2);
  // Два верных ответа за 5 и 3 секунды при лимите по умолчанию (30 с):
  // (0.5 + 25/30 * 0.5) + (0.5 + 27/30 * 0.5) = 0.92 + 0.95.
  assert.equal(ranked[0].totalScore, 1.87);
  assert.equal(JSON.stringify(ranked).includes('private'), false);
});

test('correct answers score higher the faster they arrive', () => {
  const ranked = buildLessonQuizLeaderboard([
    { userId: 1, user: { firstName: 'Быстрый' }, isCorrect: true, responseTimeMs: 0, timeLimit: 30 },
    { userId: 2, user: { firstName: 'Средний' }, isCorrect: true, responseTimeMs: 15000, timeLimit: 30 },
    { userId: 3, user: { firstName: 'Медленный' }, isCorrect: true, responseTimeMs: 30000, timeLimit: 30 },
    { userId: 4, user: { firstName: 'Неверный' }, isCorrect: false, responseTimeMs: 0, timeLimit: 30 }
  ], [], false, Infinity);
  assert.deepEqual(ranked.map((entry) => entry.totalScore), [1, 0.75, 0.5, 0]);
  // Ровно эта разница и была сломана: у всех верно ответивших совпадали баллы,
  // и место определялось порядком регистрации.
  assert.deepEqual(ranked.map((entry) => entry.place), [1, 2, 3, 4]);
});

test('per-question time limit scales the speed bonus', () => {
  const [fast] = buildLessonQuizLeaderboard(
    [{ userId: 1, user: { firstName: 'Аня' }, isCorrect: true, responseTimeMs: 5000, timeLimit: 10 }],
    [], false, Infinity
  );
  // 5 с из 10 — половина времени, значит половина бонуса сверх пола.
  assert.equal(fast.totalScore, 0.75);
});

test('a knowledgeable slow student still outranks a fast student who knows less', () => {
  const slowButRight = Array.from({ length: 3 }, () => ({
    userId: 1, user: { firstName: 'Знающий' }, isCorrect: true, responseTimeMs: 29000, timeLimit: 30
  }));
  const fastButWrong = [
    { userId: 2, user: { firstName: 'Быстрый' }, isCorrect: true, responseTimeMs: 0, timeLimit: 30 },
    { userId: 2, user: { firstName: 'Быстрый' }, isCorrect: false, responseTimeMs: 0, timeLimit: 30 },
    { userId: 2, user: { firstName: 'Быстрый' }, isCorrect: false, responseTimeMs: 0, timeLimit: 30 }
  ];
  const ranked = buildLessonQuizLeaderboard([...slowButRight, ...fastButWrong], [], false, Infinity);
  assert.deepEqual(ranked.map((entry) => entry.id), [1, 2]);
});

test('answers without a measured response time fall back to the floor score', () => {
  const ranked = buildLessonQuizLeaderboard([
    { userId: 1, user: { firstName: 'Аня' }, isCorrect: true, responseTimeMs: null },
    { userId: 2, user: { firstName: 'Борис' }, isCorrect: true, responseTimeMs: 0, timeLimit: 30 }
  ], [], false, Infinity);
  assert.equal(ranked.find((entry) => entry.id === 1).totalScore, 0.5);
  assert.deepEqual(ranked.map((entry) => entry.id), [2, 1]);
});

test('students with the same quiz score receive the same place', () => {
  const ranked = buildLessonQuizLeaderboard([
    { userId: 1, user: { firstName: 'Аня' }, isCorrect: true, responseTimeMs: 1000, timeLimit: 30 },
    { userId: 2, user: { firstName: 'Борис' }, isCorrect: true, responseTimeMs: 1000, timeLimit: 30 },
    { userId: 3, user: { firstName: 'Вика' }, isCorrect: false, responseTimeMs: 1000, timeLimit: 30 }
  ], [], false, Infinity);
  assert.deepEqual(ranked.map((entry) => entry.place), [1, 1, 3]);
});

test('quiz leaderboard exposes only the first name', () => {
  const ranked = buildLessonQuizLeaderboard([
    { userId: 1, user: { firstName: 'Анна', lastName: 'Соколова' }, isCorrect: true, responseTimeMs: 1000 }
  ], [], false);
  assert.equal(ranked[0].name, 'Анна');
  assert.equal(JSON.stringify(ranked).includes('Соколова'), false);
});

test('anonymous lesson quiz never exposes student names', () => {
  const ranked = buildLessonQuizLeaderboard([
    { userId: 7, user: { firstName: 'Анна', lastName: 'Соколова' }, isCorrect: true, responseTimeMs: 1000 }
  ], [], true);
  assert.equal(ranked[0].name, 'Участник 1');
  assert.equal(JSON.stringify(ranked).includes('Анна'), false);
});

test('question time limits are attached to answers without a database join', () => {
  const answers = [
    { userId: 1, questionId: 10, isCorrect: true, responseTimeMs: 1000, user: { firstName: 'Аня' } },
    { userId: 2, questionId: 11, isCorrect: true, responseTimeMs: 1000, user: { firstName: 'Борис' } }
  ];
  const prepared = withQuestionTimeLimits(answers, [
    { id: 10, timeLimit: 10 }, { id: 11, timeLimit: 60 }
  ]);
  assert.deepEqual(prepared.map((answer) => answer.timeLimit), [10, 60]);
  // Балл считается от доли израсходованного времени, а не от абсолютных секунд:
  // одна секунда съедает 10% лимита в 10 с и меньше 2% лимита в 60 с.
  const ranked = buildLessonQuizLeaderboard(prepared, [], false, Infinity);
  assert.deepEqual(ranked.map((entry) => entry.id), [2, 1]);
  assert.deepEqual(ranked.map((entry) => entry.totalScore), [0.99, 0.95]);
});

test('practice score requires exact server answer set, rejecting duplicates and coercion', () => {
  assert.equal(isPracticeAnswerCorrect([2, 0], [0, 2]), true);
  assert.equal(isPracticeAnswerCorrect(1, [1]), true);
  for (const value of [[0], [0, 0], [0, 2, 3], ['0', 2], null, []]) {
    assert.equal(isPracticeAnswerCorrect(value, [0, 2]), false);
  }
});
