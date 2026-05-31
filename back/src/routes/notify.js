const express = require('express');
const router = express.Router();
const { User, Subject, UserSubject, HomeworkSubmission, Homework, NotificationLog } = require('../models');
const { getBot } = require('../bot');
const { Op } = require('sequelize');

// POST /api/notify/preview
router.post('/preview', async (req, res) => {
  try {
    const students = await getFilteredStudents(req.body);
    res.json({ 
      count: students.length,
      students: students.map(s => ({ id: s.id, firstName: s.firstName, lastName: s.lastName, telegramId: s.telegramId }))
    });
  } catch (error) {
    console.error('Preview error:', error);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

// POST /api/notify/send
router.post('/send', async (req, res) => {
  const { filters, studentId, text, sentBy, sentByName, sentByRole } = req.body;

  if (!text || !text.trim()) {
    return res.status(400).json({ message: 'Введите текст сообщения' });
  }

  const bot = getBot();
  if (!bot) {
    return res.status(500).json({ message: 'Бот не запущен' });
  }

  try {
    let students;

    // Одиночная отправка конкретному ученику
    if (studentId) {
      const student = await User.findByPk(studentId, {
        attributes: ['id', 'telegramId', 'firstName', 'lastName']
      });
      students = student ? [student] : [];
    } else {
      students = await getFilteredStudents(filters || {});
    }

    if (students.length === 0) {
      return res.status(400).json({ message: 'Нет получателей' });
    }

    const results = { sent: [], failed: [] };

    for (const student of students) {
      if (!student.telegramId) {
        results.failed.push({ id: student.id, name: `${student.firstName} ${student.lastName || ''}`, reason: 'Нет Telegram ID' });
        continue;
      }
      try {
        await bot.sendMessage(student.telegramId, text.trim(), { parse_mode: 'HTML' });
        results.sent.push({ id: student.id, name: `${student.firstName} ${student.lastName || ''}` });
      } catch (e) {
        results.failed.push({ id: student.id, name: `${student.firstName} ${student.lastName || ''}`, reason: e.message });
      }
    }

    // Сохраняем лог
    await NotificationLog.create({
      sentBy: sentBy || 0,
      sentByName: sentByName || 'Администратор',
      sentByRole: sentByRole || 'admin',
      text: text.trim(),
      filters: studentId ? { studentId } : (filters || {}),
      recipientCount: students.length,
      successCount: results.sent.length,
      failedCount: results.failed.length,
      recipients: [
        ...results.sent.map(s => ({ ...s, status: 'sent' })),
        ...results.failed.map(s => ({ ...s, status: 'failed' }))
      ]
    });

    res.json({
      message: `Отправлено: ${results.sent.length}, ошибок: ${results.failed.length}`,
      results
    });
  } catch (error) {
    console.error('Send error:', error);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

// GET /api/notify/history
router.get('/history', async (req, res) => {
  try {
    const logs = await NotificationLog.findAll({
      order: [['createdAt', 'DESC']],
      limit: 50
    });
    res.json({ logs });
  } catch (error) {
    console.error('History error:', error);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
});

// ===== HELPER =====
async function getFilteredStudents(filters) {
  const { subjectIds, accessDays, homeworkPercent } = filters;

  let students = await User.findAll({
    where: { role: 'student', isActive: true },
    include: [{
      model: Subject,
      as: 'subjects',
      through: { attributes: ['accessStartDate', 'accessEndDate'] }
    }],
    attributes: ['id', 'telegramId', 'firstName', 'lastName']
  });

  // Фильтр по предметам
  if (subjectIds && subjectIds.length > 0) {
    students = students.filter(s =>
      s.subjects?.some(sub => subjectIds.includes(sub.id))
    );
  }

  // Фильтр по дням доступа
  if (accessDays !== undefined && accessDays !== null && accessDays !== 'all') {
    const now = new Date();
    students = students.filter(s => {
      const ends = s.subjects
        ?.map(sub => sub.UserSubject?.accessEndDate)
        .filter(Boolean)
        .map(d => new Date(d));

      if (accessDays === 'active') {
        // Есть хотя бы один активный предмет
        return ends && ends.some(d => d > now);
      }

      if (!ends || ends.length === 0) return false;
      const minEnd = new Date(Math.min(...ends));
      const days = Math.ceil((minEnd - now) / (1000 * 60 * 60 * 24));

      if (accessDays === 'expired') return days < 0;
      if (accessDays === 1) return days >= 0 && days <= 1;
      if (accessDays === 3) return days >= 0 && days <= 3;
      if (accessDays === 7) return days >= 0 && days <= 7;
      return true;
    });
  }

  // Фильтр по % домашки — "any percent" НЕ включает тех кто не начинал
  if (homeworkPercent !== undefined && homeworkPercent !== null && homeworkPercent !== 'all') {
    const studentIds = students.map(s => s.id);

    const submissions = await HomeworkSubmission.findAll({
      where: { userId: { [Op.in]: studentIds } },
      attributes: ['userId', 'homeworkId', 'totalScore', 'maxScore'],
      order: [['totalScore', 'DESC']]
    });

    const studentPercents = {};
    submissions.forEach(sub => {
      if (!studentPercents[sub.userId]) studentPercents[sub.userId] = {};
      if (!studentPercents[sub.userId][sub.homeworkId]) {
        const pct = sub.maxScore > 0 ? (sub.totalScore / sub.maxScore) * 100 : 0;
        studentPercents[sub.userId][sub.homeworkId] = pct;
      }
    });

    const avgPercent = (userId) => {
      const hws = studentPercents[userId];
      if (!hws) return null;
      const vals = Object.values(hws);
      return vals.reduce((a, b) => a + b, 0) / vals.length;
    };

    students = students.filter(s => {
      const avg = avgPercent(s.id);
      if (homeworkPercent === 'none') return avg === null;
      // Для всех остальных фильтров — только те кто хоть что-то сдавал
      if (avg === null) return false;
      if (homeworkPercent === 'lt30') return avg < 30;
      if (homeworkPercent === 'lt50') return avg < 50;
      if (homeworkPercent === 'gt80') return avg > 80;
      if (homeworkPercent === 'full') return avg >= 100;
      // 'any' = сдавал хоть что-то
      if (homeworkPercent === 'any') return avg !== null;
      return true;
    });
  }

  return students;
}

module.exports = router;