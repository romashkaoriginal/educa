const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const ParentReportLog = sequelize.define('ParentReportLog', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  parentId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'parents', key: 'id' },
    onDelete: 'SET NULL'
  },
  studentId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'users', key: 'id' },
    onDelete: 'SET NULL'
  },
  reportType: {
    type: DataTypes.ENUM('weekly', 'monthly'),
    allowNull: false,
    defaultValue: 'weekly'
  },
  // Плановая и ручная отправки одного периода не должны блокировать друг друга.
  deliveryKind: { type: DataTypes.STRING(24), allowNull: false, defaultValue: 'scheduled' },
  periodStart: { type: DataTypes.DATEONLY, allowNull: false },
  periodEnd: { type: DataTypes.DATEONLY, allowNull: false },
  status: { type: DataTypes.STRING(24), allowNull: false, defaultValue: 'processing' },
  messageCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  sentAt: { type: DataTypes.DATE, allowNull: true },
  error: { type: DataTypes.TEXT, allowNull: true },
  manualTriggeredByUserId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'users', key: 'id' },
    onDelete: 'SET NULL'
  },
  manualTriggeredByName: { type: DataTypes.STRING(300), allowNull: true },
  manualTriggerScope: { type: DataTypes.STRING(24), allowNull: true }
}, {
  tableName: 'parent_report_logs',
  timestamps: true,
  indexes: [
    // PostgreSQL обрезает длинные автоматически сгенерированные имена индексов.
    // Явное имя предотвращает коллизию с предыдущим индексом без deliveryKind.
    { name: 'parent_report_logs_unique_period_delivery', unique: true, fields: ['parentId', 'reportType', 'periodStart', 'deliveryKind'] },
    { fields: ['studentId', 'periodStart'] },
    { fields: ['status', 'createdAt'] }
  ]
});

module.exports = ParentReportLog;
