const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const PracticeBest = sequelize.define('PracticeBest', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  studentId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'users', key: 'id' }
  },
  topicId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'practice_topics', key: 'id' }
  },
  subjectId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'subjects', key: 'id' }
  },
  correct: { type: DataTypes.INTEGER, defaultValue: 0 },
  total: { type: DataTypes.INTEGER, defaultValue: 0 },
  percent: { type: DataTypes.INTEGER, defaultValue: 0 }
}, {
  tableName: 'practice_best',
  timestamps: true,
  indexes: [
    { unique: true, fields: ['studentId', 'topicId'] },
    { fields: ['studentId'] },
    { fields: ['subjectId'] }
  ]
});

module.exports = PracticeBest;