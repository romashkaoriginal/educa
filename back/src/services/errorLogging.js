const crypto = require('crypto');
const { Op } = require('sequelize');
const ErrorLog = require('../models/ErrorLog');

const nativeConsoleError = console.error.bind(console);
const RETENTION_DAYS = 30;
const DEDUPE_WINDOW_MS = 5 * 60 * 1000;
const MAX_CONTEXT_DEPTH = 3;
const MAX_PENDING_LOGS = 500;
const REDACTED = '[СКРЫТО]';
const pendingLogs = [];
let queueProcessing = false;
let queueScheduled = false;

const SECRET_KEY_PATTERN = /(password|passcode|token|secret|authorization|cookie|init.?data|hash|answer|correct|response)/i;
const SAFE_ID_KEYS = [
  'homeworkId', 'submissionId', 'subjectId', 'topicId', 'practiceTopicId',
  'questionId', 'lessonId', 'quizId', 'pollId', 'studentId', 'teacherId',
  'userId', 'applicationId', 'groupId'
];

const AREA_BY_SEGMENT = {
  homework: 'homework',
  practice: 'practice',
  lesson: 'lesson',
  'lesson-admin': 'lesson',
  quiz: 'quiz',
  stats: 'statistics',
  students: 'students',
  users: 'users',
  notify: 'notifications',
  applications: 'applications',
  subjects: 'subjects',
  guest: 'guest',
  auth: 'auth',
  admin: 'superadmin'
};

function truncate(value, maxLength = 2000) {
  const text = String(value ?? '');
  return text.length <= maxLength ? text : `${text.slice(0, maxLength)}…`;
}

function redactText(value, maxLength = 2000) {
  return truncate(value, maxLength)
    .replace(/Bearer\s+[^\s,;]+/gi, 'Bearer [СКРЫТО]')
    .replace(/(["']?(?:answers?|selectedAnswer|correctAnswer|response)["']?\s*[:=]\s*)(?:\[[^\]]*\]|\{[^}]*\}|["'][^"']*["']|[^\s,;}]+)/gi, `$1${REDACTED}`)
    .replace(/((?:password|passcode|token|secret|authorization|cookie|init_?data|hash)\s*["']?\s*[:=]\s*["']?)[^\s,"'&}]+/gi, `$1${REDACTED}`)
    .replace(/([?&](?:hash|token|password|secret|init_?data)=)[^&\s]+/gi, `$1${REDACTED}`);
}

function sanitize(value, depth = 0) {
  if (value == null || typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') return redactText(value, 1000);
  if (depth >= MAX_CONTEXT_DEPTH) return '[СВЁРНУТО]';
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => sanitize(item, depth + 1));
  if (typeof value !== 'object') return truncate(value, 200);

  const result = {};
  for (const [key, nestedValue] of Object.entries(value).slice(0, 40)) {
    result[key] = SECRET_KEY_PATTERN.test(key) ? REDACTED : sanitize(nestedValue, depth + 1);
  }
  return result;
}

function normalizePath(rawPath) {
  if (!rawPath) return null;
  if (String(rawPath).startsWith('socket://')) return truncate(rawPath, 500);
  try {
    return truncate(new URL(rawPath, 'http://local').pathname, 500);
  } catch {
    return truncate(String(rawPath).split('?')[0], 500);
  }
}

function inferArea(pathname = '') {
  const segments = String(pathname).split('/').filter(Boolean);
  const apiIndex = segments.indexOf('api');
  const root = segments[apiIndex >= 0 ? apiIndex + 1 : 0];
  return AREA_BY_SEGMENT[root] || root || 'application';
}

function inferAction(method = '', pathname = '', explicitAction = '') {
  if (explicitAction) return truncate(explicitAction, 64);
  const path = String(pathname).toLowerCase();
  if (/submit|answer|complete|finish/.test(path)) return 'submit';
  if (/start|join|connect/.test(path)) return 'start';
  if (/import/.test(path)) return 'import';
  if (/upload|image/.test(path)) return 'upload';
  if (/notify|send|resend/.test(path)) return 'send';
  if (/toggle|status|extend/.test(path)) return 'change_status';
  if (String(method).toUpperCase() === 'DELETE') return 'delete';
  if (['PATCH', 'PUT'].includes(String(method).toUpperCase())) return 'update';
  if (String(method).toUpperCase() === 'POST') return 'create';
  if (String(method).toUpperCase() === 'GET') return 'load';
  return 'execute';
}

function inferPathIdentifiers(pathname = '', method = '') {
  const path = normalizePath(pathname) || '';
  const matchers = [
    ['submissionId', /\/homework\/submission\/(\d+)/],
    ['homeworkId', /\/homework\/(?:all\/)?(\d+)/],
    ['topicId', /\/practice\/topics\/(\d+)/],
    ['lessonId', /\/lesson(?:-admin)?\/(?:lessons\/)?(\d+)/],
    ['quizId', /\/quiz\/(?:create\/)?(\d+)/],
    ['studentId', /\/(?:students|student)\/(\d+)/],
    ['userId', /\/users\/(\d+)/],
    ['subjectId', /\/subjects\/(\d+)/]
  ];
  const result = Object.fromEntries(matchers.flatMap(([key, pattern]) => {
    const match = path.match(pattern);
    return match ? [[key, Number(match[1])]] : [];
  }));
  const practiceQuestion = path.match(/\/practice\/questions\/(\d+)/);
  if (practiceQuestion) {
    const key = String(method).toUpperCase() === 'GET' || /\/import$/.test(path) ? 'topicId' : 'questionId';
    result[key] = Number(practiceQuestion[1]);
  }
  return result;
}

function collectIdentifiers(...sources) {
  const identifiers = {};
  for (const source of sources) {
    if (!source || typeof source !== 'object') continue;
    for (const key of SAFE_ID_KEYS) {
      const raw = source[key];
      if (raw == null || raw === '') continue;
      const normalized = /^\d+$/.test(String(raw)) ? Number(raw) : truncate(raw, 120);
      identifiers[key === 'practiceTopicId' ? 'topicId' : key] = normalized;
    }
  }
  return identifiers;
}

function getRequestDetails(req) {
  const path = normalizePath(req?.originalUrl || req?.url || req?.path);
  const identifiers = {
    ...inferPathIdentifiers(path, req?.method),
    ...collectIdentifiers(req?.params, req?.query, req?.body)
  };
  const proposedName = req?.body?.title || req?.body?.topic || req?.body?.name || null;
  return {
    method: req?.method ? String(req.method).toUpperCase() : null,
    path,
    area: inferArea(path),
    action: inferAction(req?.method, path),
    identifiers,
    proposedName: proposedName ? redactText(proposedName, 300) : null
  };
}

function getUserDetails(req, explicitUser = null) {
  const dbUser = explicitUser || req?.dbUser || req?.socket?.data?.dbUser || null;
  const telegramUser = req?.telegramUser || req?.socket?.data?.telegramUser || null;
  const firstName = dbUser?.firstName || telegramUser?.first_name || '';
  const lastName = dbUser?.lastName || telegramUser?.last_name || '';
  const username = telegramUser?.username ? `@${telegramUser.username}` : '';
  const userName = [firstName, lastName].filter(Boolean).join(' ').trim() || username || null;
  return {
    userId: dbUser?.id || null,
    userTelegramId: dbUser?.telegramId || telegramUser?.id || null,
    userRole: dbUser?.role || null,
    userName: userName ? truncate(userName, 300) : null
  };
}

function snapshotRequest(req) {
  if (!req) return null;
  const details = getRequestDetails(req);
  const rawDbUser = req.dbUser?.get ? req.dbUser.get({ plain: true }) : req.dbUser;
  return {
    method: details.method,
    originalUrl: details.path,
    params: {},
    query: {},
    body: {
      ...details.identifiers,
      ...(details.proposedName ? { name: details.proposedName } : {})
    },
    dbUser: rawDbUser ? {
      id: rawDbUser.id,
      telegramId: rawDbUser.telegramId,
      role: rawDbUser.role,
      firstName: rawDbUser.firstName,
      lastName: rawDbUser.lastName
    } : null,
    telegramUser: req.telegramUser ? {
      id: req.telegramUser.id,
      first_name: req.telegramUser.first_name,
      last_name: req.telegramUser.last_name,
      username: req.telegramUser.username
    } : null
  };
}

async function enrichContext(identifiers, proposedName = null, area = '') {
  const context = { ...identifiers };
  const entityCandidates = [];
  const lookups = [];

  try {
    if (identifiers.submissionId) {
      const HomeworkSubmission = require('../models/HomeworkSubmission');
      const submission = await HomeworkSubmission.findByPk(identifiers.submissionId, {
        attributes: ['homeworkId', 'userId'], raw: true
      });
      if (submission) {
        identifiers.homeworkId ||= submission.homeworkId;
        identifiers.studentId ||= submission.userId;
      }
    }
    if (identifiers.questionId && area === 'practice' && !identifiers.topicId) {
      const PracticeQuestion = require('../models/PracticeQuestion');
      const question = await PracticeQuestion.findByPk(identifiers.questionId, { attributes: ['topicId'], raw: true });
      identifiers.topicId ||= question?.topicId;
    }
    if (identifiers.quizId && area === 'lesson' && !identifiers.lessonId) {
      const LessonQuiz = require('../models/LessonQuiz');
      const lessonQuiz = await LessonQuiz.findByPk(identifiers.quizId, { attributes: ['lessonId'], raw: true });
      identifiers.lessonId ||= lessonQuiz?.lessonId;
    }
    if (identifiers.pollId && area === 'lesson' && !identifiers.lessonId) {
      const LessonPoll = require('../models/LessonPoll');
      const poll = await LessonPoll.findByPk(identifiers.pollId, { attributes: ['lessonId'], raw: true });
      identifiers.lessonId ||= poll?.lessonId;
    }
  } catch (_) { /* linked context is best-effort */ }
  Object.assign(context, identifiers);

  function lookup(key, modelPath, attributes, type, nameField) {
    if (!identifiers[key]) return;
    lookups.push((async () => {
      const Model = require(modelPath);
      const row = await Model.findByPk(identifiers[key], { attributes, raw: true });
      if (!row) return;
      const name = row[nameField] || null;
      context[`${type}Name`] = name;
      entityCandidates.push({ key, type, id: row.id, name });
      if (row.subjectId && !context.subjectId) context.subjectId = row.subjectId;
      if (row.teacherId && !context.teacherId) context.teacherId = row.teacherId;
    })().catch(() => {}));
  }

  lookup('homeworkId', '../models/Homework', ['id', 'title', 'subjectId', 'createdBy'], 'homework', 'title');
  lookup('lessonId', '../models/Lesson', ['id', 'topic', 'subjectId', 'teacherId'], 'lesson', 'topic');
  lookup('topicId', '../models/PracticeTopic', ['id', 'name', 'subjectId'], 'practiceTopic', 'name');
  lookup('quizId', '../models/Quiz', ['id', 'title', 'subjectId', 'createdBy'], 'quiz', 'title');
  lookup('subjectId', '../models/Subject', ['id', 'name'], 'subject', 'name');
  await Promise.all(lookups);

  if (context.subjectId && !context.subjectName) {
    try {
      const Subject = require('../models/Subject');
      const subject = await Subject.findByPk(context.subjectId, { attributes: ['name'], raw: true });
      if (subject) context.subjectName = subject.name;
    } catch (_) { /* enrichment must never affect the request */ }
  }

  const User = require('../models/User');
  const people = [];
  if (context.studentId) people.push(['student', context.studentId]);
  if (context.teacherId) people.push(['teacher', context.teacherId]);
  await Promise.all(people.map(async ([kind, id]) => {
    try {
      const person = await User.findByPk(id, { attributes: ['id', 'firstName', 'lastName', 'role'], raw: true });
      if (person) context[`${kind}Name`] = [person.firstName, person.lastName].filter(Boolean).join(' ') || `ID ${id}`;
    } catch (_) { /* enrichment must never affect the request */ }
  }));

  const priority = ['homeworkId', 'lessonId', 'topicId', 'quizId', 'subjectId'];
  const domainEntity = {
    homework: ['homework', 'homeworkId'],
    lesson: ['lesson', 'lessonId'],
    practice: ['practiceTopic', 'topicId'],
    quiz: ['quiz', 'quizId'],
    subjects: ['subject', 'subjectId']
  }[area];
  const isUnsavedDomainEntity = proposedName && domainEntity && !identifiers[domainEntity[1]];
  const entity = isUnsavedDomainEntity
    ? { type: domainEntity[0], id: null, name: proposedName }
    : priority.map((key) => entityCandidates.find((candidate) => candidate.key === key)).find(Boolean);
  return {
    context: sanitize(context),
    entityType: entity?.type || (proposedName ? inferEntityType(identifiers) : null),
    entityId: entity?.id != null ? String(entity.id) : null,
    entityName: entity?.name || proposedName || null
  };
}

function inferEntityType(identifiers) {
  if (identifiers.homeworkId) return 'homework';
  if (identifiers.lessonId) return 'lesson';
  if (identifiers.topicId) return 'practiceTopic';
  if (identifiers.quizId) return 'quiz';
  if (identifiers.subjectId) return 'subject';
  return null;
}

function makeFingerprint(payload) {
  return crypto.createHash('sha256').update([
    payload.source, payload.code, payload.message, payload.path,
    payload.userId, payload.entityType, payload.entityId
  ].map((value) => value ?? '').join('|')).digest('hex');
}

async function persistErrorLog(payload) {
  const now = new Date();
  const fingerprint = makeFingerprint(payload);
  const duplicate = await ErrorLog.findOne({
    where: {
      fingerprint,
      lastSeenAt: { [Op.gte]: new Date(now.getTime() - DEDUPE_WINDOW_MS) }
    },
    order: [['lastSeenAt', 'DESC']]
  });

  if (duplicate) {
    await duplicate.update({
      lastSeenAt: now,
      occurrences: Number(duplicate.occurrences || 1) + 1,
      statusCode: payload.statusCode || duplicate.statusCode,
      stack: payload.stack || duplicate.stack,
      context: payload.context
    });
    return duplicate;
  }

  return ErrorLog.create({
    ...payload,
    fingerprint,
    occurrences: 1,
    firstSeenAt: now,
    lastSeenAt: now
  });
}

async function writeErrorLog(input = {}) {
  try {
    const requestDetails = input.req ? getRequestDetails(input.req) : {
      method: input.method || null,
      path: normalizePath(input.path),
      area: input.area || inferArea(input.path),
      action: inferAction(input.method, input.path, input.action),
      identifiers: collectIdentifiers(input.context),
      proposedName: input.entityName || null
    };
    const identifiers = { ...requestDetails.identifiers, ...collectIdentifiers(input.context) };
    const resolvedArea = input.area || requestDetails.area || 'application';
    const enriched = await enrichContext(identifiers, input.entityName || requestDetails.proposedName, resolvedArea);
    const user = getUserDetails(input.req, input.user);
    const error = input.error instanceof Error ? input.error : null;
    const message = redactText(input.message || error?.message || 'Неизвестная ошибка', 4000);
    const stack = error?.stack || input.stack;
    const code = input.code || error?.code || error?.original?.code || null;
    const mergedContext = sanitize({
      ...enriched.context,
      ...(input.context || {}),
      response: input.response
    });

    return await persistErrorLog({
      source: input.source === 'frontend' ? 'frontend' : 'backend',
      severity: input.severity || (Number(input.statusCode) >= 500 ? 'error' : 'warning'),
      statusCode: Number.isFinite(Number(input.statusCode)) ? Number(input.statusCode) : null,
      code: code ? redactText(code, 120) : null,
      message,
      stack: stack ? redactText(stack, 12000) : null,
      area: truncate(resolvedArea, 64),
      action: truncate(input.action || requestDetails.action || 'execute', 64),
      method: input.method || requestDetails.method,
      path: normalizePath(input.path || requestDetails.path),
      ...user,
      entityType: input.entityType || enriched.entityType,
      entityId: input.entityId != null ? String(input.entityId) : enriched.entityId,
      entityName: input.entityName || enriched.entityName,
      context: mergedContext
    });
  } catch (loggingError) {
    nativeConsoleError('[ErrorLog] Не удалось сохранить лог:', loggingError?.message || loggingError);
    return null;
  }
}

function queueErrorLog(payload) {
  try {
    if (pendingLogs.length >= MAX_PENDING_LOGS) return false;
    pendingLogs.push({ ...payload, req: snapshotRequest(payload.req) });
    if (!queueScheduled && !queueProcessing) {
      queueScheduled = true;
      setImmediate(processErrorQueue);
    }
    return true;
  } catch (queueError) {
    nativeConsoleError('[ErrorLog] Не удалось поставить лог в очередь:', queueError?.message || queueError);
    return false;
  }
}

async function processErrorQueue() {
  queueScheduled = false;
  if (queueProcessing) return;
  queueProcessing = true;
  try {
    while (pendingLogs.length > 0) await writeErrorLog(pendingLogs.shift());
  } finally {
    queueProcessing = false;
    if (pendingLogs.length > 0 && !queueScheduled) {
      queueScheduled = true;
      setImmediate(processErrorQueue);
    }
  }
}

async function purgeExpiredErrorLogs(now = new Date()) {
  const cutoff = new Date(now.getTime() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
  return ErrorLog.destroy({ where: { lastSeenAt: { [Op.lt]: cutoff } } });
}

module.exports = {
  RETENTION_DAYS,
  collectIdentifiers,
  getRequestDetails,
  inferAction,
  inferArea,
  makeFingerprint,
  normalizePath,
  purgeExpiredErrorLogs,
  queueErrorLog,
  redactText,
  sanitize,
  snapshotRequest,
  writeErrorLog
};
