const test = require('node:test');
const assert = require('node:assert/strict');

const controllerPath = require.resolve('../src/controllers/studentController');
const modelsPath = require.resolve('../src/models');
const deliveryPath = require.resolve('../src/services/telegramDelivery');
const webAppUrlPath = require.resolve('../src/utils/webAppUrl');
const identityPath = require.resolve('../src/services/systemUserIdentity');

function replaceModule(modulePath, exports) {
  const original = require.cache[modulePath];
  require.cache[modulePath] = { id: modulePath, filename: modulePath, loaded: true, exports };
  return () => {
    if (original) require.cache[modulePath] = original;
    else delete require.cache[modulePath];
  };
}

test('DELETE /students/:studentId removes streak records before deleting the student', async (t) => {
  const deleted = [];
  const model = (name) => ({
    destroy: async ({ where, transaction }) => {
      deleted.push({ name, where, transaction });
      return 1;
    }
  });
  const transaction = { id: 'delete-student' };
  const student = { id: 473, role: 'student', telegramId: '123', destroy: async ({ transaction: tx }) => {
    deleted.push({ name: 'User', transaction: tx });
  } };
  const models = {
    User: { findByPk: async () => student },
    HomeworkSubmission: { findAll: async () => [], destroy: model('HomeworkSubmission').destroy },
    HomeworkAnswer: model('HomeworkAnswer'),
    PracticeAttempt: model('PracticeAttempt'),
    PracticeBest: model('PracticeBest'),
    PracticeDailyLog: model('PracticeDailyLog'),
    PracticeStreakHistory: model('PracticeStreakHistory'),
    PracticeStreakEvent: model('PracticeStreakEvent'),
    PracticeQuestionResult: model('PracticeQuestionResult'),
    PracticeScoreHistory: model('PracticeScoreHistory'),
    PracticeStudentTotals: model('PracticeStudentTotals'),
    PracticeDailyStats: model('PracticeDailyStats'),
    PracticeTopicTotals: model('PracticeTopicTotals'),
    PracticeDifficultyTotals: model('PracticeDifficultyTotals'),
    PracticeModeTotals: model('PracticeModeTotals'),
    PracticeRecentError: model('PracticeRecentError'),
    QuizAnswer: model('QuizAnswer'),
    QuizParticipant: model('QuizParticipant'),
    ParentStudent: model('ParentStudent'),
    UserSubject: model('UserSubject'),
    BotUser: model('BotUser'),
    Parent: {},
    Subject: {},
    sequelize: { transaction: async (callback) => callback(transaction) }
  };

  const restore = [
    replaceModule(modelsPath, models),
    replaceModule(deliveryPath, { sendTelegramMessage: async () => ({ ok: true }) }),
    replaceModule(webAppUrlPath, { getWebAppUrlSync: () => 'https://example.test' }),
    replaceModule(identityPath, { resolveStudentIdentity: async () => ({}), usernameLookup: () => ({}) })
  ];
  delete require.cache[controllerPath];
  const { deleteStudent } = require('../src/controllers/studentController');
  t.after(() => {
    delete require.cache[controllerPath];
    restore.reverse().forEach((restoreModule) => restoreModule());
  });

  let body;
  await deleteStudent(
    { params: { studentId: '473' } },
    { json: (value) => { body = value; } }
  );

  assert.deepEqual(body, { message: 'Student deleted successfully' });
  assert.deepEqual(
    deleted.filter(({ name }) => name.startsWith('PracticeStreak')).map(({ name, where, transaction: tx }) => ({ name, where, transaction: tx })),
    [
      { name: 'PracticeStreakHistory', where: { studentId: '473' }, transaction },
      { name: 'PracticeStreakEvent', where: { studentId: '473' }, transaction }
    ]
  );
  assert.equal(deleted.at(-1).name, 'User');
});
