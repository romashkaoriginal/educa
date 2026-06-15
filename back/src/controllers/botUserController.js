const { BotUser, User } = require('../models');
const { Op } = require('sequelize');

// Получить всех пользователей бота с сортировкой
exports.getAllBotUsers = async (req, res) => {
  try {
    const { 
      sortBy = 'firstInteractionAt',
      order = 'DESC',
      filter = 'all'
    } = req.query;

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

// Зарегистрировать/обновить пользователя бота
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

    let botUser = await BotUser.findOne({ where: { telegramId } });

    if (botUser) {
      botUser.telegramUsername = telegramUsername || botUser.telegramUsername;
      botUser.firstName = firstName || botUser.firstName;
      botUser.lastName = lastName || botUser.lastName;
      botUser.languageCode = languageCode || botUser.languageCode;
      botUser.lastInteractionAt = new Date();
      botUser.messageCount += 1;
      await botUser.save();
    } else {
      botUser = await BotUser.create({
        telegramId,
        telegramUsername,
        firstName,
        lastName,
        languageCode,
        isBot: isBot || false,
        isAssigned: false,
        firstInteractionAt: new Date(),
        lastInteractionAt: new Date(),
        messageCount: 1
      });
    }

    const assignedUser = await User.findOne({ where: { telegramId } });
    
    if (assignedUser && !botUser.isAssigned) {
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
    res.status(500).json({ message: 'Server error' });
  }
};

// Получить статистику
exports.getBotUsersStats = async (req, res) => {
  try {
    const total = await BotUser.count();
    const assigned = await BotUser.count({ where: { isAssigned: true } });
    const unassigned = await BotUser.count({ where: { isAssigned: false } });
    
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const newLast7Days = await BotUser.count({
      where: {
        firstInteractionAt: {
          [Op.gte]: sevenDaysAgo
        }
      }
    });

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

// Синхронизировать статусы isAssigned
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