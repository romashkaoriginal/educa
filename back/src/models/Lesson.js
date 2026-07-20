const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Lesson = sequelize.define('Lesson', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  subjectId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'subjects', key: 'id' }
  },
  teacherId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'users', key: 'id' },
    onDelete: 'SET NULL'
  },
  topic: { type: DataTypes.STRING, allowNull: true },
  scheduledAt: { type: DataTypes.DATE, allowNull: false },
  streamUrl: { type: DataTypes.STRING, allowNull: true },
  status: {
    type: DataTypes.ENUM('scheduled', 'live', 'finished', 'cancelled'),
    defaultValue: 'scheduled'
  },
  startedAt: { type: DataTypes.DATE, allowNull: true },
  sessionEndsAt: { type: DataTypes.DATE, allowNull: true },
  finishedAt: { type: DataTypes.DATE, allowNull: true },
  originalScheduledAt: { type: DataTypes.DATE, allowNull: true },
  notifiedAt: { type: DataTypes.DATE, allowNull: true },
  reminderSentAt: { type: DataTypes.DATE, allowNull: true },
  createdBy: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'users', key: 'id' },
    onDelete: 'SET NULL'
  }
}, {
  tableName: 'lessons',
  timestamps: true,
  indexes: [
    { fields: ['status', 'scheduledAt'] },
    { fields: ['status', 'sessionEndsAt'] },
    { fields: ['subjectId'] },
    { fields: ['teacherId'] }
  ]
});

module.exports = Lesson;
