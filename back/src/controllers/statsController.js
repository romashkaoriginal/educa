const { User, PracticeAttempt, HomeworkSubmission, QuizParticipant, PracticeTopic, Homework } = require('../models');
const { Op } = require('sequelize');

// Получить статистику студента
exports.getStudentStats = async (req, res) => {
  try {
    const { studentId } = req.params;

    // Проверка: студент существует?
    const student = await User.findByPk(studentId);
    if (!student || student.role !== 'student') {
      return res.status(404).json({ message: 'Student not found' });
    }

    // Получаем предметы студента
    const studentWithSubjects = await User.findByPk(studentId, {
      include: [{
        model: require('../models').Subject,
        as: 'subjects',
        attributes: ['id']
      }]
    });

    const subjectIds = studentWithSubjects.subjects.map(s => s.id);

    // 1. Статистика практики
    const totalPracticeTopics = await PracticeTopic.count({
      where: { subjectId: { [Op.in]: subjectIds } }
    });

    const completedPractice = await PracticeAttempt.count({
      where: { userId: studentId }
    });

    const practiceAttempts = await PracticeAttempt.findAll({
      where: { userId: studentId },
      attributes: ['score', 'questionsTotal', 'questionsCorrect']
    });

    const totalPracticeScore = practiceAttempts.reduce((sum, att) => sum + att.score, 0);
    const averagePracticeScore = practiceAttempts.length > 0 
      ? Math.round(totalPracticeScore / practiceAttempts.length) 
      : 0;

    // 2. Статистика домашних заданий
    const totalHomeworks = await Homework.count({
      where: { 
        subjectId: { [Op.in]: subjectIds },
        isPublished: true
      }
    });

    const homeworkSubmissions = await HomeworkSubmission.findAll({
      where: { userId: studentId },
      attributes: ['totalScore', 'status']
    });

    const completedHomeworks = homeworkSubmissions.filter(
      hw => hw.status === 'checked' || hw.status === 'submitted'
    ).length;

    const totalHomeworkScore = homeworkSubmissions.reduce((sum, hw) => sum + hw.totalScore, 0);
    const averageHomeworkScore = homeworkSubmissions.length > 0
      ? Math.round(totalHomeworkScore / homeworkSubmissions.length)
      : 0;

    // 3. Статистика викторин
    const quizParticipations = await QuizParticipant.findAll({
      where: { userId: studentId },
      attributes: ['totalScore', 'rank', 'status']
    });

    const completedQuizzes = quizParticipations.filter(
      q => q.status === 'completed'
    ).length;

    const totalQuizScore = quizParticipations.reduce((sum, q) => sum + q.totalScore, 0);
    const averageQuizScore = quizParticipations.length > 0
      ? Math.round(totalQuizScore / quizParticipations.length)
      : 0;

    const averageRank = quizParticipations.length > 0
      ? Math.round(
          quizParticipations.reduce((sum, q) => sum + (q.rank || 0), 0) / quizParticipations.length
        )
      : 0;

    // Формируем ответ
    res.json({
      studentId,
      stats: {
        practice: {
          total: totalPracticeTopics,
          completed: completedPractice,
          averageScore: averagePracticeScore
        },
        homework: {
          total: totalHomeworks,
          completed: completedHomeworks,
          averageScore: averageHomeworkScore,
          submissions: homeworkSubmissions.length
        },
        quizzes: {
          total: quizParticipations.length,
          completed: completedQuizzes,
          averageScore: averageQuizScore,
          averageRank: averageRank
        }
      }
    });
  } catch (error) {
    console.error('Get student stats error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Получить детальную историю активности студента
exports.getStudentActivity = async (req, res) => {
  try {
    const { studentId } = req.params;

    // Практика
    const practiceAttempts = await PracticeAttempt.findAll({
      where: { userId: studentId },
      include: [{
        model: require('../models').PracticeTopic,
        as: 'topic',
        attributes: ['title', 'difficulty']
      }],
      order: [['completedAt', 'DESC']],
      limit: 10
    });

    // Домашние задания
    const homeworkSubmissions = await HomeworkSubmission.findAll({
      where: { userId: studentId },
      include: [{
        model: require('../models').Homework,
        as: 'homework',
        attributes: ['title']
      }],
      order: [['submittedAt', 'DESC']],
      limit: 10
    });

    // Викторины
    const quizParticipations = await QuizParticipant.findAll({
      where: { userId: studentId },
      include: [{
        model: require('../models').Quiz,
        attributes: ['title']
      }],
      order: [['finishedAt', 'DESC']],
      limit: 10
    });

    res.json({
      activity: {
        practice: practiceAttempts,
        homework: homeworkSubmissions,
        quizzes: quizParticipations
      }
    });
  } catch (error) {
    console.error('Get student activity error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};