const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const compression = require('compression');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
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
const guestRoutes = require('./routes/guest');
const guestAdminRoutes = require('./routes/guestAdmin');
const setupQuizSocket = require('./socket/quizSocket');
const { startGuestScheduler } = require('./services/guestScheduler');
const { telegramAuth, requireUser, requireAdmin, requireRole, blockGuests } = require('./middleware/telegramAuth');
const { telegramKey } = require('./middleware/rateLimitKeys');

const app = express();
const PORT = process.env.PORT || 5000;

const allowedOrigins = (process.env.ALLOWED_ORIGINS || process.env.WEB_APP_URL || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const defaultOrigins = [
  'http://localhost:3000',
  'https://web.telegram.org'
];

const corsOrigins = allowedOrigins.length > 0 ? allowedOrigins : defaultOrigins;

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: corsOrigins,
    methods: ['GET', 'POST'],
    credentials: true
  }
});

app.use(helmet({
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: false,
}));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { message: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Общий лимит на /api/ — ключуем ПО ПОЛЬЗОВАТЕЛЮ (Telegram ID), фолбэк IP.
// Порог щедрый: активная практика (answer/dashboard/streak/leaderboard) влезает
// с запасом, а флуд одного пользователя/IP режется.
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 600,
  keyGenerator: telegramKey,
  message: { message: 'Слишком много запросов, попробуйте чуть позже' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Старт Mini App (состояние гостя, список предметов) — дёргается редко.
const guestStateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  keyGenerator: telegramKey,
  message: { message: 'Слишком много запросов' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Выбор предметов гостем (только POST — GET /subjects/available лимитируется отдельно).
const guestSubjectsLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  keyGenerator: telegramKey,
  skip: (req) => req.method !== 'POST',
  message: { message: 'Слишком много запросов' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Заявки — строгий анти-флуд лидов: и по пользователю, и по IP.
const applicationUserLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  keyGenerator: telegramKey,
  skip: (req) => req.method !== 'POST',
  message: { message: 'Слишком много заявок. Попробуйте позже.' },
  standardHeaders: true,
  legacyHeaders: false,
});
const applicationIpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  skip: (req) => req.method !== 'POST',
  message: { message: 'Слишком много заявок. Попробуйте позже.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Запись результатов практики — высокий порог: живой ученик не превышает,
// а скриптовый флуд режется. Только POST (чтение покрыто общим apiLimiter).
const practiceWriteLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 240,
  keyGenerator: telegramKey,
  skip: (req) => req.method !== 'POST',
  message: { message: 'Слишком много запросов' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Сжатие gzip — уменьшает размер ответов в 3-5 раз
app.use(compression());

app.use(cors({
  origin: corsOrigins,
  credentials: true
}));
// Лимит размера тела — защита от memory-абьюза большими payload'ами.
app.use(express.json({ limit: '64kb' }));

// Кэширование статичных данных (предметы меняются редко)
app.use('/api/subjects', (req, res, next) => {
  if (req.method === 'GET') {
    res.set('Cache-Control', 'public, max-age=60'); // 60 секунд
  }
  next();
});

app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/', apiLimiter);

// Публичные эндпоинты (бот, проверка)
app.use('/api/bot-users', botUsersRoutes);

// Список гостей для админа (вход «под гостем» для проверки) — только admin.
// Монтируется ДО общего /api/guest, чтобы admin-guard сработал на этом сабпути.
app.use('/api/guest/admin', telegramAuth, requireRole(['admin']), guestAdminRoutes);

// Состояние гостя / список предметов — отдельный лимит по TG ID
app.use('/api/guest/state', guestStateLimiter);
app.use('/api/guest/subjects/available', guestStateLimiter);
app.use('/api/guest/subjects', guestSubjectsLimiter);

// Гостевой доступ — нужен только верифицированный initData (без requireUser)
app.use('/api/guest', telegramAuth, guestRoutes);

// Все авторизованные пользователи (гость пропускается requireUser, т.к. он User)
app.use('/api/subjects', telegramAuth, requireUser, subjectRoutes);
// Викторина закрыта для гостя (ТЗ §8)
app.use('/api/quiz', telegramAuth, requireUser, blockGuests, quizRoutes);

// Практика доступна гостю (ТЗ §6). Домашка закрыта для гостя (ТЗ §7).
// practiceWriteLimiter режет флуд POST-запросов (answer/session-summary).
app.use('/api/practice', telegramAuth, requireUser, practiceWriteLimiter, practiceRoutes);
app.use('/api/homework', telegramAuth, requireUser, blockGuests, homeworkRoutes);

// Статистика — все роли (студент видит свою, админ/препод/менеджер — общую)
app.use('/api/stats', telegramAuth, requireUser, statsRoutes);

// Только admin
app.use('/api/admin', telegramAuth, requireAdmin, adminRoutes);

// admin + manager
app.use('/api/students', telegramAuth, requireRole(['admin', 'manager']), studentRoutes);
app.use('/api/users', telegramAuth, requireRole(['admin', 'manager']), usersRoutes);

// admin + manager + teacher
app.use('/api/notify', telegramAuth, requireRole(['admin', 'manager', 'teacher']), notifyRoutes);

// Заявки — POST публичный (из бота), GET/PATCH/resend защищены внутри роута.
// Анти-флуд лидов навешиваем только на создание (лимитеры пропускают не-POST).
app.use('/api/applications', applicationIpLimiter, applicationUserLimiter, applicationRoutes);

setupQuizSocket(io);

app.get('/', (req, res) => {
  res.json({ message: 'Educa Backend API + Telegram Bot + WebSocket' });
});

// Keepalive self-ping (на VPS не обязателен, оставлен как безвредный health-tick).
// URL берём из PUBLIC_URL/SELF_URL, иначе локальный порт.
const SELF_URL = process.env.PUBLIC_URL || process.env.SELF_URL || `http://localhost:${PORT}`;

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
    startGuestScheduler();
  });
};

process.on('SIGTERM', () => {
  console.log('\n🛑 Получен сигнал завершения...');
  stopBot();
  process.exit(0);
});

startServer();