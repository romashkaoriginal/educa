const jwt = require('jsonwebtoken');
const zlib = require('node:zlib');

const PREVIEW_KIND = 'parent-report-preview';
const PREVIEW_AUDIENCE = 'parent-report-preview';
const PREVIEW_ISSUER = 'educa';

function previewSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  const error = new Error('Сервер не настроен для подтверждения предпросмотра');
  error.statusCode = 503;
  throw error;
}

function decodeMessages(compressedMessages) {
  const messages = JSON.parse(zlib.inflateRawSync(Buffer.from(compressedMessages, 'base64url')).toString('utf8'));
  if (!Array.isArray(messages) || !messages.length || !messages.every((message) => typeof message === 'string' && message.length > 0)) {
    throw new Error('Некорректный предпросмотр отчёта');
  }
  return messages;
}

function assertPreviewPayload(payload) {
  if (!payload || payload.kind !== PREVIEW_KIND || !Number.isInteger(Number(payload.parentId))) {
    throw new Error('Некорректный предпросмотр отчёта');
  }
  if (!['weekly', 'monthly'].includes(payload.reportType) || typeof payload.compressedMessages !== 'string') {
    throw new Error('Некорректный предпросмотр отчёта');
  }
}

function createParentReportPreviewToken({ parentId, reportType, period, messages, telegramId }) {
  const payload = {
    kind: PREVIEW_KIND,
    parentId: Number(parentId),
    reportType,
    period: { startDate: period.startDate, endDate: period.endDate },
    compressedMessages: zlib.deflateRawSync(JSON.stringify(messages)).toString('base64url'),
    telegramId: String(telegramId)
  };
  assertPreviewPayload(payload);
  return jwt.sign(payload, previewSecret(), {
    expiresIn: '15m',
    audience: PREVIEW_AUDIENCE,
    issuer: PREVIEW_ISSUER
  });
}

function readParentReportPreviewToken(token) {
  try {
    const payload = jwt.verify(token, previewSecret(), {
      audience: PREVIEW_AUDIENCE,
      issuer: PREVIEW_ISSUER
    });
    assertPreviewPayload(payload);
    return { ...payload, messages: decodeMessages(payload.compressedMessages) };
  } catch (error) {
    if (error.statusCode) throw error;
    const previewError = new Error('Предпросмотр устарел или недействителен. Откройте его заново.');
    previewError.statusCode = 400;
    throw previewError;
  }
}

module.exports = {
  createParentReportPreviewToken,
  readParentReportPreviewToken
};
