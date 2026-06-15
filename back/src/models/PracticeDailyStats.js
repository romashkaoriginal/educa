const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const PracticeDailyStats = sequelize.define('PracticeDailyStats', {
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
  attempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  correct: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  wrong: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  goalCompleted: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false }
}, {
  tableName: 'practice_daily_stats',
  timestamps: true,
  indexes: [
    { unique: true, fields: ['studentId', 'subjectId', 'date'] },
    { fields: ['date'] }
  ]
});

module.exports = PracticeDailyStats;
