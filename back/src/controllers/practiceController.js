const { PracticeTopic, PracticeQuestion, PracticeAttempt, Subject, User } = require('../models');
const { Op } = require('sequelize');
const sequelize = require('../config/database');

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
        const questionCount = await PracticeQuestion.count({
          where: { topicId: topic.id }
        });
        return {
          ...topic.toJSON(),
          questionCount
        };
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

    if (!name || !subjectId) {
      return res.status(400).json({ message: 'Name and subjectId required' });
    }

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

// Получить вопросы по топику
exports.getQuestionsByTopic = async (req, res) => {
  try {
    const { topicId } = req.params;

    const questions = await PracticeQuestion.findAll({
      where: { topicId },
      attributes: [
        'id',
        'questionText',
        'options',
        'correctAnswer',
        'explanation',
        'difficulty',
        'isActive',
        'createdAt'
      ],
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
      return res.status(400).json({ 
        message: 'topicId, questionText, and 4 options required' 
      });
    }

    if (correctAnswer < 0 || correctAnswer > 3) {
      return res.status(400).json({ message: 'correctAnswer must be 0-3' });
    }

    const question = await PracticeQuestion.create({
      topicId,
      questionText,
      options,
      correctAnswer,
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
    if (!question) {
      return res.status(404).json({ message: 'Question not found' });
    }

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
    if (!question) {
      return res.status(404).json({ message: 'Question not found' });
    }

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
    if (!question) {
      return res.status(404).json({ message: 'Question not found' });
    }

    await question.destroy();

    res.json({ message: 'Question deleted' });
  } catch (error) {
    console.error('Delete question error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// ========== ПОПЫТКИ И СТАТИСТИКА ==========

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

    const totalAttempts = await PracticeAttempt.count({ where: { studentId } });
    const correctAttempts = await PracticeAttempt.count({ where: { studentId, isCorrect: true } });
    const incorrectAttempts = totalAttempts - correctAttempts;
    const successRate = totalAttempts > 0 ? Math.round((correctAttempts / totalAttempts) * 100) : 0;

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

    const recentAttempts = await PracticeAttempt.findAll({
      where: { studentId },
      include: [
        { model: PracticeQuestion, as: 'question', attributes: ['questionText'] },
        { model: PracticeTopic, as: 'topic', attributes: ['name', 'icon'] },
        { model: Subject, as: 'subject', attributes: ['name', 'icon'] }
      ],
      order: [['createdAt', 'DESC']],
      limit: 10
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
      recentAttempts
    });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ error: 'Failed to get statistics' });
  }
};

// Получить вопросы с ошибками
exports.getIncorrectQuestions = async (req, res) => {
  try {
    const { studentId, topicId } = req.params;

    const incorrectQuestionIds = await PracticeAttempt.findAll({
      where: { studentId, topicId, isCorrect: false },
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