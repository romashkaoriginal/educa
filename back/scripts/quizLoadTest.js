#!/usr/bin/env node
/**
 * Нагрузочная проверка живой викторины.
 *
 * Воспроизводит ситуацию, из-за которой сервер лёг на стриме: класс входит в
 * занятие разом, преподаватель листает вопросы, все отвечают почти
 * одновременно. Скрипт считает запросы, ответы 429 и время отклика.
 *
 * Запуск против ЛОКАЛЬНОГО стенда (к проду не ходим):
 *   node scripts/quizLoadTest.js --students 50 --questions 10
 *
 * Нужны переменные окружения:
 *   LOAD_TEST_URL         адрес бэкенда (по умолчанию http://127.0.0.1:5000)
 *   LOAD_TEST_BOT_TOKEN   токен бота стенда — им подписывается initData
 *   LOAD_TEST_LESSON_ID   id идущего занятия
 *   LOAD_TEST_QUIZ_ID     id подготовленной викторины
 *   LOAD_TEST_TEACHER_ID  telegram id преподавателя этого занятия
 *   LOAD_TEST_STUDENT_IDS telegram id учеников через запятую
 */
const crypto = require('crypto');

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 2) {
    if (!argv[i].startsWith('--')) continue;
    args[argv[i].slice(2)] = argv[i + 1];
  }
  return args;
}

const args = parseArgs(process.argv);
const BASE_URL = (process.env.LOAD_TEST_URL || 'http://127.0.0.1:5000').replace(/\/$/, '');
const BOT_TOKEN = process.env.LOAD_TEST_BOT_TOKEN;
const LESSON_ID = process.env.LOAD_TEST_LESSON_ID;
const QUIZ_ID = process.env.LOAD_TEST_QUIZ_ID;
const TEACHER_ID = process.env.LOAD_TEST_TEACHER_ID;
const STUDENT_IDS = (process.env.LOAD_TEST_STUDENT_IDS || '').split(',').map((id) => id.trim()).filter(Boolean);
const QUESTIONS = Number(args.questions || 10);
const STUDENTS = Math.min(Number(args.students || 50), STUDENT_IDS.length || Number(args.students || 50));

// К продовой базе такой скрипт подпускать нельзя: он пишет ответы в занятие.
if (/kubik-ct\.online|https:\/\//.test(BASE_URL) && !args.force) {
  console.error('Скрипт рассчитан на локальный стенд. Для другого адреса добавьте --force.');
  process.exit(1);
}
if (!BOT_TOKEN || !LESSON_ID || !QUIZ_ID || !TEACHER_ID || STUDENT_IDS.length === 0) {
  console.error('Не заданы переменные окружения. См. комментарий в начале файла.');
  process.exit(1);
}

// Клиент сокета нужен только этому скрипту, в зависимости бэкенда он не входит.
let io;
try {
  ({ io } = require('socket.io-client'));
} catch {
  console.error('Нужен socket.io-client: npm i -D socket.io-client');
  process.exit(1);
}

function signInitData(telegramId) {
  const params = new URLSearchParams();
  params.set('auth_date', String(Math.floor(Date.now() / 1000)));
  params.set('user', JSON.stringify({ id: Number(telegramId), first_name: `Ученик ${telegramId}` }));
  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
  params.set('hash', crypto.createHmac('sha256', secret).update(dataCheckString).digest('hex'));
  return params.toString();
}

const stats = { requests: 0, rateLimited: 0, failed: 0, latencies: [] };

async function call(path, initData, options = {}) {
  const startedAt = Date.now();
  stats.requests += 1;
  try {
    const response = await fetch(`${BASE_URL}/api${path}`, {
      ...options,
      headers: {
        'content-type': 'application/json',
        'x-telegram-init-data': initData,
        ...(options.headers || {})
      }
    });
    stats.latencies.push(Date.now() - startedAt);
    if (response.status === 429) stats.rateLimited += 1;
    else if (!response.ok) stats.failed += 1;
    return response;
  } catch (error) {
    stats.failed += 1;
    return null;
  }
}

function percentile(values, share) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * share))];
}

function connectStudent(telegramId) {
  const initData = signInitData(telegramId);
  const socket = io(BASE_URL, {
    auth: { initData },
    transports: ['websocket'],
    reconnection: false
  });
  const state = { socket, initData, telegramId, currentQuestionId: null, answered: new Set() };
  socket.on('lesson:state', (payload) => {
    const question = payload?.activeQuiz?.currentQuestion;
    state.currentQuestionId = question?.id || null;
  });
  socket.on('quiz:question-shown', ({ question } = {}) => { state.currentQuestionId = question?.id || null; });
  socket.on('quiz:next-question', () => {
    socket.emit('student:request-state', { lessonId: Number(LESSON_ID) });
  });
  return new Promise((resolve, reject) => {
    socket.once('connect', () => {
      socket.emit('student:join-lesson', { lessonId: Number(LESSON_ID), forceReconnect: true });
      resolve(state);
    });
    socket.once('connect_error', reject);
    setTimeout(() => reject(new Error(`Таймаут подключения ${telegramId}`)), 15000);
  });
}

async function main() {
  const teacherInitData = signInitData(TEACHER_ID);
  const ids = STUDENT_IDS.slice(0, STUDENTS);
  console.log(`Стенд: ${BASE_URL}`);
  console.log(`Подключаю ${ids.length} учеников…`);

  const connectStartedAt = Date.now();
  const students = [];
  for (const result of await Promise.allSettled(ids.map(connectStudent))) {
    if (result.status === 'fulfilled') students.push(result.value);
  }
  console.log(`Подключено ${students.length} из ${ids.length} за ${Date.now() - connectStartedAt} мс`);
  if (students.length === 0) process.exit(1);

  // Регистрация в викторине — так же разом, как при реальном старте.
  await Promise.all(students.map((student) => call(`/lesson/lesson-quiz/${QUIZ_ID}/join`, student.initData, { method: 'POST' })));

  for (let index = 0; index < QUESTIONS; index += 1) {
    const questionStartedAt = Date.now();
    const action = index === 0 ? 'show-question' : 'next-question';
    const response = await call(`/lesson-admin/quizzes/${QUIZ_ID}/${action}`, teacherInitData, { method: 'POST' });
    if (!response || !response.ok) {
      console.log(`Вопрос ${index + 1}: преподаватель получил ${response ? response.status : 'сбой сети'} — дальше нет смысла`);
      break;
    }

    // Даём событию разойтись по комнате, затем отвечают все сразу.
    await new Promise((resolve) => setTimeout(resolve, 400));
    await Promise.all(students.map((student) => {
      if (!student.currentQuestionId || student.answered.has(student.currentQuestionId)) return null;
      student.answered.add(student.currentQuestionId);
      return new Promise((resolve) => {
        student.socket.emit('student:submit-quiz-answer', {
          quizId: Number(QUIZ_ID),
          questionId: student.currentQuestionId,
          selectedAnswer: [0]
        });
        setTimeout(resolve, 0);
      });
    }));

    await new Promise((resolve) => setTimeout(resolve, 600));
    await call(`/lesson-admin/quizzes/${QUIZ_ID}/show-answer`, teacherInitData, { method: 'POST' });
    console.log(`Вопрос ${index + 1}: цикл занял ${Date.now() - questionStartedAt} мс`);
  }

  await call(`/lesson-admin/quizzes/${QUIZ_ID}/finish`, teacherInitData, { method: 'POST' });
  students.forEach((student) => student.socket.disconnect());

  console.log('\n—— Итог ——');
  console.log(`HTTP-запросов:      ${stats.requests}`);
  console.log(`Ответов 429:        ${stats.rateLimited}`);
  console.log(`Прочих ошибок:      ${stats.failed}`);
  console.log(`Отклик p50 / p95:   ${percentile(stats.latencies, 0.5)} / ${percentile(stats.latencies, 0.95)} мс`);
  if (stats.rateLimited > 0) console.log('\nЕсть 429: лимит всё ещё срабатывает на нормальной нагрузке.');
  else console.log('\n429 нет — лимит не мешает уроку.');
  process.exit(0);
}

main().catch((error) => { console.error(error); process.exit(1); });
