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
  // Период лидерборда по предмету (см. LeaderboardModal на фронте ученика,
  // practiceController.getCombinedLeaderboard): задаётся преподавателем в
  // статистике. leaderboardStartDate = null — период ещё не назначен, сервер
  // сам считает текущую календарную неделю (прежнее поведение). После
  // leaderboardEndDate лидерборд пуст у всех — это и есть «сброс», пока не
  // назначат новый период.
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