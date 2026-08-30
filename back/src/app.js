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
const practiceImagesRoutes = require('./routes/practiceImages');
const usersRoutes = require('./routes/users');
const botUsersRoutes = require('./routes/botUsers');
const quizRoutes = require('./routes/quiz');
const notifyRoutes = require('./routes/notify');
const applicationRoutes = require('./routes/applications');
const guestRoutes = require('./routes/guest');
const guestAdminRoutes = require('./routes/guestAdmin');
const lessonRoutes = require('./routes/lesson');
const lessonAdminRoutes = require('./routes/lessonAdmin');
const clientErrorRoutes = require('./routes/clientErrors');
const setupSocketAuth = require('./socket/authMiddleware');
const setupQuizSocket = require('./socket/quizSocket');
const setupLessonSocket = require('./socket/lessonSocket');
const { startGuestScheduler } = require('./services/guestScheduler');
const { startLessonScheduler, stopLessonScheduler } = require('./services/lessonScheduler');
const { startErrorLogRetention, stopErrorLogRetention } = require('./services/errorLogRetention');
const { telegramAuth, requireUser, requireAdmin, requireRole, blockGuests } = require('./middleware/telegramAuth');
const {
  finalErrorHandler,
  installConsoleErrorCapture,
  requestErrorCapture,
  setupSocketErrorCapture
} = require('./middleware/errorCapture');

const app = express();
const PORT = process.env.PORT || 5000;

// За nginx/докер-прокси: доверяем первому прокси, чтобы express-rate-limit
// корректно читал реальный IP из X-Forwarded-For (иначе ValidationError и
// все запросы выглядят как один IP).
app.set('trust proxy', 1);

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
app.set('io', io);

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

// Общий лимит на /api/ — по IP. Щадящий потолок: не мешает нормальной работе,
// отсекает только грубый флуд.
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  message: { message: 'Слишком много запросов, попробуйте чуть позже' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Сжатие gzip — уменьшает размер ответов в 3-5 раз
app.use(compression());

app.use(cors({
  origin: corsOrigins,
  credentials: true
}));
app.use(express.json());
installConsoleErrorCapture();
app.use(requestErrorCapture);

// Кэширование статичных данных (предметы меняются редко)
app.use('/api/subjects', (req, res, next) => {
  if (req.method === 'GET') {
    res.set('Cache-Control', 'public, max-age=60'); // 60 секунд
  }
  next();
});

app.use('/api/auth', authLimiter, authRoutes);

// Публичная раздача изображений практики — без telegramAuth (<img> не шлёт
// telegram-заголовок), но под тем же apiLimiter, что и остальные /api/*.
app.use('/api/practice-images', apiLimiter, practiceImagesRoutes);

app.use('/api/', apiLimiter);

// Публичные эндпоинты (бот, проверка)
app.use('/api/bot-users', botUsersRoutes);

// Ошибки браузера принимаются отдельно и никогда не вмешиваются в основной запрос.
app.use('/api/client-errors', telegramAuth, clientErrorRoutes);

// Список гостей для админа (вход «под гостем» для проверки) — только admin.
// Монтируется ДО общего /api/guest, чтобы admin-guard сработал на этом сабпути.
app.use('/api/guest/admin', telegramAuth, requireRole(['admin']), guestAdminRoutes);

// Гостевой доступ — нужен только верифицированный initData (без requireUser)
app.use('/api/guest', telegramAuth, guestRoutes);

// Все авторизованные пользователи (гость пропускается requireUser, т.к. он User)
app.use('/api/subjects', telegramAuth, requireUser, subjectRoutes);
// Викторина закрыта для гостя (ТЗ §8)
app.use('/api/quiz', telegramAuth, requireUser, blockGuests, quizRoutes);

// Практика доступна гостю (ТЗ §6). Домашка закрыта для гостя (ТЗ §7).
app.use('/api/practice', telegramAuth, requireUser, practiceRoutes);
app.use('/api/homework', telegramAuth, requireUser, blockGuests, homeworkRoutes);
app.use('/api/lesson', telegramAuth, requireUser, blockGuests, lessonRoutes);
app.use('/api/lesson-admin', telegramAuth, requireRole(['admin', 'teacher']), lessonAdminRoutes);

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
app.use('/api/applications', applicationRoutes);

setupSocketAuth(io);
setupSocketErrorCapture(io);
setupQuizSocket(io);
setupLessonSocket(io);

app.get('/', (req, res) => {
  res.json({ message: 'Educa Backend API + Telegram Bot + WebSocket' });
});

app.use(finalErrorHandler);

// Keepalive self-ping (на VPS не обязателен, оставлен как безвредный health-tick).
// URL берём из PUBLIC_URL/SELF_URL, иначе локальный порт.
const SELF_URL = process.env.PUBLIC_URL || process.env.SELF_URL || `http://localhost:${PORT}`;

setInterval(() => {
  fetch(SELF_URL).catch(() => {});
}, 4 * 60 * 1000); // каждые 4 минуты

const startServer = async () => {
  await syncDatabase();
  startErrorLogRetention();

  server.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`🔌 WebSocket ready for quizzes and lessons`);
    console.log(`📦 Compression enabled`);
    startBot();
    startGuestScheduler();
    startLessonScheduler();
  });
};

process.on('SIGTERM', () => {
  console.log('\n🛑 Получен сигнал завершения...');
  stopBot();
  stopLessonScheduler();
  stopErrorLogRetention();
  process.exit(0);
});
startServer();
