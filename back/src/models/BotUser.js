const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const BotUser = sequelize.define('BotUser', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  
  telegramId: {
    type: DataTypes.BIGINT,
    allowNull: false,
    unique: true
  },
  
  telegramUsername: {
    type: DataTypes.STRING,
    allowNull: true
  },
  
  firstName: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'Пользователь'
  },
  
  lastName: {
    type: DataTypes.STRING,
    allowNull: true
  },
  
  languageCode: {
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: 'ru'
  },
  
  isBot: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  
  // Связь с User (если назначен в систему)
  userId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  
  // Флаг назначенности
  isAssigned: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    comment: 'Назначен ли пользователь в систему (админ/учитель/менеджер/студент)'
  },
  
  // Статистика взаимодействий
  firstInteractionAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  
  lastInteractionAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  
  messageCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  }
}, {
  tableName: 'bot_users',
  timestamps: true,
  indexes: [
    {
      unique: true,
      fields: ['telegramId']
    }
  ]
});

module.exports = BotUser;