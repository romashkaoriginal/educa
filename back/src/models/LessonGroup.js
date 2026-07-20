const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const LessonGroup = sequelize.define('LessonGroup', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  lessonId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'lessons', key: 'id' },
    onDelete: 'CASCADE'
  },
  groupId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'groups', key: 'id' },
    onDelete: 'CASCADE'
  }
}, {
  tableName: 'lesson_groups',
  timestamps: false,
  indexes: [{ unique: true, fields: ['lessonId', 'groupId'] }]
});

module.exports = LessonGroup;
