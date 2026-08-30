import { API_URL } from '../config';

const MAX_REPORTS_PER_MINUTE = 20;
const DEDUPE_WINDOW_MS = 30 * 1000;
const recentReports = [];
const recentFingerprints = new Map();
const SECRET_KEY_PATTERN = /(password|passcode|token|secret|authorization|cookie|init.?data|hash|answer|correct|response)/i;
const SAFE_CONTEXT_KEYS = new Set([
  'homeworkId', 'submissionId', 'subjectId', 'topicId', 'practiceTopicId',
  'questionId', 'lessonId', 'quizId', 'pollId', 'studentId', 'teacherId',
  'userId', 'applicationId', 'groupId', 'title', 'topic', 'name', 'online',
  'viewport', 'componentStack', 'event'
]);

function truncate(value, maxLength = 1000) {
  const text = String(value ?? '');
  return text.length <= maxLength ? text : `${text.slice(0, maxLength)}…`;
}

function sanitizeContext(value, depth = 0) {
  if (value == null || typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') return truncate(value);
  if (depth >= 3) return '[СВЁРНУТО]';
  if (Array.isArray(value)) return value.slice(0, 15).map((item) => sanitizeContext(item, depth + 1));
  if (typeof value !== 'object') return truncate(value, 200);
  return Object.fromEntries(Object.entries(value).slice(0, 30).map(([key, nested]) => [
    key,
    SECRET_KEY_PATTERN.test(key) ? '[СКРЫТО]' : sanitizeContext(nested, depth + 1)
  ]));
}

function inferRequest(url = '', method = 'GET') {
  let pathname = String(url).split('?')[0];
  try { pathname = new URL(url, window.location.origin).pathname; } catch (_) { /* keep path */ }
  const pathSegments = pathname.split('/').filter(Boolean);
  const segment = pathSegments[pathname.includes('/api/') ? 1 : 0] || 'application';
  const area = segment === 'lesson-admin' ? 'lesson' : ({
    stats: 'statistics', notify: 'notifications', admin: 'superadmin'
  }[segment] || segment);
  const lower = pathname.toLowerCase();
  let action = 'load';
  if (/submit|answer|finish|complete/.test(lower)) action = 'submit';
  else if (/import/.test(lower)) action = 'import';
  else if (/upload|image/.test(lower)) action = 'upload';
  else if (/send|notify|resend/.test(lower)) action = 'send';
  else if (String(method).toUpperCase() === 'DELETE') action = 'delete';
  else if (['PATCH', 'PUT'].includes(String(method).toUpperCase())) action = 'update';
  else if (String(method).toUpperCase() === 'POST') action = 'create';
  return { area, action, path: pathname, method: String(method).toUpperCase() };
}

function extractRequestContext(body) {
  let parsed = body;
  if (typeof body === 'string') {
    try { parsed = JSON.parse(body); } catch { return {}; }
  }
  if (typeof FormData !== 'undefined' && body instanceof FormData) {
    parsed = Object.fromEntries([...body.entries()].filter(([key]) => SAFE_CONTEXT_KEYS.has(key)));
  }
  if (!parsed || typeof parsed !== 'object') return {};
  return sanitizeContext(Object.fromEntries(
    Object.entries(parsed).filter(([key]) => SAFE_CONTEXT_KEYS.has(key))
  ));
}

function canSend(fingerprint) {
  const now = Date.now();
  while (recentReports[0] < now - 60 * 1000) recentReports.shift();
  for (const [key, seenAt] of recentFingerprints) {
    if (seenAt < now - DEDUPE_WINDOW_MS) recentFingerprints.delete(key);
  }
  if (recentReports.length >= MAX_REPORTS_PER_MINUTE) return false;
  if (recentFingerprints.has(fingerprint)) return false;
  recentReports.push(now);
  recentFingerprints.set(fingerprint, now);
  return true;
}

function reportClientError(details = {}) {
  const initData = window.Telegram?.WebApp?.initData || '';
  if (!initData || String(details.path || '').includes('/client-errors')) return;

  const message = truncate(details.message || 'Неизвестная ошибка интерфейса', 4000);
  const fingerprint = [message, details.code, details.path, details.action].join('|');
  if (!canSend(fingerprint)) return;

  const payload = sanitizeContext({
    source: 'frontend',
    severity: details.severity || 'error',
    statusCode: details.statusCode || null,
    code: details.code || null,
    message,
    stack: details.stack ? truncate(details.stack, 12000) : null,
    area: details.area || 'application',
    action: details.action || 'execute',
    method: details.method || null,
    path: details.path || window.location.pathname,
    entityType: details.entityType || null,
    entityId: details.entityId || null,
    entityName: details.entityName || null,
    context: {
      ...sanitizeContext(details.context || {}),
      online: navigator.onLine,
      viewport: `${window.innerWidth}x${window.innerHeight}`
    }
  });

  void fetch(`${API_URL}/client-errors`, {
    method: 'POST',
    keepalive: true,
    headers: {
      'Content-Type': 'application/json',
      'x-telegram-init-data': initData
    },
    body: JSON.stringify(payload)
  }).catch(() => {});
}

async function reportApiFailure(response, url, options = {}) {
  try {
    if (!response || response.ok || String(url).includes('/client-errors')) return;
    let body = {};
    const clone = typeof response.clone === 'function' ? response.clone() : response;
    try { body = await clone.json(); } catch (_) { /* non-JSON error response */ }
    const request = inferRequest(url, options.method || 'GET');
    reportClientError({
      ...request,
      message: body?.message || body?.error || `HTTP ${response.status}`,
      code: body?.code,
      statusCode: response.status,
      severity: response.status >= 500 ? 'error' : 'warning',
      context: extractRequestContext(options.body)
    });
  } catch (_) {
    /* Error reporting must not affect the original request. */
  }
}

function installGlobalErrorReporting() {
  if (window.__kubikErrorReportingInstalled) return;
  window.__kubikErrorReportingInstalled = true;
  window.addEventListener('error', (event) => {
    reportClientError({
      message: event.error?.message || event.message || 'Ошибка JavaScript',
      stack: event.error?.stack,
      code: 'UNHANDLED_ERROR',
      area: 'application',
      action: 'render',
      path: window.location.pathname,
      context: { event: event.type }
    });
  });
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    reportClientError({
      message: reason?.message || String(reason || 'Необработанная ошибка Promise'),
      stack: reason?.stack,
      code: 'UNHANDLED_REJECTION',
      area: 'application',
      action: 'async_operation',
      path: window.location.pathname
    });
  });
}

export {
  extractRequestContext,
  inferRequest,
  installGlobalErrorReporting,
  reportApiFailure,
  reportClientError,
  sanitizeContext
};
