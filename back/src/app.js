const express = require('express');
const cors = require('cors');
require('dotenv').config();

const { syncDatabase } = require('./models');
const { startBot, stopBot } = require('./bot');

const authRoutes = require('./routes/auth');
const subjectRoutes = require('./routes/subjects');
const studentRoutes = require('./routes/students');
const statsRoutes = require('./routes/stats');
const adminRoutes = require('./routes/admin');
const homeworkRoutes = require('./routes/homework');
const practiceRoutes = require('./routes/practice');
const usersRoutes = require('./routes/users');
const botUsersRoutes = require('./routes/botUsers');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({
  origin: [
    'https://educa-student.vercel.app',  
    'http://localhost:3000',
    'https://web.telegram.org'
  ],
  credentials: true
}));
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/subjects', subjectRoutes);
app.use('/api/students', studentRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/homework', homeworkRoutes);
app.use('/api/practice', practiceRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/bot-users', botUsersRoutes);

// Тестовый маршрут
app.get('/', (req, res) => {
  res.json({ message: 'Educa Backend API + Telegram Bot' });
});

// Запуск сервера
const startServer = async () => {
  const sequelize = require('./config/database'); 
  
  await syncDatabase();
  await sequelize.sync({ alter: true }); 
  
  app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    startBot();
  });
};



process.on('SIGTERM', () => {
  console.log('\n🛑 Получен сигнал завершения...');
  stopBot();
  process.exit(0);
});

startServer();