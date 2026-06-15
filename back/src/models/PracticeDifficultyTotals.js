const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const PracticeDifficultyTotals = sequelize.define('PracticeDifficultyTotals', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  studentId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'users', key: 'id' }
  },
  subjectId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'subjects', key: 'id' }
  },
  difficulty: {
    type: DataTypes.ENUM('easy', 'medium', 'hard'),
    allowNull: false
  },
  totalAttempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  totalCorrect: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 }
}, {
  tableName: 'practice_difficulty_totals',
  timestamps: true,
  indexes: [
    { unique: true, fields: ['studentId', 'subjectId', 'difficulty'] }
  ]
});

module.exports = PracticeDifficultyTotals;
