const express = require('express');
const { Homework, HomeworkQuestion, User, Subject } = require('../models');
const { Op } = require('sequelize');

const router = express.Router();

// Получить домашки для конкретного студента (только по его предметам)
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

    // Получаем опубликованные домашки по предметам студента
    const homeworks = await Homework.findAll({
      where: {
        subjectId: { [Op.in]: subjectIds },
        isPublished: true
      },
      include: [
        {
          model: Subject,
          as: 'subject',
          attributes: ['id', 'name', 'icon']
        },
        {
          model: HomeworkQuestion,
          as: 'questions',
          attributes: ['id']
        }
      ],
      order: [['deadline', 'ASC']]
    });

    res.json({ homeworks });
  } catch (error) {
    console.error('Get student homeworks error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;