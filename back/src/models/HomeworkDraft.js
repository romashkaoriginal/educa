const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

module.exports = sequelize.define('HomeworkDraft', {
  userId: { type: DataTypes.INTEGER, primaryKey: true, references: { model: 'users', key: 'id' }, onDelete: 'CASCADE' },
  homeworkId: { type: DataTypes.INTEGER, primaryKey: true, references: { model: 'homeworks', key: 'id' }, onDelete: 'CASCADE' },
  revision: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  data: { type: DataTypes.JSONB, allowNull: true },
}, { tableName: 'homework_drafts', timestamps: true });
