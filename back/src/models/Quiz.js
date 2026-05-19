const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Quiz = sequelize.define('Quiz', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  title: {
    type: DataTypes.STRING,
    allowNull: false
  },
  description: {
    type: DataTypes.TEXT
  },
  subjectId: {
    type: DataTypes.INTEGER,
    references: { model: 'subjects', key: 'id' }
  },
  accessCode: {
    type: DataTypes.STRING(10),
    allowNull: false,
    unique: true
  },
  status: {
    type: DataTypes.ENUM('draft', 'active', 'finished'),
    defaultValue: 'draft'
  },
  isDeleted: {
  type: DataTypes.BOOLEAN,
  defaultValue: false
},
  createdBy: {
    type: DataTypes.INTEGER,
    references: { model: 'users', key: 'id' }
  },
  startedAt: DataTypes.DATE,
  finishedAt: DataTypes.DATE,
  currentQuestionIndex: {
    type: DataTypes.INTEGER,
    defaultValue: -1
  },
  questionStartedAt: DataTypes.DATE
}, {
  tableName: 'quizzes',
  timestamps: true
});

module.exports = Quiz;