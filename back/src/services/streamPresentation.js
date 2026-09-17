// В эфире используем только отображаемое имя. Фамилия — персональные данные и
// не должна попадать на стрим без отдельного согласия ученика.
const displayName = (user) => String(user?.firstName || '').trim() || 'Участник';

// Балл за правильный ответ зависит от скорости: мгновенный ответ даёт полный
// балл, ответ на последней секунде — половину. Пол в 50% намеренный: без него
// ученик, ответивший верно на все вопросы медленно, проиграл бы тому, кто
// быстро угадал пару — это наказывало бы за знание в пользу реакции.
const QUIZ_SCORE_FLOOR = 0.5;
const DEFAULT_TIME_LIMIT_MS = 30000;
// Ответ без замера времени (self_paced или старые записи) не должен получать
// преимущество перед теми, кого время засекали.
const UNTIMED_RESPONSE_MS = 300000;

function answerTimeLimitMs(answer) {
  const seconds = Number(answer?.question?.timeLimit ?? answer?.timeLimit);
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : DEFAULT_TIME_LIMIT_MS;
}

// Лимит вопроса нужен для расчёта балла, но JOIN на вопросы в каждом запросе
// лидерборда — лишняя работа: вопросы уже загружены вместе с викториной.
// Проставляем timeLimit из этого списка.
function withQuestionTimeLimits(answers = [], questions = []) {
  const limitByQuestion = new Map(
    questions.map((question) => [Number(question.id), Number(question.timeLimit) || undefined])
  );
  return answers.map((answer) => ({
    userId: answer.userId,
    user: answer.user,
    isCorrect: answer.isCorrect,
    responseTimeMs: answer.responseTimeMs,
    timeLimit: answer.question?.timeLimit ?? limitByQuestion.get(Number(answer.questionId))
  }));
}

// Доля от полного балла за скорость: 1 при мгновенном ответе, QUIZ_SCORE_FLOOR
// на дедлайне и после него.
function speedScore(responseTimeMs, timeLimitMs) {
  if (!Number.isFinite(responseTimeMs) || responseTimeMs < 0) return QUIZ_SCORE_FLOOR;
  const ratio = 1 - (responseTimeMs / timeLimitMs);
  return QUIZ_SCORE_FLOOR + Math.max(0, Math.min(1, ratio)) * (1 - QUIZ_SCORE_FLOOR);
}

// Builds cumulative places for the in-lesson quiz. A correct answer is worth
// between QUIZ_SCORE_FLOOR and 1 point depending on how fast it arrived; total
// response time stays a deterministic tie-breaker.
function buildLessonQuizLeaderboard(answers = [], deliveries = [], isAnonymous = false, limit = 10) {
  const participants = new Map();
  const ensure = (userId, user) => {
    const id = Number(userId);
    if (!participants.has(id)) participants.set(id, {
      id, name: displayName(user), totalScore: 0, correctCount: 0, responseTimeMs: 0
    });
    return participants.get(id);
  };
  deliveries.forEach((delivery) => ensure(delivery.userId, delivery.user));
  answers.forEach((answer) => {
    const participant = ensure(answer.userId, answer.user);
    if (answer.isCorrect) {
      const timed = answer.responseTimeMs !== null && answer.responseTimeMs !== undefined;
      const responseTimeMs = timed ? Math.max(0, Number(answer.responseTimeMs) || 0) : UNTIMED_RESPONSE_MS;
      participant.totalScore += timed
        ? speedScore(responseTimeMs, answerTimeLimitMs(answer))
        : QUIZ_SCORE_FLOOR;
      participant.correctCount += 1;
      participant.responseTimeMs += responseTimeMs;
    }
  });
  // Накопление долей даёт хвосты плавающей точки (0.1+0.2). Округляем до сотых:
  // на экране всё равно один-два знака, а равные суммы должны сравниваться как равные.
  participants.forEach((participant) => {
    participant.totalScore = Math.round(participant.totalScore * 100) / 100;
  });
  const anonymousName = new Map(
    [...participants.keys()].sort((a, b) => a - b).map((id, index) => [id, `Участник ${index + 1}`])
  );
  const ranked = [...participants.values()].sort((a, b) =>
    b.totalScore - a.totalScore || a.responseTimeMs - b.responseTimeMs || a.id - b.id
  );
  return ranked.slice(0, limit).map((entry, index) => ({
    id: entry.id,
    name: isAnonymous ? anonymousName.get(entry.id) : entry.name,
    totalScore: entry.totalScore,
    correctCount: entry.correctCount,
    // Скорость определяет порядок внутри ничьей, но не меняет место:
    // 1, 1, 3 — а не искусственное 1, 2, 3.
    place: index > 0 && ranked[index - 1].totalScore === entry.totalScore
      ? ranked.slice(0, index).findIndex((item) => item.totalScore === entry.totalScore) + 1
      : index + 1
  }));
}

// Explicit allowlists: the teacher presentation must never expose answer keys,
// explanations or a student's selected answer.
function presentLessonQuiz(quiz, question, leaderboard, totalQuestions, participantCount, now = Date.now()) {
  const timeLimit = Number(question?.timeLimit) || 30;
  const deadline = question && quiz.questionStartedAt
    ? new Date(quiz.questionStartedAt).getTime() + timeLimit * 1000 : null;
  const phase = quiz.status === 'finished' ? 'finished'
    : quiz.status !== 'active' ? 'lobby'
      : quiz.mode !== 'single_step' ? 'leaderboard'
        : quiz.questionRevealState === 'question' && deadline !== null && now < deadline ? 'question'
          : quiz.questionRevealState === 'hidden' ? 'lobby' : 'leaderboard';
  return {
    title: quiz.title,
    status: quiz.status,
    phase,
    serverNow: now,
    deadline,
    questionIndex: Number(quiz.currentQuestionIndex),
    totalQuestions,
    participantCount,
    question: phase === 'question' ? {
      id: question.id,
      questionText: question.questionText,
      questionImage: question.questionImage?.storageKey
        ? {
          storageKey: question.questionImage.storageKey,
          width: Number(question.questionImage.width) || undefined,
          height: Number(question.questionImage.height) || undefined
        }
        : null,
      options: Array.isArray(question.options) ? question.options : [],
      timeLimit
    } : null,
    leaderboard: leaderboard.slice(0, 10).map((entry) => ({
      id: Number(entry.id), name: entry.name, totalScore: Number(entry.totalScore) || 0,
      correctCount: Number(entry.correctCount) || 0,
      place: Number(entry.place) || undefined
    }))
  };
}

const WEEKLY_SQL = `
WITH homework_best AS (
  SELECT s."userId", s."homeworkId", MAX(s."totalScore") AS points
  FROM homework_submissions s JOIN homeworks h ON h.id = s."homeworkId"
  WHERE s."submittedAt" >= :since AND s."submittedAt" <= :until
    AND (:subjectId IS NULL OR h."subjectId" = :subjectId)
    AND (:restrictSubjects = false OR h."subjectId" IN (:allowedSubjectIds))
  GROUP BY s."userId", s."homeworkId"
), practice_unique AS (
  SELECT a."studentId" AS "userId", a."questionId",
    CASE q.difficulty WHEN 'easy' THEN 1 WHEN 'medium' THEN 2 WHEN 'hard' THEN 3 ELSE 0 END AS points
  FROM practice_question_results a JOIN practice_questions q ON q.id = a."questionId"
  WHERE COALESCE(a."lastCorrectAt", CASE WHEN a."isCorrect" THEN a."updatedAt" END) >= :since
    AND COALESCE(a."lastCorrectAt", CASE WHEN a."isCorrect" THEN a."updatedAt" END) <= :until
    AND (:subjectId IS NULL OR a."subjectId" = :subjectId)
    AND (:restrictSubjects = false OR a."subjectId" IN (:allowedSubjectIds))
), scores AS (
  SELECT "userId", points AS homework, 0 AS practice FROM homework_best
  UNION ALL SELECT "userId", 0 AS homework, points AS practice FROM practice_unique
)
SELECT u.id, COALESCE(NULLIF(TRIM(u."firstName"), ''), 'Участник') AS name,
  SUM(s.homework)::float AS "homeworkScore", SUM(s.practice)::float AS "practiceScore",
  SUM(s.homework + s.practice)::float AS "totalScore"
FROM scores s JOIN users u ON u.id = s."userId"
WHERE u.role = 'student' AND u."isActive" = true
GROUP BY u.id, u."firstName"
HAVING SUM(s.homework + s.practice) > 0
ORDER BY "totalScore" DESC, "homeworkScore" DESC, u.id ASC LIMIT 10`;

function isPracticeAnswerCorrect(selected, correct) {
  const answers = Array.isArray(selected) ? selected : [selected];
  const keys = Array.isArray(correct) ? correct : [correct];
  return keys.length > 0 && answers.length === keys.length
    && new Set(answers).size === answers.length
    && answers.every(value => Number.isInteger(value) && keys.includes(value));
}

module.exports = {
  buildLessonQuizLeaderboard,
  withQuestionTimeLimits,
  presentLessonQuiz,
  WEEKLY_SQL,
  isPracticeAnswerCorrect
};
