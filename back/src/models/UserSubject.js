const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const UserSubject = sequelize.define('UserSubject', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id'
    }
  },
  
  subjectId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'subjects',
      key: 'id'
    }
  },
  
  // Даты доступа к конкретному предмету
  accessStartDate: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Дата начала доступа к предмету'
  },
  
  accessEndDate: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Дата окончания доступа к предмету'
  },
  
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  }
}, {
  tableName: 'user_subjects',
  timestamps: true,
  indexes: [
    {
      unique: true,
      fields: ['userId', 'subjectId']
    }
  ]
});

module.exports = UserSubject;