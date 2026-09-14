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
  periodStart: { type: DataTypes.DATEONLY, allowNull: false },
  periodEnd: { type: DataTypes.DATEONLY, allowNull: false },
  status: { type: DataTypes.STRING(24), allowNull: false, defaultValue: 'processing' },
  messageCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  sentAt: { type: DataTypes.DATE, allowNull: true },
  error: { type: DataTypes.TEXT, allowNull: true }
}, {
  tableName: 'parent_report_logs',
  timestamps: true,
  indexes: [
    { unique: true, fields: ['parentId', 'reportType', 'periodStart'] },
    { fields: ['studentId', 'periodStart'] },
    { fields: ['status', 'createdAt'] }
  ]
});

module.exports = ParentReportLog;
