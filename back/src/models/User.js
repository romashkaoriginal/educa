const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const User = sequelize.define('User', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  
  // TELEGRAM DATA
  telegramId: {
    type: DataTypes.BIGINT,
    allowNull: true,
    unique: true
  },
  telegramUsername: {
    type: DataTypes.STRING,
    allowNull: true
  },
  telegramPhotoUrl: {
    type: DataTypes.STRING,
    allowNull: true
  },
  
  // ОБЩИЕ ПОЛЯ
  firstName: {
    type: DataTypes.STRING,
    allowNull: false  // Имя обязательно
  },
  lastName: {
    type: DataTypes.STRING,
    allowNull: true  
  },
  role: {
    type: DataTypes.ENUM('admin', 'teacher', 'manager', 'student'),
    allowNull: false,
    defaultValue: 'student'
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  
  // СТАТИСТИКА (для студентов)
  totalScore: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  quizzesPassed: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  homeworksCompleted: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  }
}, {
  tableName: 'users',
  timestamps: true,
  indexes: [
    {
      unique: true,
      fields: ['telegramId']
    }
  ]
});

module.exports = User;