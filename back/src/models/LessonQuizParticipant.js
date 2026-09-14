const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const LessonQuizParticipant = sequelize.define('LessonQuizParticipant', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  lessonQuizId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'lesson_quizzes', key: 'id' }, onDelete: 'CASCADE' },
  userId: { type: DataTypes.INTEGER, allowNull: false, references: { model: 'users', key: 'id' }, onDelete: 'CASCADE' },
  joinedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
}, {
  tableName: 'lesson_quiz_participants',
  timestamps: false,
  indexes: [{ unique: true, fields: ['lessonQuizId', 'userId'] }, { fields: ['lessonQuizId'] }]
});

module.exports = LessonQuizParticipant;
