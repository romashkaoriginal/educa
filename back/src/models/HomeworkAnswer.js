const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const HomeworkAnswer = sequelize.define('HomeworkAnswer', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  submissionId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'homework_submissions',
      key: 'id'
    },
    onDelete: 'CASCADE'
  },
  questionId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'homework_questions',
      key: 'id'
    }
  },
  answer: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  isCorrect: {
    type: DataTypes.BOOLEAN,
    allowNull: false
  },
  points: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  }
}, {
  tableName: 'homework_answers',
  timestamps: false
});

module.exports = HomeworkAnswer;