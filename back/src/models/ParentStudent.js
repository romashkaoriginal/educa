const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Связь родитель↔ученик "многие ко многим": у одного родителя может быть
// несколько привязанных детей (ТЗ: "создать родителя с двумя и более детьми").
const ParentStudent = sequelize.define('ParentStudent', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  parentId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'parents', key: 'id' },
    onDelete: 'CASCADE'
  },
  studentId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    unique: true, // ученик привязан не более чем к одному родителю в системе
    references: { model: 'users', key: 'id' },
    onDelete: 'CASCADE'
  }
}, {
  tableName: 'parent_students',
  timestamps: true,
  indexes: [
    { unique: true, fields: ['studentId'] },
    { fields: ['parentId'] }
  ]
});

module.exports = ParentStudent;
