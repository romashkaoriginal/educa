const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const HomeworkAnswer = sequelize.define('HomeworkAnswer', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  submissionId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'homework_submissions', key: 'id' },
    onDelete: 'CASCADE'
  },
  questionId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'homework_questions', key: 'id' }
  },
  userAnswer: { type: DataTypes.JSONB, allowNull: true },
  isCorrect: { type: DataTypes.BOOLEAN, allowNull: false }
}, {
  tableName: 'homework_answers',
  timestamps: true,
  indexes: [
    { fields: ['submissionId'] },
    { fields: ['questionId'] }
  ]
});

module.exports = HomeworkAnswer;