const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Одна реакция одного ученика на один конкретный мем. Уникальный индекс
// защищает статистику от повторных нажатий и повторно отправленных запросов.
const DailyMemeReaction = sequelize.define('DailyMemeReaction', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  dailyMemeId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'daily_memes', key: 'id' },
    onDelete: 'CASCADE'
  },
  studentId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'users', key: 'id' },
    onDelete: 'CASCADE'
  },
  reaction: {
    type: DataTypes.ENUM('like', 'dislike', 'stone'),
    allowNull: false
  }
}, {
  tableName: 'daily_meme_reactions',
  timestamps: true,
  indexes: [
    { unique: true, fields: ['dailyMemeId', 'studentId'] },
    { fields: ['dailyMemeId', 'reaction'] }
  ]
});

module.exports = DailyMemeReaction;
