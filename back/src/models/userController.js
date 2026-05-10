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

    // Валидация роли
    if (!['admin', 'teacher', 'manager'].includes(role)) {
      return res.status(400).json({ 
        message: 'Invalid role. Allowed: admin, teacher, manager' 
      });
    }

    // Валидация обязательных полей
    if (!telegramId || !firstName || !lastName) {
      return res.status(400).json({ 
        message: 'Required fields: telegramId, firstName, lastName' 
      });
    }

    // Проверка существования пользователя с таким Telegram ID
    const existingUser = await User.findOne({ where: { telegramId } });
    if (existingUser) {
      return res.status(400).json({ 
        message: 'User with this Telegram ID already exists' 
      });
    }

    // Создание пользователя
    const user = await User.create({
      telegramId,
      telegramUsername: telegramUsername || null,
      firstName,
      lastName,
      role,
      isActive: true
    });

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
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Обновить пользователя
exports.updateUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const { firstName, lastName, telegramUsername, role, isActive } = req.body;

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