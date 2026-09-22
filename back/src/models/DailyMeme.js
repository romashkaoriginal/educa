const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Мем дня (ТЗ Дмитрия 22.09.2026): показывается ученику поп-апом сразу после
// того, как засчитан стрик. Одна картинка на конкретную дату — админ
// распределяет мемы по датам заранее.
const DailyMeme = sequelize.define('DailyMeme', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  imageId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'practice_images', key: 'id' }
  },
  date: { type: DataTypes.DATEONLY, allowNull: false, unique: true }
}, {
  tableName: 'daily_memes',
  timestamps: true
});

module.exports = DailyMeme;
