const { 
  PracticeBest,
  PracticeDailyLog,
  PracticeTopic, 
  PracticeQuestion,
  Subject, 
  User,
  HomeworkSubmission,
  Homework,
  QuizParticipant,
  Quiz
} = require('../models');
const { Op } = require('sequelize');
const sequelize = require('../config/database');

// ========== СТАТИСТИКА УЧЕНИКА ==========

// Общая статистика ученика (все разделы)
exports.getStudentStats = async (req, res) => {
  try {
    const { studentId } = req.params;

    // ===== ПРАКТИКА =====
    const practiceStats = await getPracticeStats(studentId);
    
    // ===== ДОМАШКА =====
    const homeworkStats = await getHomeworkStats(studentId);
    
    // ===== ВИКТОРИНЫ =====
    const quizStats = await getQuizStats(studentId);

    res.json({
      practice: practiceStats,
      homework: homeworkStats,
      quiz: quizStats
    });
  } catch (error) {
    console.error('Get student stats error:', error);
    res.status(500).json({ error: 'Failed to get statistics' });
  }
};

// Статистика по практике
async function getPracticeStats(studentId) {
  try {
    const totalAttempts = await PracticeAttempt.count({ where: { studentId } });
    const correctAttempts = await PracticeAttempt.count({ where: { studentId, isCorrect: true } });
    const incorrectAttempts = totalAttempts - correctAttempts;
    const successRate = totalAttempts > 0 ? Math.round((correctAttempts / totalAttempts) * 100) : 0;

    // Доступные предметы
    const student = await User.findByPk(studentId, {
      include: [{
        model: Subject,
        as: 'subjects',
        attributes: ['id', 'name', 'icon']
      }]
    });

    const availableSubjects = student?.subjects || [];

    // По предметам
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

    // По подразделам
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

    return {
      availableSubjects,
      totalAttempts,
      correctAttempts,
      incorrectAttempts,
      successRate,
      subjectStats,
      topicStats
    };
  } catch (error) {
    console.error('Practice stats error:', error);
    return null;
  }
}

// Статистика по домашке
async function getHomeworkStats(studentId) {
  try {
    const submissions = await HomeworkSubmission.findAll({
      where: { userId: studentId },
      include: [{
        model: Homework,
        as: 'homework',
        attributes: ['title', 'deadline', 'subjectId'],
        include: [{
          model: Subject,
          as: 'subject',
          attributes: ['name', 'icon']
        }]
      }],
      order: [['createdAt', 'DESC']]
    });

    return submissions.map(sub => ({
      id: sub.id,
      title: sub.homework?.title || 'Без названия',
      subject: sub.homework?.subject,
      status: sub.status || 'pending',
      score: sub.score || 0,
      maxScore: sub.maxScore || 100,
      percentage: sub.maxScore > 0 ? Math.round((sub.score / sub.maxScore) * 100) : 0,
      startDate: sub.createdAt,
      submitDate: sub.submittedAt,
      deadline: sub.homework?.deadline
    }));
  } catch (error) {
    console.error('Homework stats error:', error);
    return [];
  }
}

// Статистика по викторинам
async function getQuizStats(studentId) {
  try {
    const participations = await QuizParticipant.findAll({
      where: { userId: studentId },
      include: [{
        model: Quiz,
        attributes: ['title', 'subjectId'],
        include: [{
          model: Subject,
          as: 'subject',
          attributes: ['name', 'icon']
        }]
      }],
      order: [['createdAt', 'DESC']]
    });

    // Формируем статистику викторин
    const quizzesStats = participations.map((part) => {
      return {
        id: part.id,
        quizTitle: part.Quiz?.title || 'Без названия',
        subject: part.Quiz?.subject,
        score: part.score || 0,
        participationDate: part.createdAt
      };
    });

    return quizzesStats;
  } catch (error) {
    console.error('Quiz stats error:', error);
    return [];
  }
}

// ========== СТАТИСТИКА АДМИНА ==========

// Общая админская статистика с фильтрами
exports.getAdminStats = async (req, res) => {
  try {
    const { 
      studentId, 
      subjectId, 
      section, // 'practice', 'homework', 'quiz'
      dateFrom, 
      dateTo, 
      minPercent, 
      maxPercent 
    } = req.query;

    const whereClause = {};
    if (studentId) whereClause.studentId = studentId;
    if (subjectId) whereClause.subjectId = subjectId;
    
    if (dateFrom || dateTo) {
      whereClause.createdAt = {};
      if (dateFrom) whereClause.createdAt[Op.gte] = new Date(dateFrom);
      if (dateTo) whereClause.createdAt[Op.lte] = new Date(dateTo);
    }

    const result = {};

    // Статистика по практике — из PracticeDailyLog (только сегодня)
    if (!section || section === 'practice') {
      const today = new Date().toISOString().slice(0, 10);

      const dailyLogs = await PracticeDailyLog.findAll({
        where: { date: today },
        include: [
          { model: Subject, as: 'subject', attributes: ['id', 'name', 'icon'] }
        ]
      });

      // Группируем по предмету
      const bySubject = {};
      dailyLogs.forEach(log => {
        const sid = log.subjectId;
        if (!bySubject[sid]) bySubject[sid] = {
          subjectId: sid,
          subject: log.subject,
          studentIds: new Set(),
          totalAttempts: 0
        };
        bySubject[sid].studentIds.add(log.studentId);
        bySubject[sid].totalAttempts += log.attemptsCount;
      });

      result.practice = Object.values(bySubject).map(s => ({
        subjectId: s.subjectId,
        subject: s.subject,
        uniqueStudents: s.studentIds.size,
        totalAttempts: s.totalAttempts,
        avgPerStudent: s.studentIds.size > 0 ? Math.round(s.totalAttempts / s.studentIds.size) : 0
      }));
    }

    // Статистика по домашке
    if (!section || section === 'homework') {
      const homeworkWhere = {};
      if (studentId) homeworkWhere.userId = studentId;

      const homeworks = await HomeworkSubmission.findAll({
        where: homeworkWhere,
        include: [
          { model: User, as: 'student', attributes: ['id', 'firstName', 'lastName'] },
          { 
            model: Homework, 
            as: 'homework',
            attributes: ['title', 'deadline'],
            include: [{ model: Subject, as: 'subject', attributes: ['name'] }]
          }
        ],
        order: [['createdAt', 'DESC']]
      });

      result.homework = homeworks.filter(h => {
        if (minPercent || maxPercent) {
          const percent = h.maxScore > 0 ? (h.score / h.maxScore) * 100 : 0;
          if (minPercent && percent < parseInt(minPercent)) return false;
          if (maxPercent && percent > parseInt(maxPercent)) return false;
        }
        return true;
      });
    }

    // Статистика по викторинам
    if (!section || section === 'quiz') {
      const quizWhere = {};
      if (studentId) quizWhere.userId = studentId;

      const quizzes = await QuizParticipant.findAll({
        where: quizWhere,
        include: [
          { model: User, as: 'user', attributes: ['id', 'firstName', 'lastName'] },
          { 
            model: Quiz,
            attributes: ['title'],
            include: [{ model: Subject, as: 'subject', attributes: ['name'] }]
          }
        ],
        order: [['createdAt', 'DESC']]
      });

      result.quiz = quizzes;
    }

    res.json(result);
  } catch (error) {
    console.error('Get admin stats error:', error);
    res.status(500).json({ error: 'Failed to get admin statistics' });
  }
};

// Список всех учеников для фильтра
exports.getStudentsForFilter = async (req, res) => {
  try {
    const students = await User.findAll({
      where: { role: 'student' },
      attributes: ['id', 'firstName', 'lastName'],
      order: [['firstName', 'ASC']]
    });

    res.json({ students });
  } catch (error) {
    console.error('Get students error:', error);
    res.status(500).json({ error: 'Failed to get students' });
  }
};