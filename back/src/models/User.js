const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const User = sequelize.define('User', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  
  telegramId: {
    type: DataTypes.BIGINT,
    allowNull: true,
    unique: true
  },
  telegramUsername: {
    type: DataTypes.STRING,
    allowNull: true
  },
  telegramPhotoUrl: {
    type: DataTypes.STRING,
    allowNull: true
  },
  
  // ОБЩИЕ ПОЛЯ
  firstName: {
    type: DataTypes.STRING,
    allowNull: false  
  },
  lastName: {
    type: DataTypes.STRING,
    allowNull: true  
  },
  role: {
    type: DataTypes.ENUM('admin', 'teacher', 'manager', 'student'),
    allowNull: false,
    defaultValue: 'student'
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  
  // СТАТИСТИКА (для студентов)
  totalScore: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  quizzesPassed: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  homeworksCompleted: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },

  // ========== ГОСТЕВОЙ ДОСТУП ==========
  // Гость — это реальный User (role='student') с временным доступом на 24 часа.
  // Практика/статистика работают по studentId=User.id без изменений.
  isGuest: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  guestStatus: {
    type: DataTypes.ENUM(
      'guest_active',          // доступ активен
      'guest_expiring',        // осталось меньше 4 часов (отправлено напоминание)
      'guest_expired',         // доступ закончился
      'lead_sent',             // оставил заявку
      'converted_to_student'   // стал учеником
    ),
    allowNull: true
  },
  guestStartedAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  guestExpiresAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  // Выбрал ли предметы при первом входе
  guestSubjectsChosen: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  // Факт отправки уведомления за 4 часа
  guestReminderSentAt: {
    type: DataTypes.DATE,
    allowNull: true
  },
  // Факт отправки заявки
  guestApplicationSent: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  }
}, {
  tableName: 'users',
  timestamps: true,
  indexes: [
    {
      unique: true,
      fields: ['telegramId']
    }
  ]
});

module.exports = User;