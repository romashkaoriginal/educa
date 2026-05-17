const { PracticeTopic, PracticeQuestion, PracticeAttempt, Subject, User } = require('../models');
const { Op } = require('sequelize');
const sequelize = require('../config/database');

// ... существующий код ...

// Сохранить попытку
exports.saveAttempt = async (req, res) => {
  try {
    const { studentId, topicId, questionId, subjectId, selectedAnswer, isCorrect, timeSpent } = req.body;

    const attempt = await PracticeAttempt.create({
      studentId,
      topicId,
      questionId,
      subjectId,
      selectedAnswer,
      isCorrect,
      timeSpent: timeSpent || 0
    });

    res.json({ success: true, attempt });
  } catch (error) {
    console.error('Save attempt error:', error);
    res.status(500).json({ error: 'Failed to save attempt' });
  }
};

// Получить статистику студента
exports.getStudentStats = async (req, res) => {
  try {
    const { studentId } = req.params;

    // Общая статистика
    const totalAttempts = await PracticeAttempt.count({
      where: { studentId }
    });

    const correctAttempts = await PracticeAttempt.count({
      where: { studentId, isCorrect: true }
    });

    const incorrectAttempts = totalAttempts - correctAttempts;
    const successRate = totalAttempts > 0 ? Math.round((correctAttempts / totalAttempts) * 100) : 0;

    // Статистика по предметам
    const subjectStats = await PracticeAttempt.findAll({
      where: { studentId },
      attributes: [
        'subjectId',
        [sequelize.fn('COUNT', sequelize.col('PracticeAttempt.id')), 'total'],
        [sequelize.fn('SUM', sequelize.literal('CASE WHEN "PracticeAttempt"."isCorrect" = true THEN 1 ELSE 0 END')), 'correct']
      ],
      include: [{
        model: Subject,
        as: 'subject',
        attributes: ['name', 'icon']
      }],
      group: ['subjectId', 'subject.id'],
      raw: false
    });

    // Статистика по подразделам (топикам)
    const topicStats = await PracticeAttempt.findAll({
      where: { studentId },
      attributes: [
        'topicId',
        [sequelize.fn('COUNT', sequelize.col('PracticeAttempt.id')), 'total'],
        [sequelize.fn('SUM', sequelize.literal('CASE WHEN "PracticeAttempt"."isCorrect" = true THEN 1 ELSE 0 END')), 'correct']
      ],
      include: [{
        model: PracticeTopic,
        as: 'topic',
        attributes: ['name', 'icon'],
        include: [{
          model: Subject,
          as: 'subject',
          attributes: ['name']
        }]
      }],
      group: ['topicId', 'topic.id', 'topic->subject.id'],
      raw: false
    });

    // Последние 10 решенных заданий
    const recentAttempts = await PracticeAttempt.findAll({
      where: { studentId },
      include: [
        {
          model: PracticeQuestion,
          as: 'question',
          attributes: ['questionText']
        },
        {
          model: PracticeTopic,
          as: 'topic',
          attributes: ['name', 'icon']
        },
        {
          model: Subject,
          as: 'subject',
          attributes: ['name', 'icon']
        }
      ],
      order: [['createdAt', 'DESC']],
      limit: 10
    });

    // Динамика за последние 30 дней
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const dynamicsData = await PracticeAttempt.findAll({
      where: {
        studentId,
        createdAt: { [Op.gte]: thirtyDaysAgo }
      },
      attributes: [
        [sequelize.fn('DATE', sequelize.col('createdAt')), 'date'],
        [sequelize.fn('COUNT', sequelize.col('id')), 'total'],
        [sequelize.fn('SUM', sequelize.literal('CASE WHEN "isCorrect" = true THEN 1 ELSE 0 END')), 'correct']
      ],
      group: [sequelize.fn('DATE', sequelize.col('createdAt'))],
      order: [[sequelize.fn('DATE', sequelize.col('createdAt')), 'ASC']],
      raw: true
    });

    res.json({
      stats: {
        total: totalAttempts,
        correct: correctAttempts,
        incorrect: incorrectAttempts,
        successRate
      },
      subjectStats,
      topicStats,
      recentAttempts,
      dynamics: dynamicsData
    });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ error: 'Failed to get statistics' });
  }
};

// Получить вопросы с учётом ошибок (для режима "только ошибки")
exports.getIncorrectQuestions = async (req, res) => {
  try {
    const { studentId, topicId } = req.params;

    // Находим ID вопросов, на которые студент ответил неправильно
    const incorrectQuestionIds = await PracticeAttempt.findAll({
      where: {
        studentId,
        topicId,
        isCorrect: false
      },
      attributes: [[sequelize.fn('DISTINCT', sequelize.col('questionId')), 'questionId']],
      raw: true
    });

    const questionIds = incorrectQuestionIds.map(q => q.questionId);

    if (questionIds.length === 0) {
      return res.json({ questions: [] });
    }

    const questions = await PracticeQuestion.findAll({
      where: {
        id: { [Op.in]: questionIds },
        isActive: true
      },
      order: [['createdAt', 'ASC']]
    });

    res.json({ questions });
  } catch (error) {
    console.error('Get incorrect questions error:', error);
    res.status(500).json({ error: 'Failed to get incorrect questions' });
  }
};