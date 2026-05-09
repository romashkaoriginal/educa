const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const QuizAnswer = sequelize.define('QuizAnswer', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  participantId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'quiz_participants',
      key: 'id'
    },
    onDelete: 'CASCADE'
  },
  questionId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'quiz_questions',
      key: 'id'
    }
  },
  answer: {
    type: DataTypes.INTEGER, // индекс выбранного ответа
    allowNull: false
  },
  isCorrect: {
    type: DataTypes.BOOLEAN,
    allowNull: false
  },
  timeSpent: {
    type: DataTypes.INTEGER, // в секундах
    allowNull: false
  },
  pointsEarned: {
    type: DataTypes.INTEGER,
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