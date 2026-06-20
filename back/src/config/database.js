const { Sequelize } = require('sequelize');
require('dotenv').config();

const databaseUrl = process.env.DATABASE_URL;
// SSL включаем только явно (DATABASE_SSL=true) или при sslmode=require в URL.
// На VPS БД — локальный Postgres в docker-сети, SSL не нужен (DATABASE_SSL=false).
const useSsl =
  process.env.DATABASE_SSL === 'true' ||
  /sslmode=require/i.test(databaseUrl || '');

const sequelize = new Sequelize(databaseUrl, {
  dialect: 'postgres',
  ...(useSsl
    ? {
        dialectOptions: {
          ssl: {
            require: true,
            rejectUnauthorized: false
          }
        }
      }
    : {}),
  logging: false,
  pool: {
    max: 20,
    min: 2,
    acquire: 30000,
    idle: 10000
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
