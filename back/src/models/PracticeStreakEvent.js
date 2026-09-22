const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// События серии для всплывающего экрана в приложении (ТЗ Дмитрия 22.09.2026):
// "extended" — серия продлена, показываем день серии, очки и предмет, куда
// они пошли; "broken" — серия прервалась, показываем при следующем входе.
// shownAt — идемпотентный показ: пока не проставлен, событие отдаётся клиенту.
const PracticeStreakEvent = sequelize.define('PracticeStreakEvent', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  studentId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'users', key: 'id' }
  },
  type: { type: DataTypes.ENUM('extended', 'broken'), allowNull: false },
  streakDay: { type: DataTypes.INTEGER, allowNull: true },
  points: { type: DataTypes.INTEGER, allowNull: true },
  subjectId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'subjects', key: 'id' }
  },
  date: { type: DataTypes.DATEONLY, allowNull: false },
  shownAt: { type: DataTypes.DATE, allowNull: true }
}, {
  tableName: 'practice_streak_events',
  timestamps: true,
  indexes: [
    { fields: ['studentId', 'shownAt'] }
  ]
});

module.exports = PracticeStreakEvent;
