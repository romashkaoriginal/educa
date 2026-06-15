const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const PracticeModeTotals = sequelize.define('PracticeModeTotals', {
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
  practiceMode: {
    type: DataTypes.STRING(16),
    allowNull: false
  },
  totalAttempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  totalCorrect: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 }
}, {
  tableName: 'practice_mode_totals',
  timestamps: true,
  indexes: [
    { unique: true, fields: ['studentId', 'subjectId', 'practiceMode'] }
  ]
});

module.exports = PracticeModeTotals;
