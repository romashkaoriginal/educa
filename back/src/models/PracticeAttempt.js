const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const PracticeAttempt = sequelize.define('PracticeAttempt', {
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
  questionId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'practice_questions', key: 'id' }
  },
  subjectId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'subjects', key: 'id' }
  },
  selectedAnswer: { type: DataTypes.INTEGER, allowNull: false },
  isCorrect: { type: DataTypes.BOOLEAN, allowNull: false },
  timeSpent: { type: DataTypes.INTEGER, allowNull: true }
}, {
  tableName: 'practice_attempts',
  timestamps: true,
  indexes: [
    { fields: ['studentId'] },
    { fields: ['subjectId'] },
    { fields: ['topicId'] },
    { fields: ['studentId', 'subjectId'] },
    { fields: ['studentId', 'topicId'] }
  ]
});

module.exports = PracticeAttempt;