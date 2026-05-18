const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const QuizParticipant = sequelize.define('QuizParticipant', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  quizId: {
    type: DataTypes.INTEGER,
    references: { model: 'quizzes', key: 'id' }
  },
  userId: {
    type: DataTypes.INTEGER,
    references: { model: 'users', key: 'id' }
  },
  totalScore: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0
  },
  joinedAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  lastActivityAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'quiz_participants',
  timestamps: false
});

module.exports = QuizParticipant;