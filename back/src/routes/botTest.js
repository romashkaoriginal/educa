const express = require('express');
const { requireRole } = require('../middleware/telegramAuth');
const router = express.Router();
const { BotTest, Subject } = require('../models');

// GET /api/bot-test — все вопросы по предметам
router.get('/', async (req, res) => {
  try {
    const questions = await BotTest.findAll({
      include: [{ model: Subject, as: 'subject', attributes: ['id', 'name', 'icon'] }],
      order: [['subjectId', 'ASC'], ['order', 'ASC'], ['id', 'ASC']]
    });
    res.json({ questions });
  } catch (e) {
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

// GET /api/bot-test/subjects — предметы у которых есть вопросы
router.get('/subjects', async (req, res) => {
  try {
    const subjects = await Subject.findAll({
      include: [{
        model: BotTest,
        as: 'botTests',
        where: { isActive: true },
        required: true,
        attributes: []
      }],
      attributes: ['id', 'name', 'icon']
    });
    res.json({ subjects });
  } catch (e) {
    // Если ассоциация не настроена, возвращаем все предметы
    try {
      const subjects = await Subject.findAll({ attributes: ['id', 'name', 'icon'] });
      res.json({ subjects });
    } catch (e2) {
      res.status(500).json({ message: 'Ошибка сервера' });
    }
  }
});

// GET /api/bot-test/:subjectId — вопросы по предмету
router.get('/:subjectId', async (req, res) => {
  try {
    const questions = await BotTest.findAll({
      where: { subjectId: req.params.subjectId, isActive: true },
      order: [['order', 'ASC'], ['id', 'ASC']]
    });
    res.json({ questions });
  } catch (e) {
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

// POST /api/bot-test — создать вопрос
router.post('/', requireRole(['admin', 'manager', 'teacher']), async (req, res) => {
  try {
    const { subjectId, questionText, options, correctAnswer, order } = req.body;
    const question = await BotTest.create({ subjectId, questionText, options, correctAnswer, order: order || 0 });
    res.json({ question });
  } catch (e) {
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

// PUT /api/bot-test/:id — обновить
router.put('/:id', requireRole(['admin', 'manager', 'teacher']), async (req, res) => {
  try {
    const q = await BotTest.findByPk(req.params.id);
    if (!q) return res.status(404).json({ message: 'Не найден' });
    await q.update(req.body);
    res.json({ question: q });
  } catch (e) {
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

// DELETE /api/bot-test/:id
router.delete('/:id', requireRole(['admin', 'manager', 'teacher']), async (req, res) => {
  try {
    await BotTest.destroy({ where: { id: req.params.id } });
    res.json({ message: 'Удалён' });
  } catch (e) {
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

module.exports = router;