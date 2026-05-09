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
    allowNull: false,
    references: {
      model: 'quizzes',
      key: 'id'
    },
    onDelete: 'CASCADE'
  },
  questionText: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  options: {
    type: DataTypes.JSON, // ["Option 1", "Option 2", "Option 3", "Option 4"]
    allowNull: false
  },
  correctAnswer: {
    type: DataTypes.INTEGER, // индекс правильного ответа (0, 1, 2, 3)
    allowNull: false
  },
  points: {
    type: DataTypes.INTEGER,
    defaultValue: 10
  },
  timeLimit: {
    type: DataTypes.INTEGER, // в секундах
    defaultValue: 30
  },
  order: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  }
}, {
  tableName: 'quiz_questions',
  timestamps: true
});

module.exports = QuizQuestion;