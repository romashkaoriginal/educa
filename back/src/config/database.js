const { Sequelize } = require('sequelize');
require('dotenv').config();

const sequelize = new Sequelize(process.env.DATABASE_URL, {
  dialect: 'postgres',
  dialectOptions: {
    ssl: {
      require: true,
      rejectUnauthorized: false
    }
  },
  logging: false,
  pool: {
    max: 20,        // максимум соединений (было 5 по умолчанию)
    min: 2,         // минимум держим открытыми
    acquire: 30000, // ждём соединение максимум 30 секунд
    idle: 10000     // закрываем соединение после 10 секунд простоя
  }
});

const testConnection = async () => {
  try {
    await sequelize.authenticate();
    console.log('✅ Database connected successfully');
  } catch (error) {
    console.error('❌ Database connection error:', error);
  }
};

testConnection();

module.exports = sequelize;