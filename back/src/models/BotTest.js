const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const BotTest = sequelize.define('BotTest', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  subjectId: { type: DataTypes.INTEGER, allowNull: false },
  questionText: { type: DataTypes.TEXT, allowNull: false },
  options: { type: DataTypes.JSONB, allowNull: false }, // ['вариант A', 'вариант B', ...]
  correctAnswer: { type: DataTypes.INTEGER, allowNull: false }, // индекс правильного ответа
  order: { type: DataTypes.INTEGER, defaultValue: 0 },
  isActive: { type: DataTypes.BOOLEAN, defaultValue: true }
}, {
  tableName: 'bot_tests',
  timestamps: true
});

module.exports = BotTest;