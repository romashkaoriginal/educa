const express = require('express');
const { Homework, UserSubject, sequelize } = require('../models');
const Draft = require('../models/HomeworkDraft');
const router = express.Router();

// A shared transaction lock also protects successful submission from late autosaves.
async function lockDraft(transaction, userId, homeworkId) {
  await sequelize.query('SELECT pg_advisory_xact_lock(:userId, :homeworkId)', {
    replacements: { userId: Number(userId), homeworkId: Number(homeworkId) }, transaction,
  });
}

router.use('/:id/draft', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id <= 0 || id > 2147483647) return res.status(400).json({ message: 'Invalid homework' });
    if (req.dbUser?.role !== 'student' || req.dbUser.isGuest) return res.status(403).json({ message: 'Student access required' });
    const homework = await Homework.findByPk(id);
    const access = homework && await UserSubject.findOne({ where: { userId: req.dbUser.id, subjectId: homework.subjectId, isActive: true } });
    if (!access) return res.status(403).json({ message: 'Access denied' });
    req.draftHomework = homework;
    next();
  } catch (e) { next(e); }
});

router.get('/:id/draft', async (req, res, next) => {
  try {
    const draft = await Draft.findOne({ where: { userId: req.dbUser.id, homeworkId: req.params.id } });
    res.set('Cache-Control', 'no-store').json({ draft: draft?.data || null, revision: draft?.revision || 0 });
  } catch (e) { next(e); }
});

router.put('/:id/draft', async (req, res, next) => {
  try {
    const { data, revision } = req.body;
    if (!Number.isSafeInteger(revision) || revision < 0 || !data || typeof data !== 'object' || Array.isArray(data)
      || !Array.isArray(data.questionIds) || data.questionIds.length > 1000
      || !data.answers || typeof data.answers !== 'object' || Array.isArray(data.answers)
      || Buffer.byteLength(JSON.stringify(data)) > 180000) return res.status(400).json({ message: 'Invalid draft' });
    const userId = req.dbUser.id, homeworkId = req.draftHomework.id;
    const result = await sequelize.transaction(async transaction => {
      await lockDraft(transaction, userId, homeworkId);
      const [draft] = await Draft.findOrCreate({ where: { userId, homeworkId }, defaults: { revision: 0 }, transaction });
      if (draft.revision !== revision) return null;
      await draft.update({ data, revision: revision + 1 }, { transaction });
      return draft.revision;
    });
    if (result === null) return res.status(409).json({ message: 'Черновик изменён на другом устройстве. Открой домашку заново.' });
    res.json({ revision: result });
  } catch (e) { next(e); }
});

module.exports = { router, lockDraft };
