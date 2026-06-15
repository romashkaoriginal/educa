const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const PracticeStudentTotals = sequelize.define('PracticeStudentTotals', {
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
  totalAttempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  totalCorrect: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  totalWrong: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  practiceDays: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  bestStreakEver: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  correctStreak: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  firstPracticeAt: { type: DataTypes.DATE, allowNull: true },
  lastPracticeAt: { type: DataTypes.DATE, allowNull: true },
  statsMigratedAt: { type: DataTypes.DATE, allowNull: true }
}, {
  tableName: 'practice_student_totals',
  timestamps: true,
  indexes: [
    { unique: true, fields: ['studentId', 'subjectId'] },
    { fields: ['studentId'] },
    { fields: ['subjectId'] }
  ]
});

module.exports = PracticeStudentTotals;
