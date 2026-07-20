const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const LessonQuizQuestion = sequelize.define('LessonQuizQuestion', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  lessonQuizId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'lesson_quizzes', key: 'id' },
    onDelete: 'CASCADE'
  },
  questionText: { type: DataTypes.TEXT, allowNull: true },
  questionImageId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'practice_images', key: 'id' },
    onDelete: 'SET NULL'
  },
  options: { type: DataTypes.JSON, allowNull: false },
  correctAnswer: { type: DataTypes.JSON, allowNull: false },
  explanation: { type: DataTypes.TEXT, allowNull: true },
  hintImageId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'practice_images', key: 'id' },
    onDelete: 'SET NULL'
  },
  order: { type: DataTypes.INTEGER, defaultValue: 0 },
  sourcePracticeQuestionId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'practice_questions', key: 'id' },
    onDelete: 'SET NULL'
  }
}, {
  tableName: 'lesson_quiz_questions',
  timestamps: true,
  validate: {
    questionHasContent() {
      const hasText = Boolean(this.questionText && String(this.questionText).trim());
      if (!hasText && !this.questionImageId) {
        throw new Error('Добавьте текст вопроса или изображение.');
      }
      if (!Array.isArray(this.options) || this.options.length < 2) {
        throw new Error('Добавьте минимум два варианта ответа.');
      }
      if (this.options.length > 8 || this.options.some((option) => !String(option || '').trim())) {
        throw new Error('Допустимо от 2 до 8 непустых вариантов ответа.');
      }
      if (!Array.isArray(this.correctAnswer) || this.correctAnswer.length === 0) {
        throw new Error('Укажите правильный ответ.');
      }
      if (this.correctAnswer.some((index) => !Number.isInteger(Number(index)) || Number(index) < 0 || Number(index) >= this.options.length)) {
        throw new Error('Правильный ответ должен ссылаться на существующий вариант.');
      }
    }
  }
});

module.exports = LessonQuizQuestion;
