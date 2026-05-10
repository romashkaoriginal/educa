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
const BotUser = require('./BotUser'); // ← ДОБАВЬ ЭТУ СТРОКУ

// ========== НОВЫЕ СВЯЗИ С SUBJECTS ==========

// User ↔ Subject (многие ко многим через UserSubject)
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

// Subject → Homeworks
Subject.hasMany(Homework, { foreignKey: 'subjectId', as: 'homeworks' });
Homework.belongsTo(Subject, { foreignKey: 'subjectId', as: 'subject' });

// Subject → PracticeTopics
Subject.hasMany(PracticeTopic, { foreignKey: 'subjectId', as: 'practiceTopics' });
PracticeTopic.belongsTo(Subject, { foreignKey: 'subjectId', as: 'subject' });

// ========== СВЯЗИ BOTUSER ========== ← ДОБАВЬ ВСЁ ЭТО
// BotUser → User (опционально, если назначен в систему)
BotUser.belongsTo(User, { foreignKey: 'userId', as: 'assignedUser' });
User.hasOne(BotUser, { foreignKey: 'userId', as: 'botProfile' });

// ========== СУЩЕСТВУЮЩИЕ СВЯЗИ ==========

// User → Quizzes (создатель)
User.hasMany(Quiz, { foreignKey: 'createdBy', as: 'createdQuizzes' });
Quiz.belongsTo(User, { foreignKey: 'createdBy', as: 'creator' });

// Quiz → QuizQuestions
Quiz.hasMany(QuizQuestion, { foreignKey: 'quizId', as: 'questions' });
QuizQuestion.belongsTo(Quiz, { foreignKey: 'quizId' });

// Quiz → QuizParticipants
Quiz.hasMany(QuizParticipant, { foreignKey: 'quizId', as: 'participants' });
QuizParticipant.belongsTo(Quiz, { foreignKey: 'quizId' });

// User → QuizParticipants
User.hasMany(QuizParticipant, { foreignKey: 'userId', as: 'quizParticipations' });
QuizParticipant.belongsTo(User, { foreignKey: 'userId', as: 'user' });

// QuizParticipant → QuizAnswers
QuizParticipant.hasMany(QuizAnswer, { foreignKey: 'participantId', as: 'answers' });
QuizAnswer.belongsTo(QuizParticipant, { foreignKey: 'participantId' });

// QuizQuestion → QuizAnswers
QuizQuestion.hasMany(QuizAnswer, { foreignKey: 'questionId' });
QuizAnswer.belongsTo(QuizQuestion, { foreignKey: 'questionId', as: 'question' });

// User → Homeworks (создатель)
User.hasMany(Homework, { foreignKey: 'createdBy', as: 'createdHomeworks' });
Homework.belongsTo(User, { foreignKey: 'createdBy', as: 'creator' });

// Homework → HomeworkQuestions
Homework.hasMany(HomeworkQuestion, { foreignKey: 'homeworkId', as: 'questions' });
HomeworkQuestion.belongsTo(Homework, { foreignKey: 'homeworkId' });

// Homework → HomeworkSubmissions
Homework.hasMany(HomeworkSubmission, { foreignKey: 'homeworkId', as: 'submissions' });
HomeworkSubmission.belongsTo(Homework, { foreignKey: 'homeworkId', as: 'homework' });

// User → HomeworkSubmissions
User.hasMany(HomeworkSubmission, { foreignKey: 'userId', as: 'homeworkSubmissions' });
HomeworkSubmission.belongsTo(User, { foreignKey: 'userId', as: 'student' });

// User → HomeworkSubmissions (проверяющий)
User.hasMany(HomeworkSubmission, { foreignKey: 'checkedBy', as: 'checkedSubmissions' });
HomeworkSubmission.belongsTo(User, { foreignKey: 'checkedBy', as: 'checker' });

// HomeworkSubmission → HomeworkAnswers
HomeworkSubmission.hasMany(HomeworkAnswer, { foreignKey: 'submissionId', as: 'answers' });
HomeworkAnswer.belongsTo(HomeworkSubmission, { foreignKey: 'submissionId' });

// HomeworkQuestion → HomeworkAnswers
HomeworkQuestion.hasMany(HomeworkAnswer, { foreignKey: 'questionId' });
HomeworkAnswer.belongsTo(HomeworkQuestion, { foreignKey: 'questionId', as: 'question' });

// User → PracticeTopics (создатель)
User.hasMany(PracticeTopic, { foreignKey: 'createdBy', as: 'createdTopics' });
PracticeTopic.belongsTo(User, { foreignKey: 'createdBy', as: 'creator' });

// PracticeTopic → PracticeQuestions
PracticeTopic.hasMany(PracticeQuestion, { foreignKey: 'topicId', as: 'questions' });
PracticeQuestion.belongsTo(PracticeTopic, { foreignKey: 'topicId' });

// User → PracticeAttempts
User.hasMany(PracticeAttempt, { foreignKey: 'userId', as: 'practiceAttempts' });
PracticeAttempt.belongsTo(User, { foreignKey: 'userId', as: 'user' });

// PracticeTopic → PracticeAttempts
PracticeTopic.hasMany(PracticeAttempt, { foreignKey: 'topicId', as: 'attempts' });
PracticeAttempt.belongsTo(PracticeTopic, { foreignKey: 'topicId', as: 'topic' });

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