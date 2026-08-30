const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const ErrorLog = sequelize.define('ErrorLog', {
  id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
  source: { type: DataTypes.STRING(24), allowNull: false, defaultValue: 'backend' },
  severity: { type: DataTypes.STRING(16), allowNull: false, defaultValue: 'error' },
  statusCode: { type: DataTypes.INTEGER, allowNull: true },
  code: { type: DataTypes.STRING(120), allowNull: true },
  message: { type: DataTypes.TEXT, allowNull: false },
  stack: { type: DataTypes.TEXT, allowNull: true },
  area: { type: DataTypes.STRING(64), allowNull: true },
  action: { type: DataTypes.STRING(64), allowNull: true },
  method: { type: DataTypes.STRING(12), allowNull: true },
  path: { type: DataTypes.STRING(500), allowNull: true },
  userId: { type: DataTypes.INTEGER, allowNull: true },
  userTelegramId: { type: DataTypes.BIGINT, allowNull: true },
  userRole: { type: DataTypes.STRING(32), allowNull: true },
  userName: { type: DataTypes.STRING(300), allowNull: true },
  entityType: { type: DataTypes.STRING(64), allowNull: true },
  entityId: { type: DataTypes.STRING(120), allowNull: true },
  entityName: { type: DataTypes.STRING(500), allowNull: true },
  context: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
  fingerprint: { type: DataTypes.STRING(64), allowNull: false },
  occurrences: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
  firstSeenAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  lastSeenAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
}, {
  tableName: 'error_logs',
  timestamps: true,
  indexes: [
    { fields: ['lastSeenAt'] },
    { fields: ['fingerprint', 'lastSeenAt'] },
    { fields: ['userId', 'lastSeenAt'] },
    { fields: ['area', 'lastSeenAt'] },
    { fields: ['source', 'lastSeenAt'] }
  ]
});

module.exports = ErrorLog;
