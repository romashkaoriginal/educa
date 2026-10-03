const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Subject = sequelize.define('Subject', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  icon: {
    type: DataTypes.STRING, // emoji или URL иконки
    defaultValue: '📚'
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  // Точка последнего ручного сброса лидерборда по предмету. Null означает,
  // что рейтинг ещё не сбрасывали и баллы считаются за всё время. Поле
  // leaderboardEndDate оставлено для совместимости со старыми данными, но в
  // текущем расчёте не используется и при сбросе очищается.
  leaderboardStartDate: {
    type: DataTypes.DATE,
    allowNull: true
  },
  leaderboardEndDate: {
    type: DataTypes.DATE,
    allowNull: true
  }
}, {
  tableName: 'subjects',
  timestamps: true
});

module.exports = Subject;
