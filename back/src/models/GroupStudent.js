const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const GroupStudent = sequelize.define('GroupStudent', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  groupId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'groups', key: 'id' },
    onDelete: 'CASCADE'
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'users', key: 'id' },
    onDelete: 'CASCADE'
  }
}, {
  tableName: 'group_students',
  timestamps: true,
  indexes: [{ unique: true, fields: ['groupId', 'userId'] }]
});

module.exports = GroupStudent;
