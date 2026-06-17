const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Application = sequelize.define('Application', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  // Данные заявки
  fullName: {
    type: DataTypes.STRING,
    allowNull: false
  },
  phone: {
    type: DataTypes.STRING,
    allowNull: false
  },
  telegramId: {
    type: DataTypes.BIGINT,
    allowNull: true
  },
  telegramUsername: {
    type: DataTypes.STRING,
    allowNull: true
  },
  // Привязка к предмету теста
  subjectId: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  subjectName: {
    type: DataTypes.STRING,
    allowNull: true
  },
  // Результат теста бота
  testCorrect: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  testTotal: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  testPercent: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  // Детали ответов теста (массив)
  testAnswers: {
    type: DataTypes.JSONB,
    defaultValue: []
  },
  // ========== ГОСТЕВАЯ ЗАЯВКА (ТЗ §13) ==========
  // Источник заявки, напр. "TG Mini App — гостевой доступ", "TG Bot — напоминание за 4 часа"
  source: {
    type: DataTypes.STRING,
    allowNull: true
  },
  // Контекст открытия формы: locked_homework / locked_quiz /
  // locked_statistics_homework / trial_expire_reminder / guest_access / guest_expired
  context: {
    type: DataTypes.STRING,
    allowNull: true
  },
  // Выбранные гостем предметы (имена)
  selectedSubjects: {
    type: DataTypes.JSONB,
    defaultValue: []
  },
  selectedSubjectsCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  // Статус пользователя на момент заявки: guest / trial
  userStatus: {
    type: DataTypes.STRING,
    allowNull: true
  },
  // Статус заявки (рабочий процесс)
  status: {
    type: DataTypes.ENUM('new', 'in_progress', 'completed', 'rejected'),
    defaultValue: 'new'
  },
  // Статус передачи в CRM
  crmStatus: {
    type: DataTypes.ENUM('pending', 'sent', 'error'),
    defaultValue: 'pending'
  },
  crmLeadId: {
    type: DataTypes.STRING,
    allowNull: true
  },
  crmError: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  crmSentAt: {
    type: DataTypes.DATE,
    allowNull: true
  }
}, {
  tableName: 'applications',
  timestamps: true,
  indexes: [
    { fields: ['status'] },
    { fields: ['crmStatus'] },
    { fields: ['telegramId'] }
  ]
});

module.exports = Application;