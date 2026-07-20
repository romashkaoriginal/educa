const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const LessonQuestion = sequelize.define('LessonQuestion', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  lessonId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'lessons', key: 'id' },
    onDelete: 'CASCADE'
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'users', key: 'id' },
    onDelete: 'CASCADE'
  },
  text: { type: DataTypes.TEXT, allowNull: true },
  status: {
    type: DataTypes.ENUM('pending', 'answering', 'answered', 'deferred'),
    defaultValue: 'pending'
  }
}, {
  tableName: 'lesson_questions',
  timestamps: true,
  indexes: [{ fields: ['lessonId', 'status', 'createdAt'] }]
});

module.exports = LessonQuestion;
