const express = require('express');
const router = express.Router();
const { DailyMeme, PracticeImage } = require('../models');

// Авторизация (admin/teacher) применяется на уровне app.use('/api/daily-memes', ...) в app.js.

// Список мемов, отсортирован по дате — раздел админки "Мемы".
router.get('/', async (req, res) => {
  try {
    const memes = await DailyMeme.findAll({
      include: [{ model: PracticeImage, as: 'image' }],
      order: [['date', 'DESC']]
    });
    res.json({ memes });
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
