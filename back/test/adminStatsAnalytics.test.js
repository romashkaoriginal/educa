const test = require('node:test');
const assert = require('node:assert/strict');

const {
  groupHomeworkRows,
  groupPracticeRows,
  rankProblems,
} = require('../src/services/adminStatsAnalytics');

test('rankProblems prioritises error rate and keeps the sample size visible', () => {
  const ranked = rankProblems([
    { topicId: 1, attempts: '20', errorCount: '8', affectedStudents: '4' },
    { topicId: 2, attempts: '5', errorCount: '4', affectedStudents: '3' },
    { topicId: 3, attempts: '10', errorCount: '0', affectedStudents: '0' },
  ]);

  assert.deepEqual(ranked.map((row) => row.topicId), [2, 1]);
  assert.equal(ranked[0].errorRate, 80);
  assert.equal(ranked[0].attempts, 5);
});

test('homework analytics counts the current subject roster and best submissions without duplicates', () => {
  const analytics = groupHomeworkRows([
    {
      id: 10,
      title: 'Квадратные уравнения',
      subjectId: 1,
      subjectName: 'Математика',
      subjectIcon: '📐',
      eligibleStudents: 3,
      eligibleStudentIds: [1, 2, 3],
    },
  ], [
    { id: 100, homeworkId: 10, userId: 1, totalScore: 8, maxScore: 10, firstName: 'Анна' },
    { id: 101, homeworkId: 10, userId: 2, totalScore: 6, maxScore: 10, firstName: 'Илья' },
  ], [
    { homeworkId: 10, questionId: 7, questionText: 'Найдите корни', answerCount: 2, errorCount: 1 },
  ]);

  const homework = analytics.subjects[0].homeworks[0];
  assert.equal(homework.completedCount, 2);
  assert.equal(homework.completionPercent, 67);
  assert.equal(homework.averageScore, 70);
  assert.equal(homework.commonErrors[0].errorRate, 50);
  assert.equal(analytics.summary.activeStudents, 2);
  assert.equal(analytics.summary.eligibleStudents, 3);
});

test('practice analytics returns participation and the most problematic topics and questions', () => {
  const analytics = groupPracticeRows([
    {
      subjectId: 1,
      subjectName: 'Физика',
      subjectIcon: '⚛️',
      eligibleStudents: 10,
      activeStudents: 6,
      todayStudents: 2,
      todayAttempts: 12,
      totalAttempts: 50,
      correctAttempts: 35,
    },
  ], [
    { subjectId: 1, topicId: 4, topicName: 'Динамика', attempts: 20, errorCount: 8, affectedStudents: 5 },
  ], [
    { subjectId: 1, topicId: 4, questionId: 9, topicName: 'Динамика', questionText: 'Сила трения', attempts: 10, errorCount: 7, affectedStudents: 4 },
  ], {
    eligibleStudents: 10,
    activeStudents: 6,
    todayStudents: 2,
    totalAttempts: 50,
    correctAttempts: 35,
  });

  assert.equal(analytics.summary.accuracy, 70);
  assert.equal(analytics.subjects[0].activePercent, 60);
  assert.equal(analytics.subjects[0].problemTopics[0].errorRate, 40);
  assert.equal(analytics.subjects[0].problemQuestions[0].errorRate, 70);
});
