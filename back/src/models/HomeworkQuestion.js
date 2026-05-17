const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const HomeworkQuestion = sequelize.define('HomeworkQuestion', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  homeworkId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'homeworks',
      key: 'id'
    },
    onDelete: 'CASCADE'
  },
  questionType: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'single_choice'
  },
  questionText: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  options: {
    type: DataTypes.JSONB,
    allowNull: true
  },
  correctAnswer: {
    type: DataTypes.JSONB,
    allowNull: false
  },
  explanation: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  points: {
    type: DataTypes.INTEGER,
    defaultValue: 10
  },
  order: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  }
}, {
  tableName: 'homework_questions',
  timestamps: true
});

module.exports = HomeworkQuestion;