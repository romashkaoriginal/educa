const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const PracticeAttempt = sequelize.define('PracticeAttempt', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  topicId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'practice_topics',
      key: 'id'
    }
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  score: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  questionsTotal: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  questionsCorrect: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  completedAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'practice_attempts',
  timestamps: false
});

module.exports = PracticeAttempt;