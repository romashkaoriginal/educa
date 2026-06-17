const express = require('express');
const router = express.Router();
const { Application, Subject } = require('../models');
const { sendToAmoCRM } = require('../services/amocrm');
const { markGuestApplicationSent } = require('../services/guestAccess');
const { telegramAuth, requireRole } = require('../middleware/telegramAuth');

// Доступ к заявкам: admin + manager
const canManage = requireRole(['admin', 'manager']);

// POST /api/applications — создать заявку (из бота, без авторизации)
// Бот отправляет напрямую, поэтому без telegramAuth
router.post('/', async (req, res) => {
  try {
    const {
      fullName, phone, telegramId, telegramUsername,
      subjectId, subjectName, testCorrect, testTotal, testAnswers,
      // Гостевые поля (ТЗ §13)
      source, context, selectedSubjects, userStatus
    } = req.body;

    if (!fullName || !phone) {
      return res.status(400).json({ message: 'ФИО и телефон обязательны' });
    }

    // Анти-абьюз тела: ограничиваем длины полей
    const safeName = String(fullName).trim().slice(0, 100);
    const safePhone = String(phone).trim().slice(0, 32);
    if (safeName.length < 2) {
      return res.status(400).json({ message: 'Введите имя.' });
    }

    const testPercent = testTotal > 0 ? Math.round((testCorrect / testTotal) * 100) : 0;
    const subjectsArr = (Array.isArray(selectedSubjects) ? selectedSubjects : [])
      .slice(0, 3)
      .map((s) => String(s).slice(0, 60));

    const application = await Application.create({
      fullName: safeName, phone: safePhone, telegramId, telegramUsername,
      subjectId, subjectName,
      testCorrect: testCorrect || 0,
      testTotal: testTotal || 0,
      testPercent,
      testAnswers: testAnswers || [],
      source: source || null,
      context: context || null,
      selectedSubjects: subjectsArr,
      selectedSubjectsCount: subjectsArr.length,
      userStatus: userStatus || null,
      status: 'new',
      crmStatus: 'pending'
    });

    // Помечаем у гостя факт отправки заявки (ТЗ §15, §22)
    if (telegramId) {
      markGuestApplicationSent(telegramId).catch(() => {});
    }

    // Пытаемся отправить в CRM сразу (фоново)
    sendToAmoCRM(application).then(async (result) => {
      if (result.ok) {
        await application.update({
          crmStatus: 'sent',
          crmLeadId: result.leadId,
          crmSentAt: new Date(),
          crmError: null
        });
      } else {
        await application.update({ crmStatus: 'error', crmError: result.error });
      }
    }).catch(() => {});

    res.json({ message: 'Заявка создана', application });
  } catch (error) {
    console.error('Create application error:', error);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

// GET /api/applications — список всех заявок (admin/manager)
router.get('/', telegramAuth, canManage, async (req, res) => {
  try {
    const applications = await Application.findAll({
      order: [['createdAt', 'DESC']]
    });
    res.json({ applications });
  } catch (error) {
    console.error('Get applications error:', error);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

// PATCH /api/applications/:id/status — изменить статус заявки
router.patch('/:id/status', telegramAuth, canManage, async (req, res) => {
  try {
    const { status } = req.body;
    const valid = ['new', 'in_progress', 'completed', 'rejected'];
    if (!valid.includes(status)) {
      return res.status(400).json({ message: 'Недопустимый статус' });
    }
    const application = await Application.findByPk(req.params.id);
    if (!application) return res.status(404).json({ message: 'Заявка не найдена' });
    await application.update({ status });
    res.json({ application });
  } catch (error) {
    console.error('Update status error:', error);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

// POST /api/applications/:id/resend — повторно отправить в CRM
router.post('/:id/resend', telegramAuth, canManage, async (req, res) => {
  try {
    const application = await Application.findByPk(req.params.id);
    if (!application) return res.status(404).json({ message: 'Заявка не найдена' });

    const result = await sendToAmoCRM(application);
    if (result.ok) {
      await application.update({
        crmStatus: 'sent',
        crmLeadId: result.leadId,
        crmSentAt: new Date(),
        crmError: null
      });
      res.json({ message: 'Отправлено в CRM', application });
    } else {
      await application.update({ crmStatus: 'error', crmError: result.error });
      res.status(400).json({ message: result.error, application });
    }
  } catch (error) {
    console.error('Resend error:', error);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

module.exports = router;