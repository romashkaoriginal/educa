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

  // Телефон, которым пользователь поделился через кнопку Telegram (requestContact).
  // Номер приходит боту сервис-сообщением и сохраняется сюда для подстановки в форму заявки.
  phone: {
    type: DataTypes.STRING,
    allowNull: true
  },

  phoneSharedAt: {
    type: DataTypes.DATE,
    allowNull: true
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
  },

  utmSource: { type: DataTypes.STRING, allowNull: true },
  utmMedium: { type: DataTypes.STRING, allowNull: true },
  utmCampaign: { type: DataTypes.STRING, allowNull: true },
  utmContent: { type: DataTypes.STRING, allowNull: true },
  utmTerm: { type: DataTypes.STRING, allowNull: true },
  utmRaw: { type: DataTypes.STRING, allowNull: true },
  utmFirstSeenAt: { type: DataTypes.DATE, allowNull: true },

  dailyLimits: {
    type: DataTypes.JSONB,
    defaultValue: {}
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