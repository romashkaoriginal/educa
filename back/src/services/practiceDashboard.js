const { Op } = require('sequelize');
const sequelize = require('../config/database');
const {
  PracticeTopic, PracticeQuestion, PracticeAttempt, PracticeQuestionResult,
  PracticeScoreHistory, Subject
} = require('../models');
const { CONFIG, calculatePredictedScore } = require('./predictedScore');

const WEAK_TOPIC_MIN = 10;
const WEEKLY_GOAL = CONFIG.DAILY_GOAL * 7;

function getTopicStatus(solved, accuracy) {
  if (solved < WEAK_TOPIC_MIN) return { key: 'learning', label: 'мало данных' };
  if (accuracy >= 95 && solved >= 15) return { key: 'mastered', label: 'тема освоена' };
  if (accuracy >= 85) return { key: 'good', label: 'хорошо' };
  if (accuracy >= 70) return { key: 'normal', label: 'нормально' };
  if (accuracy >= 55) return { key: 'review', label: 'нужно повторить' };
  return { key: 'weak', label: 'слабая тема' };
}

function computeBestStreakFromDates(dates) {
  if (!dates.length) return 0;
  const set = new Set(dates);
  let best = 1;
  for (const d of dates) {
    let streak = 1;
    let next = shiftDateStr(d, 1);
    while (set.has(next)) {
      streak += 1;
      next = shiftDateStr(next, 1);
    }
    best = Math.max(best, streak);
  }
  return best;
}

function shiftDateStr(dateStr, days) {
  const d = new Date(`${dateStr}T12:00:00+03:00`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function findScoreNearDate(history, daysAgo, getLocalDateStr) {
  const target = new Date();
  target.setDate(target.getDate() - daysAgo);
  const targetStr = getLocalDateStr(target);
  let best = null;
  for (const h of history) {
    const d = typeof h.date === 'string' ? h.date.slice(0, 10) : getLocalDateStr(new Date(h.date));
    if (d <= targetStr) best = h;
    else break;
  }
  return best?.score ?? null;
}

function buildRecommendation(ctx) {
  const {
    prediction, streak, todaySolved, weakTopics, hardestWeak,
    accuracyByDifficulty, modeStats, inactiveTopic, correctStreak
  } = ctx;

  if (!prediction?.unlocked) {
    const left = prediction?.needed || CONFIG.MIN_TOTAL_TO_UNLOCK;
    return {
      title: 'Что делать дальше?',
      text: left <= 5
        ? `Осталось ${left} заданий — и откроется прогноз на ЦТ!`
        : `Реши ещё ${left} заданий, чтобы увидеть балл на ЦТ/ЦЭ.`,
      action: 'Решать тесты',
      actionType: 'general'
    };
  }

  if (streak?.streak > 0 && !streak?.todayDone && todaySolved < CONFIG.DAILY_GOAL) {
    const remaining = Math.max(1, CONFIG.DAILY_GOAL - todaySolved);
    return {
      title: 'Сохрани стрик',
      text: `Ты занимаешься ${streak.streak} ${streak.streak === 1 ? 'день' : 'дней'} подряд. Реши ещё ${remaining} правильных заданий сегодня, чтобы продлить серию.`,
      action: 'Продолжить стрик',
      actionType: 'general'
    };
  }

  if (hardestWeak) {
    const target = Math.min(70, (prediction.score || 0) + 6);
    return {
      title: 'Что делать дальше?',
      text: `«${hardestWeak.name}» сильнее всего снижает балл (${hardestWeak.accuracy}%). Реши 10 заданий по этой теме${prediction.score < 70 ? ` — это поможет подняться к ${target}+` : ''}.`,
      action: 'Тренировать слабые темы',
      actionType: 'weak',
      topicId: hardestWeak.id
    };
  }

  const easyAcc = accuracyByDifficulty?.easy;
  const hardAcc = accuracyByDifficulty?.hard;
  const hardTotal = accuracyByDifficulty?.hardTotal || 0;
  if (easyAcc >= 80 && hardTotal < 15 && (hardAcc == null || hardAcc < 50)) {
    return {
      title: 'Добавь сложности',
      text: 'С лёгкими заданиями справляешься отлично, но мало решаешь сложные. Добавь 15 сложных — балл вырастет быстрее.',
      action: 'Решать тесты',
      actionType: 'general'
    };
  }

  const weakModeTotal = modeStats?.weak?.total || 0;
  const generalTotal = modeStats?.general?.total || 0;
  if (generalTotal > 30 && weakModeTotal < generalTotal * 0.15 && weakTopics?.length) {
    return {
      title: 'Слабые темы',
      text: 'Ты редко тренируешь слабые темы — это замедляет рост балла.',
      action: 'Тренировать слабые темы',
      actionType: 'weak'
    };
  }

  if (inactiveTopic) {
    return {
      title: 'Повтори тему',
      text: `Ты давно не решал «${inactiveTopic.name}». Повтори её, чтобы не потерять прогресс.`,
      action: 'Повторить тему',
      actionType: 'topic',
      topicId: inactiveTopic.id
    };
  }

  if (correctStreak >= 8) {
    return {
      title: 'Отличный темп!',
      text: `${correctStreak} правильных подряд — продолжай в том же духе.`,
      action: 'Решать тесты',
      actionType: 'general'
    };
  }

  const nextTarget = Math.min(100, Math.floor((prediction.score || 0) / 10) * 10 + 10);
  return {
    title: 'Что делать дальше?',
    text: prediction.score < 100
      ? `Чтобы поднять балл до ${nextTarget}+, реши ещё ~${Math.max(5, Math.ceil((nextTarget - prediction.score) / 2))} заданий по слабым темам.`
      : 'Поддерживай форму — решай по 10–15 заданий в день.',
    action: weakTopics?.length ? 'Тренировать слабые темы' : 'Решать тесты',
    actionType: weakTopics?.length ? 'weak' : 'general'
  };
}

function buildAchievements(ctx) {
  const items = [];
  const { streak, bestStreak, activity, prediction, scoreDynamics, correctStreak, masteredCount } = ctx;

  if (streak?.streak >= 3) items.push({ icon: '🔥', label: `${streak.streak} ${streak.streak >= 5 ? 'дней' : 'дня'} подряд` });
  if (bestStreak >= 7 && bestStreak > (streak?.streak || 0)) {
    items.push({ icon: '🏅', label: `Лучший стрик: ${bestStreak} дн.` });
  }
  if (activity?.total >= 100) items.push({ icon: '⭐', label: `${activity.total}+ заданий` });
  if (activity?.total >= 300) items.push({ icon: '💎', label: '300+ заданий' });
  if (correctStreak >= 10) items.push({ icon: '🎯', label: '10 правильных подряд' });
  if (scoreDynamics?.weekDelta > 0) items.push({ icon: '📈', label: `+${scoreDynamics.weekDelta} за неделю` });
  if (masteredCount >= 1) items.push({ icon: '✅', label: `${masteredCount} ${masteredCount === 1 ? 'тема освоена' : 'тем освоено'}` });
  if (prediction?.unlocked && prediction.score >= 70) items.push({ icon: '🏆', label: `Прогноз ${prediction.score}+` });

  return items.slice(0, 5);
}

async function buildSubjectDashboard(studentId, subjectId, helpers) {
  const { getLocalDateStr, getLocalDayBounds, getPeriodBounds, buildStreakForStudent, getDailyGoalCompletionDates } = helpers;
  const sid = parseInt(studentId, 10);
  const subId = parseInt(subjectId, 10);

  const subject = await Subject.findByPk(subId, { attributes: ['id', 'name', 'icon'] });
  if (!subject) return null;

  const today = getLocalDateStr();
  const { start: todayStart, end: todayEnd } = getLocalDayBounds(today);
  const { start: weekStart, end: weekEnd } = getPeriodBounds('week');
  const { start: monthStart, end: monthEnd } = getPeriodBounds('month');

  const [
    topics,
    results,
    allAttempts,
    history,
    streak,
    completionDates,
    recentErrors
  ] = await Promise.all([
    PracticeTopic.findAll({ where: { subjectId: subId, isActive: true }, attributes: ['id', 'name', 'icon'] }),
    PracticeQuestionResult.findAll({ where: { studentId: sid, subjectId: subId } }),
    PracticeAttempt.findAll({
      where: { studentId: sid, subjectId: subId },
      attributes: ['topicId', 'isCorrect', 'practiceMode', 'createdAt', 'questionId'],
      raw: true
    }),
    PracticeScoreHistory.findAll({
      where: { studentId: sid, subjectId: subId },
      order: [['date', 'ASC']],
      limit: 60
    }),
    buildStreakForStudent(sid, subId),
    getDailyGoalCompletionDates(sid, subId),
    PracticeAttempt.findAll({
      where: { studentId: sid, subjectId: subId, isCorrect: false },
      include: [
        { model: PracticeQuestion, as: 'question', attributes: ['difficulty', 'explanation', 'questionText'] },
        { model: PracticeTopic, as: 'topic', attributes: ['id', 'name', 'icon'] }
      ],
      order: [['createdAt', 'DESC']],
      limit: 8
    })
  ]);

  const topicMap = Object.fromEntries(topics.map(t => [t.id, t.toJSON()]));
  const topicIds = topics.map(t => t.id);

  // Сколько всего активных заданий в каждой теме (для процента прохождения)
  const questionCounts = topicIds.length
    ? await PracticeQuestion.findAll({
      where: { topicId: topicIds, isActive: true },
      attributes: ['topicId', [sequelize.fn('COUNT', sequelize.col('id')), 'cnt']],
      group: ['topicId'],
      raw: true
    })
    : [];
  const totalQuestionsByTopic = Object.fromEntries(
    questionCounts.map(q => [q.topicId, parseInt(q.cnt, 10) || 0])
  );

  // Сколько уникальных заданий темы реально пройдено (из results)
  const uniqueSolvedByTopic = {};
  results.forEach((r) => {
    const rj = r.toJSON ? r.toJSON() : r;
    if (!uniqueSolvedByTopic[rj.topicId]) uniqueSolvedByTopic[rj.topicId] = new Set();
    uniqueSolvedByTopic[rj.topicId].add(rj.questionId);
  });

  const totalAttempts = allAttempts.length;
  const totalCorrect = allAttempts.filter(a => a.isCorrect).length;
  const overallAccuracy = totalAttempts > 0 ? Math.round(totalCorrect / totalAttempts * 100) : 0;

  const topicAgg = {};
  allAttempts.forEach((a) => {
    if (!topicAgg[a.topicId]) {
      topicAgg[a.topicId] = { total: 0, correct: 0, lastAt: a.createdAt };
    }
    topicAgg[a.topicId].total += 1;
    if (a.isCorrect) topicAgg[a.topicId].correct += 1;
    if (new Date(a.createdAt) > new Date(topicAgg[a.topicId].lastAt)) {
      topicAgg[a.topicId].lastAt = a.createdAt;
    }
  });

  const modeStats = {
    general: { total: 0, correct: 0, accuracy: 0 },
    weak: { total: 0, correct: 0, accuracy: 0 },
    topic: { total: 0, correct: 0, accuracy: 0 }
  };
  allAttempts.forEach((a) => {
    const key = ['general', 'weak', 'topic'].includes(a.practiceMode) ? a.practiceMode : 'general';
    modeStats[key].total += 1;
    if (a.isCorrect) modeStats[key].correct += 1;
  });
  Object.keys(modeStats).forEach((k) => {
    const m = modeStats[k];
    m.accuracy = m.total > 0 ? Math.round(m.correct / m.total * 100) : 0;
  });

  const countInRange = (start, end) =>
    allAttempts.filter(a => {
      const t = new Date(a.createdAt);
      return t >= start && t < end;
    }).length;

  const countCorrectInRange = (start, end) =>
    allAttempts.filter(a => {
      const t = new Date(a.createdAt);
      return t >= start && t < end && a.isCorrect;
    }).length;

  const [todayCount, weekCount, monthCount] = [
    countInRange(todayStart, todayEnd),
    countInRange(weekStart, weekEnd),
    countInRange(monthStart, monthEnd)
  ];
  const todayCorrect = countCorrectInRange(todayStart, todayEnd);

  const practiceDays = new Set(
    allAttempts.map(a => getLocalDateStr(new Date(a.createdAt)))
  ).size;

  const prediction = calculatePredictedScore(
    topics.map(t => t.toJSON()),
    results.map(r => r.toJSON())
  );

  const bestStreak = computeBestStreakFromDates(completionDates);

  const historyPoints = history.map(h => ({
    date: typeof h.date === 'string' ? h.date.slice(0, 10) : getLocalDateStr(new Date(h.date)),
    score: h.score
  }));

  const weekAgoScore = prediction.unlocked ? findScoreNearDate(historyPoints, 7, getLocalDateStr) : null;
  const monthAgoScore = prediction.unlocked ? findScoreNearDate(historyPoints, 30, getLocalDateStr) : null;
  const weekDelta = prediction.unlocked && weekAgoScore != null ? prediction.score - weekAgoScore : null;
  const monthDelta = prediction.unlocked && monthAgoScore != null ? prediction.score - monthAgoScore : null;

  const questionIds = [...new Set(allAttempts.map(a => a.questionId))];
  const questions = questionIds.length
    ? await PracticeQuestion.findAll({
      where: { id: questionIds },
      attributes: ['id', 'difficulty'],
      raw: true
    })
    : [];
  const qDiffMap = Object.fromEntries(questions.map(q => [q.id, q.difficulty || 'medium']));

  const diffAgg = { easy: { t: 0, c: 0 }, medium: { t: 0, c: 0 }, hard: { t: 0, c: 0 } };
  allAttempts.forEach((a) => {
    const d = qDiffMap[a.questionId] || 'medium';
    if (!diffAgg[d]) return;
    diffAgg[d].t += 1;
    if (a.isCorrect) diffAgg[d].c += 1;
  });

  const accuracyByDifficulty = {
    easy: diffAgg.easy.t ? Math.round(diffAgg.easy.c / diffAgg.easy.t * 100) : null,
    medium: diffAgg.medium.t ? Math.round(diffAgg.medium.c / diffAgg.medium.t * 100) : null,
    hard: diffAgg.hard.t ? Math.round(diffAgg.hard.c / diffAgg.hard.t * 100) : null,
    easyTotal: diffAgg.easy.t,
    mediumTotal: diffAgg.medium.t,
    hardTotal: diffAgg.hard.t
  };

  const topicStats = Object.entries(topicAgg).map(([topicId, agg]) => {
    const meta = topicMap[topicId] || {};
    const total = agg.total;
    const correct = agg.correct;
    const errors = total - correct;
    const accuracy = total > 0 ? Math.round(correct / total * 100) : 0;
    const status = getTopicStatus(total, accuracy);
    const totalQuestions = totalQuestionsByTopic[topicId] || 0;
    const uniqueSolved = uniqueSolvedByTopic[topicId] ? uniqueSolvedByTopic[topicId].size : 0;
    const completionPercent = totalQuestions > 0
      ? Math.min(100, Math.round(uniqueSolved / totalQuestions * 100))
      : 0;
    return {
      id: parseInt(topicId, 10),
      name: meta.name || 'Тема',
      icon: meta.icon || '📝',
      solved: total,
      correct,
      errors,
      accuracy,
      totalQuestions,
      uniqueSolved,
      completionPercent,
      status: status.key,
      statusLabel: status.label,
      lastAt: agg.lastAt
    };
  }).sort((a, b) => a.accuracy - b.accuracy);

  const weakTopics = topicStats
    .filter(t => t.solved >= WEAK_TOPIC_MIN && t.accuracy < 70)
    .slice(0, 5);

  const masteredCount = topicStats.filter(t => t.status === 'mastered').length;

  let correctStreak = 0;
  const sortedAttempts = [...allAttempts].sort(
    (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
  );
  for (const a of sortedAttempts.slice(0, 20)) {
    if (a.isCorrect) correctStreak += 1;
    else break;
  }

  let inactiveTopic = null;
  if (topicStats.length) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 14);
    const stale = topicStats
      .filter(t => t.solved >= WEAK_TOPIC_MIN && new Date(t.lastAt) < cutoff)
      .sort((a, b) => a.accuracy - b.accuracy);
    inactiveTopic = stale[0] || null;
  }

  const hardestWeak = weakTopics[0] || null;

  const recommendation = buildRecommendation({
    prediction,
    streak,
    todaySolved: todayCorrect,
    weakTopics,
    hardestWeak,
    accuracyByDifficulty,
    modeStats,
    inactiveTopic,
    correctStreak
  });

  const achievements = buildAchievements({
    streak,
    bestStreak,
    activity: { total: totalAttempts },
    prediction,
    scoreDynamics: { weekDelta },
    correctStreak,
    masteredCount
  });

  const weeklyGoal = {
    target: WEEKLY_GOAL,
    done: weekCount,
    remaining: Math.max(0, WEEKLY_GOAL - weekCount),
    percent: Math.min(100, Math.round(weekCount / WEEKLY_GOAL * 100))
  };

  return {
    subject: subject.toJSON(),
    prediction: {
      ...prediction,
      delta: weekDelta,
      previousScore: weekAgoScore
    },
    scoreDynamics: {
      current: prediction.unlocked ? prediction.score : null,
      weekAgo: weekAgoScore,
      monthAgo: monthAgoScore,
      weekDelta,
      monthDelta
    },
    activity: {
      total: totalAttempts,
      today: todayCount,
      week: weekCount,
      month: monthCount,
      practiceDays,
      uniqueSolved: prediction.solved,
      accuracy: overallAccuracy
    },
    streak: { ...streak, best: bestStreak },
    accuracyByDifficulty: {
      easy: accuracyByDifficulty.easy,
      medium: accuracyByDifficulty.medium,
      hard: accuracyByDifficulty.hard
    },
    topics: topicStats,
    weakTopics,
    recommendation,
    modeStats,
    recentErrors: recentErrors.map(e => ({
      id: e.id,
      topicId: e.topicId,
      topicName: e.topic?.name || 'Тема',
      topicIcon: e.topic?.icon || '📝',
      difficulty: e.question?.difficulty || 'medium',
      date: e.createdAt,
      explanation: e.question?.explanation || null,
      questionText: e.question?.questionText
        ? String(e.question.questionText).slice(0, 120)
        : null
    })),
    achievements,
    weeklyGoal,
    correctStreak
  };
}

module.exports = {
  buildSubjectDashboard,
  WEAK_TOPIC_MIN,
  WEEKLY_GOAL
};
