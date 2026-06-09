const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const PracticeScoreHistory = sequelize.define('PracticeScoreHistory', {
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
  score: {
    type: DataTypes.INTEGER,
    allowNull: false,
    validate: { min: 0, max: 100 }
  },
  solvedCount: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0
  },
  date: {
    type: DataTypes.DATEONLY,
    allowNull: false
  }
}, {
  tableName: 'practice_score_history',
  timestamps: true,
  indexes: [
    { fields: ['studentId', 'subjectId', 'date'] },
    { fields: ['studentId', 'subjectId', 'createdAt'] }
  ]
});

module.exports = PracticeScoreHistory;
