const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const LessonQuizDelivery = sequelize.define('LessonQuizDelivery', {
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
  receivedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
}, {
  tableName: 'lesson_quiz_deliveries',
  timestamps: false,
  indexes: [
    { unique: true, fields: ['questionId', 'userId'] },
    { fields: ['lessonQuizId', 'userId'] }
  ]
});

module.exports = LessonQuizDelivery;
