const { BotUser, User } = require('../models');
const { Op } = require('sequelize');

// Получить всех пользователей бота с фильтрацией
exports.getAllBotUsers = async (req, res) => {
  try {
    const { sortBy = 'firstInteractionAt', order = 'DESC', filter = 'all' } = req.query;

    // Базовый запрос
    let whereClause = {};

    // Применяем фильтр
    if (filter === 'assigned') {
      whereClause.isAssigned = true;
    } else if (filter === 'unassigned') {
      whereClause.isAssigned = false;
    }

    // Получаем пользователей с проверкой реальной назначенности
    const botUsers = await BotUser.findAll({
      where: whereClause,
      order: [[sortBy, order]],
      include: [{
        model: User,
        as: 'assignedUser',
        required: false,
        attributes: ['id', 'firstName', 'lastName', 'role']
      }]
    });

    // ВАЖНО: Проверяем реальную назначенность через User таблицу
    const checkedBotUsers = await Promise.all(botUsers.map(async (botUser) => {
      const realUser = await User.findOne({ 
        where: { telegramId: botUser.telegramId } 
      });
      
      // Если флаг не совпадает с реальностью - синхронизируем
      const shouldBeAssigned = !!realUser;
      if (botUser.isAssigned !== shouldBeAssigned) {
        botUser.isAssigned = shouldBeAssigned;
        botUser.userId = realUser?.id || null;
        await botUser.save();
      }
      
      return botUser.toJSON();
    }));

    res.json({ botUsers: checkedBotUsers });
  } catch (error) {
    console.error('Get bot users error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Регистрация/обновление пользователя бота
exports.registerOrUpdateBotUser = async (req, res) => {
  try {
    const {
      telegramId,
      telegramUsername,
      firstName,
      lastName,
      languageCode,
      isBot
    } = req.body;

    if (!telegramId) {
      return res.status(400).json({ message: 'telegramId is required' });
    }

    // Проверяем существует ли пользователь в основной таблице
    const systemUser = await User.findOne({ where: { telegramId } });

    // Находим или создаём запись в BotUser
    let botUser = await BotUser.findOne({ where: { telegramId } });

    if (botUser) {
      // Обновляем существующую запись
      botUser.telegramUsername = telegramUsername || botUser.telegramUsername;
      botUser.firstName = firstName || botUser.firstName;
      botUser.lastName = lastName || botUser.lastName;
      botUser.languageCode = languageCode || botUser.languageCode;
      botUser.lastInteractionAt = new Date();
      botUser.messageCount = (botUser.messageCount || 0) + 1;
      
      // Синхронизируем флаг назначенности
      botUser.isAssigned = !!systemUser;
      botUser.userId = systemUser?.id || null;
      
      await botUser.save();
    } else {
      // Создаём новую запись
      botUser = await BotUser.create({
        telegramId,
        telegramUsername: telegramUsername || null,
        firstName: firstName || 'Пользователь',
        lastName: lastName || '',
        languageCode: languageCode || 'ru',
        isBot: isBot || false,
        firstInteractionAt: new Date(),
        lastInteractionAt: new Date(),
        messageCount: 1,
        isAssigned: !!systemUser,
        userId: systemUser?.id || null
      });
    }

    res.json({
      message: 'Bot user registered/updated successfully',
      botUser
    });
  } catch (error) {
    console.error('Register bot user error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.syncAssignedStatus = async (req, res) => {
  try {
    const botUsers = await BotUser.findAll();
    let synced = 0;

    for (const botUser of botUsers) {
      const systemUser = await User.findOne({ 
        where: { telegramId: botUser.telegramId } 
      });
      
      const shouldBeAssigned = !!systemUser;
      
      if (botUser.isAssigned !== shouldBeAssigned) {
        botUser.isAssigned = shouldBeAssigned;
        botUser.userId = systemUser?.id || null;
        await botUser.save();
        synced++;
      }
    }

    res.json({ 
      message: 'Sync completed', 
      totalBotUsers: botUsers.length,
      synced 
    });
  } catch (error) {
    console.error('Sync error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};