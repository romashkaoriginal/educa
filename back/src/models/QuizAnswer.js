const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const QuizAnswer = sequelize.define('QuizAnswer', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  quizId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'quizzes', key: 'id' }
  },
  questionId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'quiz_questions', key: 'id' }
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'users', key: 'id' }
  },
  participantId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'quiz_participants', key: 'id' }
  },
  selectedAnswer: DataTypes.INTEGER,
  isCorrect: DataTypes.BOOLEAN,
  responseTime: DataTypes.INTEGER,
  score: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0
  },
  answeredAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'quiz_answers',
  timestamps: false
});

module.exports = QuizAnswer;