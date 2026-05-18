const sequelize = require('../config/database');

// Импорт всех моделей
const User = require('./User');
const Subject = require('./Subject');
const UserSubject = require('./UserSubject');
const Quiz = require('./Quiz');
const QuizQuestion = require('./QuizQuestion');
const QuizParticipant = require('./QuizParticipant');
const QuizAnswer = require('./QuizAnswer');
const Homework = require('./Homework');
const HomeworkQuestion = require('./HomeworkQuestion');
const HomeworkSubmission = require('./HomeworkSubmission');
const HomeworkAnswer = require('./HomeworkAnswer');
const PracticeTopic = require('./PracticeTopic');
const PracticeQuestion = require('./PracticeQuestion');
const PracticeAttempt = require('./PracticeAttempt');
const BotUser = require('./BotUser');

// ========== СВЯЗИ С SUBJECTS ==========
User.belongsToMany(Subject, { 
  through: UserSubject, 
  foreignKey: 'userId', 
  as: 'subjects' 
});
Subject.belongsToMany(User, { 
  through: UserSubject, 
  foreignKey: 'subjectId', 
  as: 'students' 
});

Subject.hasMany(Homework, { foreignKey: 'subjectId', as: 'homeworks' });
Homework.belongsTo(Subject, { foreignKey: 'subjectId', as: 'subject' });

Subject.hasMany(PracticeTopic, { foreignKey: 'subjectId', as: 'practiceTopics' });
PracticeTopic.belongsTo(Subject, { foreignKey: 'subjectId', as: 'subject' });

// ========== СВЯЗИ BOTUSER ==========
BotUser.belongsTo(User, { foreignKey: 'userId', as: 'assignedUser' });
User.hasOne(BotUser, { foreignKey: 'userId', as: 'botProfile' });

// ========== QUIZ ==========
User.hasMany(Quiz, { foreignKey: 'createdBy', as: 'createdQuizzes' });
Quiz.belongsTo(User, { foreignKey: 'createdBy', as: 'creator' });

// ОСТАВЬТЕ ТОЛЬКО ОДИН РАЗ:
Quiz.hasMany(QuizQuestion, { foreignKey: 'quizId', as: 'questions' });
QuizQuestion.belongsTo(Quiz, { foreignKey: 'quizId' });

Quiz.hasMany(QuizParticipant, { foreignKey: 'quizId', as: 'participants' });
QuizParticipant.belongsTo(Quiz, { foreignKey: 'quizId' });

User.hasMany(QuizParticipant, { foreignKey: 'userId', as: 'quizParticipations' });
QuizParticipant.belongsTo(User, { foreignKey: 'userId', as: 'user' });

QuizParticipant.hasMany(QuizAnswer, { foreignKey: 'participantId', as: 'answers' });
QuizAnswer.belongsTo(QuizParticipant, { foreignKey: 'participantId' });

QuizQuestion.hasMany(QuizAnswer, { foreignKey: 'questionId' });
QuizAnswer.belongsTo(QuizQuestion, { foreignKey: 'questionId', as: 'question' });

// ========== HOMEWORK ==========
User.hasMany(Homework, { foreignKey: 'createdBy', as: 'createdHomeworks' });
Homework.belongsTo(User, { foreignKey: 'createdBy', as: 'creator' });

Homework.hasMany(HomeworkQuestion, { foreignKey: 'homeworkId', as: 'questions' });
HomeworkQuestion.belongsTo(Homework, { foreignKey: 'homeworkId' });

Homework.hasMany(HomeworkSubmission, { foreignKey: 'homeworkId', as: 'submissions' });
HomeworkSubmission.belongsTo(Homework, { foreignKey: 'homeworkId', as: 'homework' });

User.hasMany(HomeworkSubmission, { foreignKey: 'userId', as: 'homeworkSubmissions' });
HomeworkSubmission.belongsTo(User, { foreignKey: 'userId', as: 'student' });

HomeworkSubmission.hasMany(HomeworkAnswer, { foreignKey: 'submissionId', as: 'answers' });
HomeworkAnswer.belongsTo(HomeworkSubmission, { foreignKey: 'submissionId' });

HomeworkQuestion.hasMany(HomeworkAnswer, { foreignKey: 'questionId' });
HomeworkAnswer.belongsTo(HomeworkQuestion, { foreignKey: 'questionId', as: 'question' });

// ========== PRACTICE ==========
PracticeTopic.hasMany(PracticeQuestion, { foreignKey: 'topicId', as: 'questions' });
PracticeQuestion.belongsTo(PracticeTopic, { foreignKey: 'topicId' });

PracticeAttempt.belongsTo(User, { foreignKey: 'studentId', as: 'student' });
PracticeAttempt.belongsTo(PracticeTopic, { foreignKey: 'topicId', as: 'topic' });
PracticeAttempt.belongsTo(PracticeQuestion, { foreignKey: 'questionId', as: 'question' });
PracticeAttempt.belongsTo(Subject, { foreignKey: 'subjectId', as: 'subject' });

User.hasMany(PracticeAttempt, { foreignKey: 'studentId', as: 'practiceAttempts' });
PracticeTopic.hasMany(PracticeAttempt, { foreignKey: 'topicId', as: 'attempts' });
PracticeQuestion.hasMany(PracticeAttempt, { foreignKey: 'questionId', as: 'attempts' });
Subject.hasMany(PracticeAttempt, { foreignKey: 'subjectId', as: 'practiceAttempts' });

// Синхронизация моделей с БД
const syncDatabase = async () => {
  try {
    await sequelize.sync({ alter: true });
    console.log('✅ Database models synchronized');
  } catch (error) {
    console.error('❌ Error synchronizing models:', error);
  }
};

module.exports = {
  sequelize,
  User,
  Subject,
  UserSubject,
  Quiz,
  QuizQuestion,
  QuizParticipant,
  QuizAnswer,
  Homework,
  HomeworkQuestion,
  HomeworkSubmission,
  HomeworkAnswer,
  PracticeTopic,
  PracticeQuestion,
  PracticeAttempt,
  BotUser,
  syncDatabase
};