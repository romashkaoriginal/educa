const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const activitiesPath = require.resolve('../src/services/lessonActivities');
const originalLoad = Module._load;

function loadActivities({ accessCheck, findLesson, models = {} }) {
  Module._load = function mockLessonDependencies(request, parent, isMain) {
    const fromActivities = parent?.filename === activitiesPath;
    if (fromActivities && request === '../models') {
      return {
        Lesson: { findByPk: findLesson },
        LessonPoll: {},
        LessonPollOption: {},
        LessonPollAnswer: {},
        LessonQuiz: {},
        LessonQuizQuestion: {},
        LessonQuizAnswer: {},
        LessonQuizDelivery: {},
        ...models
      };
    }
    if (fromActivities && request === '../middleware/lessonAccess') {
      return { assertStudentCanAccessLesson: accessCheck };
    }
    if (fromActivities && request === './lessonAttendance') {
      return { touchAttendance: async () => ({}) };
    }
    if (fromActivities && request === './lessonState') {
      return {
        getPollResults: async () => null,
        serializeActiveQuiz: async () => null,
        invalidateSharedQuizCache: () => {}
      };
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  delete require.cache[activitiesPath];
  try {
    return require(activitiesPath);
  } finally {
    Module._load = originalLoad;
  }
}

test.afterEach(() => {
  Module._load = originalLoad;
  delete require.cache[activitiesPath];
});

test('requireLiveAccess reloads session fields when access returned a partial lesson', async () => {
  const partialLesson = { id: 2, subjectId: 7 };
  const liveLesson = { id: 2, subjectId: 7, status: 'live', sessionEndsAt: null };
  let requestedLessonId = null;
  const activities = loadActivities({
    accessCheck: async () => ({ ok: true, lesson: partialLesson }),
    findLesson: async (lessonId) => {
      requestedLessonId = Number(lessonId);
      return liveLesson;
    }
  });

  const result = await activities.requireLiveAccess(2, 42);

  assert.equal(requestedLessonId, 2);
  assert.equal(result, liveLesson);
});

test('requireLiveAccess still rejects a finished lesson', async () => {
  const finishedLesson = {
    id: 2,
    subjectId: 7,
    status: 'finished',
    sessionEndsAt: new Date(Date.now() - 1_000)
  };
  const activities = loadActivities({
    accessCheck: async () => ({ ok: true, lesson: finishedLesson }),
    findLesson: async () => {
      throw new Error('A complete access result must not be reloaded');
    }
  });

  await assert.rejects(
    () => activities.requireLiveAccess(2, 42),
    (error) => error.code === 'LESSON_NOT_LIVE' && error.status === 409
  );
});

test('markQuizQuestionReceived stores an idempotent delivery for the visible question', async () => {
  const liveLesson = { id: 2, subjectId: 7, status: 'live', sessionEndsAt: null };
  let stored = null;
  const activities = loadActivities({
    accessCheck: async () => ({ ok: true, lesson: liveLesson }),
    findLesson: async () => liveLesson,
    models: {
      LessonQuiz: { findByPk: async () => ({
        id: 5, lessonId: 2, status: 'active', mode: 'single_step',
        currentQuestionIndex: 0, questionRevealState: 'question'
      }) },
      LessonQuizQuestion: {
        findOne: async () => ({ id: 9, lessonQuizId: 5 }),
        findAll: async () => [{ id: 9 }]
      },
      LessonQuizDelivery: {
        findOrCreate: async ({ where, defaults }) => {
          stored = { where, defaults };
          return [{ id: 12, ...defaults }, true];
        }
      }
    }
  });

  const result = await activities.markQuizQuestionReceived({ quizId: 5, questionId: 9, userId: 42 });

  assert.deepEqual(stored.where, { questionId: 9, userId: 42 });
  assert.equal(result.created, true);
  assert.equal(result.lessonId, 2);
});

test('submitQuizAnswer rejects an answer after the in-lesson question timer expires', async () => {
  const liveLesson = { id: 2, subjectId: 7, status: 'live', sessionEndsAt: null };
  let created = false;
  const activities = loadActivities({
    accessCheck: async () => ({ ok: true, lesson: liveLesson }),
    findLesson: async () => liveLesson,
    models: {
      LessonQuiz: { findByPk: async () => ({
        id: 5, lessonId: 2, status: 'active', mode: 'single_step',
        currentQuestionIndex: 0, questionRevealState: 'question',
        questionStartedAt: new Date(Date.now() - 31_000)
      }) },
      LessonQuizQuestion: {
        findOne: async () => ({ id: 9, lessonQuizId: 5, timeLimit: 30, options: ['A', 'B'], correctAnswer: [1] }),
        findAll: async () => [{ id: 9 }]
      },
      LessonQuizAnswer: { create: async () => { created = true; } }
    }
  });

  await assert.rejects(
    () => activities.submitQuizAnswer({ quizId: 5, questionId: 9, selectedAnswer: [1], userId: 42 }),
    (error) => error.code === 'QUESTION_TIME_EXPIRED' && error.status === 409
  );
  assert.equal(created, false);
});

test('submitQuizAnswer stores server-measured response time for lesson ranking', async () => {
  const liveLesson = { id: 2, subjectId: 7, status: 'live', sessionEndsAt: null };
  const startedAt = new Date(Date.now() - 4_000);
  let payload = null;
  const activities = loadActivities({
    accessCheck: async () => ({ ok: true, lesson: liveLesson }),
    findLesson: async () => liveLesson,
    models: {
      LessonQuiz: { findByPk: async () => ({
        id: 5, lessonId: 2, status: 'active', mode: 'single_step',
        currentQuestionIndex: 0, questionRevealState: 'question', questionStartedAt: startedAt
      }) },
      LessonQuizQuestion: {
        findOne: async () => ({ id: 9, lessonQuizId: 5, timeLimit: 30, options: ['A', 'B'], correctAnswer: [1] }),
        findAll: async () => [{ id: 9 }]
      },
      LessonQuizAnswer: { create: async (values) => { payload = values; return values; } }
    }
  });

  await activities.submitQuizAnswer({ quizId: 5, questionId: 9, selectedAnswer: [1], userId: 42 });

  assert.equal(payload.isCorrect, true);
  assert.ok(payload.responseTimeMs >= 4_000 && payload.responseTimeMs < 5_000);
});
