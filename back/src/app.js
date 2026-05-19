const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
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
const quizRoutes = require('./routes/quiz'); // ← ДОБАВИЛИ

const setupQuizSocket = require('./socket/quizSocket'); // ← ДОБАВИЛИ

const app = express();
const PORT = process.env.PORT || 5000;

// Создаём HTTP сервер для Socket.IO
const server = http.createServer(app);

// Настройка Socket.IO
const io = new Server(server, {
  cors: {
    origin: [
      'https://educa-student.vercel.app',
      'http://localhost:3000',
      'https://web.telegram.org'
    ],
    methods: ['GET', 'POST'],
    credentials: true
  }
});

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
app.use('/api/quiz', quizRoutes); // ← ДОБАВИЛИ

// Подключаем WebSocket для викторин
setupQuizSocket(io); // ← ДОБАВИЛИ

// Тестовый маршрут
app.get('/', (req, res) => {
  res.json({ message: 'Educa Backend API + Telegram Bot + WebSocket' });
});

// Запуск сервера
const startServer = async () => {
  const sequelize = require('./config/database'); 
  
  await syncDatabase();
  //await sequelize.sync({ alter: true }); //
  
  // ИЗМЕНЕНО: server.listen вместо app.listen!
  server.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`🔌 WebSocket ready for quizzes`);
    startBot();
  });
};

process.on('SIGTERM', () => {
  console.log('\n🛑 Получен сигнал завершения...');
  stopBot();
  process.exit(0);
});

startServer();