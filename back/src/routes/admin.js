const express = require('express');
const { User, Subject } = require('../models');

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

module.exports = router;