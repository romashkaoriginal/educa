const { DataTypes, Op } = require('sequelize');
const sequelize = require('../config/database');

const User = sequelize.define('User', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  
  // TELEGRAM DATA (для всех: админов, учителей, менеджеров, студентов)
  telegramId: {
  type: DataTypes.BIGINT,
  allowNull: true,  // ← ДОЛЖНО БЫТЬ
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
    allowNull: false
  },
  lastName: {
    type: DataTypes.STRING,
    allowNull: false
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
  
  accessStartDate: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Дата начала доступа к приложению (для студентов)'
  },
  accessEndDate: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Дата окончания доступа к приложению (для студентов)'
  },
  
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