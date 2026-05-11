const { User, Subject, UserSubject } = require('../models');
const { Op } = require('sequelize');

// Получить всех студентов
exports.getAllStudents = async (req, res) => {
  try {
    const students = await User.findAll({
      where: { role: 'student' },
      include: [{
        model: Subject,
        as: 'subjects',
        through: { 
          attributes: ['accessStartDate', 'accessEndDate', 'isActive'] 
        }
      }],
      attributes: [
        'id',
        'telegramId',
        'telegramUsername',
        'firstName',
        'lastName',
        'isActive',
        'accessStartDate',
        'accessEndDate',
        'createdAt'
      ],
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
    const { 
      telegramId, 
      telegramUsername, 
      firstName, 
      lastName, 
      subjectIds,
      accessStartDate,
      accessEndDate,
      subjectAccessDates // Формат: { subjectId: { startDate, endDate } }
    } = req.body;

    // Валидация обязательных полей
    if (!telegramId || !firstName || !lastName) {
      return res.status(400).json({ 
        message: 'Required fields: telegramId, firstName, lastName' 
      });
    }

    // Проверка: студент уже существует?
    const existingStudent = await User.findOne({ where: { telegramId } });
    if (existingStudent) {
      return res.status(400).json({ 
        message: 'Student with this Telegram ID already exists' 
      });
    }

    // Создаём студента с датами доступа к приложению
    const student = await User.create({
      telegramId,
      telegramUsername: telegramUsername || null,
      firstName,
      lastName,
      role: 'student',
      isActive: true,
      accessStartDate: accessStartDate || new Date(), // По умолчанию сейчас
      accessEndDate: accessEndDate || null // Бессрочно если не указано
    });

    // Привязываем предметы с индивидуальными датами доступа
    if (subjectIds && subjectIds.length > 0) {
      for (const subjectId of subjectIds) {
        // Берём индивидуальные даты для предмета, если есть
        const subjectAccess = subjectAccessDates?.[subjectId] || {};
        
        await UserSubject.create({
          userId: student.id,
          subjectId: subjectId,
          // Если для предмета указаны свои даты - используем их
          // Иначе используем общие даты доступа студента
          accessStartDate: subjectAccess.startDate || accessStartDate || new Date(),
          accessEndDate: subjectAccess.endDate || accessEndDate || null,
          isActive: true
        });
      }
    }

    // Получаем студента с предметами и их датами доступа
    const studentWithSubjects = await User.findByPk(student.id, {
      include: [{
        model: Subject,
        as: 'subjects',
        through: { 
          attributes: ['accessStartDate', 'accessEndDate', 'isActive'] 
        }
      }]
    });

    // ВАЖНО: Обновляем BotUser если такой есть
    const { BotUser } = require('../models');
    const botUser = await BotUser.findOne({ where: { telegramId } });
    if (botUser) {
      botUser.isAssigned = true;
      botUser.userId = student.id;
      await botUser.save();
    }

    res.status(201).json({
      message: 'Student created successfully',
      student: studentWithSubjects
    });
  } catch (error) {
    console.error('Create student error:', error);
    res.status(500).json({ 
      message: 'Server error', 
      error: error.message 
    });
  }
};

// Обновить предметы студента
exports.updateStudentSubjects = async (req, res) => {
  try {
    const { studentId } = req.params;
    const { subjectIds, subjectAccessDates } = req.body;

    const student = await User.findByPk(studentId);
    if (!student || student.role !== 'student') {
      return res.status(404).json({ message: 'Student not found' });
    }

    // Удаляем старые связи
    await UserSubject.destroy({ where: { userId: studentId } });

    // Создаём новые связи с датами доступа
    if (subjectIds && subjectIds.length > 0) {
      for (const subjectId of subjectIds) {
        const subjectAccess = subjectAccessDates?.[subjectId] || {};
        
        await UserSubject.create({
          userId: studentId,
          subjectId: subjectId,
          accessStartDate: subjectAccess.startDate || student.accessStartDate || new Date(),
          accessEndDate: subjectAccess.endDate || student.accessEndDate || null,
          isActive: true
        });
      }
    }

    // Получаем обновлённого студента
    const updatedStudent = await User.findByPk(studentId, {
      include: [{
        model: Subject,
        as: 'subjects',
        through: { 
          attributes: ['accessStartDate', 'accessEndDate', 'isActive'] 
        }
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

// Обновить даты доступа студента к приложению
exports.updateStudentAccess = async (req, res) => {
  try {
    const { studentId } = req.params;
    const { accessStartDate, accessEndDate, isActive } = req.body;

    const student = await User.findByPk(studentId);
    if (!student || student.role !== 'student') {
      return res.status(404).json({ message: 'Student not found' });
    }

    // Обновляем даты доступа
    if (accessStartDate !== undefined) student.accessStartDate = accessStartDate;
    if (accessEndDate !== undefined) student.accessEndDate = accessEndDate;
    if (typeof isActive === 'boolean') student.isActive = isActive;

    await student.save();

    // Получаем обновлённого студента с предметами
    const updatedStudent = await User.findByPk(studentId, {
      include: [{
        model: Subject,
        as: 'subjects',
        through: { 
          attributes: ['accessStartDate', 'accessEndDate', 'isActive'] 
        }
      }]
    });

    res.json({
      message: 'Student access updated',
      student: updatedStudent
    });
  } catch (error) {
    console.error('Update student access error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Продлить доступ студента
exports.extendStudentAccess = async (req, res) => {
  try {
    const { studentId } = req.params;
    const { days } = req.body; // Количество дней для продления

    const student = await User.findByPk(studentId);
    if (!student || student.role !== 'student') {
      return res.status(404).json({ message: 'Student not found' });
    }

    // Если есть дата окончания - продлеваем от неё
    // Если нет - ставим от текущей даты
    const baseDate = student.accessEndDate 
      ? new Date(student.accessEndDate) 
      : new Date();
    
    baseDate.setDate(baseDate.getDate() + (days || 30));
    student.accessEndDate = baseDate;

    await student.save();

    res.json({
      message: `Access extended by ${days || 30} days`,
      student: {
        id: student.id,
        accessEndDate: student.accessEndDate
      }
    });
  } catch (error) {
    console.error('Extend student access error:', error);
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

// Назначить пользователя студентом
exports.assignUserAsStudent = async (req, res) => {
  try {
    const { userId } = req.params;
    const { 
      subjectIds, 
      accessStartDate, 
      accessEndDate,
      subjectAccessDates 
    } = req.body;

    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Меняем роль на студента
    user.role = 'student';
    user.isActive = true;
    user.accessStartDate = accessStartDate || new Date();
    user.accessEndDate = accessEndDate || null;

    await user.save();

    // Привязываем предметы
    if (subjectIds && subjectIds.length > 0) {
      // Удаляем старые связи если были
      await UserSubject.destroy({ where: { userId: user.id } });

      for (const subjectId of subjectIds) {
        const subjectAccess = subjectAccessDates?.[subjectId] || {};
        
        await UserSubject.create({
          userId: user.id,
          subjectId: subjectId,
          accessStartDate: subjectAccess.startDate || accessStartDate || new Date(),
          accessEndDate: subjectAccess.endDate || accessEndDate || null,
          isActive: true
        });
      }
    }

    // Получаем обновлённого пользователя
    const updatedUser = await User.findByPk(user.id, {
      include: [{
        model: Subject,
        as: 'subjects',
        through: { 
          attributes: ['accessStartDate', 'accessEndDate', 'isActive'] 
        }
      }]
    });

    res.json({
      message: 'User assigned as student successfully',
      student: updatedUser
    });
  } catch (error) {
    console.error('Assign user as student error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};