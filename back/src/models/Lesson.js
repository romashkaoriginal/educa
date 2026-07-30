const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Lesson = sequelize.define('Lesson', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  subjectId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: { model: 'subjects', key: 'id' }
  },
  teacherId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'users', key: 'id' },
    onDelete: 'SET NULL'
  },
  topic: { type: DataTypes.STRING, allowNull: true },
  scheduledAt: { type: DataTypes.DATE, allowNull: false },
  // ТЗ §3.1/§8.9: в расписании ссылка на трансляцию не хранится. Поле заполняется
  // только в момент «Начать занятие» и живёт вместе с активной сессией.
  streamUrl: { type: DataTypes.STRING, allowNull: true },
  status: {
    type: DataTypes.ENUM('scheduled', 'live', 'finished', 'cancelled'),
    defaultValue: 'scheduled'
  },
  // ТЗ §3.2: занятие можно начать из расписания или вне его. Запись, созданная
  // быстрым запуском, не является пунктом расписания и в нём не показывается.
  fromSchedule: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  // ТЗ §4.2: если преподаватель временно отключил вопросы, блок «Задать вопрос
  // преподавателю» не отображается у ученика.
  questionsEnabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  startedAt: { type: DataTypes.DATE, allowNull: true },
  sessionEndsAt: { type: DataTypes.DATE, allowNull: true },
  finishedAt: { type: DataTypes.DATE, allowNull: true },
  originalScheduledAt: { type: DataTypes.DATE, allowNull: true },
  notifiedAt: { type: DataTypes.DATE, allowNull: true },
  reminderSentAt: { type: DataTypes.DATE, allowNull: true },
  createdBy: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: { model: 'users', key: 'id' },
    onDelete: 'SET NULL'
  }
}, {
  tableName: 'lessons',
  timestamps: true,
  indexes: [
    { fields: ['status', 'scheduledAt'] },
    { fields: ['status', 'sessionEndsAt'] },
    { fields: ['subjectId'] },
    { fields: ['teacherId'] }
  ]
});

module.exports = Lesson;
