const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const NotificationLog = sequelize.define('NotificationLog', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  sentBy: { type: DataTypes.INTEGER, allowNull: false },
  sentByName: { type: DataTypes.STRING, allowNull: false },
  sentByRole: { type: DataTypes.STRING, allowNull: true, defaultValue: 'admin' },
  text: { type: DataTypes.TEXT, allowNull: false },
  filters: { type: DataTypes.JSONB, allowNull: true },
  recipientCount: { type: DataTypes.INTEGER, defaultValue: 0 },
  successCount: { type: DataTypes.INTEGER, defaultValue: 0 },
  failedCount: { type: DataTypes.INTEGER, defaultValue: 0 },
  recipients: { type: DataTypes.JSONB, allowNull: true }
}, {
  tableName: 'notification_logs',
  timestamps: true
});

module.exports = NotificationLog;