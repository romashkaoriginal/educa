const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const LessonMaterial = sequelize.define('LessonMaterial', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  lessonId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'lessons', key: 'id' },
    onDelete: 'CASCADE'
  },
  type: {
    type: DataTypes.ENUM('note', 'presentation', 'recording', 'link', 'homework'),
    allowNull: false
  },
  title: { type: DataTypes.STRING, allowNull: false },
  url: { type: DataTypes.STRING, allowNull: true },
  homeworkId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'homeworks', key: 'id' },
    onDelete: 'SET NULL'
  },
  createdBy: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'users', key: 'id' },
    onDelete: 'SET NULL'
  }
}, {
  tableName: 'lesson_materials',
  timestamps: true
});

module.exports = LessonMaterial;
