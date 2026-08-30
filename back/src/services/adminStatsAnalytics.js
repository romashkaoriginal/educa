const { QueryTypes } = require('sequelize');
const sequelize = require('../config/database');

function asNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function percent(part, total) {
  return total > 0 ? Math.round((part / total) * 100) : 0;
}

function rankProblems(rows, limit = 5) {
  return rows
    .map((row) => {
      const attempts = asNumber(row.attempts ?? row.answerCount);
      const errorCount = asNumber(row.errorCount);
      return {
        ...row,
        attempts,
        errorCount,
        affectedStudents: asNumber(row.affectedStudents),
        errorRate: percent(errorCount, attempts),
      };
    })
    .filter((row) => row.errorCount > 0)
    .sort((a, b) =>
      b.errorRate - a.errorRate ||
      b.affectedStudents - a.affectedStudents ||
      b.errorCount - a.errorCount ||
      b.attempts - a.attempts
    )
    .slice(0, limit);
}

function groupHomeworkRows(homeworks, bestSubmissions, errorRows) {
  const bestByHomework = new Map();
  bestSubmissions.forEach((submission) => {
    const key = asNumber(submission.homeworkId);
    if (!bestByHomework.has(key)) bestByHomework.set(key, []);
    bestByHomework.get(key).push({
      id: asNumber(submission.id),
      userId: asNumber(submission.userId),
      totalScore: asNumber(submission.totalScore),
      maxScore: asNumber(submission.maxScore),
      correctCount: submission.correctCount == null ? null : asNumber(submission.correctCount),
      attemptNumber: asNumber(submission.attemptNumber),
      submittedAt: submission.submittedAt,
      student: {
        id: asNumber(submission.userId),
        firstName: submission.firstName || '',
        lastName: submission.lastName || '',
        telegramUsername: submission.telegramUsername || '',
      },
      percentage: percent(asNumber(submission.totalScore), asNumber(submission.maxScore)),
    });
  });

  const errorsByHomework = new Map();
  errorRows.forEach((row) => {
    const key = asNumber(row.homeworkId);
    if (!errorsByHomework.has(key)) errorsByHomework.set(key, []);
    errorsByHomework.get(key).push({
      questionId: asNumber(row.questionId),
      questionText: row.questionText || 'Вопрос без текста',
      errorCount: asNumber(row.errorCount),
      answerCount: asNumber(row.answerCount),
    });
  });

  const subjectMap = new Map();
  homeworks.forEach((homework) => {
    const subjectId = asNumber(homework.subjectId);
    if (!subjectMap.has(subjectId)) {
      subjectMap.set(subjectId, {
        subject: {
          id: subjectId,
          name: homework.subjectName || 'Без предмета',
          icon: homework.subjectIcon || '📖',
        },
        homeworks: [],
      });
    }

    const submissions = bestByHomework.get(asNumber(homework.id)) || [];
    const averageScore = submissions.length > 0
      ? Math.round(submissions.reduce((sum, item) => sum + item.percentage, 0) / submissions.length)
      : 0;
    const eligibleStudentIds = Array.isArray(homework.eligibleStudentIds)
      ? homework.eligibleStudentIds.map(asNumber)
      : [];
    const completedCount = submissions.length;

    subjectMap.get(subjectId).homeworks.push({
      id: asNumber(homework.id),
      title: homework.title,
      openDate: homework.openDate,
      closeDate: homework.closeDate,
      eligibleStudents: asNumber(homework.eligibleStudents),
      eligibleStudentIds,
      completedCount,
      completionPercent: percent(completedCount, asNumber(homework.eligibleStudents)),
      averageScore,
      completedStudents: submissions,
      commonErrors: rankProblems(errorsByHomework.get(asNumber(homework.id)) || []),
    });
  });

  const subjects = Array.from(subjectMap.values()).map((entry) => {
    const eligibleIds = new Set(entry.homeworks.flatMap((homework) => homework.eligibleStudentIds));
    const completedIds = new Set(entry.homeworks.flatMap((homework) => homework.completedStudents.map((item) => item.userId)));
    const completedWorks = entry.homeworks.reduce((sum, homework) => sum + homework.completedCount, 0);
    const scoreSamples = entry.homeworks.flatMap((homework) => homework.completedStudents.map((item) => item.percentage));
    return {
      ...entry,
      summary: {
        eligibleStudents: eligibleIds.size,
        activeStudents: completedIds.size,
        completedWorks,
        averageScore: scoreSamples.length > 0
          ? Math.round(scoreSamples.reduce((sum, score) => sum + score, 0) / scoreSamples.length)
          : 0,
      },
    };
  });

  const allEligibleIds = new Set(homeworks.flatMap((homework) =>
    Array.isArray(homework.eligibleStudentIds) ? homework.eligibleStudentIds.map(asNumber) : []
  ));
  const allCompletedIds = new Set(bestSubmissions.map((submission) => asNumber(submission.userId)));
  const allScores = bestSubmissions.map((submission) =>
    percent(asNumber(submission.totalScore), asNumber(submission.maxScore))
  );

  return {
    summary: {
      eligibleStudents: allEligibleIds.size,
      activeStudents: allCompletedIds.size,
      completedWorks: bestSubmissions.length,
      averageScore: allScores.length > 0
        ? Math.round(allScores.reduce((sum, score) => sum + score, 0) / allScores.length)
        : 0,
    },
    subjects,
  };
}

async function getAdminHomeworkAnalytics() {
  const [homeworks, bestSubmissions, errorRows] = await Promise.all([
    sequelize.query(`
      SELECT
        h.id,
        h.title,
        h."subjectId",
        h."openDate",
        h."closeDate",
        s.name AS "subjectName",
        s.icon AS "subjectIcon",
        COUNT(DISTINCT us."userId") FILTER (
          WHERE us."isActive" = true AND u.role = 'student' AND u."isActive" = true
        )::int AS "eligibleStudents",
        COALESCE(
          ARRAY_AGG(DISTINCT us."userId") FILTER (
            WHERE us."isActive" = true AND u.role = 'student' AND u."isActive" = true
          ),
          ARRAY[]::integer[]
        ) AS "eligibleStudentIds"
      FROM homeworks h
      JOIN subjects s ON s.id = h."subjectId"
      LEFT JOIN user_subjects us ON us."subjectId" = h."subjectId"
      LEFT JOIN users u ON u.id = us."userId"
      GROUP BY h.id, s.id
      ORDER BY h."createdAt" DESC
    `, { type: QueryTypes.SELECT }),
    sequelize.query(`
      SELECT DISTINCT ON (hs."homeworkId", hs."userId")
        hs.id,
        hs."homeworkId",
        hs."userId",
        hs."totalScore",
        hs."maxScore",
        hs."correctCount",
        hs."attemptNumber",
        hs."submittedAt",
        u."firstName",
        u."lastName",
        u."telegramUsername"
      FROM homework_submissions hs
      JOIN homeworks h ON h.id = hs."homeworkId"
      JOIN users u ON u.id = hs."userId" AND u.role = 'student' AND u."isActive" = true
      JOIN user_subjects us ON us."userId" = hs."userId"
        AND us."subjectId" = h."subjectId" AND us."isActive" = true
      ORDER BY hs."homeworkId", hs."userId",
        CASE WHEN hs."maxScore" > 0 THEN hs."totalScore"::numeric / hs."maxScore" ELSE 0 END DESC,
        hs."submittedAt" DESC,
        hs.id DESC
    `, { type: QueryTypes.SELECT }),
    sequelize.query(`
      WITH ranked AS (
        SELECT
          hs.id,
          hs."homeworkId",
          ROW_NUMBER() OVER (
            PARTITION BY hs."homeworkId", hs."userId"
            ORDER BY
              CASE WHEN hs."maxScore" > 0 THEN hs."totalScore"::numeric / hs."maxScore" ELSE 0 END DESC,
              hs."submittedAt" DESC,
              hs.id DESC
          ) AS rank
        FROM homework_submissions hs
        JOIN homeworks h ON h.id = hs."homeworkId"
        JOIN users u ON u.id = hs."userId" AND u.role = 'student' AND u."isActive" = true
        JOIN user_subjects us ON us."userId" = hs."userId"
          AND us."subjectId" = h."subjectId" AND us."isActive" = true
      )
      SELECT
        q."homeworkId",
        q.id AS "questionId",
        q."questionText",
        COUNT(ha.id)::int AS "answerCount",
        COUNT(ha.id) FILTER (WHERE ha."isCorrect" = false)::int AS "errorCount"
      FROM homework_questions q
      LEFT JOIN ranked r ON r."homeworkId" = q."homeworkId" AND r.rank = 1
      LEFT JOIN homework_answers ha ON ha."submissionId" = r.id AND ha."questionId" = q.id
      GROUP BY q."homeworkId", q.id
      HAVING COUNT(ha.id) > 0
    `, { type: QueryTypes.SELECT }),
  ]);

  return groupHomeworkRows(homeworks, bestSubmissions, errorRows);
}

function groupPracticeRows(subjectRows, topicRows, questionRows, summaryRow = {}) {
  const topicsBySubject = new Map();
  topicRows.forEach((row) => {
    const key = asNumber(row.subjectId);
    if (!topicsBySubject.has(key)) topicsBySubject.set(key, []);
    topicsBySubject.get(key).push({
      topicId: asNumber(row.topicId),
      name: row.topicName || 'Без темы',
      icon: row.topicIcon || '📝',
      attempts: asNumber(row.attempts),
      errorCount: asNumber(row.errorCount),
      affectedStudents: asNumber(row.affectedStudents),
    });
  });

  const questionsBySubject = new Map();
  questionRows.forEach((row) => {
    const key = asNumber(row.subjectId);
    if (!questionsBySubject.has(key)) questionsBySubject.set(key, []);
    questionsBySubject.get(key).push({
      questionId: asNumber(row.questionId),
      topicId: asNumber(row.topicId),
      topicName: row.topicName || 'Без темы',
      questionText: row.questionText || 'Задание с изображением',
      attempts: asNumber(row.attempts),
      errorCount: asNumber(row.errorCount),
      affectedStudents: asNumber(row.affectedStudents),
    });
  });

  return {
    summary: {
      eligibleStudents: asNumber(summaryRow.eligibleStudents),
      activeStudents: asNumber(summaryRow.activeStudents),
      todayStudents: asNumber(summaryRow.todayStudents),
      totalAttempts: asNumber(summaryRow.totalAttempts),
      accuracy: percent(asNumber(summaryRow.correctAttempts), asNumber(summaryRow.totalAttempts)),
    },
    subjects: subjectRows.map((row) => ({
      subject: {
        id: asNumber(row.subjectId),
        name: row.subjectName || 'Без предмета',
        icon: row.subjectIcon || '📖',
      },
      eligibleStudents: asNumber(row.eligibleStudents),
      activeStudents: asNumber(row.activeStudents),
      activePercent: percent(asNumber(row.activeStudents), asNumber(row.eligibleStudents)),
      todayStudents: asNumber(row.todayStudents),
      todayAttempts: asNumber(row.todayAttempts),
      totalAttempts: asNumber(row.totalAttempts),
      accuracy: percent(asNumber(row.correctAttempts), asNumber(row.totalAttempts)),
      problemTopics: rankProblems(topicsBySubject.get(asNumber(row.subjectId)) || []),
      problemQuestions: rankProblems(questionsBySubject.get(asNumber(row.subjectId)) || []),
    })),
  };
}

async function getAdminPracticeAnalytics() {
  const timeZone = process.env.APP_TIMEZONE || 'Europe/Minsk';
  const replacements = { timeZone };
  const [subjectRows, topicRows, questionRows, summaryRows] = await Promise.all([
    sequelize.query(`
      WITH eligible AS (
        SELECT us."subjectId", COUNT(DISTINCT us."userId")::int AS students
        FROM user_subjects us
        JOIN users u ON u.id = us."userId"
        WHERE us."isActive" = true AND u.role = 'student' AND u."isActive" = true
        GROUP BY us."subjectId"
      ), totals AS (
        SELECT
          pst."subjectId",
          SUM(pst."totalAttempts")::int AS total,
          SUM(pst."totalCorrect")::int AS correct,
          COUNT(DISTINCT pst."studentId") FILTER (WHERE pst."totalAttempts" > 0)::int AS active
        FROM practice_student_totals pst
        JOIN users u ON u.id = pst."studentId" AND u.role = 'student' AND u."isActive" = true
        JOIN user_subjects us ON us."userId" = pst."studentId"
          AND us."subjectId" = pst."subjectId" AND us."isActive" = true
        GROUP BY pst."subjectId"
      ), today AS (
        SELECT
          pds."subjectId",
          SUM(pds.attempts)::int AS attempts,
          COUNT(DISTINCT pds."studentId") FILTER (WHERE pds.attempts > 0)::int AS students
        FROM practice_daily_stats pds
        JOIN users u ON u.id = pds."studentId" AND u.role = 'student' AND u."isActive" = true
        JOIN user_subjects us ON us."userId" = pds."studentId"
          AND us."subjectId" = pds."subjectId" AND us."isActive" = true
        WHERE pds.date = timezone(:timeZone, CURRENT_TIMESTAMP)::date
        GROUP BY pds."subjectId"
      )
      SELECT
        s.id AS "subjectId",
        s.name AS "subjectName",
        s.icon AS "subjectIcon",
        COALESCE(e.students, 0)::int AS "eligibleStudents",
        COALESCE(st.active, 0)::int AS "activeStudents",
        COALESCE(st.total, 0)::int AS "totalAttempts",
        COALESCE(st.correct, 0)::int AS "correctAttempts",
        COALESCE(td.attempts, 0)::int AS "todayAttempts",
        COALESCE(td.students, 0)::int AS "todayStudents"
      FROM subjects s
      LEFT JOIN eligible e ON e."subjectId" = s.id
      LEFT JOIN totals st ON st."subjectId" = s.id
      LEFT JOIN today td ON td."subjectId" = s.id
      WHERE COALESCE(e.students, 0) > 0 OR COALESCE(st.total, 0) > 0
      ORDER BY s.name
    `, { type: QueryTypes.SELECT, replacements }),
    sequelize.query(`
      SELECT
        ptt."subjectId",
        ptt."topicId",
        t.name AS "topicName",
        t.icon AS "topicIcon",
        SUM(ptt."totalAttempts")::int AS attempts,
        SUM(ptt."totalWrong")::int AS "errorCount",
        COUNT(DISTINCT ptt."studentId") FILTER (WHERE ptt."totalWrong" > 0)::int AS "affectedStudents"
      FROM practice_topic_totals ptt
      JOIN practice_topics t ON t.id = ptt."topicId"
      JOIN users u ON u.id = ptt."studentId" AND u.role = 'student' AND u."isActive" = true
      JOIN user_subjects us ON us."userId" = ptt."studentId"
        AND us."subjectId" = ptt."subjectId" AND us."isActive" = true
      GROUP BY ptt."subjectId", ptt."topicId", t.id
      HAVING SUM(ptt."totalAttempts") > 0
    `, { type: QueryTypes.SELECT }),
    sequelize.query(`
      SELECT
        pqr."subjectId",
        pqr."topicId",
        pqr."questionId",
        t.name AS "topicName",
        q."questionText",
        COUNT(*)::int AS attempts,
        COUNT(*) FILTER (WHERE pqr."isCorrect" = false)::int AS "errorCount",
        COUNT(DISTINCT pqr."studentId") FILTER (WHERE pqr."isCorrect" = false)::int AS "affectedStudents"
      FROM practice_question_results pqr
      JOIN practice_topics t ON t.id = pqr."topicId"
      JOIN practice_questions q ON q.id = pqr."questionId"
      JOIN users u ON u.id = pqr."studentId" AND u.role = 'student' AND u."isActive" = true
      JOIN user_subjects us ON us."userId" = pqr."studentId"
        AND us."subjectId" = pqr."subjectId" AND us."isActive" = true
      GROUP BY pqr."subjectId", pqr."topicId", pqr."questionId", t.id, q.id
    `, { type: QueryTypes.SELECT }),
    sequelize.query(`
      SELECT
        (SELECT COUNT(DISTINCT u.id) FROM users u
          JOIN user_subjects us ON us."userId" = u.id
          WHERE u.role = 'student' AND u."isActive" = true AND us."isActive" = true
        )::int AS "eligibleStudents",
        (SELECT COUNT(DISTINCT pst."studentId")
          FROM practice_student_totals pst
          JOIN users u ON u.id = pst."studentId"
          WHERE u.role = 'student' AND u."isActive" = true AND pst."totalAttempts" > 0
            AND EXISTS (
              SELECT 1 FROM user_subjects us
              WHERE us."userId" = pst."studentId"
                AND us."subjectId" = pst."subjectId"
                AND us."isActive" = true
            )
        )::int AS "activeStudents",
        (SELECT COUNT(DISTINCT pds."studentId")
          FROM practice_daily_stats pds
          JOIN users u ON u.id = pds."studentId"
          WHERE u.role = 'student' AND u."isActive" = true
            AND pds.date = timezone(:timeZone, CURRENT_TIMESTAMP)::date
            AND pds.attempts > 0
            AND EXISTS (
              SELECT 1 FROM user_subjects us
              WHERE us."userId" = pds."studentId"
                AND us."subjectId" = pds."subjectId"
                AND us."isActive" = true
            )
        )::int AS "todayStudents",
        COALESCE((SELECT SUM(pst."totalAttempts")
          FROM practice_student_totals pst
          JOIN users u ON u.id = pst."studentId"
          WHERE u.role = 'student' AND u."isActive" = true
            AND EXISTS (
              SELECT 1 FROM user_subjects us
              WHERE us."userId" = pst."studentId"
                AND us."subjectId" = pst."subjectId"
                AND us."isActive" = true
            )
        ), 0)::int AS "totalAttempts",
        COALESCE((SELECT SUM(pst."totalCorrect")
          FROM practice_student_totals pst
          JOIN users u ON u.id = pst."studentId"
          WHERE u.role = 'student' AND u."isActive" = true
            AND EXISTS (
              SELECT 1 FROM user_subjects us
              WHERE us."userId" = pst."studentId"
                AND us."subjectId" = pst."subjectId"
                AND us."isActive" = true
            )
        ), 0)::int AS "correctAttempts"
    `, { type: QueryTypes.SELECT, replacements }),
  ]);

  return groupPracticeRows(subjectRows, topicRows, questionRows, summaryRows[0] || {});
}

module.exports = {
  getAdminHomeworkAnalytics,
  getAdminPracticeAnalytics,
  groupHomeworkRows,
  groupPracticeRows,
  rankProblems,
};
