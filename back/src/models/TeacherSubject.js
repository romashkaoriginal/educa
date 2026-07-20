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
  groupId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'groups', key: 'id' },
    onDelete: 'CASCADE'
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
    { unique: true, fields: ['teacherId', 'groupId'] },
    { fields: ['subjectId', 'teacherId'] }
  ]
});

module.exports = TeacherSubject;
