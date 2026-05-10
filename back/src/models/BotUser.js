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
    allowNull: true
  },
  
  lastName: {
    type: DataTypes.STRING,
    allowNull: true
  },
  
  telegramPhotoUrl: {
    type: DataTypes.STRING,
    allowNull: true
  },
  
  languageCode: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Язык пользователя (ru, en и т.д.)'
  },
  
  isBot: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  
  // Флаг - назначен ли пользователь в систему (студент/админ/учитель/менеджер)
  isAssigned: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    comment: 'Назначен ли в систему как User'
  },
  
  // ID в таблице users (если назначен)
  userId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'users',
      key: 'id'
    },
    onDelete: 'SET NULL'
  },
  
  // Дата первого взаимодействия с ботом
  firstInteractionAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  
  // Дата последнего взаимодействия
  lastInteractionAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  
  // Количество сообщений боту
  messageCount: {
    type: DataTypes.INTEGER,
    defaultValue: 1
  }
}, {
  tableName: 'bot_users',
  timestamps: true,
  indexes: [
    {
      unique: true,
      fields: ['telegramId']
    },
    {
      fields: ['isAssigned']
    },
    {
      fields: ['firstInteractionAt']
    }
  ]
});

module.exports = BotUser;