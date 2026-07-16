const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Метаданные оптимизированного изображения. Сам файл лежит в файловом
// хранилище (docker volume), в БД — только ключ и параметры (ТЗ §5.1).
const PracticeImage = sequelize.define('PracticeImage', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  storageKey: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
  },
  mimeType: {
    type: DataTypes.STRING,
    allowNull: false
  },
  width: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  height: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  fileSize: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  // sha256 оптимизированного файла — для дедупликации (ТЗ §5.4).
  fileHash: {
    type: DataTypes.STRING(64),
    allowNull: false
  }
}, {
  tableName: 'practice_images',
  timestamps: true,
  updatedAt: false,
  indexes: [
    { fields: ['fileHash'] }
  ]
});

module.exports = PracticeImage;
