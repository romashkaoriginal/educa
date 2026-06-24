const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const HomeworkSubmission = sequelize.define('HomeworkSubmission', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  homeworkId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'homeworks', key: 'id' }
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'users', key: 'id' }
  },
  attemptNumber: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
  totalScore: { type: DataTypes.INTEGER, defaultValue: 0 },
  maxScore: { type: DataTypes.INTEGER, allowNull: true },
  correctCount: { type: DataTypes.INTEGER, allowNull: true },
  submittedAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  timeSpent: { type: DataTypes.INTEGER, allowNull: true },
  status: { type: DataTypes.STRING, defaultValue: 'submitted' }
}, {
  tableName: 'homework_submissions',
  timestamps: false,
  indexes: [
    { fields: ['userId'] },
    { fields: ['homeworkId'] },
    { fields: ['userId', 'homeworkId'] }
  ]
});

module.exports = HomeworkSubmission;