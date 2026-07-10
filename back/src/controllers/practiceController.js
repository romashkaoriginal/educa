const {
  PracticeTopic, PracticeQuestion, PracticeAttempt, PracticeBest, PracticeDailyLog,
  PracticeQuestionResult, PracticeScoreHistory, PracticeDailyStats,
  PracticeTopicTotals, PracticeRecentError, Subject, User
} = require('../models');
const { Op } = require('sequelize');
const sequelize = require('../config/database');
const { calculatePredictedScore, getGrowthTopicIds, CONFIG } = require('../services/predictedScore');
const { calculateHomeworkScore } = require('../services/homeworkScore');
const { buildSubjectDashboard } = require('../services/practiceDashboard');
const { recordPracticeStatsIncrement, hasAggregatedStats } = require('../services/practiceStatsAggregate');

// In-memory кэш статистики (TTL 60 секунд)
const statsCache = new Map();
const CACHE_TTL = 60 * 1000;
const getCached = (key) => {
  const item = statsCache.get(key);
  if (!item) return null;
  if (Date.now() - item.time > CACHE_TTL) { statsCache.delete(key); return null; }
  return item.data;
};
const setCache = (key, data) => statsCache.set(key, { data, time: Date.now() });
const invalidateCache = (key) => statsCache.delete(key);

async function buildPrediction(studentId, subjectId) {
  const [topics, results, homework] = await Promise.all([
    PracticeTopic.findAll({
      where: { subjectId, isActive: true },
      attributes: ['id', 'name', 'icon']
    }),
    PracticeQuestionResult.findAll({ where: { studentId, subjectId } }),
    calculateHomeworkScore(studentId, subjectId)
  ]);
  const resultRows = results.map(r => r.toJSON());
  return {
    ...calculatePredictedScore(
      topics.map(t => t.toJSON()),
      resultRows,
      homework
    ),
    solvedQuestionIds: resultRows.map(r => r.questionId)
  };
}

async function recordScoreHistory(studentId, subjectId, prediction) {
  if (!prediction?.unlocked) return;

  const last = await PracticeScoreHistory.findOne({
    where: { studentId, subjectId },
    order: [['createdAt', 'DESC']]
  });

  if (last && last.score === prediction.score && last.solvedCount === prediction.solved) {
    return;
  }

  const today = getLocalDateStr();
  await PracticeScoreHistory.create({
    studentId,
    subjectId,
    score: prediction.score,
    practiceScore: prediction.practiceScore ?? null,
    homeworkScore: prediction.homeworkScore ?? null,
    solvedCount: prediction.solved,
    date: today
  });
}

const APP_TIMEZONE = 'Europe/Minsk';

function getLocalDateStr(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: APP_TIMEZONE }).format(date);
}

function getLocalDayBounds(dateStr) {
  const start = new Date(`${dateStr}T00:00:00+03:00`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}

function getPeriodStart(period) {
  const now = new Date();
  if (period === 'day') {
    return getLocalDateStr(now);
  }
  if (period === 'week') {
    const d = new Date(now);
    d.setDate(d.getDate() - 6);
    return getLocalDateStr(d);
  }
  if (period === 'month') {
    const d = new Date(now);
    d.setDate(d.getDate() - 29);
    return getLocalDateStr(d);
  }
  return getLocalDateStr(now);
}

function formatLogDate(value) {
  if (!value) return null;
  if (typeof value === 'string') return value.slice(0, 10);
  return getLocalDateStr(value);
}

function shiftLocalDateStr(dateStr, days) {
  const { start } = getLocalDayBounds(dateStr);
  start.setUTCDate(start.getUTCDate() + days);
  return getLocalDateStr(start);
}

function getPeriodBounds(period) {
  const today = getLocalDateStr();
  const { end: todayEnd } = getLocalDayBounds(today);
  const startDate = getPeriodStart(period);
  const { start } = getLocalDayBounds(startDate);
  return { start, end: todayEnd };
}

async function countCorrectFromDailyStats(studentId, subjectId, start, end) {
  const rows = await PracticeDailyStats.findAll({
    where: { studentId: parseInt(studentId, 10), subjectId: parseInt(subjectId, 10) },
    attributes: ['date', 'correct'],
    raw: true
  });

  return rows.reduce((sum, row) => {
    const dateStr = typeof row.date === 'string' ? row.date.slice(0, 10) : getLocalDateStr(new Date(row.date));
    const { start: dayStart } = getLocalDayBounds(dateStr);
    if (dayStart >= start && dayStart < end) {
      return sum + (parseInt(row.correct, 10) || 0);
    }
    return sum;
  }, 0);
}

async function countCorrectTotalInRange(studentId, subjectId, start, end) {
  if (await hasAggregatedStats(studentId, subjectId)) {
    return countCorrectFromDailyStats(studentId, subjectId, start, end);
  }

  const attemptCount = await PracticeAttempt.count({
    where: {
      studentId,
      subjectId,
      isCorrect: true,
      createdAt: { [Op.gte]: start, [Op.lt]: end }
    }
  });

  if (attemptCount > 0) return attemptCount;

  // Fallback для данных до поштучного сохранения ответов
  return countCorrectUniqueInRange(studentId, subjectId, start, end);
}

async function countCorrectUniqueInRange(studentId, subjectId, start, end) {
  return PracticeQuestionResult.count({
    where: {
      studentId,
      subjectId,
      isCorrect: true,
      updatedAt: { [Op.gte]: start, [Op.lt]: end }
    },
    distinct: true,
    col: 'questionId'
  });
}

async function getCorrectUniqueQuestionIdsInRange(studentId, subjectId, start, end) {
  const rows = await PracticeQuestionResult.findAll({
    where: {
      studentId,
      subjectId,
      isCorrect: true,
      updatedAt: { [Op.gte]: start, [Op.lt]: end }
    },
    attributes: ['questionId'],
    group: ['questionId'],
    raw: true
  });
  return rows.map(r => r.questionId);
}

async function getDailyGoalCompletionDates(studentId, subjectId = null) {
  const where = {
    studentId: parseInt(studentId),
    attemptsCount: { [Op.gte]: CONFIG.DAILY_GOAL }
  };
  if (subjectId != null && subjectId !== '') {
    where.subjectId = parseInt(subjectId, 10);
  }
  const rows = await PracticeDailyLog.findAll({
    where,
    attributes: ['date'],
    order: [['date', 'DESC']],
    raw: true
  });
  const dates = new Set();
  rows.forEach((row) => {
    if (!row.date) return;
    const key = typeof row.date === 'string'
      ? row.date.slice(0, 10)
      : getLocalDateStr(new Date(row.date));
    dates.add(key);
  });
  return [...dates].sort().reverse();
}

function computeStreakFromDates(dates) {
  if (dates.length === 0) return { streak: 0, todayDone: false };

  const todayKey = getLocalDateStr();
  const yesterdayKey = shiftLocalDateStr(todayKey, -1);
  const todayDone = dates.includes(todayKey);

  if (dates[0] !== todayKey && dates[0] !== yesterdayKey) {
    return { streak: 0, todayDone };
  }

  let streak = 1;
  let expected = shiftLocalDateStr(dates[0], -1);
  for (let i = 1; i < dates.length; i++) {
    if (dates[i] === expected) {
      streak++;
      expected = shiftLocalDateStr(dates[i], -1);
    } else {
      break;
    }
  }

  return { streak, todayDone };
}

async function buildStreakForStudent(studentId, subjectId = null) {
  const dates = await getDailyGoalCompletionDates(studentId, subjectId);
  return computeStreakFromDates(dates);
}

async function syncDailyGoalLog(studentId, subjectId, dateStr) {
  const { start, end } = getLocalDayBounds(dateStr);
  const totalCorrect = await countCorrectTotalInRange(studentId, subjectId, start, end);

  if (totalCorrect <= 0) {
    await PracticeDailyLog.destroy({
      where: { studentId, subjectId, date: dateStr }
    }).catch(() => {});
    return 0;
  }

  const [log] = await PracticeDailyLog.findOrCreate({
    where: { studentId, subjectId, date: dateStr },
    defaults: { studentId, subjectId, date: dateStr, attemptsCount: totalCorrect }
  });

  if (log.attemptsCount !== totalCorrect) {
    await log.update({ attemptsCount: totalCorrect });
  }

  return totalCorrect;
}

async function buildDailyGoalEntry(studentId, subject, start, end) {
  const solved = await countCorrectTotalInRange(studentId, subject.id, start, end);
  return {
    subjectId: subject.id,
    subjectName: subject.name,
    subjectIcon: subject.icon,
    goal: CONFIG.DAILY_GOAL,
    solved,
    remaining: Math.max(0, CONFIG.DAILY_GOAL - solved),
    completed: solved >= CONFIG.DAILY_GOAL,
    percent: Math.min(100, Math.round(solved / CONFIG.DAILY_GOAL * 100))
  };
}

async function persistPracticeAnswer({
  studentId,
  topicId,
  subjectId,
  questionId,
  isCorrect,
  difficulty,
  selectedAnswer = 0,
  practiceMode = 'general'
}) {
  await recordPracticeStatsIncrement({
    studentId,
    subjectId,
    topicId,
    questionId,
    isCorrect,
    difficulty,
    practiceMode,
    selectedAnswer
  }).catch((err) => {
    console.error('recordPracticeStatsIncrement error:', err);
  });

  const [record, created] = await PracticeQuestionResult.findOrCreate({
    where: { studentId: parseInt(studentId), questionId: parseInt(questionId) },
    defaults: {
      studentId: parseInt(studentId),
      questionId: parseInt(questionId),
      topicId: parseInt(topicId),
      subjectId: parseInt(subjectId),
      difficulty: difficulty || 'medium',
      isCorrect: !!isCorrect,
      attempts: 1
    }
  });

  if (!created) {
    await record.update({
      isCorrect: !!isCorrect,
      attempts: (record.attempts || 1) + 1,
      difficulty: difficulty || record.difficulty,
      topicId: parseInt(topicId),
      subjectId: parseInt(subjectId)
    });
  }

  const today = getLocalDateStr();
  if (isCorrect) {
    await syncDailyGoalLog(studentId, subjectId, today);
  }
}

/** @deprecated use syncDailyGoalLog — kept for callers migrating from unique counts */
async function syncDailyUniqueLog(studentId, subjectId, dateStr) {
  return syncDailyGoalLog(studentId, subjectId, dateStr);
}

// ========== АДМИН ФУНКЦИИ ==========

// Получить разделы практики по предмету
exports.getTopicsBySubject = async (req, res) => {
  try {
    const { subjectId } = req.params;
    const topics = await PracticeTopic.findAll({
      where: { subjectId },
      attributes: ['id', 'name', 'description', 'icon', 'weight', 'isActive', 'createdAt'],
      order: [['createdAt', 'ASC']]
    });
    const topicsWithCounts = await Promise.all(
      topics.map(async (topic) => {
        const questionCount = await PracticeQuestion.count({ where: { topicId: topic.id } });
        return { ...topic.toJSON(), questionCount };
      })
    );
    res.json({ topics: topicsWithCounts });
  } catch (error) {
    console.error('Get topics error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Создать раздел практики
exports.createTopic = async (req, res) => {
  try {
    const { name, description, icon, subjectId, weight } = req.body;
    if (!name || !subjectId) return res.status(400).json({ message: 'Name and subjectId required' });
    const topic = await PracticeTopic.create({
      name,
      description: description || '',
      icon: icon || '📝',
      subjectId,
      weight: weight != null ? parseFloat(weight) : null,
      isActive: true
    });
    res.json({ topic });
  } catch (error) {
    console.error('Create topic error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Обновить топик
exports.updateTopic = async (req, res) => {
  try {
    const { topicId } = req.params;
    const { name, description, icon, weight } = req.body;
    const topic = await PracticeTopic.findByPk(topicId);
    if (!topic) return res.status(404).json({ message: 'Topic not found' });
    if (name) topic.name = name;
    if (description !== undefined) topic.description = description;
    if (icon) topic.icon = icon;
    if (weight !== undefined) topic.weight = weight != null && weight !== '' ? parseFloat(weight) : null;
    await topic.save();
    res.json({ topic });
  } catch (error) {
    console.error('Update topic error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Удалить топик (каскадно, в транзакции).
// Чистим ВСЕ таблицы, ссылающиеся на topicId и на questionId вопросов темы,
// иначе FK (напр. practice_recent_errors_questionId_fkey) блокируют удаление.
exports.deleteTopic = async (req, res) => {
  try {
    const { topicId } = req.params;
    const topic = await PracticeTopic.findByPk(topicId);
    if (!topic) return res.status(404).json({ message: 'Topic not found' });

    await sequelize.transaction(async (t) => {
      const tid = topic.id;
      // 1. Таблицы со ссылкой на topicId
      await PracticeRecentError.destroy({ where: { topicId: tid }, transaction: t });
      await PracticeAttempt.destroy({ where: { topicId: tid }, transaction: t });
      await PracticeQuestionResult.destroy({ where: { topicId: tid }, transaction: t });
      await PracticeBest.destroy({ where: { topicId: tid }, transaction: t });
      await PracticeTopicTotals.destroy({ where: { topicId: tid }, transaction: t });

      // 2. На случай записей, привязанных только по questionId (без topicId)
      const questions = await PracticeQuestion.findAll({ where: { topicId: tid }, attributes: ['id'], transaction: t });
      const questionIds = questions.map(q => q.id);
      if (questionIds.length > 0) {
        await PracticeRecentError.destroy({ where: { questionId: questionIds }, transaction: t });
        await PracticeAttempt.destroy({ where: { questionId: questionIds }, transaction: t });
        await PracticeQuestionResult.destroy({ where: { questionId: questionIds }, transaction: t });
      }

      // 3. Сами вопросы и тема
      await PracticeQuestion.destroy({ where: { topicId: tid }, transaction: t });
      await topic.destroy({ transaction: t });
    });

    res.json({ message: 'Topic deleted' });
  } catch (error) {
    console.error('Delete topic error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Получить вопросы по топику
exports.getQuestionsByTopic = async (req, res) => {
  try {
    const { topicId } = req.params;
    // ВАЖНО: практика проверяет ответ НА КЛИЕНТЕ (savePracticeAnswer доверяет isCorrect),
    // поэтому correctAnswer нужен фронту для подсветки правильного ответа и объяснения.
    // Скрытие correctAnswer здесь ломает весь раздел практики — не убирать.
    const questions = await PracticeQuestion.findAll({
      where: { topicId },
      attributes: ['id', 'questionText', 'options', 'correctAnswer', 'explanation', 'difficulty', 'isActive', 'createdAt'],
      order: [['createdAt', 'ASC']]
    });
    res.json({ questions });
  } catch (error) {
    console.error('Get questions error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Создать вопрос
exports.createQuestion = async (req, res) => {
  try {
    const { topicId, questionText, options, correctAnswer, explanation, difficulty } = req.body;
    if (!topicId || !questionText || !options || options.length !== 4) {
      return res.status(400).json({ message: 'topicId, questionText, and 4 options required' });
    }
    if (correctAnswer < 0 || correctAnswer > 3) return res.status(400).json({ message: 'correctAnswer must be 0-3' });
    const question = await PracticeQuestion.create({
      topicId, questionText, options, correctAnswer,
      explanation: explanation || '',
      difficulty: difficulty || 'medium',
      isActive: true
    });
    res.json({ question });
  } catch (error) {
    console.error('Create question error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Обновить вопрос
exports.updateQuestion = async (req, res) => {
  try {
    const { questionId } = req.params;
    const { questionText, options, correctAnswer, explanation, difficulty } = req.body;
    const question = await PracticeQuestion.findByPk(questionId);
    if (!question) return res.status(404).json({ message: 'Question not found' });
    if (questionText) question.questionText = questionText;
    if (options && options.length === 4) question.options = options;
    if (typeof correctAnswer === 'number') question.correctAnswer = correctAnswer;
    if (explanation !== undefined) question.explanation = explanation;
    if (difficulty) question.difficulty = difficulty;
    await question.save();
    res.json({ question });
  } catch (error) {
    console.error('Update question error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Включить/выключить вопрос
exports.toggleQuestion = async (req, res) => {
  try {
    const { questionId } = req.params;
    const { isActive } = req.body;
    const question = await PracticeQuestion.findByPk(questionId);
    if (!question) return res.status(404).json({ message: 'Question not found' });
    question.isActive = isActive;
    await question.save();
    res.json({ question });
  } catch (error) {
    console.error('Toggle question error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Удалить вопрос (каскадно — чистим записи, ссылающиеся на questionId).
exports.deleteQuestion = async (req, res) => {
  try {
    const { questionId } = req.params;
    const question = await PracticeQuestion.findByPk(questionId);
    if (!question) return res.status(404).json({ message: 'Question not found' });

    await sequelize.transaction(async (t) => {
      const qid = question.id;
      await PracticeRecentError.destroy({ where: { questionId: qid }, transaction: t });
      await PracticeAttempt.destroy({ where: { questionId: qid }, transaction: t });
      await PracticeQuestionResult.destroy({ where: { questionId: qid }, transaction: t });
      await question.destroy({ transaction: t });
    });

    res.json({ message: 'Question deleted' });
  } catch (error) {
    console.error('Delete question error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// ========== ПОПЫТКИ И СТАТИСТИКА ==========

// Сохранить результат прохождения темы
// Принимает итог теста: { studentId, topicId, subjectId, correct, total }
exports.saveAttempt = async (req, res) => {
  try {
    const { studentId, topicId, subjectId, correct, total, answers } = req.body;

    if (!studentId || !topicId || !subjectId || correct === undefined || !total) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const percent = total > 0 ? Math.round(correct / total * 100) : 0;
    const today = getLocalDateStr();

    if (Array.isArray(answers) && answers.length > 0) {
      for (const ans of answers) {
        if (!ans.questionId) continue;
        const qTopicId = ans.topicId || topicId;
        await persistPracticeAnswer({
          studentId,
          topicId: qTopicId,
          subjectId,
          questionId: ans.questionId,
          isCorrect: !!ans.isCorrect,
          difficulty: ans.difficulty || 'medium',
          selectedAnswer: ans.selectedAnswer ?? 0
        });
      }
    } else {
      await syncDailyGoalLog(studentId, subjectId, today);
    }

    const [best, created] = await PracticeBest.findOrCreate({
      where: { studentId, topicId },
      defaults: { studentId, topicId, subjectId, correct, total, percent }
    });

    if (!created && percent > best.percent) {
      await best.update({ correct, total, percent });
    }

    invalidateCache(`stats_${studentId}`);

    const prediction = await buildPrediction(studentId, subjectId);
    await recordScoreHistory(studentId, subjectId, prediction);

    const streak = await buildStreakForStudent(studentId, subjectId);

    res.json({ success: true, prediction, streak });
  } catch (error) {
    console.error('Save attempt error:', error);
    res.status(500).json({ error: 'Failed to save attempt' });
  }
};

// Сохранить один ответ (сразу после вопроса)
exports.savePracticeAnswer = async (req, res) => {
  try {
    const {
      studentId,
      topicId,
      subjectId,
      questionId,
      isCorrect,
      difficulty,
      selectedAnswer,
      practiceMode
    } = req.body;

    if (!studentId || !topicId || !subjectId || !questionId || isCorrect === undefined) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    await persistPracticeAnswer({
      studentId,
      topicId,
      subjectId,
      questionId,
      isCorrect,
      difficulty,
      selectedAnswer: selectedAnswer ?? 0,
      practiceMode: practiceMode || 'general'
    });

    invalidateCache(`stats_${studentId}`);

    const prediction = await buildPrediction(studentId, subjectId);
    await recordScoreHistory(studentId, subjectId, prediction);

    const subject = await Subject.findByPk(subjectId, { attributes: ['id', 'name', 'icon'] });
    if (!subject) return res.status(404).json({ error: 'Subject not found' });

    const today = getLocalDateStr();
    const { start, end } = getLocalDayBounds(today);
    const goal = await buildDailyGoalEntry(studentId, subject, start, end);
    const streak = await buildStreakForStudent(studentId, subjectId);

    res.json({ success: true, goal, streak });
  } catch (error) {
    console.error('Save practice answer error:', error);
    res.status(500).json({ error: 'Failed to save answer' });
  }
};

// Итог сессии — только лучший результат по теме (ответы уже сохранены по одному)
exports.saveSessionSummary = async (req, res) => {
  try {
    const { studentId, topicId, subjectId, correct, total } = req.body;

    if (!studentId || !subjectId || correct === undefined || !total) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const percent = total > 0 ? Math.round(correct / total * 100) : 0;
    const numericTopicId = parseInt(topicId, 10);

    if (Number.isInteger(numericTopicId)) {
      const [best, created] = await PracticeBest.findOrCreate({
        where: { studentId, topicId: numericTopicId },
        defaults: { studentId, topicId: numericTopicId, subjectId, correct, total, percent }
      });

      if (!created && percent > best.percent) {
        await best.update({ correct, total, percent });
      }
    }

    invalidateCache(`stats_${studentId}`);

    const prediction = await buildPrediction(studentId, subjectId);
    await recordScoreHistory(studentId, subjectId, prediction);
    const streak = await buildStreakForStudent(studentId, subjectId);

    res.json({ success: true, prediction, streak });
  } catch (error) {
    console.error('Save session summary error:', error);
    res.status(500).json({ error: 'Failed to save session summary' });
  }
};

// Получить статистику по конкретному топику для студента
exports.getTopicStats = async (req, res) => {
  try {
    const { studentId, topicId } = req.params;
    const best = await PracticeBest.findOne({ where: { studentId, topicId } });
    if (!best) return res.json({ total: 0, correct: 0, incorrect: 0, successRate: 0 });
    res.json({
      total: best.total,
      correct: best.correct,
      incorrect: best.total - best.correct,
      successRate: best.percent
    });
  } catch (error) {
    console.error('Get topic stats error:', error);
    res.status(500).json({ error: 'Failed to get topic statistics' });
  }
};

// Получить статистику студента — из PracticeBest
exports.getStudentStats = async (req, res) => {
  try {
    const { studentId } = req.params;

    const cacheKey = `stats_${studentId}`;
    const cached = getCached(cacheKey);
    if (cached) return res.json(cached);

    const bests = await PracticeBest.findAll({
      where: { studentId },
      include: [{
        model: PracticeTopic,
        as: 'topic',
        attributes: ['id', 'name', 'icon'],
        include: [{ model: Subject, as: 'subject', attributes: ['id', 'name', 'icon'] }]
      }]
    });

    if (bests.length === 0) {
      return res.json({
        stats: { total: 0, correct: 0, incorrect: 0, successRate: 0 },
        subjectStats: [],
        topicStats: []
      });
    }

    // Агрегируем по предметам
    const subjectMap = {};
    bests.forEach(b => {
      const sid = b.subjectId;
      if (!subjectMap[sid]) subjectMap[sid] = { subject: b.topic?.subject, correct: 0, total: 0 };
      subjectMap[sid].correct += b.correct;
      subjectMap[sid].total += b.total;
    });

    const subjectStats = Object.values(subjectMap).map(s => ({
      subject: s.subject,
      correct: s.correct,
      total: s.total,
      successRate: s.total > 0 ? Math.round(s.correct / s.total * 100) : 0
    }));

    const totalCorrect = bests.reduce((sum, b) => sum + b.correct, 0);
    const totalAll = bests.reduce((sum, b) => sum + b.total, 0);

    const topicStats = bests.map(b => ({
      topicId: b.topicId,
      topic: {
        name: b.topic?.name,
        icon: b.topic?.icon,
        subject: { name: b.topic?.subject?.name }
      },
      correct: b.correct,
      total: b.total,
      successRate: b.percent
    }));

    const result = {
      stats: {
        total: totalAll,
        correct: totalCorrect,
        incorrect: totalAll - totalCorrect,
        successRate: totalAll > 0 ? Math.round(totalCorrect / totalAll * 100) : 0
      },
      subjectStats,
      topicStats
    };

    setCache(cacheKey, result);
    res.json(result);
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ error: 'Failed to get statistics' });
  }
};

// Получить стрик — дни подряд с выполненной дневной целью
exports.getStreak = async (req, res) => {
  try {
    const { studentId } = req.params;
    const { subjectId } = req.query;
    const streak = await buildStreakForStudent(studentId, subjectId || null);
    res.json(streak);
  } catch (error) {
    console.error('Get streak error:', error);
    res.status(500).json({ error: 'Failed to get streak' });
  }
};

// Получить вопросы с ошибками (упрощённо — все вопросы темы если не 100%)
exports.getIncorrectQuestions = async (req, res) => {
  try {
    const { studentId, topicId } = req.params;
    const best = await PracticeBest.findOne({ where: { studentId, topicId } });
    if (!best || best.percent === 100) return res.json({ questions: [] });
    const questions = await PracticeQuestion.findAll({
      where: { topicId, isActive: true },
      attributes: ['id', 'questionText', 'options', 'correctAnswer', 'explanation', 'difficulty'],
      order: [['createdAt', 'ASC']]
    });
    res.json({ questions });
  } catch (error) {
    console.error('Get incorrect questions error:', error);
    res.status(500).json({ error: 'Failed to get incorrect questions' });
  }
};

// ========== ПРОГНОЗНЫЙ БАЛЛ ЦТ ==========

exports.getPredictedScore = async (req, res) => {
  try {
    const { studentId, subjectId } = req.params;

    if (req.query.dashboard === '1') {
      const dashboard = await buildSubjectDashboard(studentId, subjectId, {
        getLocalDateStr,
        getLocalDayBounds,
        getPeriodBounds,
        buildStreakForStudent,
        getDailyGoalCompletionDates
      });
      if (!dashboard) return res.status(404).json({ error: 'Subject not found' });
      return res.json(dashboard);
    }

    const prediction = await buildPrediction(parseInt(studentId), parseInt(subjectId));

    const history = await PracticeScoreHistory.findAll({
      where: { studentId, subjectId },
      order: [['createdAt', 'DESC']],
      limit: 2
    });

    let delta = null;
    if (history.length >= 2 && prediction.unlocked) {
      delta = prediction.score - history[1].score;
    }

    res.json({ ...prediction, delta, previousScore: history[1]?.score ?? null });
  } catch (error) {
    console.error('Get predicted score error:', error);
    res.status(500).json({ error: 'Failed to get predicted score' });
  }
};

exports.getPredictedScoreAll = async (req, res) => {
  try {
    const { studentId } = req.params;
    const student = await User.findByPk(studentId, {
      include: [{ model: Subject, as: 'subjects', attributes: ['id', 'name', 'icon'] }]
    });
    if (!student) return res.status(404).json({ error: 'Student not found' });

    const subjects = await Promise.all(
      (student.subjects || []).map(async (subject) => {
        const prediction = await buildPrediction(parseInt(studentId), subject.id);
        return { subject, ...prediction };
      })
    );

    res.json({ subjects });
  } catch (error) {
    console.error('Get all predicted scores error:', error);
    res.status(500).json({ error: 'Failed to get predicted scores' });
  }
};

// ========== ЕЖЕДНЕВНАЯ ЦЕЛЬ ==========

exports.getDailyGoal = async (req, res) => {
  try {
    const { studentId } = req.params;
    const today = getLocalDateStr();
    const { start, end } = getLocalDayBounds(today);

    const student = await User.findByPk(studentId, {
      include: [{ model: Subject, as: 'subjects', attributes: ['id', 'name', 'icon'] }]
    });
    if (!student) return res.status(404).json({ error: 'Student not found' });

    const goals = await Promise.all((student.subjects || []).map(async (subject) =>
      buildDailyGoalEntry(studentId, subject, start, end)
    ));

    const totalCorrectToday = goals.reduce((sum, g) => sum + g.solved, 0);

    res.json({ goals, dailyGoal: CONFIG.DAILY_GOAL, totalCorrectToday, totalUniqueToday: totalCorrectToday });
  } catch (error) {
    console.error('Get daily goal error:', error);
    res.status(500).json({ error: 'Failed to get daily goal' });
  }
};

// ========== РЕЙТИНГ ==========

exports.getLeaderboard = async (req, res) => {
  try {
    const { subjectId } = req.params;
    const { period = 'day', studentId } = req.query;
    const { start, end } = getPeriodBounds(period);

    const rows = await PracticeQuestionResult.findAll({
      where: {
        subjectId: parseInt(subjectId),
        isCorrect: true,
        updatedAt: { [Op.gte]: start, [Op.lt]: end }
      },
      attributes: [
        'studentId',
        [sequelize.fn('COUNT', sequelize.fn('DISTINCT', sequelize.col('questionId'))), 'totalSolved']
      ],
      group: ['studentId'],
      raw: true
    });

    const studentIds = rows.map(l => l.studentId);
    const users = await User.findAll({
      where: { id: studentIds },
      attributes: ['id', 'firstName', 'lastName']
    });
    const userMap = {};
    users.forEach(u => { userMap[u.id] = u; });

    const ranked = rows
      .map(l => ({
        studentId: l.studentId,
        firstName: userMap[l.studentId]?.firstName || 'Ученик',
        lastName: userMap[l.studentId]?.lastName || '',
        totalSolved: parseInt(l.totalSolved, 10) || 0
      }))
      .sort((a, b) => b.totalSolved - a.totalSolved);

    ranked.forEach((entry, idx) => { entry.rank = idx + 1; });

    const top = ranked.slice(0, CONFIG.LEADERBOARD_TOP_N);
    let myPosition = null;
    if (studentId) {
      const me = ranked.find(r => r.studentId === parseInt(studentId));
      if (me) myPosition = me;
    }

    res.json({ period, top, myPosition, totalParticipants: ranked.length });
  } catch (error) {
    console.error('Get leaderboard error:', error);
    res.status(500).json({ error: 'Failed to get leaderboard' });
  }
};

// ========== СЛАБЫЕ ТЕМЫ ==========

exports.getWeakTopicsPractice = async (req, res) => {
  try {
    const { studentId, subjectId } = req.params;

    const wrongRows = await PracticeQuestionResult.findAll({
      where: {
        studentId: parseInt(studentId),
        subjectId: parseInt(subjectId),
        isCorrect: false
      },
      attributes: ['topicId'],
      group: ['topicId'],
      raw: true
    });

    const errorTopicIds = [...new Set(wrongRows.map(r => r.topicId).filter(Boolean))];

    if (errorTopicIds.length === 0) {
      return res.json({
        topics: [],
        questions: [],
        message: 'Пока нет слабых тем — ошибок в практике ещё не было'
      });
    }

    const topics = await PracticeTopic.findAll({
      where: { id: errorTopicIds, isActive: true },
      attributes: ['id', 'name', 'icon', 'description']
    });

    const questions = await PracticeQuestion.findAll({
      where: { topicId: errorTopicIds, isActive: true },
      attributes: ['id', 'questionText', 'options', 'correctAnswer', 'explanation', 'difficulty', 'topicId'],
      order: [['createdAt', 'ASC']]
    });

    res.json({
      topics: topics.map(t => t.toJSON()),
      questions: questions.map(q => q.toJSON())
    });
  } catch (error) {
    console.error('Get weak topics error:', error);
    res.status(500).json({ error: 'Failed to get weak topics' });
  }
};

// ========== ИСТОРИЯ БАЛЛА ==========

exports.getSubjectDashboard = async (req, res) => {
  try {
    const { studentId, subjectId } = req.params;
    const dashboard = await buildSubjectDashboard(studentId, subjectId, {
      getLocalDateStr,
      getLocalDayBounds,
      getPeriodBounds,
      buildStreakForStudent,
      getDailyGoalCompletionDates
    });
    if (!dashboard) return res.status(404).json({ error: 'Subject not found' });
    res.json(dashboard);
  } catch (error) {
    console.error('Get subject dashboard error:', error);
    res.status(500).json({ error: 'Failed to get dashboard' });
  }
};

exports.getScoreHistory = async (req, res) => {
  try {
    const { studentId, subjectId } = req.params;
    const history = await PracticeScoreHistory.findAll({
      where: { studentId, subjectId },
      order: [['createdAt', 'ASC']],
      limit: 30
    });

    const points = history.map(h => ({
      date: h.date,
      score: h.score,
      solvedCount: h.solvedCount
    }));

    let growth = null;
    if (points.length >= 2) {
      growth = points[points.length - 1].score - points[0].score;
    }

    res.json({ history: points, growth });
  } catch (error) {
    console.error('Get score history error:', error);
    res.status(500).json({ error: 'Failed to get score history' });
  }
};

// ========== АДМИН АНАЛИТИКА ==========

exports.getAdminPredicted = async (req, res) => {
  try {
    const { studentId } = req.params;
    const role = req.user?.role || 'admin';
    const isManager = role === 'manager';

    const student = await User.findByPk(studentId, {
      include: [{ model: Subject, as: 'subjects', attributes: ['id', 'name', 'icon'] }]
    });
    if (!student) return res.status(404).json({ error: 'Student not found' });

    const subjects = await Promise.all(
      (student.subjects || []).map(async (subject) => {
        const prediction = await buildPrediction(parseInt(studentId), subject.id);

        if (isManager) {
          return {
            subject: { id: subject.id, name: subject.name, icon: subject.icon },
            score: prediction.unlocked ? prediction.score : null,
            solved: prediction.solved,
            unlocked: prediction.unlocked
          };
        }

        const history = await PracticeScoreHistory.findAll({
          where: { studentId, subjectId: subject.id },
          order: [['createdAt', 'ASC']],
          limit: 10
        });

        return {
          subject: { id: subject.id, name: subject.name, icon: subject.icon },
          ...prediction,
          history: history.map(h => ({
            date: h.date,
            score: h.score,
            solvedCount: h.solvedCount
          }))
        };
      })
    );

    res.json({ studentId, subjects });
  } catch (error) {
    console.error('Get admin predicted error:', error);
    res.status(500).json({ error: 'Failed to get admin analytics' });
  }
};

// ========== ИМПОРТ ВОПРОСОВ ИЗ EXCEL ==========

exports.getQuestionsImportTemplate = async (req, res) => {
  try {
    const ExcelJS = require('exceljs');
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Questions');
    sheet.columns = [
      { header: 'question', width: 40 },
      { header: 'a', width: 18 },
      { header: 'b', width: 18 },
      { header: 'c', width: 18 },
      { header: 'd', width: 18 },
      { header: 'correct', width: 10 },
      { header: 'difficulty', width: 12 },
      { header: 'explanation', width: 30 },
    ];
    sheet.addRow(['Чему равно 2+2?', '3', '4', '5', '6', 'b', 'easy', 'Простое сложение']);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=questions_template.xlsx');
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Import template error:', error);
    res.status(500).json({ message: 'Не удалось сформировать шаблон' });
  }
};

exports.importQuestionsFromExcel = async (req, res) => {
  try {
    const { topicId } = req.params;

    if (!req.file) {
      return res.status(400).json({ message: 'Файл не загружен' });
    }

    const topic = await PracticeTopic.findByPk(topicId);
    if (!topic) {
      return res.status(404).json({ message: 'Тема не найдена' });
    }

    const ExcelJS = require('exceljs');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(req.file.buffer);
    const sheet = workbook.worksheets[0];
    const headerRow = sheet.getRow(1).values.slice(1);
    const rows = [];
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const obj = {};
      row.values.slice(1).forEach((val, i) => { obj[headerRow[i]] = val ?? ''; });
      rows.push(obj);
    });

    if (rows.length === 0) {
      return res.status(400).json({ message: 'Файл пустой или не содержит данных' });
    }

    const CORRECT_MAP = { a: 0, b: 1, c: 2, d: 3 };
    const VALID_DIFFICULTY = ['easy', 'medium', 'hard'];

    const toCreate = [];
    const errors = [];

    rows.forEach((row, i) => {
      const rowNum = i + 2;
      const q = String(row.question || '').trim();
      const a = String(row.a || '').trim();
      const b = String(row.b || '').trim();
      const c = String(row.c || '').trim();
      const d = String(row.d || '').trim();
      const correct = String(row.correct || '').trim().toLowerCase();
      const diffRaw = String(row.difficulty || '').trim().toLowerCase();
      const explanation = String(row.explanation || '').trim() || null;

      if (!q) {
        errors.push({ row: rowNum, reason: 'пустой вопрос' });
        return;
      }
      if (!a || !b || !c || !d) {
        errors.push({ row: rowNum, reason: 'не все варианты ответов заполнены' });
        return;
      }
      if (!(correct in CORRECT_MAP)) {
        errors.push({
          row: rowNum,
          reason: `некорректное значение correct: "${correct}" (допустимо: a, b, c, d)`,
        });
        return;
      }

      toCreate.push({
        topicId: parseInt(topicId, 10),
        questionText: q,
        options: [a, b, c, d],
        correctAnswer: CORRECT_MAP[correct],
        explanation,
        difficulty: VALID_DIFFICULTY.includes(diffRaw) ? diffRaw : 'medium',
        isActive: true,
      });
    });

    let imported = 0;
    if (toCreate.length > 0) {
      await PracticeQuestion.bulkCreate(toCreate);
      imported = toCreate.length;
    }

    res.json({ imported, skipped: errors.length, errors });
  } catch (error) {
    console.error('Import questions error:', error);
    res.status(500).json({ message: 'Ошибка при импорте' });
  }
};