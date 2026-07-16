const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const PracticeQuestion = sequelize.define('PracticeQuestion', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  topicId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'practice_topics',
      key: 'id'
    },
    onDelete: 'CASCADE'
  },
  // Может быть пустым, если у вопроса есть изображение (ТЗ §1).
  questionText: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  // Изображение условия вопроса (ТЗ §2.1). Null — только текст.
  questionImageId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'practice_images', key: 'id' },
    onDelete: 'SET NULL'
  },
  options: {
    type: DataTypes.JSON,
    allowNull: false
  },
  // Массив индексов правильных вариантов (multiple choice) — минимум один.
  correctAnswer: {
    type: DataTypes.JSON,
    allowNull: false
  },
  explanation: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  // Изображение подсказки (ТЗ §2.2). Null — подсказка без картинки.
  hintImageId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'practice_images', key: 'id' },
    onDelete: 'SET NULL'
  },
  difficulty: {
    type: DataTypes.ENUM('easy', 'medium', 'hard'),
    defaultValue: 'medium'
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  }
}, {
  tableName: 'practice_questions',
  timestamps: true,
  validate: {
    // Условие вопроса не может быть пустым одновременно по тексту и картинке (ТЗ §1).
    questionHasContent() {
      const hasText = !!(this.questionText && String(this.questionText).trim());
      if (!hasText && !this.questionImageId) {
        throw new Error('Добавьте текст вопроса или изображение.');
      }
    }
  },
  hooks: {
    beforeDestroy: async (question) => {
      // Удаляем все попытки связанные с этим вопросом
      const { PracticeAttempt } = require('./index');
      await PracticeAttempt.destroy({
        where: { questionId: question.id }
      });
    }
  }
});

module.exports = PracticeQuestion;