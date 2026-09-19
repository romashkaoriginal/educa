const express = require('express');
const fs = require('fs');
const router = express.Router();
const { ProblemReport } = require('../models');
const { requireSuperAdmin } = require('../middleware/superAdmin');
const problemReportImages = require('../services/problemReportImages');

// Счётчик новых жалоб — для бейджа на вкладке "Суперадмин", без загрузки списка.
router.get('/unread-count', requireSuperAdmin, async (req, res) => {
  try {
    const count = await ProblemReport.count({ where: { status: 'new' } });
    res.set('Cache-Control', 'no-store');
    res.json({ count });
  } catch (error) {
    console.error('Get problem reports unread count error:', error);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

// Список жалоб — только супер-админ, все статусы, новые сверху.
router.get('/', requireSuperAdmin, async (req, res) => {
  try {
    const reports = await ProblemReport.findAll({
      order: [['createdAt', 'DESC']]
    });
    res.json({ reports });
  } catch (error) {
    console.error('Get problem reports error:', error);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

// Скриншот жалобы — доступен только супер-админу (не публичная раздача,
// в отличие от practice-images, т.к. жалоба может содержать личные данные).
router.get('/screenshots/:key', requireSuperAdmin, async (req, res) => {
  try {
    const { key } = req.params;
    if (!/^[a-zA-Z0-9._-]+$/.test(key)) {
      return res.status(400).end();
    }
    const filePath = problemReportImages.storagePath(key);
    try {
      await fs.promises.access(filePath);
    } catch {
      return res.status(404).end();
    }
    res.setHeader('Content-Type', 'image/webp');
    res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
    fs.createReadStream(filePath).pipe(res);
  } catch (error) {
    console.error('Serve problem report screenshot error:', error);
    res.status(500).end();
  }
});

// Смена статуса жалобы.
router.patch('/:id/status', requireSuperAdmin, async (req, res) => {
  try {
    const { status } = req.body;
    const valid = ['new', 'in_progress', 'resolved', 'rejected'];
    if (!valid.includes(status)) {
      return res.status(400).json({ message: 'Недопустимый статус' });
    }
    const report = await ProblemReport.findByPk(req.params.id);
    if (!report) return res.status(404).json({ message: 'Жалоба не найдена' });
    await report.update({ status });
    res.json({ report });
  } catch (error) {
    console.error('Update problem report status error:', error);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

// Удаление жалобы вместе со скриншотами.
router.delete('/:id', requireSuperAdmin, async (req, res) => {
  try {
    const report = await ProblemReport.findByPk(req.params.id);
    if (!report) return res.status(404).json({ message: 'Жалоба не найдена' });
    problemReportImages.deleteScreenshots(report.screenshots);
    await report.destroy();
    res.json({ message: 'Жалоба удалена' });
  } catch (error) {
    console.error('Delete problem report error:', error);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

module.exports = router;
