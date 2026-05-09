const express = require('express');
const { PracticeTopic, PracticeQuestion, User, Subject } = require('../models');
const { Op } = require('sequelize');

const router = express.Router();

// Получить практику для конкретного студента (только по его предметам)
router.get('/student/:studentId', async (req, res) => {
  try {
    const { studentId } = req.params;

    // Получаем предметы студента
    const student = await User.findByPk(studentId, {
      include: [{
        model: Subject,
        as: 'subjects',
        attributes: ['id']
      }]
    });

    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }

    const subjectIds = student.subjects.map(s => s.id);

    // Получаем практики по предметам студента
    const practiceTopics = await PracticeTopic.findAll({
      where: {
        subjectId: { [Op.in]: subjectIds }
      },
      include: [
        {
          model: Subject,
          as: 'subject',
          attributes: ['id', 'name', 'icon']
        },
        {
          model: PracticeQuestion,
          as: 'questions',
          attributes: ['id']
        }
      ],
      order: [['createdAt', 'DESC']]
    });

    res.json({ practiceTopics });
  } catch (error) {
    console.error('Get student practice error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;