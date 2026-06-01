const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const PracticeDailyLog = sequelize.define('PracticeDailyLog', {
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
  date: { type: DataTypes.DATEONLY, allowNull: false }, // только дата без времени
  attemptsCount: { type: DataTypes.INTEGER, defaultValue: 1 }
}, {
  tableName: 'practice_daily_logs',
  timestamps: false,
  indexes: [
    { unique: true, fields: ['studentId', 'subjectId', 'date'] },
    { fields: ['date'] },
    { fields: ['subjectId', 'date'] }
  ]
});

module.exports = PracticeDailyLog;