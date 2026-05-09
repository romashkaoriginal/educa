const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const QuizParticipant = sequelize.define('QuizParticipant', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  quizId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'quizzes',
      key: 'id'
    },
    onDelete: 'CASCADE'
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  totalScore: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  totalTime: {
    type: DataTypes.INTEGER, // общее время в секундах
    defaultValue: 0
  },
  rank: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  status: {
    type: DataTypes.ENUM('active', 'completed', 'abandoned'),
    defaultValue: 'active'
  },
  joinedAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  finishedAt: {
    type: DataTypes.DATE,
    allowNull: true
  }
}, {
  tableName: 'quiz_participants',
  timestamps: false,
  indexes: [
    {
      unique: true,
      fields: ['quizId', 'userId']
    }
  ]
});

module.exports = QuizParticipant;