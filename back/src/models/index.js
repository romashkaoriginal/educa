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
const PracticeImage = require('./PracticeImage');
const PracticeAttempt = require('./PracticeAttempt');
const PracticeBest = require('./PracticeBest');
const PracticeDailyLog = require('./PracticeDailyLog');
const PracticeQuestionResult = require('./PracticeQuestionResult');
const PracticeScoreHistory = require('./PracticeScoreHistory');
const PracticeStudentTotals = require('./PracticeStudentTotals');
const PracticeDailyStats = require('./PracticeDailyStats');
const PracticeTopicTotals = require('./PracticeTopicTotals');
const PracticeDifficultyTotals = require('./PracticeDifficultyTotals');
const PracticeModeTotals = require('./PracticeModeTotals');
const PracticeRecentError = require('./PracticeRecentError');
const BotUser = require('./BotUser');
const NotificationLog = require('./NotificationLog');
const Application = require('./Application');

// ========== СВЯЗИ С SUBJECTS ==========

User.belongsToMany(Subject, { through: UserSubject, foreignKey: 'userId', as: 'subjects' });
Subject.belongsToMany(User, { through: UserSubject, foreignKey: 'subjectId', as: 'students' });

Subject.hasMany(Homework, { foreignKey: 'subjectId', as: 'homeworks' });
Homework.belongsTo(Subject, { foreignKey: 'subjectId', as: 'subject' });

Subject.hasMany(PracticeTopic, { foreignKey: 'subjectId', as: 'practiceTopics' });
PracticeTopic.belongsTo(Subject, { foreignKey: 'subjectId', as: 'subject' });

// ========== СВЯЗИ BOTUSER ==========
BotUser.belongsTo(User, { foreignKey: 'userId', as: 'assignedUser' });
User.hasOne(BotUser, { foreignKey: 'userId', as: 'botProfile' });

// ========== QUIZ ==========
Quiz.belongsTo(Subject, { foreignKey: 'subjectId', as: 'subject' });
Subject.hasMany(Quiz, { foreignKey: 'subjectId', as: 'quizzes' });

User.hasMany(Quiz, { foreignKey: 'createdBy', as: 'createdQuizzes' });
Quiz.belongsTo(User, { foreignKey: 'createdBy', as: 'creator' });

Quiz.hasMany(QuizQuestion, { foreignKey: 'quizId', as: 'questions' });
QuizQuestion.belongsTo(Quiz, { foreignKey: 'quizId' });

Quiz.hasMany(QuizParticipant, { foreignKey: 'quizId', as: 'participants' });
QuizParticipant.belongsTo(Quiz, { foreignKey: 'quizId' });

User.hasMany(QuizParticipant, { foreignKey: 'userId', as: 'quizParticipations' });
QuizParticipant.belongsTo(User, { foreignKey: 'userId', as: 'user' });

QuizQuestion.hasMany(QuizAnswer, { foreignKey: 'questionId' });
QuizAnswer.belongsTo(QuizQuestion, { foreignKey: 'questionId', as: 'question' });

QuizAnswer.belongsTo(User, { foreignKey: 'userId', as: 'user' });
User.hasMany(QuizAnswer, { foreignKey: 'userId', as: 'quizAnswers' });

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

// Изображения условия и подсказки (ТЗ §5.1). SET NULL при удалении картинки.
PracticeQuestion.belongsTo(PracticeImage, { foreignKey: 'questionImageId', as: 'questionImage' });
PracticeQuestion.belongsTo(PracticeImage, { foreignKey: 'hintImageId', as: 'hintImage' });

PracticeAttempt.belongsTo(User, { foreignKey: 'studentId', as: 'student' });
PracticeAttempt.belongsTo(PracticeTopic, { foreignKey: 'topicId', as: 'topic' });
PracticeAttempt.belongsTo(PracticeQuestion, { foreignKey: 'questionId', as: 'question' });
PracticeAttempt.belongsTo(Subject, { foreignKey: 'subjectId', as: 'subject' });

User.hasMany(PracticeAttempt, { foreignKey: 'studentId', as: 'practiceAttempts' });
PracticeTopic.hasMany(PracticeAttempt, { foreignKey: 'topicId', as: 'attempts' });
PracticeQuestion.hasMany(PracticeAttempt, { foreignKey: 'questionId', as: 'attempts' });
Subject.hasMany(PracticeAttempt, { foreignKey: 'subjectId', as: 'practiceAttempts' });

// ========== PRACTICE BEST & DAILY LOG ==========
PracticeBest.belongsTo(User, { foreignKey: 'studentId', as: 'student' });
PracticeBest.belongsTo(PracticeTopic, { foreignKey: 'topicId', as: 'topic' });
PracticeBest.belongsTo(Subject, { foreignKey: 'subjectId', as: 'subject' });
User.hasMany(PracticeBest, { foreignKey: 'studentId', as: 'practiceBests' });

PracticeDailyLog.belongsTo(User, { foreignKey: 'studentId', as: 'student' });
PracticeDailyLog.belongsTo(Subject, { foreignKey: 'subjectId', as: 'subject' });
User.hasMany(PracticeDailyLog, { foreignKey: 'studentId', as: 'dailyLogs' });

// ========== PRACTICE QUESTION RESULT (для прогнозного балла) ==========
PracticeQuestionResult.belongsTo(User, { foreignKey: 'studentId', as: 'student' });
PracticeQuestionResult.belongsTo(PracticeQuestion, { foreignKey: 'questionId', as: 'question' });
PracticeQuestionResult.belongsTo(PracticeTopic, { foreignKey: 'topicId', as: 'topic' });
PracticeQuestionResult.belongsTo(Subject, { foreignKey: 'subjectId', as: 'subject' });
User.hasMany(PracticeQuestionResult, { foreignKey: 'studentId', as: 'questionResults' });
PracticeTopic.hasMany(PracticeQuestionResult, { foreignKey: 'topicId', as: 'questionResults' });

// ========== PRACTICE SCORE HISTORY ==========
PracticeScoreHistory.belongsTo(User, { foreignKey: 'studentId', as: 'student' });
PracticeScoreHistory.belongsTo(Subject, { foreignKey: 'subjectId', as: 'subject' });
User.hasMany(PracticeScoreHistory, { foreignKey: 'studentId', as: 'scoreHistory' });
Subject.hasMany(PracticeScoreHistory, { foreignKey: 'subjectId', as: 'scoreHistory' });

// ========== PRACTICE STATS AGGREGATES ==========
PracticeStudentTotals.belongsTo(User, { foreignKey: 'studentId', as: 'student' });
PracticeStudentTotals.belongsTo(Subject, { foreignKey: 'subjectId', as: 'subject' });
User.hasMany(PracticeStudentTotals, { foreignKey: 'studentId', as: 'practiceStudentTotals' });

PracticeDailyStats.belongsTo(User, { foreignKey: 'studentId', as: 'student' });
PracticeDailyStats.belongsTo(Subject, { foreignKey: 'subjectId', as: 'subject' });
User.hasMany(PracticeDailyStats, { foreignKey: 'studentId', as: 'practiceDailyStats' });

PracticeTopicTotals.belongsTo(User, { foreignKey: 'studentId', as: 'student' });
PracticeTopicTotals.belongsTo(PracticeTopic, { foreignKey: 'topicId', as: 'topic' });
PracticeTopicTotals.belongsTo(Subject, { foreignKey: 'subjectId', as: 'subject' });
User.hasMany(PracticeTopicTotals, { foreignKey: 'studentId', as: 'practiceTopicTotals' });

PracticeDifficultyTotals.belongsTo(User, { foreignKey: 'studentId', as: 'student' });
PracticeDifficultyTotals.belongsTo(Subject, { foreignKey: 'subjectId', as: 'subject' });
User.hasMany(PracticeDifficultyTotals, { foreignKey: 'studentId', as: 'practiceDifficultyTotals' });

PracticeModeTotals.belongsTo(User, { foreignKey: 'studentId', as: 'student' });
PracticeModeTotals.belongsTo(Subject, { foreignKey: 'subjectId', as: 'subject' });
User.hasMany(PracticeModeTotals, { foreignKey: 'studentId', as: 'practiceModeTotals' });

PracticeRecentError.belongsTo(User, { foreignKey: 'studentId', as: 'student' });
PracticeRecentError.belongsTo(Subject, { foreignKey: 'subjectId', as: 'subject' });
PracticeRecentError.belongsTo(PracticeQuestion, { foreignKey: 'questionId', as: 'question' });
PracticeRecentError.belongsTo(PracticeTopic, { foreignKey: 'topicId', as: 'topic' });
User.hasMany(PracticeRecentError, { foreignKey: 'studentId', as: 'practiceRecentErrors' });

// Ручная миграция practice_questions.correct_answer: integer → json (массив
// индексов, поддержка нескольких правильных вариантов). sequelize.sync({alter})
// не умеет сам сконвертировать integer в json (нет каста 5::json), поэтому
// колонку меняем вручную ДО alter-синка. Идемпотентно — проверяем текущий тип.
const migrateCorrectAnswerToJson = async () => {
  const [rows] = await sequelize.query(`
    SELECT data_type FROM information_schema.columns
    WHERE table_name = 'practice_questions' AND column_name = 'correct_answer'
  `);
  if (rows.length === 0 || rows[0].data_type === 'json' || rows[0].data_type === 'jsonb') {
    return; // таблицы ещё нет, либо уже мигрировано
  }
  await sequelize.query(`
    ALTER TABLE practice_questions
    ALTER COLUMN correct_answer TYPE json
    USING json_build_array(correct_answer)
  `);
  console.log('✅ practice_questions.correct_answer migrated integer → json');
};

// Синхронизация
const syncDatabase = async () => {
  try {
    await migrateCorrectAnswerToJson();
    await sequelize.sync({ alter: true });
    console.log('✅ Database synced (alter mode)');
  } catch (error) {
    console.error('❌ Error connecting to database:', error);
  }
};

module.exports = {
  sequelize,
  User, Subject, UserSubject,
  Quiz, QuizQuestion, QuizParticipant, QuizAnswer,
  Homework, HomeworkQuestion, HomeworkSubmission, HomeworkAnswer,
  PracticeTopic, PracticeQuestion, PracticeImage, PracticeAttempt,
  PracticeBest, PracticeDailyLog, PracticeQuestionResult, PracticeScoreHistory,
  PracticeStudentTotals, PracticeDailyStats, PracticeTopicTotals,
  PracticeDifficultyTotals, PracticeModeTotals, PracticeRecentError,
  NotificationLog, BotUser, Application,
  syncDatabase
};