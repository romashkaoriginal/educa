const { DataTypes, Op } = require('sequelize');
const sequelize = require('../config/database');

const User = sequelize.define('User', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  
  // ДЛЯ АДМИНОВ (веб-сайт)
  email: {
    type: DataTypes.STRING,
    allowNull: true,
    unique: true,
    validate: {
      isEmail: true
    }
  },
  password: {
    type: DataTypes.STRING,
    allowNull: true
  },
  
  // ДЛЯ СТУДЕНТОВ (Telegram Mini App)
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
    allowNull: false
  },
  lastName: {
    type: DataTypes.STRING,
    allowNull: false
  },
  role: {
    type: DataTypes.ENUM('admin', 'student'),
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
      fields: ['email'],
      where: { email: { [Op.ne]: null } }
    },
    {
      unique: true,
      fields: ['telegramId'],
      where: { telegramId: { [Op.ne]: null } }
    }
  ]
});

module.exports = User;