const { User, Subject } = require('../models');

// Получить все предметы студента
exports.getStudentSubjects = async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findByPk(userId, {
      include: [{
        model: Subject,
        as: 'subjects',
        through: { attributes: [] }
      }]
    });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({
      user: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role
      },
      subjects: user.subjects
    });
  } catch (error) {
    console.error('Get student subjects error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Получить все предметы (для админа)
exports.getAllSubjects = async (req, res) => {
  try {
    const subjects = await Subject.findAll({
      where: { isActive: true },
      order: [['name', 'ASC']]
    });

    res.json({ subjects });
  } catch (error) {
    console.error('Get all subjects error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};