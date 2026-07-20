const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const LessonPollAnswer = sequelize.define('LessonPollAnswer', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  pollId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'lesson_polls', key: 'id' },
    onDelete: 'CASCADE'
  },
  optionId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'lesson_poll_options', key: 'id' },
    onDelete: 'CASCADE'
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'users', key: 'id' },
    onDelete: 'CASCADE'
  },
  answeredAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, {
  tableName: 'lesson_poll_answers',
  timestamps: false,
  indexes: [{ unique: true, fields: ['pollId', 'userId'] }]
});

module.exports = LessonPollAnswer;
