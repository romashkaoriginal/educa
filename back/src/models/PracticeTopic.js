const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const PracticeTopic = sequelize.define('PracticeTopic', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  name: {  
    type: DataTypes.STRING,
    allowNull: false
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  icon: {  
    type: DataTypes.STRING,
    defaultValue: '📝'
  },
  subjectId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'subjects',
      key: 'id'
    }
  },
  isActive: {  
    type: DataTypes.BOOLEAN,
    defaultValue: true
  }
}, {
  tableName: 'practice_topics',
  timestamps: true
});

module.exports = PracticeTopic;