const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const LessonQuizAnswer = sequelize.define('LessonQuizAnswer', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  lessonQuizId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'lesson_quizzes', key: 'id' },
    onDelete: 'CASCADE'
  },
  questionId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'lesson_quiz_questions', key: 'id' },
    onDelete: 'CASCADE'
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'users', key: 'id' },
    onDelete: 'CASCADE'
  },
  selectedAnswer: { type: DataTypes.JSON, allowNull: false },
  isCorrect: { type: DataTypes.BOOLEAN, allowNull: false },
  answeredAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, {
  tableName: 'lesson_quiz_answers',
  timestamps: false,
  indexes: [{ unique: true, fields: ['questionId', 'userId'] }]
});

module.exports = LessonQuizAnswer;
