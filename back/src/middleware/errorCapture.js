const { AsyncLocalStorage } = require('async_hooks');
const { queueErrorLog, redactText } = require('../services/errorLogging');

const requestStorage = new AsyncLocalStorage();
const nativeConsoleError = console.error.bind(console);
let consoleCaptureInstalled = false;

function consoleMessage(args) {
  return args.map((value) => {
    if (value instanceof Error) return value.message;
    if (typeof value === 'string') return value;
    if (typeof value?.message === 'string') return value.message;
    return `[${value?.constructor?.name || typeof value}]`;
  }).join(' ');
}

function installConsoleErrorCapture() {
  if (consoleCaptureInstalled) return;
  consoleCaptureInstalled = true;
  console.error = (...args) => {
    nativeConsoleError(...args);
    const store = requestStorage.getStore();
    if (!store || store.suppressCapture) return;
    const error = args.find((value) => value instanceof Error) || null;
    store.capturedErrors = Number(store.capturedErrors || 0) + 1;
    queueErrorLog({
      req: store.req,
      user: store.socket?.data?.dbUser,
      error,
      message: consoleMessage(args),
      source: 'backend',
      statusCode: store.res?.statusCode >= 400 ? store.res.statusCode : (error?.status || error?.statusCode || 500),
      area: store.area,
      action: store.action,
      path: store.path,
      context: store.context
    });
  };
}

function shouldCaptureResponse(req, res, store) {
  if (res.statusCode < 400 || store.capturedErrors > 0) return false;
  if (req.originalUrl?.startsWith('/api/client-errors')) return false;
  if (res.statusCode === 401 && !req.telegramUser) return false;
  return Boolean(req.dbUser || req.telegramUser || res.statusCode >= 500);
}

function requestErrorCapture(req, res, next) {
  const store = { req, res, capturedErrors: 0, responseBody: null };
  requestStorage.run(store, () => {
    const originalJson = res.json.bind(res);
    res.json = (body) => {
      if (res.statusCode >= 400) store.responseBody = body;
      return originalJson(body);
    };
    res.once('finish', () => {
      if (!shouldCaptureResponse(req, res, store)) return;
      const response = store.responseBody && typeof store.responseBody === 'object'
        ? store.responseBody
        : null;
      const message = response?.message || response?.error || `HTTP ${res.statusCode}`;
      queueErrorLog({
        req,
        message,
        code: response?.code,
        statusCode: res.statusCode,
        source: 'backend',
        response
      });
    });
    next();
  });
}

function finalErrorHandler(error, req, res, next) { // eslint-disable-line no-unused-vars
  const store = requestStorage.getStore();
  if (store) store.capturedErrors = Number(store.capturedErrors || 0) + 1;
  queueErrorLog({ req, error, statusCode: error?.status || error?.statusCode || 500, source: 'backend' });
  nativeConsoleError('Unhandled request error:', error);
  if (res.headersSent) return next(error);
  return res.status(error?.status || error?.statusCode || 500).json({ message: 'Server error' });
}

function setupSocketErrorCapture(io) {
  io.on('connection', (socket) => {
    socket.use(([event, payload], next) => {
      requestStorage.run({
        socket,
        capturedErrors: 0,
        area: event.includes('lesson') || socket.data.lessonId ? 'lesson' : 'quiz',
        action: event,
        path: `socket://${event}`,
        context: payload && typeof payload === 'object' ? payload : {}
      }, next);
    });

    const originalEmit = socket.emit.bind(socket);
    socket.emit = (event, ...args) => {
      if (event === 'error') {
        const payload = args[0] && typeof args[0] === 'object' ? args[0] : {};
        const store = requestStorage.getStore() || {};
        queueErrorLog({
          user: socket.data.dbUser,
          message: redactText(payload.message || 'Ошибка realtime-события'),
          code: payload.code,
          statusCode: payload.status || 500,
          source: 'backend',
          area: store.area || (socket.data.lessonId ? 'lesson' : 'quiz'),
          action: store.action || 'socket_event',
          path: store.path || 'socket://error',
          context: { ...(store.context || {}), lessonId: socket.data.lessonId, quizId: socket.data.quizId }
        });
      }
      return originalEmit(event, ...args);
    };
  });
}

module.exports = {
  finalErrorHandler,
  installConsoleErrorCapture,
  requestErrorCapture,
  requestStorage,
  setupSocketErrorCapture
};
