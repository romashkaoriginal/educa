const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const TeacherSubject = sequelize.define('TeacherSubject', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  teacherId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'users', key: 'id' },
    onDelete: 'CASCADE'
  },
  // Группы как сущность убраны: преподаватель назначается прямо на предмет.
  // Колонка groupId остаётся в таблице ради исторических данных, но больше не
  // используется и не обязательна.
  groupId: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  subjectId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'subjects', key: 'id' },
    onDelete: 'CASCADE'
  }
}, {
  tableName: 'teacher_subjects',
  timestamps: true,
  indexes: [
    { unique: true, fields: ['teacherId', 'subjectId'] }
  ]
});

module.exports = TeacherSubject;
