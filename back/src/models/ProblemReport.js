const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Жалоба «Сообщить о проблеме», собранная ботом (текст + до 3 скриншотов).
// Файлы скриншотов лежат в файловом хранилище (docker volume), в БД —
// только ключи (см. services/problemReportImages.js), по аналогии с practice_images.
const ProblemReport = sequelize.define('ProblemReport', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  text: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  // Массив storageKey скриншотов, максимум 3 (проверяется в боте).
  screenshots: {
    type: DataTypes.JSONB,
    allowNull: false,
    defaultValue: []
  },
  reporterTelegramId: {
    type: DataTypes.BIGINT,
    allowNull: true
  },
  reporterUserId: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  reporterName: {
    type: DataTypes.STRING,
    allowNull: true
  },
  // Роль на момент отправки: superadmin/admin/teacher/manager/student/parent/guest
  reporterRole: {
    type: DataTypes.STRING(32),
    allowNull: true
  },
  status: {
    type: DataTypes.ENUM('new', 'in_progress', 'resolved', 'rejected'),
    allowNull: false,
    defaultValue: 'new'
  }
}, {
  tableName: 'problem_reports',
  timestamps: true,
  indexes: [
    { fields: ['status'] },
    { fields: ['createdAt'] },
    { fields: ['reporterTelegramId'] }
  ]
});

module.exports = ProblemReport;
