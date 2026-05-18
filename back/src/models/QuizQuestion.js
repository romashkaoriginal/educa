const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const QuizQuestion = sequelize.define('QuizQuestion', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  quizId: {
    type: DataTypes.INTEGER,
    references: { model: 'quizzes', key: 'id' }
  },
  questionText: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  options: {
    type: DataTypes.JSONB,
    allowNull: false
  },
  correctAnswer: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  timeLimit: {
    type: DataTypes.INTEGER,
    defaultValue: 30
  },
  points: {
    type: DataTypes.INTEGER,
    defaultValue: 1
  },
  order: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  explanation: DataTypes.TEXT
}, {
  tableName: 'quiz_questions',
  timestamps: true
});

module.exports = QuizQuestion;