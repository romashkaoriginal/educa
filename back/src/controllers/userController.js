const { User } = require('../models');

// Получить всех пользователей системы (админы, учителя, менеджеры)
exports.getAllUsers = async (req, res) => {
  try {
    const users = await User.findAll({
      where: { 
        role: ['admin', 'teacher', 'manager']
      },
      attributes: [
        'id', 
        'telegramId', 
        'telegramUsername', 
        'firstName', 
        'lastName', 
        'role', 
        'isActive', 
        'createdAt'
      ],
      order: [
        ['role', 'ASC'], 
        ['createdAt', 'DESC']
      ]
    });

    res.json({ users });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Создать пользователя (админ/учитель/менеджер)
exports.createUser = async (req, res) => {
  try {
    const { telegramId, telegramUsername, firstName, lastName, role } = req.body;
    const { BotUser } = require('../models');

    if (!['admin', 'teacher', 'manager'].includes(role)) {
      return res.status(400).json({
        message: 'Недопустимая роль. Допустимо: admin, teacher, manager'
      });
    }

    // lastName не обязателен — у многих в Telegram фамилии нет
    if (!telegramId || !firstName) {
      return res.status(400).json({
        message: 'Обязательные поля: telegramId, firstName'
      });
    }

    const tid = String(telegramId).trim();
    if (!/^\d+$/.test(tid)) {
      return res.status(400).json({ message: 'Некорректный Telegram ID' });
    }

    const name = String(firstName).trim();
    if (!name) {
      return res.status(400).json({
        message: 'Обязательные поля: telegramId, firstName'
      });
    }
    const surname = lastName != null && String(lastName).trim() !== ''
      ? String(lastName).trim()
      : null;
    const username = telegramUsername
      ? String(telegramUsername).replace(/^@/, '').trim() || null
      : null;

    let user = await User.findOne({ where: { telegramId: tid } });

    if (user && ['admin', 'teacher', 'manager'].includes(user.role) && !user.isGuest) {
      return res.status(400).json({
        message: 'Пользователь с этим Telegram ID уже есть в системе'
      });
    }

    if (user) {
      // Гость / ученик → назначаем роль сотрудника, сохраняя User.id
      const wasGuestOrStudent = user.isGuest || user.role === 'student';
      await user.update({
        firstName: name,
        lastName: surname !== null ? surname : user.lastName,
        telegramUsername: username !== null ? username : user.telegramUsername,
        role,
        isActive: true,
        isGuest: false,
        guestStatus: null,
        guestStartedAt: null,
        guestExpiresAt: null,
        guestSubjectsChosen: false,
        guestReminderSentAt: null,
        guestApplicationSent: false
      });

      if (wasGuestOrStudent) {
        const { UserSubject } = require('../models');
        await UserSubject.destroy({ where: { userId: user.id } });
      }
    } else {
      user = await User.create({
        telegramId: tid,
        telegramUsername: username,
        firstName: name,
        lastName: surname,
        role,
        isActive: true
      });
    }

    const botUser = await BotUser.findOne({ where: { telegramId: tid } });
    if (botUser) {
      botUser.isAssigned = true;
      botUser.userId = user.id;
      await botUser.save();
    }

    res.status(201).json({
      message: 'User created successfully',
      user: {
        id: user.id,
        telegramId: user.telegramId,
        telegramUsername: user.telegramUsername,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        isActive: user.isActive,
        createdAt: user.createdAt
      }
    });
  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Обновить пользователя
exports.updateUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const { firstName, lastName, telegramUsername, role, isActive } = req.body;

    if (Object.prototype.hasOwnProperty.call(req.body, 'role') && req.dbUser?.role !== 'admin') {
      return res.status(403).json({ message: 'Только администратор может изменять роли' });
    }

    const user = await User.findByPk(userId);
    if (!user || user.role === 'student') {
      return res.status(404).json({ message: 'User not found' });
    }

    // Обновление полей
    if (firstName) user.firstName = firstName;
    if (lastName) user.lastName = lastName;
    if (telegramUsername !== undefined) user.telegramUsername = telegramUsername;
    if (role && ['admin', 'teacher', 'manager'].includes(role)) {
      user.role = role;
    }
    if (typeof isActive === 'boolean') user.isActive = isActive;

    await user.save();

    res.json({
      message: 'User updated successfully',
      user: {
        id: user.id,
        telegramId: user.telegramId,
        telegramUsername: user.telegramUsername,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        isActive: user.isActive,
        updatedAt: user.updatedAt
      }
    });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Удалить пользователя
exports.deleteUser = async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findByPk(userId);
    if (!user || user.role === 'student') {
      return res.status(404).json({ message: 'User not found' });
    }

    await user.destroy();

    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Переключить статус активности
exports.toggleUserStatus = async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findByPk(userId);
    if (!user || user.role === 'student') {
      return res.status(404).json({ message: 'User not found' });
    }

    user.isActive = !user.isActive;
    await user.save();

    res.json({
      message: 'User status updated',
      user: {
        id: user.id,
        isActive: user.isActive
      }
    });
  } catch (error) {
    console.error('Toggle user status error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Получить пользователя по Telegram ID (для авторизации)
exports.getUserByTelegramId = async (req, res) => {
  try {
    const { telegramId } = req.params;

    const user = await User.findOne({ 
      where: { telegramId },
      attributes: [
        'id', 
        'telegramId', 
        'telegramUsername', 
        'firstName', 
        'lastName', 
        'role', 
        'isActive',
        'accessStartDate',
        'accessEndDate'
      ]
    });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({ user });
  } catch (error) {
    console.error('Get user by Telegram ID error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Удалить пользователя
exports.deleteUser = async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await User.findByPk(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (user.role === 'student') {
      return res.status(400).json({
        message: 'Cannot delete student through this endpoint. Use /students/:id instead'
      });
    }

    const { Homework, Quiz, BotUser, sequelize } = require('../models');
    const telegramId = user.telegramId;

    await sequelize.transaction(async (t) => {
      // Контент, созданный сотрудником, НЕ удаляем — отвязываем (createdBy=NULL).
      await Homework.update({ createdBy: null }, { where: { createdBy: user.id }, transaction: t });
      await Quiz.update({ createdBy: null }, { where: { createdBy: user.id }, transaction: t });

      // Отвязываем BotUser
      if (telegramId) {
        const botUser = await BotUser.findOne({ where: { telegramId }, transaction: t });
        if (botUser) {
          botUser.isAssigned = false;
          botUser.userId = null;
          await botUser.save({ transaction: t });
        }
      }

      await user.destroy({ transaction: t });
    });

    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};
