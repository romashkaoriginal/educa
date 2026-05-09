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
  questionText: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  options: {
    type: DataTypes.JSON,
    allowNull: false
  },
  correctAnswer: {
    type: DataTypes.INTEGER,
    allowNull: false
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