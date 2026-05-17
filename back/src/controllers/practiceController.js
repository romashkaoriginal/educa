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

// Обновить топик
exports.updateTopic = async (req, res) => {
  try {
    const { topicId } = req.params;
    const { name, description, icon } = req.body;

    const topic = await PracticeTopic.findByPk(topicId);
    if (!topic) {
      return res.status(404).json({ message: 'Topic not found' });
    }

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
    if (!topic) {
      return res.status(404).json({ message: 'Topic not found' });
    }

    // Шаг 1: Найти все вопросы этого топика
    const questions = await PracticeQuestion.findAll({
      where: { topicId: topic.id },
      attributes: ['id']
    });

    const questionIds = questions.map(q => q.id);

    // Шаг 2: Удалить все попытки по этим вопросам
    if (questionIds.length > 0) {
      await PracticeAttempt.destroy({
        where: { questionId: questionIds }
      });
    }

    // Шаг 3: Удалить все вопросы
    await PracticeQuestion.destroy({
      where: { topicId: topic.id }
    });

    // Шаг 4: Удалить сам топик
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

// Получить статистику по конкретному топику для студента (последняя попытка)
exports.getTopicStats = async (req, res) => {
  try {
    const { studentId, topicId } = req.params;

    // Получаем последнюю попытку по каждому вопросу в этом топике
    const lastAttempts = await sequelize.query(`
      SELECT DISTINCT ON ("questionId") "questionId", "isCorrect"
      FROM practice_attempts
      WHERE "studentId" = :studentId AND "topicId" = :topicId
      ORDER BY "questionId", "createdAt" DESC
    `, {
      replacements: { studentId, topicId },
      type: sequelize.QueryTypes.SELECT
    });

    const total = lastAttempts.length;
    const correct = lastAttempts.filter(a => a.isCorrect).length;
    const successRate = total > 0 ? Math.round((correct / total) * 100) : 0;

    res.json({
      total,
      correct,
      incorrect: total - correct,
      successRate
    });
  } catch (error) {
    console.error('Get topic stats error:', error);
    res.status(500).json({ error: 'Failed to get topic statistics' });
  }
};

// Получить статистику студента (по последним попыткам)
exports.getStudentStats = async (req, res) => {
  try {
    const { studentId } = req.params;

    // Все последние попытки по каждому вопросу
    const lastAttempts = await sequelize.query(`
      SELECT DISTINCT ON (pa."questionId") 
        pa."questionId", 
        pa."isCorrect", 
        pa."topicId", 
        pa."subjectId",
        pa."createdAt"
      FROM practice_attempts pa
      WHERE pa."studentId" = :studentId
      ORDER BY pa."questionId", pa."createdAt" DESC
    `, {
      replacements: { studentId },
      type: sequelize.QueryTypes.SELECT
    });

    const totalAttempts = lastAttempts.length;
    const correctAttempts = lastAttempts.filter(a => a.isCorrect).length;
    const incorrectAttempts = totalAttempts - correctAttempts;
    const successRate = totalAttempts > 0 ? Math.round((correctAttempts / totalAttempts) * 100) : 0;

    // Группируем по предметам
    const subjectMap = {};
    for (const attempt of lastAttempts) {
      const sid = attempt.subjectId;
      if (!subjectMap[sid]) {
        subjectMap[sid] = { total: 0, correct: 0 };
      }
      subjectMap[sid].total++;
      if (attempt.isCorrect) subjectMap[sid].correct++;
    }

    // Получаем инфу о предметах
    const subjectIds = Object.keys(subjectMap);
    const subjects = await Subject.findAll({
      where: { id: subjectIds },
      attributes: ['id', 'name', 'icon']
    });

    const subjectStats = subjects.map(subj => ({
      subjectId: subj.id,
      subject: { name: subj.name, icon: subj.icon },
      total: subjectMap[subj.id].total,
      correct: subjectMap[subj.id].correct,
      successRate: Math.round((subjectMap[subj.id].correct / subjectMap[subj.id].total) * 100)
    }));

    // Группируем по топикам
    const topicMap = {};
    for (const attempt of lastAttempts) {
      const tid = attempt.topicId;
      if (!topicMap[tid]) {
        topicMap[tid] = { total: 0, correct: 0 };
      }
      topicMap[tid].total++;
      if (attempt.isCorrect) topicMap[tid].correct++;
    }

    // Получаем инфу о топиках
    const topicIds = Object.keys(topicMap);
    const topics = await PracticeTopic.findAll({
      where: { id: topicIds },
      attributes: ['id', 'name', 'icon'],
      include: [{
        model: Subject,
        as: 'subject',
        attributes: ['name']
      }]
    });

    const topicStats = topics.map(t => ({
      topicId: t.id,
      topic: { 
        name: t.name, 
        icon: t.icon, 
        subject: { name: t.subject?.name }
      },
      total: topicMap[t.id].total,
      correct: topicMap[t.id].correct,
      successRate: Math.round((topicMap[t.id].correct / topicMap[t.id].total) * 100)
    }));

    // Последние 20 решений (по дате)
    const recentAttempts = await PracticeAttempt.findAll({
      where: { studentId },
      include: [
        { model: PracticeQuestion, as: 'question', attributes: ['questionText'] },
        { model: PracticeTopic, as: 'topic', attributes: ['name', 'icon'] },
        { model: Subject, as: 'subject', attributes: ['name', 'icon'] }
      ],
      order: [['createdAt', 'DESC']],
      limit: 20
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