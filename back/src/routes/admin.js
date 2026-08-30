const express = require('express');
const { Op } = require('sequelize');
const { User, Subject, ErrorLog } = require('../models');
const { requireSuperAdmin } = require('../middleware/superAdmin');
const { getSystemDiagnostics } = require('../services/systemDiagnostics');
const { parseErrorLogQuery } = require('../services/errorLogQuery');

const router = express.Router();

// Получить все данные для админ-панели одним запросом
router.get('/dashboard', async (req, res) => {
  try {
    const [students, subjects] = await Promise.all([
      User.findAll({
        where: { role: 'student' },
        include: [{
          model: Subject,
          as: 'subjects',
          through: { attributes: [] }
        }],
        order: [['createdAt', 'DESC']]
      }),
      Subject.findAll({
        where: { isActive: true },
        order: [['name', 'ASC']]
      })
    ]);

    res.json({
      students,
      subjects
    });
  } catch (error) {
    console.error('Dashboard data error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/diagnostics', requireSuperAdmin, (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(getSystemDiagnostics(req.app.get('io')));
});

router.get('/error-logs', requireSuperAdmin, async (req, res) => {
  try {
    const parsed = parseErrorLogQuery(req.query);
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [result, lastHour, last24Hours] = await Promise.all([
      ErrorLog.findAndCountAll({
        where: parsed.where,
        order: [['lastSeenAt', 'DESC'], ['id', 'DESC']],
        limit: parsed.limit,
        offset: parsed.offset
      }),
      ErrorLog.sum('occurrences', { where: { lastSeenAt: { [Op.gte]: oneHourAgo } } }),
      ErrorLog.sum('occurrences', { where: { lastSeenAt: { [Op.gte]: twentyFourHoursAgo } } })
    ]);

    res.set('Cache-Control', 'no-store');
    res.json({
      logs: result.rows,
      total: result.count,
      page: parsed.page,
      limit: parsed.limit,
      range: { from: parsed.from, to: parsed.to, preset: parsed.preset },
      summary: { lastHour: Number(lastHour || 0), last24Hours: Number(last24Hours || 0) }
    });
  } catch (error) {
    if (error instanceof RangeError) return res.status(400).json({ message: error.message });
    console.error('Error log list error:', error);
    return res.status(500).json({ message: 'Не удалось загрузить журнал ошибок' });
  }
});

module.exports = router;
