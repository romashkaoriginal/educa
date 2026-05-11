const { BotUser, User } = require('../models');
const { Op } = require('sequelize');

// Получить всех пользователей бота с сортировкой
exports.getAllBotUsers = async (req, res) => {
  try {
    const { 
      sortBy = 'firstInteractionAt', // firstInteractionAt | lastInteractionAt | messageCount
      order = 'DESC', // DESC | ASC
      filter = 'all' // all | assigned | unassigned
    } = req.query;

    // Условия фильтрации
    let whereCondition = {};
    if (filter === 'assigned') {
      whereCondition.isAssigned = true;
    } else if (filter === 'unassigned') {
      whereCondition.isAssigned = false;
    }

    const botUsers = await BotUser.findAll({
      where: whereCondition,
      include: [{
        model: User,
        as: 'assignedUser',
        attributes: ['id', 'role', 'isActive'],
        required: false
      }],
      order: [[sortBy, order]],
      attributes: [
        'id',
        'telegramId',
        'telegramUsername',
        'firstName',
        'lastName',
        'telegramPhotoUrl',
        'isAssigned',
        'userId',
        'firstInteractionAt',
        'lastInteractionAt',
        'messageCount',
        'createdAt'
      ]
    });

    res.json({ 
      botUsers,
      total: botUsers.length,
      filter,
      sortBy,
      order
    });
  } catch (error) {
    console.error('Get bot users error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Зарегистрировать/обновить пользователя бота (вызывается из Telegram бота)
exports.registerOrUpdateBotUser = async (req, res) => {
  try {
    const {
      telegramId,
      telegramUsername,
      firstName,
      lastName,
      telegramPhotoUrl,
      languageCode,
      isBot
    } = req.body;

    // Ищем существующего пользователя
    let botUser = await BotUser.findOne({ where: { telegramId } });

    if (botUser) {
      // Обновляем информацию
      botUser.telegramUsername = telegramUsername || botUser.telegramUsername;
      botUser.firstName = firstName || botUser.firstName;
      botUser.lastName = lastName || botUser.lastName;
      botUser.telegramPhotoUrl = telegramPhotoUrl || botUser.telegramPhotoUrl;
      botUser.languageCode = languageCode || botUser.languageCode;
      botUser.lastInteractionAt = new Date();
      botUser.messageCount += 1;

      await botUser.save();
    } else {
      // Создаём нового
      botUser = await BotUser.create({
        telegramId,
        telegramUsername,
        firstName,
        lastName,
        telegramPhotoUrl,
        languageCode,
        isBot: isBot || false,
        isAssigned: false,
        firstInteractionAt: new Date(),
        lastInteractionAt: new Date(),
        messageCount: 1
      });
    }

    // Проверяем, есть ли этот пользователь в таблице User
    const assignedUser = await User.findOne({ where: { telegramId } });
    
    if (assignedUser && !botUser.isAssigned) {
      // Если пользователь есть в User, но флаг не установлен
      botUser.isAssigned = true;
      botUser.userId = assignedUser.id;
      await botUser.save();
    }

    res.json({
      message: 'Bot user registered/updated',
      botUser: {
        id: botUser.id,
        telegramId: botUser.telegramId,
        isAssigned: botUser.isAssigned,
        userId: botUser.userId
      }
    });
  } catch (error) {
    console.error('Register bot user error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Получить статистику по пользователям бота
exports.getBotUsersStats = async (req, res) => {
  try {
    const total = await BotUser.count();
    const assigned = await BotUser.count({ where: { isAssigned: true } });
    const unassigned = await BotUser.count({ where: { isAssigned: false } });
    
    // Новые пользователи за последние 7 дней
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const newLast7Days = await BotUser.count({
      where: {
        firstInteractionAt: {
          [Op.gte]: sevenDaysAgo
        }
      }
    });

    // Активные за последние 24 часа
    const oneDayAgo = new Date();
    oneDayAgo.setDate(oneDayAgo.getDate() - 1);
    
    const activeLast24h = await BotUser.count({
      where: {
        lastInteractionAt: {
          [Op.gte]: oneDayAgo
        }
      }
    });

    res.json({
      total,
      assigned,
      unassigned,
      newLast7Days,
      activeLast24h
    });
  } catch (error) {
    console.error('Get bot users stats error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};
// Синхронизировать статусы isAssigned для всех BotUser
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