const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const LessonAttendance = sequelize.define('LessonAttendance', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  lessonId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'lessons', key: 'id' },
    onDelete: 'CASCADE'
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'users', key: 'id' },
    onDelete: 'CASCADE'
  },
  joinedAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  lastActionAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  openedScreenAt: { type: DataTypes.DATE, allowNull: true },
  clickedStreamAt: { type: DataTypes.DATE, allowNull: true },
  firstAnswerAt: { type: DataTypes.DATE, allowNull: true },
  present: { type: DataTypes.BOOLEAN, defaultValue: false }
}, {
  tableName: 'lesson_attendance',
  timestamps: true,
  indexes: [{ unique: true, fields: ['lessonId', 'userId'] }]
});

module.exports = LessonAttendance;
