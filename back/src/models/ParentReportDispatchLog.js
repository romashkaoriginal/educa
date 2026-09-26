const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Не агрегат, а неизменяемый след одного ручного нажатия «Отправить».
// ParentReportLog хранит текущее состояние периода, эта таблица — аудит.
const ParentReportDispatchLog = sequelize.define('ParentReportDispatchLog', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  parentReportLogId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'parent_report_logs', key: 'id' },
    onDelete: 'SET NULL'
  },
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
  reportType: { type: DataTypes.ENUM('weekly', 'monthly'), allowNull: false },
  periodStart: { type: DataTypes.DATEONLY, allowNull: false },
  periodEnd: { type: DataTypes.DATEONLY, allowNull: false },
  triggerScope: { type: DataTypes.ENUM('bulk', 'parent'), allowNull: false },
  triggeredByUserId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'users', key: 'id' },
    // Имя остаётся в аудите, даже если сотрудника позднее удалили.
    onDelete: 'SET NULL'
  },
  triggeredByName: { type: DataTypes.STRING(300), allowNull: false },
  status: { type: DataTypes.STRING(24), allowNull: false },
  messageCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  sentAt: { type: DataTypes.DATE, allowNull: true },
  error: { type: DataTypes.TEXT, allowNull: true }
}, {
  tableName: 'parent_report_dispatch_logs',
  timestamps: true,
  indexes: [
    { fields: ['parentId', 'createdAt'] },
    { fields: ['triggeredByUserId', 'createdAt'] }
  ]
});

module.exports = ParentReportDispatchLog;
