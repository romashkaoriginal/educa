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
  explanation: {
    type: DataTypes.TEXT,
    allowNull: true
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