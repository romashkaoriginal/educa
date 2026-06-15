const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const PracticeRecentError = sequelize.define('PracticeRecentError', {
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
  questionId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'practice_questions', key: 'id' }
  },
  topicId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'practice_topics', key: 'id' }
  },
  answeredAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  selectedAnswer: { type: DataTypes.INTEGER, allowNull: true }
}, {
  tableName: 'practice_recent_errors',
  timestamps: true,
  indexes: [
    { fields: ['studentId', 'subjectId', 'answeredAt'] }
  ]
});

module.exports = PracticeRecentError;
