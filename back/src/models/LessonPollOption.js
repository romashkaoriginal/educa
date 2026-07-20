const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const LessonPollOption = sequelize.define('LessonPollOption', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  pollId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'lesson_polls', key: 'id' },
    onDelete: 'CASCADE'
  },
  text: { type: DataTypes.STRING, allowNull: false },
  order: { type: DataTypes.INTEGER, defaultValue: 0 }
}, {
  tableName: 'lesson_poll_options',
  timestamps: false
});

module.exports = LessonPollOption;
