const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const LessonReaction = sequelize.define('LessonReaction', {
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
  type: {
    type: DataTypes.ENUM('clear', 'need_repeat', 'too_fast', 'has_question'),
    allowNull: false
  }
}, {
  tableName: 'lesson_reactions',
  timestamps: true,
  updatedAt: false,
  indexes: [{ fields: ['lessonId', 'userId', 'createdAt'] }]
});

module.exports = LessonReaction;
