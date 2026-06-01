const { PracticeTopic, PracticeQuestion, PracticeAttempt, PracticeBest, PracticeDailyLog, Subject, User } = require('../models');
const { Op } = require('sequelize');
const sequelize = require('../config/database');

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

// ========== АДМИН ФУНКЦИИ ==========

// Получить разделы практики по предмету
exports.getTopicsBySubject = async (req, res) => {
  try {
    const { subjectId } = req.params;
    const topics = await PracticeTopic.findAll({
      where: { subjectId },
      attributes: ['id', 'name', 'description', 'icon', 'isActive', 'createdAt'],
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
    const { name, description, icon, subjectId } = req.body;
    if (!name || !subjectId) return res.status(400).json({ message: 'Name and subjectId required' });
    const topic = await PracticeTopic.create({
      name,
      description: description || '',
      icon: icon || '📝',
      subjectId,
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
    const { name, description, icon } = req.body;
    const topic = await PracticeTopic.findByPk(topicId);
    if (!topic) return res.status(404).json({ message: 'Topic not found' });
    if (name) topic.name = name;
    if (description !== undefined) topic.description = description;
    if (icon) topic.icon = icon;
    await topic.save();
    res.json({ topic });
  } catch (error) {
    console.error('Update topic error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Удалить топик
exports.deleteTopic = async (req, res) => {
  try {
    const { topicId } = req.params;
    const topic = await PracticeTopic.findByPk(topicId);
    if (!topic) return res.status(404).json({ message: 'Topic not found' });

    const questions = await PracticeQuestion.findAll({ where: { topicId: topic.id }, attributes: ['id'] });
    const questionIds = questions.map(q => q.id);

    // Удаляем старые попытки если они ещё есть
    if (questionIds.length > 0) {
      await PracticeAttempt.destroy({ where: { questionId: questionIds } }).catch(() => {});
    }

    // Удаляем PracticeBest и PracticeDailyLog по теме
    await PracticeBest.destroy({ where: { topicId: topic.id } });

    await PracticeQuestion.destroy({ where: { topicId: topic.id } });
    await topic.destroy();

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

// Удалить вопрос
exports.deleteQuestion = async (req, res) => {
  try {
    const { questionId } = req.params;
    const question = await PracticeQuestion.findByPk(questionId);
    if (!question) return res.status(404).json({ message: 'Question not found' });
    await question.destroy();
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
    const { studentId, topicId, subjectId, correct, total } = req.body;

    if (!studentId || !topicId || !subjectId || correct === undefined || !total) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const percent = total > 0 ? Math.round(correct / total * 100) : 0;
    const today = new Date().toISOString().slice(0, 10);

    // 1. Обновляем PracticeBest — только если результат лучше
    const [best, created] = await PracticeBest.findOrCreate({
      where: { studentId, topicId },
      defaults: { studentId, topicId, subjectId, correct, total, percent }
    });

    if (!created && percent > best.percent) {
      await best.update({ correct, total, percent });
    }

    // 2. Инкрементируем PracticeDailyLog
    const [log, logCreated] = await PracticeDailyLog.findOrCreate({
      where: { studentId, subjectId, date: today },
      defaults: { studentId, subjectId, date: today, attemptsCount: total }
    });

    if (!logCreated) {
      await log.increment('attemptsCount', { by: total });
    }

    // Инвалидируем кэш статистики
    invalidateCache(`stats_${studentId}`);

    res.json({ success: true });
  } catch (error) {
    console.error('Save attempt error:', error);
    res.status(500).json({ error: 'Failed to save attempt' });
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