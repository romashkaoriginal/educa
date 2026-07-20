const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const LessonPoll = sequelize.define('LessonPoll', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  lessonId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'lessons', key: 'id' },
    onDelete: 'CASCADE'
  },
  template: {
    type: DataTypes.ENUM('clear_unclear', 'yes_no', 'pace', 'repeat_or_continue', 'keeping_up', 'custom'),
    allowNull: false,
    defaultValue: 'custom'
  },
  question: { type: DataTypes.STRING, allowNull: false },
  isAnonymous: { type: DataTypes.BOOLEAN, defaultValue: false },
  showResultsToStudents: { type: DataTypes.BOOLEAN, defaultValue: true },
  durationSec: { type: DataTypes.INTEGER, allowNull: true },
  autoCloseAt: { type: DataTypes.DATE, allowNull: true },
  status: {
    type: DataTypes.ENUM('draft', 'active', 'closed'),
    defaultValue: 'draft'
  },
  startedAt: { type: DataTypes.DATE, allowNull: true },
  closedAt: { type: DataTypes.DATE, allowNull: true },
  resultsRevealedAt: { type: DataTypes.DATE, allowNull: true },
  createdBy: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'users', key: 'id' },
    onDelete: 'SET NULL'
  }
}, {
  tableName: 'lesson_polls',
  timestamps: true,
  indexes: [{ fields: ['lessonId', 'status'] }, { fields: ['status', 'autoCloseAt'] }]
});

module.exports = LessonPoll;
