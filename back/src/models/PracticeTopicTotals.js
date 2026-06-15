const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const PracticeTopicTotals = sequelize.define('PracticeTopicTotals', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  studentId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'users', key: 'id' }
  },
  topicId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'practice_topics', key: 'id' }
  },
  subjectId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'subjects', key: 'id' }
  },
  totalAttempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  totalCorrect: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  totalWrong: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  lastPracticeAt: { type: DataTypes.DATE, allowNull: true }
}, {
  tableName: 'practice_topic_totals',
  timestamps: true,
  indexes: [
    { unique: true, fields: ['studentId', 'topicId'] },
    { fields: ['studentId', 'subjectId'] }
  ]
});

module.exports = PracticeTopicTotals;
