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
  isActive: {  // ← ДОБАВЬ ЭТО ПОЛЕ
    type: DataTypes.BOOLEAN,
    defaultValue: true
  }
}, {
  tableName: 'practice_questions',
  timestamps: true
});

module.exports = PracticeQuestion;