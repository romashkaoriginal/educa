const express = require('express');
const router = express.Router();
const { DailyMeme, DailyMemeReaction, PracticeImage } = require('../models');
const sequelize = require('../config/database');

// Авторизация (admin/teacher) применяется на уровне app.use('/api/daily-memes', ...) в app.js.

// Список мемов, отсортирован по дате — раздел админки "Мемы".
router.get('/', async (req, res) => {
  try {
    const memes = await DailyMeme.findAll({
      include: [{ model: PracticeImage, as: 'image' }],
      order: [['date', 'DESC']]
    });
    const reactionRows = await DailyMemeReaction.findAll({
      attributes: ['dailyMemeId', 'reaction', [sequelize.fn('COUNT', sequelize.col('id')), 'count']],
      group: ['dailyMemeId', 'reaction'],
      raw: true
    });
    const reactionStatsByMeme = new Map();
    reactionRows.forEach((row) => {
      const stats = reactionStatsByMeme.get(row.dailyMemeId) || { like: 0, dislike: 0, stone: 0, total: 0 };
      const count = Number(row.count) || 0;
      stats[row.reaction] = count;
      stats.total += count;
      reactionStatsByMeme.set(row.dailyMemeId, stats);
    });
    res.json({ memes: memes.map((meme) => ({
      ...meme.toJSON(),
      reactionStats: reactionStatsByMeme.get(meme.id) || { like: 0, dislike: 0, stone: 0, total: 0 }
    })) });
  } catch (error) {
    console.error('Get daily memes error:', error);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

// Привязать картинку к дате — одна картинка на дату, повторная привязка заменяет.
router.post('/', async (req, res) => {
  try {
    const { date, imageId } = req.body;
    if (!date || !imageId) {
      return res.status(400).json({ message: 'date и imageId обязательны' });
    }
    const image = await PracticeImage.findByPk(imageId);
    if (!image) return res.status(404).json({ message: 'Изображение не найдено' });

    const [meme] = await DailyMeme.findOrCreate({
      where: { date },
      defaults: { date, imageId }
    });
    if (meme.imageId !== Number(imageId)) {
      await meme.update({ imageId });
    }
    const withImage = await DailyMeme.findByPk(meme.id, { include: [{ model: PracticeImage, as: 'image' }] });
    res.json({ meme: withImage });
  } catch (error) {
    console.error('Create daily meme error:', error);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const meme = await DailyMeme.findByPk(req.params.id);
    if (!meme) return res.status(404).json({ message: 'Мем не найден' });
    await meme.destroy();
    res.json({ message: 'Мем удалён' });
  } catch (error) {
    console.error('Delete daily meme error:', error);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

module.exports = router;
