const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const LessonQuiz = sequelize.define('LessonQuiz', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  lessonId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'lessons', key: 'id' },
    onDelete: 'CASCADE'
  },
  title: { type: DataTypes.STRING, allowNull: false },
  mode: {
    type: DataTypes.ENUM('single_step', 'self_paced'),
    allowNull: false,
    defaultValue: 'single_step'
  },
  isAnonymous: { type: DataTypes.BOOLEAN, defaultValue: false },
  showExplanations: { type: DataTypes.BOOLEAN, defaultValue: true },
  status: {
    type: DataTypes.ENUM('draft', 'active', 'finished'),
    defaultValue: 'draft'
  },
  currentQuestionIndex: { type: DataTypes.INTEGER, defaultValue: -1 },
  questionRevealState: {
    type: DataTypes.ENUM('hidden', 'question', 'answer'),
    defaultValue: 'hidden'
  },
  explanationRevealed: { type: DataTypes.BOOLEAN, defaultValue: false },
  startedAt: { type: DataTypes.DATE, allowNull: true },
  finishedAt: { type: DataTypes.DATE, allowNull: true },
  createdBy: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'users', key: 'id' },
    onDelete: 'SET NULL'
  }
}, {
  tableName: 'lesson_quizzes',
  timestamps: true,
  indexes: [{ fields: ['lessonId', 'status'] }]
});

module.exports = LessonQuiz;
