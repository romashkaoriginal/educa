const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const HomeworkSubmission = sequelize.define('HomeworkSubmission', {
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
    }
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
  submittedAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  checkedAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  checkedBy: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  feedback: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  status: {
    type: DataTypes.ENUM('submitted', 'checked', 'returned'),
    defaultValue: 'submitted'
  }
}, {
  tableName: 'homework_submissions',
  timestamps: false,
  indexes: [
    {
      unique: true,
      fields: ['homeworkId', 'userId']
    }
  ]
});

module.exports = HomeworkSubmission;