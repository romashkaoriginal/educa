const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Group = sequelize.define('Group', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  name: { type: DataTypes.STRING, allowNull: false },
  subjectId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'subjects', key: 'id' }
  },
  isActive: { type: DataTypes.BOOLEAN, defaultValue: true }
}, {
  tableName: 'groups',
  timestamps: true,
  indexes: [{ fields: ['subjectId', 'isActive'] }]
});

module.exports = Group;
