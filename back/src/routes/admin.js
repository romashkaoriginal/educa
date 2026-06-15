const express = require('express');
const { User, Subject } = require('../models');
const { requireSuperAdmin } = require('../middleware/superAdmin');
const cleanupController = require('../controllers/cleanupController');

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

router.post('/cleanup/answers', requireSuperAdmin, cleanupController.clearStudentAnswersBySubject);
router.post('/cleanup/streak', requireSuperAdmin, cleanupController.clearStudentStreak);
router.post('/cleanup/migrate-stats', requireSuperAdmin, cleanupController.migratePracticeStats);
router.post('/cleanup/rebuild-stats', requireSuperAdmin, cleanupController.rebuildPracticeStats);

module.exports = router;