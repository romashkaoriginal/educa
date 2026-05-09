const { User, Subject, UserSubject } = require('../models');

// Получить всех студентов
exports.getAllStudents = async (req, res) => {
  try {
    const students = await User.findAll({
      where: { role: 'student' },
      include: [{
        model: Subject,
        as: 'subjects',
        through: { attributes: [] }
      }],
      order: [['createdAt', 'DESC']]
    });

    res.json({ students });
  } catch (error) {
    console.error('Get students error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Создать студента (через Telegram ID)
exports.createStudent = async (req, res) => {
  try {
    const { telegramId, telegramUsername, firstName, lastName, subjectIds } = req.body;

    // Проверка: студент уже существует?
    const existingStudent = await User.findOne({ where: { telegramId } });
    if (existingStudent) {
      return res.status(400).json({ message: 'Student with this Telegram ID already exists' });
    }

    // Создаём студента
    const student = await User.create({
      telegramId,
      telegramUsername,
      firstName,
      lastName,
      role: 'student',
      isActive: true
    });

    // Привязываем предметы
    if (subjectIds && subjectIds.length > 0) {
      const subjects = await Subject.findAll({
        where: { id: subjectIds }
      });
      await student.addSubjects(subjects);
    }

    // Получаем студента с предметами
    const studentWithSubjects = await User.findByPk(student.id, {
      include: [{
        model: Subject,
        as: 'subjects',
        through: { attributes: [] }
      }]
    });

    res.status(201).json({
      message: 'Student created successfully',
      student: studentWithSubjects
    });
  } catch (error) {
    console.error('Create student error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Обновить предметы студента
exports.updateStudentSubjects = async (req, res) => {
  try {
    const { studentId } = req.params;
    const { subjectIds } = req.body;

    const student = await User.findByPk(studentId);
    if (!student || student.role !== 'student') {
      return res.status(404).json({ message: 'Student not found' });
    }

    // Обновляем предметы
    const subjects = await Subject.findAll({
      where: { id: subjectIds }
    });
    await student.setSubjects(subjects);

    // Получаем обновлённого студента
    const updatedStudent = await User.findByPk(studentId, {
      include: [{
        model: Subject,
        as: 'subjects',
        through: { attributes: [] }
      }]
    });

    res.json({
      message: 'Student subjects updated',
      student: updatedStudent
    });
  } catch (error) {
    console.error('Update student subjects error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Удалить студента
exports.deleteStudent = async (req, res) => {
  try {
    const { studentId } = req.params;

    const student = await User.findByPk(studentId);
    if (!student || student.role !== 'student') {
      return res.status(404).json({ message: 'Student not found' });
    }

    await student.destroy();

    res.json({ message: 'Student deleted successfully' });
  } catch (error) {
    console.error('Delete student error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};