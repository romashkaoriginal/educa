const express = require('express');
const rateLimit = require('express-rate-limit');
const { writeErrorLog } = require('../services/errorLogging');

const router = express.Router();
const clientErrorLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Слишком много отчётов об ошибках' }
});

function cleanString(value, maxLength) {
  if (typeof value !== 'string') return null;
  return value.trim().slice(0, maxLength) || null;
}

router.post('/', clientErrorLimiter, async (req, res) => {
  const message = cleanString(req.body?.message, 4000);
  if (!message) return res.status(400).json({ message: 'Поле message обязательно' });

  await writeErrorLog({
    req,
    source: 'frontend',
    severity: cleanString(req.body?.severity, 16) || 'error',
    statusCode: Number(req.body?.statusCode) || null,
    code: cleanString(req.body?.code, 120),
    message,
    stack: cleanString(req.body?.stack, 12000),
    area: cleanString(req.body?.area, 64),
    action: cleanString(req.body?.action, 64),
    method: cleanString(req.body?.method, 12),
    path: cleanString(req.body?.path, 500),
    entityType: cleanString(req.body?.entityType, 64),
    entityId: cleanString(String(req.body?.entityId || ''), 120),
    entityName: cleanString(req.body?.entityName, 500),
    context: req.body?.context && typeof req.body.context === 'object' ? req.body.context : {}
  });
  return res.status(204).end();
});

module.exports = router;
