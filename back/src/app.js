const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const compression = require('compression');
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
const quizRoutes = require('./routes/quiz');
const notifyRoutes = require('./routes/notify');
const applicationRoutes = require('./routes/applications');
const botTestRoutes = require('./routes/botTest');
const setupQuizSocket = require('./socket/quizSocket');
const { telegramAuth, requireUser, requireAdmin, requireRole } = require('./middleware/telegramAuth');

const app = express();
const PORT = process.env.PORT || 5000;

const server = http.createServer(app);

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

// Сжатие gzip — уменьшает размер ответов в 3-5 раз
app.use(compression());

app.use(cors({
  origin: [
    'https://educa-student.vercel.app',
    'http://localhost:3000',
    'https://web.telegram.org'
  ],
  credentials: true
}));
app.use(express.json());

// Кэширование статичных данных (предметы меняются редко)
app.use('/api/subjects', (req, res, next) => {
  if (req.method === 'GET') {
    res.set('Cache-Control', 'public, max-age=60'); // 60 секунд
  }
  next();
});

app.use('/api/auth', authRoutes);

// Публичные эндпоинты (бот, проверка)
app.use('/api/bot-users', botUsersRoutes);

// Публичные роуты (для бота — без auth)
app.use('/api/bot-test', botTestRoutes); // бот читает вопросы без авторизации

// Все авторизованные пользователи
app.use('/api/subjects', telegramAuth, requireUser, subjectRoutes);
app.use('/api/quiz', telegramAuth, requireUser, quizRoutes);

// Студенты + все роли (практика и домашка нужны и преподу)
app.use('/api/practice', telegramAuth, requireUser, practiceRoutes);
app.use('/api/homework', telegramAuth, requireUser, homeworkRoutes);

// Статистика — все роли (студент видит свою, админ/препод/менеджер — общую)
app.use('/api/stats', telegramAuth, requireUser, statsRoutes);

// Только admin
app.use('/api/admin', telegramAuth, requireAdmin, adminRoutes);

// admin + manager
app.use('/api/students', telegramAuth, requireRole(['admin', 'manager']), studentRoutes);
app.use('/api/users', telegramAuth, requireRole(['admin', 'manager']), usersRoutes);

// admin + manager + teacher
app.use('/api/notify', telegramAuth, requireRole(['admin', 'manager', 'teacher']), notifyRoutes);

// Заявки — POST публичный (из бота), GET/PATCH/resend защищены внутри роута
app.use('/api/applications', applicationRoutes);

setupQuizSocket(io);

app.get('/', (req, res) => {
  res.json({ message: 'Educa Backend API + Telegram Bot + WebSocket' });
});

// Keepalive — не даём Railway засыпать
const SELF_URL = process.env.RAILWAY_STATIC_URL
  ? `https://${process.env.RAILWAY_STATIC_URL}`
  : `http://localhost:${PORT}`;

setInterval(() => {
  fetch(SELF_URL).catch(() => {});
}, 4 * 60 * 1000); // каждые 4 минуты

const startServer = async () => {
  await syncDatabase();

  server.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`🔌 WebSocket ready for quizzes`);
    console.log(`📦 Compression enabled`);
    startBot();
  });
};

process.on('SIGTERM', () => {
  console.log('\n🛑 Получен сигнал завершения...');
  stopBot();
  process.exit(0);
});

startServer();