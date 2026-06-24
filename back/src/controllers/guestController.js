// Контроллер гостевого доступа (ТЗ §3, §4)
const { Op } = require('sequelize');
const { User, Subject } = require('../models');
const guestAccess = require('../services/guestAccess');
const { saveBotUserUtm } = require('../services/botUserUtm');

// GET /api/guest/state — состояние гостя/ученика по верифицированному telegramId.
// Фронт зовёт на старте Mini App, чтобы понять режим (ученик / выбор предметов /
// гость активен / доступ закончился).
exports.getState = async (req, res) => {
  try {
    const telegramId = req.telegramUser?.id;
    if (!telegramId) return res.status(401).json({ message: 'No Telegram user' });

    const state = await guestAccess.getGuestState(telegramId);
    res.json(state);
  } catch (error) {
    console.error('Guest state error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// GET /api/guest/subjects/available — предметы для выбора (пересечение ТЗ и БД)
exports.getAvailableSubjects = async (req, res) => {
  try {
    const subjects = await guestAccess.getAvailableGuestSubjects();
    res.json({ subjects });
  } catch (error) {
    console.error('Guest available subjects error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// GET /api/guest/admin/list — список активных гостей для входа админа «под гостем».
// Только активные (доступ не истёк) и уже выбравшие предметы — у таких открывается практика.
exports.adminListGuests = async (req, res) => {
  try {
    const now = new Date();
    const guests = await User.findAll({
      where: {
        isGuest: true,
        guestSubjectsChosen: true,
        guestExpiresAt: { [Op.gt]: now }
      },
      // guestStartedAt обязателен в attributes: по нему идёт ORDER BY, а при
      // include+limit Sequelize строит subQuery и колонка из order должна быть выбрана.
      attributes: ['id', 'telegramId', 'telegramUsername', 'firstName', 'guestStatus', 'guestStartedAt', 'guestExpiresAt', 'guestApplicationSent'],
      include: [{ model: Subject, as: 'subjects', attributes: ['id', 'name', 'icon'], through: { attributes: [] } }],
      order: [['guestStartedAt', 'DESC']],
      limit: 200
    });
    res.json({ guests });
  } catch (error) {
    console.error('Admin guest list error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.trackUtm = async (req, res) => {
  try {
    const telegramId = req.telegramUser?.id;
    if (!telegramId) return res.status(401).json({ message: 'No Telegram user' });

    const { utmSource, utmMedium, utmCampaign, utmContent, utmTerm, utmRaw } = req.body;
    if (!utmSource) return res.json({ saved: false });

    const saved = await saveBotUserUtm(telegramId, {
      utmSource, utmMedium, utmCampaign, utmContent, utmTerm, utmRaw,
    });
    res.json({ saved });
  } catch (error) {
    console.error('Guest track UTM error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// POST /api/guest/subjects — гость выбирает 1..3 предмета (ТЗ §4.2)
exports.chooseSubjects = async (req, res) => {
  try {
    const telegramId = req.telegramUser?.id;
    if (!telegramId) return res.status(401).json({ message: 'No Telegram user' });

    // Гость уже создан ботом при /start; находим его строку
    const state = await guestAccess.getGuestState(telegramId);
    if (!state.exists || !state.isGuest) {
      return res.status(404).json({ message: 'Гостевой профиль не найден', code: 'GUEST_NOT_FOUND' });
    }
    if (state.expired) {
      return res.status(403).json({ message: 'Гостевой доступ закончился', code: 'GUEST_EXPIRED' });
    }

    let { subjectIds } = req.body;
    // Анти-абьюз тела: только массив чисел, не длиннее 3
    if (!Array.isArray(subjectIds)) subjectIds = [];
    subjectIds = subjectIds.map(Number).filter(Number.isInteger).slice(0, 3);

    const chosen = await guestAccess.chooseSubjects(state.userId, subjectIds);

    res.json({ success: true, subjectIds: chosen });
  } catch (error) {
    if (error.code === 'NO_SUBJECTS' || error.code === 'TOO_MANY_SUBJECTS') {
      return res.status(400).json({ message: error.message, code: error.code });
    }
    if (error.code === 'GUEST_EXPIRED' || error.code === 'GUEST_NOT_FOUND') {
      return res.status(403).json({ message: error.message, code: error.code });
    }
    console.error('Guest choose subjects error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};
