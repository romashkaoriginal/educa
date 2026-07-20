const { Op, QueryTypes } = require('sequelize');
const sequelize = require('../config/database');
const {
  PracticeAttempt,
  PracticeQuestion,
  PracticeTopic,
  PracticeQuestionResult,
  PracticeStudentTotals,
  PracticeDailyStats,
  PracticeTopicTotals,
  PracticeDifficultyTotals,
  PracticeModeTotals,
  PracticeRecentError
} = require('../models');
const { CONFIG } = require('./predictedScore');
const { buildRecentErrorPayload } = require('../utils/practiceAnswerText');

const APP_TIMEZONE = 'Europe/Minsk';
const RECENT_ERRORS_LIMIT = 8;
const VALID_MODES = ['general', 'weak', 'topic'];
const VALID_DIFFICULTIES = ['easy', 'medium', 'hard'];

function getLocalDateStr(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: APP_TIMEZONE }).format(date);
}

function normalizeMode(mode) {
  return VALID_MODES.includes(mode) ? mode : 'general';
}

function normalizeDifficulty(difficulty) {
  return VALID_DIFFICULTIES.includes(difficulty) ? difficulty : 'medium';
}

function buildAttemptFilter(studentId, subjectId) {
  const where = {};
  if (studentId != null && studentId !== '') where.studentId = parseInt(studentId, 10);
  if (subjectId != null && subjectId !== '') where.subjectId = parseInt(subjectId, 10);
  return where;
}

async function trimRecentErrors(studentId, subjectId, transaction) {
  const rows = await PracticeRecentError.findAll({
    where: { studentId, subjectId },
    attributes: ['id'],
    order: [['answeredAt', 'DESC']],
    offset: RECENT_ERRORS_LIMIT,
    transaction
  });
  if (!rows.length) return 0;
  return PracticeRecentError.destroy({
    where: { id: { [Op.in]: rows.map((r) => r.id) } },
    transaction
  });
}

async function recordPracticeStatsIncrement({
  studentId,
  subjectId,
  topicId,
  questionId,
  isCorrect,
  difficulty,
  practiceMode,
  selectedAnswer = 0,
  answeredAt = new Date()
}) {
  const sid = parseInt(studentId, 10);
  const subId = parseInt(subjectId, 10);
  const tid = parseInt(topicId, 10);
  const qid = parseInt(questionId, 10);
  const correct = !!isCorrect;
  const mode = normalizeMode(practiceMode);
  const diff = normalizeDifficulty(difficulty);
  const dateStr = getLocalDateStr(answeredAt);

  await ensurePracticeStatsReady(sid, subId);

  await sequelize.transaction(async (transaction) => {
    const [totals] = await PracticeStudentTotals.findOrCreate({
      where: { studentId: sid, subjectId: subId },
      defaults: {
        studentId: sid,
        subjectId: subId,
        totalAttempts: 0,
        totalCorrect: 0,
        totalWrong: 0,
        practiceDays: 0,
        bestStreakEver: 0,
        correctStreak: 0,
        statsMigratedAt: new Date()
      },
      transaction
    });

    if (!totals.statsMigratedAt) {
      totals.statsMigratedAt = new Date();
    }

    totals.totalAttempts += 1;
    if (correct) totals.totalCorrect += 1;
    else totals.totalWrong += 1;
    totals.correctStreak = correct ? (totals.correctStreak || 0) + 1 : 0;
    if (!totals.firstPracticeAt) totals.firstPracticeAt = answeredAt;
    totals.lastPracticeAt = answeredAt;
    await totals.save({ transaction });

    const [daily, dailyCreated] = await PracticeDailyStats.findOrCreate({
      where: { studentId: sid, subjectId: subId, date: dateStr },
      defaults: {
        studentId: sid,
        subjectId: subId,
        date: dateStr,
        attempts: 0,
        correct: 0,
        wrong: 0,
        goalCompleted: false
      },
      transaction
    });

    daily.attempts += 1;
    if (correct) daily.correct += 1;
    else daily.wrong += 1;
    daily.goalCompleted = daily.correct >= CONFIG.DAILY_GOAL;
    await daily.save({ transaction });

    if (dailyCreated) {
      totals.practiceDays = (totals.practiceDays || 0) + 1;
      await totals.save({ transaction });
    }

    const [topicTotals, topicCreated] = await PracticeTopicTotals.findOrCreate({
      where: { studentId: sid, topicId: tid },
      defaults: {
        studentId: sid,
        topicId: tid,
        subjectId: subId,
        totalAttempts: 0,
        totalCorrect: 0,
        totalWrong: 0,
        lastPracticeAt: answeredAt
      },
      transaction
    });
    topicTotals.totalAttempts += 1;
    if (correct) topicTotals.totalCorrect += 1;
    else topicTotals.totalWrong += 1;
    topicTotals.lastPracticeAt = answeredAt;
    topicTotals.subjectId = subId;
    await topicTotals.save({ transaction });

    const [diffTotals] = await PracticeDifficultyTotals.findOrCreate({
      where: { studentId: sid, subjectId: subId, difficulty: diff },
      defaults: {
        studentId: sid,
        subjectId: subId,
        difficulty: diff,
        totalAttempts: 0,
        totalCorrect: 0
      },
      transaction
    });
    diffTotals.totalAttempts += 1;
    if (correct) diffTotals.totalCorrect += 1;
    await diffTotals.save({ transaction });

    const [modeTotals] = await PracticeModeTotals.findOrCreate({
      where: { studentId: sid, subjectId: subId, practiceMode: mode },
      defaults: {
        studentId: sid,
        subjectId: subId,
        practiceMode: mode,
        totalAttempts: 0,
        totalCorrect: 0
      },
      transaction
    });
    modeTotals.totalAttempts += 1;
    if (correct) modeTotals.totalCorrect += 1;
    await modeTotals.save({ transaction });

    if (!correct) {
      await PracticeRecentError.create({
        studentId: sid,
        subjectId: subId,
        questionId: qid,
        topicId: tid,
        answeredAt,
        // selectedAnswer — массив индексов (multiple choice); поддерживаем и старый
        // скалярный вызов на переходный период.
        selectedAnswer: Array.isArray(selectedAnswer) ? selectedAnswer : [selectedAnswer]
      }, { transaction });
      await trimRecentErrors(sid, subId, transaction);
    }
  });
}

async function clearAggregatesForScope(studentId, subjectId, transaction) {
  const where = buildAttemptFilter(studentId, subjectId);

  const [studentTotals, dailyStats, topicTotals, diffTotals, modeTotals, recentErrors] = await Promise.all([
    PracticeStudentTotals.destroy({ where, transaction }),
    PracticeDailyStats.destroy({ where, transaction }),
    PracticeTopicTotals.destroy({ where, transaction }),
    PracticeDifficultyTotals.destroy({ where, transaction }),
    PracticeModeTotals.destroy({ where, transaction }),
    PracticeRecentError.destroy({ where, transaction })
  ]);

  return { studentTotals, dailyStats, topicTotals, diffTotals, modeTotals, recentErrors };
}

function sqlScopeClause(studentId, subjectId, alias = 'pa') {
  const parts = [];
  const replacements = {};
  if (studentId != null && studentId !== '') {
    parts.push(`"${alias}"."studentId" = :studentId`);
    replacements.studentId = parseInt(studentId, 10);
  }
  if (subjectId != null && subjectId !== '') {
    parts.push(`"${alias}"."subjectId" = :subjectId`);
    replacements.subjectId = parseInt(subjectId, 10);
  }
  const clause = parts.length ? `WHERE ${parts.join(' AND ')}` : '';
  return { clause, replacements };
}

async function ensureAggregateTables() {
  const models = [
    PracticeStudentTotals,
    PracticeDailyStats,
    PracticeTopicTotals,
    PracticeDifficultyTotals,
    PracticeModeTotals,
    PracticeRecentError
  ];
  for (const model of models) {
    await model.sync({ alter: true });
  }
}

async function migrateDifficultyTotals({ clause, replacements, transaction }) {
  const diffRows = await sequelize.query(`
    SELECT
      pa."studentId",
      pa."subjectId",
      COALESCE(pq.difficulty::text, 'medium') AS difficulty,
      COUNT(*)::int AS "totalAttempts",
      COUNT(*) FILTER (WHERE pa."isCorrect")::int AS "totalCorrect"
    FROM practice_attempts pa
    LEFT JOIN practice_questions pq ON pq.id = pa."questionId"
    ${clause}
    GROUP BY pa."studentId", pa."subjectId", COALESCE(pq.difficulty::text, 'medium')
  `, { replacements, transaction, type: QueryTypes.SELECT });

  let count = 0;
  for (const row of diffRows) {
    const difficulty = normalizeDifficulty(row.difficulty);
    await PracticeDifficultyTotals.upsert({
      studentId: row.studentId,
      subjectId: row.subjectId,
      difficulty,
      totalAttempts: row.totalAttempts || 0,
      totalCorrect: row.totalCorrect || 0
    }, { transaction });
    count += 1;
  }
  return count;
}

async function getMigrateVerification(studentId, subjectId) {
  const where = buildAttemptFilter(studentId, subjectId);
  const attemptsWhere = { ...where };

  const [
    attemptsRemaining,
    studentTotals,
    dailyStats,
    topicTotals,
    difficultyTotals,
    modeTotals,
    recentErrors,
    sampleTotals
  ] = await Promise.all([
    PracticeAttempt.count({ where: attemptsWhere }),
    PracticeStudentTotals.count({ where }),
    PracticeDailyStats.count({ where }),
    PracticeTopicTotals.count({ where }),
    PracticeDifficultyTotals.count({ where }),
    PracticeModeTotals.count({ where }),
    PracticeRecentError.count({ where }),
    PracticeStudentTotals.findAll({
      where,
      attributes: ['studentId', 'subjectId', 'totalAttempts', 'totalCorrect', 'statsMigratedAt'],
      order: [['totalAttempts', 'DESC']],
      limit: 5,
      raw: true
    })
  ]);

  return {
    attemptsRemaining,
    cleaned: studentTotals > 0 && attemptsRemaining === 0,
    aggregateRows: {
      studentTotals,
      dailyStats,
      topicTotals,
      difficultyTotals,
      modeTotals,
      recentErrors
    },
    activeSubjects: studentTotals,
    samples: sampleTotals,
    ok: studentTotals > 0
  };
}

async function getExistingMigratedAttemptSum(studentId, subjectId) {
  const rows = await PracticeStudentTotals.findAll({
    where: buildAttemptFilter(studentId, subjectId),
    attributes: ['totalAttempts'],
    raw: true
  });
  return rows.reduce((sum, row) => sum + (parseInt(row.totalAttempts, 10) || 0), 0);
}

async function syncAggregatesFromAttempts({
  studentId,
  subjectId,
  clearExisting = false,
  deleteAttemptsAfter = false
} = {}) {
  await ensureAggregateTables();

  const attemptFilter = buildAttemptFilter(studentId, subjectId);
  const attemptCount = await PracticeAttempt.count({ where: attemptFilter });
  if (attemptCount === 0) {
    return { synced: false, attemptCount: 0 };
  }

  const { clause, replacements } = sqlScopeClause(studentId, subjectId, 'pa');

  const synced = await sequelize.transaction(async (transaction) => {
    if (clearExisting) {
      await clearAggregatesForScope(studentId, subjectId, transaction);
    }

    const [, studentMeta] = await sequelize.query(`
      INSERT INTO practice_student_totals (
        "studentId", "subjectId", "totalAttempts", "totalCorrect", "totalWrong",
        "practiceDays", "bestStreakEver", "correctStreak", "firstPracticeAt", "lastPracticeAt", "statsMigratedAt",
        "createdAt", "updatedAt"
      )
      SELECT
        pa."studentId",
        pa."subjectId",
        COUNT(*)::int,
        COUNT(*) FILTER (WHERE pa."isCorrect")::int,
        COUNT(*) FILTER (WHERE NOT pa."isCorrect")::int,
        COUNT(DISTINCT (pa."createdAt" AT TIME ZONE '${APP_TIMEZONE}')::date)::int,
        0,
        0,
        MIN(pa."createdAt"),
        MAX(pa."createdAt"),
        NOW(),
        NOW(),
        NOW()
      FROM practice_attempts pa
      ${clause}
      GROUP BY pa."studentId", pa."subjectId"
      ON CONFLICT ("studentId", "subjectId") DO UPDATE SET
        "totalAttempts" = EXCLUDED."totalAttempts",
        "totalCorrect" = EXCLUDED."totalCorrect",
        "totalWrong" = EXCLUDED."totalWrong",
        "practiceDays" = EXCLUDED."practiceDays",
        "firstPracticeAt" = EXCLUDED."firstPracticeAt",
        "lastPracticeAt" = EXCLUDED."lastPracticeAt",
        "statsMigratedAt" = NOW(),
        "updatedAt" = NOW()
    `, { replacements, transaction });

    const [, dailyMeta] = await sequelize.query(`
      INSERT INTO practice_daily_stats (
        "studentId", "subjectId", date, attempts, correct, wrong, "goalCompleted",
        "createdAt", "updatedAt"
      )
      SELECT
        pa."studentId",
        pa."subjectId",
        (pa."createdAt" AT TIME ZONE '${APP_TIMEZONE}')::date,
        COUNT(*)::int,
        COUNT(*) FILTER (WHERE pa."isCorrect")::int,
        COUNT(*) FILTER (WHERE NOT pa."isCorrect")::int,
        (COUNT(*) FILTER (WHERE pa."isCorrect")::int >= ${CONFIG.DAILY_GOAL}),
        NOW(),
        NOW()
      FROM practice_attempts pa
      ${clause}
      GROUP BY pa."studentId", pa."subjectId", (pa."createdAt" AT TIME ZONE '${APP_TIMEZONE}')::date
      ON CONFLICT ("studentId", "subjectId", date) DO UPDATE SET
        attempts = EXCLUDED.attempts,
        correct = EXCLUDED.correct,
        wrong = EXCLUDED.wrong,
        "goalCompleted" = EXCLUDED."goalCompleted",
        "updatedAt" = NOW()
    `, { replacements, transaction });

    const [, topicMeta] = await sequelize.query(`
      INSERT INTO practice_topic_totals (
        "studentId", "topicId", "subjectId", "totalAttempts", "totalCorrect", "totalWrong",
        "lastPracticeAt", "createdAt", "updatedAt"
      )
      SELECT
        pa."studentId",
        pa."topicId",
        pa."subjectId",
        COUNT(*)::int,
        COUNT(*) FILTER (WHERE pa."isCorrect")::int,
        COUNT(*) FILTER (WHERE NOT pa."isCorrect")::int,
        MAX(pa."createdAt"),
        NOW(),
        NOW()
      FROM practice_attempts pa
      ${clause}
      GROUP BY pa."studentId", pa."topicId", pa."subjectId"
      ON CONFLICT ("studentId", "topicId") DO UPDATE SET
        "totalAttempts" = EXCLUDED."totalAttempts",
        "totalCorrect" = EXCLUDED."totalCorrect",
        "totalWrong" = EXCLUDED."totalWrong",
        "lastPracticeAt" = EXCLUDED."lastPracticeAt",
        "subjectId" = EXCLUDED."subjectId",
        "updatedAt" = NOW()
    `, { replacements, transaction });

    const difficultyTotals = await migrateDifficultyTotals({ clause, replacements, transaction });

    const [, modeMeta] = await sequelize.query(`
      INSERT INTO practice_mode_totals (
        "studentId", "subjectId", "practiceMode", "totalAttempts", "totalCorrect",
        "createdAt", "updatedAt"
      )
      SELECT
        pa."studentId",
        pa."subjectId",
        CASE
          WHEN pa."practiceMode" IN ('general', 'weak', 'topic') THEN pa."practiceMode"
          ELSE 'general'
        END,
        COUNT(*)::int,
        COUNT(*) FILTER (WHERE pa."isCorrect")::int,
        NOW(),
        NOW()
      FROM practice_attempts pa
      ${clause}
      GROUP BY pa."studentId", pa."subjectId",
        CASE
          WHEN pa."practiceMode" IN ('general', 'weak', 'topic') THEN pa."practiceMode"
          ELSE 'general'
        END
      ON CONFLICT ("studentId", "subjectId", "practiceMode") DO UPDATE SET
        "totalAttempts" = EXCLUDED."totalAttempts",
        "totalCorrect" = EXCLUDED."totalCorrect",
        "updatedAt" = NOW()
    `, { replacements, transaction });

    const [, recentMeta] = await sequelize.query(`
      INSERT INTO practice_recent_errors (
        "studentId", "subjectId", "questionId", "topicId", "answeredAt", "selectedAnswer", "createdAt", "updatedAt"
      )
      SELECT
        ranked."studentId",
        ranked."subjectId",
        ranked."questionId",
        ranked."topicId",
        ranked."createdAt",
        ranked."selectedAnswer",
        NOW(),
        NOW()
      FROM (
        SELECT
          pa.*,
          ROW_NUMBER() OVER (
            PARTITION BY pa."studentId", pa."subjectId"
            ORDER BY pa."createdAt" DESC
          ) AS rn
        FROM practice_attempts pa
        ${clause ? `${clause} AND pa."isCorrect" = false` : 'WHERE pa."isCorrect" = false'}
      ) ranked
      WHERE ranked.rn <= ${RECENT_ERRORS_LIMIT}
    `, { replacements, transaction });

    await updateCorrectStreaksFromAttempts(studentId, subjectId, transaction);

    let attemptsDeleted = 0;
    if (deleteAttemptsAfter) {
      attemptsDeleted = await PracticeAttempt.destroy({
        where: attemptFilter,
        transaction
      });
    }

    return {
      studentTotals: studentMeta?.rowCount ?? 0,
      dailyStats: dailyMeta?.rowCount ?? 0,
      topicTotals: topicMeta?.rowCount ?? 0,
      difficultyTotals,
      modeTotals: modeMeta?.rowCount ?? 0,
      recentErrors: recentMeta?.rowCount ?? 0,
      attemptsDeleted
    };
  });

  return { synced: true, attemptCount, ...synced };
}

async function ensurePracticeStatsReady(studentId, subjectId) {
  const sid = parseInt(studentId, 10);
  const subId = parseInt(subjectId, 10);

  const existing = await PracticeStudentTotals.findOne({
    where: { studentId: sid, subjectId: subId },
    attributes: ['id']
  });
  if (existing) return true;

  const attemptCount = await PracticeAttempt.count({
    where: { studentId: sid, subjectId: subId }
  });
  if (attemptCount > 0) {
    await syncAggregatesFromAttempts({
      studentId: sid,
      subjectId: subId,
      clearExisting: false,
      deleteAttemptsAfter: false
    });
    return true;
  }

  const resultCount = await PracticeQuestionResult.count({
    where: { studentId: sid, subjectId: subId }
  });
  if (resultCount > 0) {
    const rebuilt = await rebuildPracticeStatsFromResults({ studentId: sid, subjectId: subId });
    return rebuilt.success;
  }

  return false;
}

async function migratePracticeStatsFromAttempts({ studentId, subjectId } = {}) {
  const attemptFilter = buildAttemptFilter(studentId, subjectId);
  const attemptCount = await PracticeAttempt.count({ where: attemptFilter });
  if (attemptCount === 0) {
    const verification = await getMigrateVerification(studentId, subjectId);
    if (verification.activeSubjects > 0) {
      return {
        success: true,
        attemptCount: 0,
        skipped: true,
        message: 'Сводки уже актуальны. Старых попыток для очистки нет.',
        verification
      };
    }
    return {
      success: true,
      attemptCount: 0,
      message: 'Нет попыток для очистки',
      verification
    };
  }

  const existingAttempts = await getExistingMigratedAttemptSum(studentId, subjectId);

  if (existingAttempts > 0 && existingAttempts >= attemptCount) {
    const attemptsDeleted = await PracticeAttempt.destroy({ where: attemptFilter });
    const verification = await getMigrateVerification(studentId, subjectId);
    return {
      success: true,
      attemptCount,
      migrated: { attemptsDeleted },
      verification
    };
  }

  if (existingAttempts > attemptCount) {
    const err = new Error(
      `Очистка отменена: в сводках ${existingAttempts} попыток, в базе осталось ${attemptCount}. ` +
      'Используйте «Восстановить сводки из результатов».'
    );
    err.code = 'MIGRATE_ALREADY_DONE';
    throw err;
  }

  const migrated = await syncAggregatesFromAttempts({
    studentId,
    subjectId,
    clearExisting: existingAttempts > 0,
    deleteAttemptsAfter: true
  });

  const verification = await getMigrateVerification(studentId, subjectId);

  return {
    success: true,
    attemptCount,
    migrated,
    verification
  };
}

async function migrateDifficultyTotalsFromResults({ clause, replacements, transaction }) {
  const diffRows = await sequelize.query(`
    SELECT
      pqr."studentId",
      pqr."subjectId",
      COALESCE(pq.difficulty::text, 'medium') AS difficulty,
      SUM(pqr.attempts)::int AS "totalAttempts",
      SUM(CASE WHEN pqr."isCorrect" THEN pqr.attempts ELSE 0 END)::int AS "totalCorrect"
    FROM practice_question_results pqr
    LEFT JOIN practice_questions pq ON pq.id = pqr."questionId"
    ${clause}
    GROUP BY pqr."studentId", pqr."subjectId", COALESCE(pq.difficulty::text, 'medium')
  `, { replacements, transaction, type: QueryTypes.SELECT });

  let count = 0;
  for (const row of diffRows) {
    const difficulty = normalizeDifficulty(row.difficulty);
    await PracticeDifficultyTotals.upsert({
      studentId: row.studentId,
      subjectId: row.subjectId,
      difficulty,
      totalAttempts: row.totalAttempts || 0,
      totalCorrect: row.totalCorrect || 0
    }, { transaction });
    count += 1;
  }
  return count;
}

async function rebuildPracticeStatsFromResults({ studentId, subjectId } = {}) {
  await ensureAggregateTables();

  const resultFilter = buildAttemptFilter(studentId, subjectId);
  const resultCount = await PracticeQuestionResult.count({ where: resultFilter });
  if (resultCount === 0) {
    return {
      success: false,
      resultCount: 0,
      message: 'Нет результатов по заданиям для восстановления'
    };
  }

  const { clause: pqrClause, replacements } = sqlScopeClause(studentId, subjectId, 'pqr');
  const { clause: pdlClause } = sqlScopeClause(studentId, subjectId, 'pdl');

  const rebuilt = await sequelize.transaction(async (transaction) => {
    await clearAggregatesForScope(studentId, subjectId, transaction);

    const [, studentMeta] = await sequelize.query(`
      INSERT INTO practice_student_totals (
        "studentId", "subjectId", "totalAttempts", "totalCorrect", "totalWrong",
        "practiceDays", "bestStreakEver", "correctStreak", "firstPracticeAt", "lastPracticeAt", "statsMigratedAt",
        "createdAt", "updatedAt"
      )
      SELECT
        pqr."studentId",
        pqr."subjectId",
        SUM(pqr.attempts)::int,
        GREATEST(
          COALESCE(logs.correct_sum, 0),
          SUM(CASE WHEN pqr."isCorrect" THEN pqr.attempts ELSE 0 END)::int
        ),
        GREATEST(
          SUM(pqr.attempts)::int - GREATEST(
            COALESCE(logs.correct_sum, 0),
            SUM(CASE WHEN pqr."isCorrect" THEN pqr.attempts ELSE 0 END)::int
          ),
          0
        ),
        GREATEST(COALESCE(logs.day_count, 0), COUNT(DISTINCT (pqr."updatedAt" AT TIME ZONE '${APP_TIMEZONE}')::date)::int),
        0,
        0,
        MIN(pqr."createdAt"),
        MAX(pqr."updatedAt"),
        NOW(),
        NOW(),
        NOW()
      FROM practice_question_results pqr
      LEFT JOIN (
        SELECT
          pdl."studentId",
          pdl."subjectId",
          SUM(pdl."attemptsCount")::int AS correct_sum,
          COUNT(DISTINCT pdl.date)::int AS day_count
        FROM practice_daily_logs pdl
        ${pdlClause}
        GROUP BY pdl."studentId", pdl."subjectId"
      ) logs ON logs."studentId" = pqr."studentId" AND logs."subjectId" = pqr."subjectId"
      ${pqrClause}
      GROUP BY pqr."studentId", pqr."subjectId", logs.correct_sum, logs.day_count
      ON CONFLICT ("studentId", "subjectId") DO UPDATE SET
        "totalAttempts" = EXCLUDED."totalAttempts",
        "totalCorrect" = EXCLUDED."totalCorrect",
        "totalWrong" = EXCLUDED."totalWrong",
        "practiceDays" = EXCLUDED."practiceDays",
        "firstPracticeAt" = EXCLUDED."firstPracticeAt",
        "lastPracticeAt" = EXCLUDED."lastPracticeAt",
        "statsMigratedAt" = NOW(),
        "updatedAt" = NOW()
    `, { replacements, transaction });

    const [, dailyMeta] = await sequelize.query(`
      INSERT INTO practice_daily_stats (
        "studentId", "subjectId", date, attempts, correct, wrong, "goalCompleted",
        "createdAt", "updatedAt"
      )
      SELECT
        pdl."studentId",
        pdl."subjectId",
        pdl.date,
        GREATEST(pdl."attemptsCount", 1)::int,
        pdl."attemptsCount"::int,
        0,
        (pdl."attemptsCount" >= ${CONFIG.DAILY_GOAL}),
        NOW(),
        NOW()
      FROM practice_daily_logs pdl
      ${pdlClause}
      ON CONFLICT ("studentId", "subjectId", date) DO UPDATE SET
        attempts = EXCLUDED.attempts,
        correct = EXCLUDED.correct,
        wrong = EXCLUDED.wrong,
        "goalCompleted" = EXCLUDED."goalCompleted",
        "updatedAt" = NOW()
    `, { replacements, transaction });

    const [, topicMeta] = await sequelize.query(`
      INSERT INTO practice_topic_totals (
        "studentId", "topicId", "subjectId", "totalAttempts", "totalCorrect", "totalWrong",
        "lastPracticeAt", "createdAt", "updatedAt"
      )
      SELECT
        pqr."studentId",
        pqr."topicId",
        pqr."subjectId",
        SUM(pqr.attempts)::int,
        SUM(CASE WHEN pqr."isCorrect" THEN pqr.attempts ELSE 0 END)::int,
        SUM(CASE WHEN NOT pqr."isCorrect" THEN pqr.attempts ELSE 0 END)::int,
        MAX(pqr."updatedAt"),
        NOW(),
        NOW()
      FROM practice_question_results pqr
      ${pqrClause}
      GROUP BY pqr."studentId", pqr."topicId", pqr."subjectId"
      ON CONFLICT ("studentId", "topicId") DO UPDATE SET
        "totalAttempts" = EXCLUDED."totalAttempts",
        "totalCorrect" = EXCLUDED."totalCorrect",
        "totalWrong" = EXCLUDED."totalWrong",
        "lastPracticeAt" = EXCLUDED."lastPracticeAt",
        "subjectId" = EXCLUDED."subjectId",
        "updatedAt" = NOW()
    `, { replacements, transaction });

    const difficultyTotals = await migrateDifficultyTotalsFromResults({
      clause: pqrClause,
      replacements,
      transaction
    });

    // Режим практики в результатах не хранится — всё в general.
    const [, modeMeta] = await sequelize.query(`
      INSERT INTO practice_mode_totals (
        "studentId", "subjectId", "practiceMode", "totalAttempts", "totalCorrect",
        "createdAt", "updatedAt"
      )
      SELECT
        pqr."studentId",
        pqr."subjectId",
        'general',
        SUM(pqr.attempts)::int,
        SUM(CASE WHEN pqr."isCorrect" THEN pqr.attempts ELSE 0 END)::int,
        NOW(),
        NOW()
      FROM practice_question_results pqr
      ${pqrClause}
      GROUP BY pqr."studentId", pqr."subjectId"
      ON CONFLICT ("studentId", "subjectId", "practiceMode") DO UPDATE SET
        "totalAttempts" = EXCLUDED."totalAttempts",
        "totalCorrect" = EXCLUDED."totalCorrect",
        "updatedAt" = NOW()
    `, { replacements, transaction });

    const [, recentMeta] = await sequelize.query(`
      INSERT INTO practice_recent_errors (
        "studentId", "subjectId", "questionId", "topicId", "answeredAt", "selectedAnswer", "createdAt", "updatedAt"
      )
      SELECT
        ranked."studentId",
        ranked."subjectId",
        ranked."questionId",
        ranked."topicId",
        ranked."updatedAt",
        0,
        NOW(),
        NOW()
      FROM (
        SELECT
          pqr.*,
          ROW_NUMBER() OVER (
            PARTITION BY pqr."studentId", pqr."subjectId"
            ORDER BY pqr."updatedAt" DESC
          ) AS rn
        FROM practice_question_results pqr
        ${pqrClause ? `${pqrClause} AND pqr."isCorrect" = false` : 'WHERE pqr."isCorrect" = false'}
      ) ranked
      WHERE ranked.rn <= ${RECENT_ERRORS_LIMIT}
    `, { replacements, transaction });

    return {
      studentTotals: studentMeta?.rowCount ?? 0,
      dailyStats: dailyMeta?.rowCount ?? 0,
      topicTotals: topicMeta?.rowCount ?? 0,
      difficultyTotals,
      modeTotals: modeMeta?.rowCount ?? 0,
      recentErrors: recentMeta?.rowCount ?? 0
    };
  });

  const verification = await getMigrateVerification(studentId, subjectId);

  return {
    success: true,
    resultCount,
    rebuilt,
    verification
  };
}

async function updateCorrectStreaksFromAttempts(studentId, subjectId, transaction) {
  const where = buildAttemptFilter(studentId, subjectId);
  const pairs = await PracticeAttempt.findAll({
    where,
    attributes: ['studentId', 'subjectId'],
    group: ['studentId', 'subjectId'],
    raw: true,
    transaction
  });

  for (const pair of pairs) {
    const attempts = await PracticeAttempt.findAll({
      where: { studentId: pair.studentId, subjectId: pair.subjectId },
      attributes: ['isCorrect'],
      order: [['createdAt', 'DESC']],
      limit: 20,
      raw: true,
      transaction
    });

    let correctStreak = 0;
    for (const attempt of attempts) {
      if (attempt.isCorrect) correctStreak += 1;
      else break;
    }

    await PracticeStudentTotals.update(
      { correctStreak },
      { where: { studentId: pair.studentId, subjectId: pair.subjectId }, transaction }
    );
  }
}

async function hasAggregatedStats(studentId, subjectId) {
  return ensurePracticeStatsReady(studentId, subjectId);
}

async function loadAggregatedDashboardMetrics(studentId, subjectId, helpers) {
  const { getLocalDateStr, getLocalDayBounds, getPeriodBounds } = helpers;
  const sid = parseInt(studentId, 10);
  const subId = parseInt(subjectId, 10);

  const today = getLocalDateStr();
  const { start: todayStart, end: todayEnd } = getLocalDayBounds(today);
  const { start: weekStart, end: weekEnd } = getPeriodBounds('week');
  const { start: monthStart, end: monthEnd } = getPeriodBounds('month');

  const [totals, dailyRows, topicTotals, diffTotals, modeTotals, recentErrors] = await Promise.all([
    PracticeStudentTotals.findOne({ where: { studentId: sid, subjectId: subId } }),
    PracticeDailyStats.findAll({ where: { studentId: sid, subjectId: subId }, raw: true }),
    PracticeTopicTotals.findAll({ where: { studentId: sid, subjectId: subId }, raw: true }),
    PracticeDifficultyTotals.findAll({ where: { studentId: sid, subjectId: subId }, raw: true }),
    PracticeModeTotals.findAll({ where: { studentId: sid, subjectId: subId }, raw: true }),
    PracticeRecentError.findAll({
      where: { studentId: sid, subjectId: subId },
      include: [
        {
          model: PracticeQuestion,
          as: 'question',
          attributes: ['difficulty', 'explanation', 'questionText', 'options', 'correctAnswer']
        },
        { model: PracticeTopic, as: 'topic', attributes: ['id', 'name', 'icon'] }
      ],
      order: [['answeredAt', 'DESC']],
      limit: RECENT_ERRORS_LIMIT
    })
  ]);

  if (!totals) return null;

  const totalAttempts = totals.totalAttempts || 0;
  const totalCorrect = totals.totalCorrect || 0;
  const overallAccuracy = totalAttempts > 0 ? Math.round(totalCorrect / totalAttempts * 100) : 0;

  const dayInRange = (dateValue, start, end) => {
    const dateStr = typeof dateValue === 'string' ? dateValue.slice(0, 10) : getLocalDateStr(new Date(dateValue));
    const { start: dayStart } = getLocalDayBounds(dateStr);
    return dayStart >= start && dayStart < end;
  };

  const sumAttemptsInRange = (start, end) => dailyRows
    .filter((d) => dayInRange(d.date, start, end))
    .reduce((sum, d) => sum + (parseInt(d.attempts, 10) || 0), 0);

  const sumCorrectInRange = (start, end) => dailyRows
    .filter((d) => dayInRange(d.date, start, end))
    .reduce((sum, d) => sum + (parseInt(d.correct, 10) || 0), 0);

  const topicAgg = {};
  topicTotals.forEach((t) => {
    topicAgg[t.topicId] = {
      total: t.totalAttempts || 0,
      correct: t.totalCorrect || 0,
      lastAt: t.lastPracticeAt
    };
  });

  const modeStats = {
    general: { total: 0, correct: 0, accuracy: 0 },
    weak: { total: 0, correct: 0, accuracy: 0 },
    topic: { total: 0, correct: 0, accuracy: 0 }
  };
  modeTotals.forEach((m) => {
    const key = normalizeMode(m.practiceMode);
    modeStats[key].total = m.totalAttempts || 0;
    modeStats[key].correct = m.totalCorrect || 0;
  });
  Object.keys(modeStats).forEach((k) => {
    const m = modeStats[k];
    m.accuracy = m.total > 0 ? Math.round(m.correct / m.total * 100) : 0;
  });

  const diffAgg = { easy: { t: 0, c: 0 }, medium: { t: 0, c: 0 }, hard: { t: 0, c: 0 } };
  diffTotals.forEach((d) => {
    const key = normalizeDifficulty(d.difficulty);
    diffAgg[key].t = d.totalAttempts || 0;
    diffAgg[key].c = d.totalCorrect || 0;
  });

  const accuracyByDifficulty = {
    easy: diffAgg.easy.t ? Math.round(diffAgg.easy.c / diffAgg.easy.t * 100) : null,
    medium: diffAgg.medium.t ? Math.round(diffAgg.medium.c / diffAgg.medium.t * 100) : null,
    hard: diffAgg.hard.t ? Math.round(diffAgg.hard.c / diffAgg.hard.t * 100) : null,
    easyTotal: diffAgg.easy.t,
    mediumTotal: diffAgg.medium.t,
    hardTotal: diffAgg.hard.t
  };

  return {
    totalAttempts,
    totalCorrect,
    overallAccuracy,
    topicAgg,
    modeStats,
    todayCount: sumAttemptsInRange(todayStart, todayEnd),
    weekCount: sumAttemptsInRange(weekStart, weekEnd),
    monthCount: sumAttemptsInRange(monthStart, monthEnd),
    todayCorrect: sumCorrectInRange(todayStart, todayEnd),
    practiceDays: totals.practiceDays || 0,
    correctStreak: totals.correctStreak || 0,
    accuracyByDifficulty,
    recentErrors: recentErrors.map((e) => buildRecentErrorPayload({
      ...e.toJSON(),
      selectedAnswer: e.selectedAnswer
    }))
  };
}

module.exports = {
  recordPracticeStatsIncrement,
  ensurePracticeStatsReady,
  syncAggregatesFromAttempts,
  migratePracticeStatsFromAttempts,
  rebuildPracticeStatsFromResults,
  clearAggregatesForScope,
  hasAggregatedStats,
  loadAggregatedDashboardMetrics,
  getLocalDateStr
};
