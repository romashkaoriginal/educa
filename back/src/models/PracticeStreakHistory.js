const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// История начисления очков за стрик практики (ТЗ Дмитрия 22.09.2026):
// день 1 стрика — 5 очков, день 2 — 10, ..., максимум 70 очков за раз (день 14+).
// Одна строка на (studentId, date) — очки идут в лидерборд того предмета,
// по которому у ученика в этот день самый длинный стрик (ТЗ). Используется
// недельным лидербордом (streamPresentation.js).
const PracticeStreakHistory = sequelize.define('PracticeStreakHistory', {
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
  date: { type: DataTypes.DATEONLY, allowNull: false },
  streakDay: { type: DataTypes.INTEGER, allowNull: false },
  points: { type: DataTypes.INTEGER, allowNull: false }
}, {
  tableName: 'practice_streak_history',
  timestamps: true,
  indexes: [
    { unique: true, fields: ['studentId', 'date'] },
    { fields: ['date'] },
    { fields: ['subjectId', 'date'] }
  ]
});

module.exports = PracticeStreakHistory;
