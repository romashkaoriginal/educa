const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Уникальный результат ученика по конкретному заданию практики.
// Одна строка на пару (studentId, questionId) — повторное решение обновляет,
// но НЕ плодит новые строки. Используется для расчёта прогнозного балла ЦТ
// и защиты от накрутки.
const PracticeQuestionResult = sequelize.define('PracticeQuestionResult', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  studentId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'users', key: 'id' }
  },
  questionId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'practice_questions', key: 'id' }
  },
  topicId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'practice_topics', key: 'id' }
  },
  subjectId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'subjects', key: 'id' }
  },
  difficulty: {
    type: DataTypes.ENUM('easy', 'medium', 'hard'),
    allowNull: false,
    defaultValue: 'medium'
  },
  // Текущий (последний) результат по заданию
  isCorrect: { type: DataTypes.BOOLEAN, defaultValue: false },
  // Сколько раз ученик решал это задание (для XP/геймификации, не влияет на прогноз)
  attempts: { type: DataTypes.INTEGER, defaultValue: 1 }
}, {
  tableName: 'practice_question_results',
  timestamps: true,
  indexes: [
    { unique: true, fields: ['studentId', 'questionId'] },
    { fields: ['studentId', 'subjectId'] },
    { fields: ['studentId', 'topicId'] }
  ]
});

module.exports = PracticeQuestionResult;