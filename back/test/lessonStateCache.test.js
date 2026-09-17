const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const statePath = require.resolve('../src/services/lessonState');
const originalLoad = Module._load;

// Смена вопроса будит всех учеников разом. Проверяем именно это: общая часть
// состояния читается из БД один раз на всю комнату, а не по разу на ученика.
function loadState({ counters, quiz, answers = [], roster = [] }) {
  const quizModel = {
    findOne: async () => { counters.quizQueries += 1; return quiz; }
  };
  const answerModel = {
    findAll: async (options) => {
      if (options?.where?.userId !== undefined) {
        counters.personalQueries += 1;
        return [];
      }
      counters.leaderboardQueries += 1;
      return answers;
    }
  };
  Module._load = function mockStateDependencies(request, parent, isMain) {
    if (parent?.filename === statePath && request === '../models') {
      return {
        Lesson: {}, Subject: {}, User: {},
        LessonPoll: {}, LessonPollOption: {}, LessonPollAnswer: {},
        LessonQuiz: quizModel,
        LessonQuizQuestion: {},
        LessonQuizAnswer: answerModel,
        LessonQuizDelivery: {},
        LessonQuizParticipant: {
          findOne: async () => ({ id: 1 }),
          findAll: async () => roster
        },
        LessonQuestion: {}, LessonMaterial: {}, PracticeImage: {}
      };
    }
    return originalLoad.call(this, request, parent, isMain);
  };
  delete require.cache[statePath];
  try {
    return require(statePath);
  } finally {
    Module._load = originalLoad;
  }
}

// Тот же стенд, но с произвольным загрузчиком викторины — нужен, чтобы
// проверить поведение при ошибке БД.
function loadStateWithQuizLoader({ counters, loadQuiz }) {
  Module._load = function mockStateDependencies(request, parent, isMain) {
    if (parent?.filename === statePath && request === '../models') {
      return {
        Lesson: {}, Subject: {}, User: {},
        LessonPoll: {}, LessonPollOption: {}, LessonPollAnswer: {},
        LessonQuiz: { findOne: loadQuiz },
        LessonQuizQuestion: {},
        LessonQuizAnswer: {
          findAll: async (options) => {
            if (options?.where?.userId !== undefined) { counters.personalQueries += 1; return []; }
            counters.leaderboardQueries += 1;
            return [];
          }
        },
        LessonQuizDelivery: {},
        LessonQuizParticipant: { findOne: async () => ({ id: 1 }), findAll: async () => [] },
        LessonQuestion: {}, LessonMaterial: {}, PracticeImage: {}
      };
    }
    return originalLoad.call(this, request, parent, isMain);
  };
  delete require.cache[statePath];
  try {
    return require(statePath);
  } finally {
    Module._load = originalLoad;
  }
}

function fakeQuiz(overrides = {}) {
  const questions = [{ id: 10, order: 0, timeLimit: 30, toJSON: () => ({ id: 10, order: 0, timeLimit: 30 }) }];
  return {
    id: 1, lessonId: 7, status: 'active', mode: 'single_step',
    currentQuestionIndex: 0, questionRevealState: 'answer',
    questionStartedAt: new Date(), isAnonymous: false,
    showExplanations: true, explanationRevealed: false,
    questions,
    toJSON: () => ({ id: 1, lessonId: 7, status: 'active', mode: 'single_step' }),
    ...overrides
  };
}

test('a burst of students shares one database read of the quiz', async () => {
  const counters = { quizQueries: 0, leaderboardQueries: 0, personalQueries: 0 };
  const { serializeActiveQuiz } = loadState({ counters, quiz: fakeQuiz() });

  // 50 учеников одновременно — ровно сценарий смены вопроса на стриме.
  await Promise.all(Array.from({ length: 50 }, (_, index) => serializeActiveQuiz(7, index + 1)));

  assert.equal(counters.quizQueries, 1);
  assert.equal(counters.leaderboardQueries, 1);
  // Персональная часть обязана остаться персональной.
  assert.equal(counters.personalQueries, 50);
});

test('each student still receives their own standing from the shared leaderboard', async () => {
  const counters = { quizQueries: 0, leaderboardQueries: 0, personalQueries: 0 };
  const answers = [
    { userId: 1, questionId: 10, isCorrect: true, responseTimeMs: 1000, user: { id: 1, firstName: 'Аня' } },
    { userId: 2, questionId: 10, isCorrect: true, responseTimeMs: 9000, user: { id: 2, firstName: 'Борис' } }
  ];
  const roster = [
    { userId: 1, user: { id: 1, firstName: 'Аня' } },
    { userId: 2, user: { id: 2, firstName: 'Борис' } }
  ];
  const { serializeActiveQuiz } = loadState({ counters, quiz: fakeQuiz(), answers, roster });

  const [first, second] = await Promise.all([serializeActiveQuiz(7, 1), serializeActiveQuiz(7, 2)]);
  assert.equal(counters.leaderboardQueries, 1);
  assert.equal(first.myStanding.id, 1);
  assert.equal(second.myStanding.id, 2);
  assert.equal(first.myStanding.place, 1);
  assert.equal(second.myStanding.place, 2);
});

test('a new answer drops the shared cache so the leaderboard is never stale', async () => {
  const counters = { quizQueries: 0, leaderboardQueries: 0, personalQueries: 0 };
  const { serializeActiveQuiz, invalidateSharedQuizCache } = loadState({ counters, quiz: fakeQuiz() });

  await serializeActiveQuiz(7, 1);
  assert.equal(counters.leaderboardQueries, 1);

  await serializeActiveQuiz(7, 2);
  assert.equal(counters.leaderboardQueries, 1, 'в пределах окна рейтинг переиспользуется');

  invalidateSharedQuizCache(7);
  await serializeActiveQuiz(7, 3);
  assert.equal(counters.leaderboardQueries, 2, 'после ответа рейтинг пересчитывается');
});

test('a failed shared read is not cached and the next student retries', async () => {
  const counters = { quizQueries: 0, leaderboardQueries: 0, personalQueries: 0 };
  let failNext = true;
  const quiz = fakeQuiz();
  const failingQuiz = {
    get questions() { return quiz.questions; },
    ...quiz
  };
  const { serializeActiveQuiz } = loadStateWithQuizLoader({
    counters,
    loadQuiz: async () => {
      counters.quizQueries += 1;
      if (failNext) { failNext = false; throw new Error('БД недоступна'); }
      return failingQuiz;
    }
  });

  await assert.rejects(() => serializeActiveQuiz(7, 1), /БД недоступна/);
  // Ошибка не должна залипнуть в кэше на всё окно: следующий ученик пробует снова.
  await serializeActiveQuiz(7, 2);
  assert.equal(counters.quizQueries, 2);
});
