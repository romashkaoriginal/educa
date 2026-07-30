const {
  User, Subject, UserSubject, HomeworkSubmission, HomeworkAnswer,
  PracticeAttempt, PracticeBest, PracticeDailyLog, BotUser, QuizAnswer, QuizParticipant,
  // Агрегатные таблицы практики — тоже ссылаются на studentId и блокируют удаление
  PracticeQuestionResult, PracticeScoreHistory, PracticeStudentTotals, PracticeDailyStats,
  PracticeTopicTotals, PracticeDifficultyTotals, PracticeModeTotals, PracticeRecentError,
  sequelize
} = require('../models');
const { Op } = require('sequelize');
const { getWebAppUrlSync } = require('../utils/webAppUrl');

function formatDate(date) {
  if (!date) return 'бессрочно';
  return new Date(date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}

async function notifyStudent(telegramId, message) {
  if (!telegramId) return;
  try {
    const { getBot } = require('../bot');
    const bot = getBot();
    if (!bot) return;
    await bot.sendMessage(telegramId, message, {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [[{ text: '📚 Открыть приложение', web_app: { url: getWebAppUrlSync() } }]]
      }
    });
  } catch (e) {
    console.error('Notify student error:', e.message);
  }
}

function buildSubjectsText(subjects) {
  if (!subjects || subjects.length === 0) return '— нет предметов';
  return subjects.map(s => {
    const us = s.UserSubject;
    const start = formatDate(us?.accessStartDate);
    const end = formatDate(us?.accessEndDate);
    return `• ${s.icon || ''} <b>${s.name}</b>\n  📅 ${start} — ${end}`;
  }).join('\n');
}


// Получить всех студентов
exports.getAllStudents = async (req, res) => {
  try {
    const students = await User.findAll({
      // Не отдаём в список учеников ни актуальных, ни старых гостевых профилей.
      // converted_to_student — полноценный ученик, сохранивший историю гостевого доступа.
      where: {
        role: 'student',
        isGuest: { [Op.not]: true },
        [Op.or]: [
          { guestStatus: { [Op.is]: null } },
          { guestStatus: 'converted_to_student' }
        ]
      },
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
      subjectAccessDates // Формат: { subjectId: { startDate, endDate } }
    } = req.body;

    // ИСПРАВЛЕНО: lastName больше не обязательное поле
    if (!firstName) {
      return res.status(400).json({ 
        message: 'Required fields: firstName' 
      });
    }

    // Проверка: студент уже существует?
    // Если это ГОСТЬ — переносим (промоутим) его в ученика, сохраняя всю
    // практику/статистику (она уже привязана к этому User.id) — ТЗ §24.
    let student = null;
    if (telegramId) {
      const existingStudent = await User.findOne({ where: { telegramId } });
      if (existingStudent && !existingStudent.isGuest) {
        return res.status(400).json({
          message: 'Student with this Telegram ID already exists'
        });
      }
      if (existingStudent && existingStudent.isGuest) {
        // Промоутим гостя
        await existingStudent.update({
          firstName,
          lastName: lastName || null,
          telegramUsername: telegramUsername || existingStudent.telegramUsername,
          role: 'student',
          isActive: true,
          isGuest: false,
          guestStatus: 'converted_to_student'
        });
        student = existingStudent;
        // Сбрасываем старые гостевые привязки предметов — назначим новые ниже
        await UserSubject.destroy({ where: { userId: student.id } });
      }
    }

    // Создаём студента (если не было гостя для промоута)
    if (!student) {
      student = await User.create({
        telegramId: telegramId || null,
        telegramUsername: telegramUsername || null,
        firstName,
        lastName: lastName || null,
        role: 'student',
        isActive: true
      });
    }

    // Привязываем предметы с индивидуальными датами доступа
    if (subjectIds && subjectIds.length > 0) {
      for (const subjectId of subjectIds) {
        const subjectAccess = subjectAccessDates?.[subjectId] || {};

        let startDate = subjectAccess.startDate || null;
        let endDate = subjectAccess.endDate || null;

        if (startDate === '' || startDate === 'Invalid date') startDate = null;
        if (endDate === '' || endDate === 'Invalid date') endDate = null;

        await UserSubject.create({
          userId: student.id,
          subjectId: subjectId,
          accessStartDate: startDate,
          accessEndDate: endDate,
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
    const botUser = await BotUser.findOne({ where: { telegramId } });
    if (botUser) {
      botUser.isAssigned = true;
      botUser.userId = student.id;
      await botUser.save();
    }

    // 🔔 Уведомляем студента о создании аккаунта
    if (telegramId) {
      const subjectsText = buildSubjectsText(studentWithSubjects.subjects);
      await notifyStudent(telegramId,
        `👋 Привет, <b>${firstName}</b>!\n\n` +
        `🎓 Вам открыт доступ к образовательной платформе <b>KUBIK</b>.\n\n` +
        `📚 <b>Ваши предметы:</b>\n${subjectsText}\n\n` +
        `Нажмите кнопку ниже чтобы войти в приложение:`
      );
    }

    res.status(201).json({
      message: 'Student created successfully',
      student: studentWithSubjects
    });
  } catch (error) {
    console.error('Create student error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Обновить студента (все данные)
exports.updateStudent = async (req, res) => {
  try {
    const { studentId } = req.params;
    const { 
      telegramId,
      telegramUsername,
      firstName, 
      lastName, 
      isActive,
      subjectIds,
      subjectAccessDates 
    } = req.body;

    const student = await User.findByPk(studentId);
    if (!student || student.role !== 'student') {
      return res.status(404).json({ message: 'Student not found' });
    }

    // Старые предметы для сравнения
    const oldStudent = await User.findByPk(studentId, {
      include: [{ model: Subject, as: 'subjects', through: { attributes: ['accessStartDate', 'accessEndDate'] } }]
    });

    // Обновляем основные данные
    if (telegramId !== undefined) student.telegramId = telegramId || null;
    if (telegramUsername !== undefined) student.telegramUsername = telegramUsername || null;
    if (firstName !== undefined) student.firstName = firstName;
    if (lastName !== undefined) student.lastName = lastName || null;
    if (typeof isActive === 'boolean') student.isActive = isActive;

    await student.save();

    // Обновляем предметы и их даты если переданы
    if (subjectIds) {
      // Удаляем старые связи
      await UserSubject.destroy({ where: { userId: studentId } });

      // Создаём новые с датами
      for (const subjectId of subjectIds) {
        const subjectAccess = subjectAccessDates?.[subjectId] || {};
        
        let startDate = subjectAccess.startDate || null;
        let endDate = subjectAccess.endDate || null;
        
        if (startDate === '' || startDate === 'Invalid date') startDate = null;
        if (endDate === '' || endDate === 'Invalid date') endDate = null;
        
        await UserSubject.create({
          userId: studentId,
          subjectId: subjectId,
          accessStartDate: startDate,
          accessEndDate: endDate,
          isActive: true
        });
      }
    }

    // Обновляем BotUser если нужно
    if (telegramId) {
      const botUser = await BotUser.findOne({ where: { telegramId } });
      if (botUser && !botUser.isAssigned) {
        botUser.isAssigned = true;
        botUser.userId = student.id;
        await botUser.save();
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

    // 🔔 Уведомляем если изменились предметы или даты
    const notifyId = student.telegramId;
    if (notifyId && subjectIds) {
      const oldIds = oldStudent.subjects.map(s => s.id).sort().join(',');
      const newIds = [...subjectIds].sort().join(',');
      const subjectsChanged = oldIds !== newIds;
      const datesChanged = !subjectsChanged && subjectIds.some(sid => {
        const oldSub = oldStudent.subjects.find(s => s.id === parseInt(sid));
        const acc = subjectAccessDates?.[sid] || {};
        const oldEnd = oldSub?.UserSubject?.accessEndDate ? new Date(oldSub.UserSubject.accessEndDate).toDateString() : null;
        const newEnd = acc.endDate ? new Date(acc.endDate).toDateString() : null;
        return oldEnd !== newEnd;
      });
      if (subjectsChanged || datesChanged) {
        const subjectsText = buildSubjectsText(updatedStudent.subjects);
        await notifyStudent(notifyId,
          `📋 <b>Изменения в вашем доступе</b>\n\n` +
          `📚 <b>Актуальные предметы:</b>\n${subjectsText}\n\n` +
          `Войдите в приложение:`
        );
      }
    }

    res.json({
      message: 'Student updated successfully',
      student: updatedStudent
    });
  } catch (error) {
    console.error('Update student error:', error);
    res.status(500).json({ message: 'Server error' });
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

    // Старые предметы для сравнения
    const oldSubjects = await User.findByPk(studentId, {
      include: [{ model: Subject, as: 'subjects', through: { attributes: ['accessStartDate', 'accessEndDate'] } }]
    });

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

    // 🔔 Уведомляем об изменении предметов/дат
    if (student.telegramId) {
      const oldIds = oldSubjects.subjects.map(s => s.id).sort().join(',');
      const newIds = [...(subjectIds || [])].sort().join(',');
      if (oldIds !== newIds) {
        const added = updatedStudent.subjects.filter(s => !oldSubjects.subjects.find(o => o.id === s.id));
        const removed = oldSubjects.subjects.filter(o => !updatedStudent.subjects.find(s => s.id === o.id));
        let changeText = '';
        if (added.length > 0) changeText += `\n➕ Добавлены: ${added.map(s => s.name).join(', ')}`;
        if (removed.length > 0) changeText += `\n➖ Убраны: ${removed.map(s => s.name).join(', ')}`;
        const subjectsText = buildSubjectsText(updatedStudent.subjects);
        await notifyStudent(student.telegramId,
          `📋 <b>Изменены ваши предметы</b>${changeText}\n\n` +
          `📚 <b>Актуальный список:</b>\n${subjectsText}\n\nВойдите в приложение:`
        );
      } else {
        const subjectsText = buildSubjectsText(updatedStudent.subjects);
        await notifyStudent(student.telegramId,
          `📋 <b>Обновлены сроки доступа</b>\n\n` +
          `📚 <b>Ваши предметы:</b>\n${subjectsText}\n\nВойдите в приложение:`
        );
      }
    }

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

    if (accessStartDate !== undefined) student.accessStartDate = accessStartDate;
    if (accessEndDate !== undefined) student.accessEndDate = accessEndDate;
    if (typeof isActive === 'boolean') student.isActive = isActive;

    await student.save();

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
    const { days } = req.body;

    const student = await User.findByPk(studentId);
    if (!student || student.role !== 'student') {
      return res.status(404).json({ message: 'Student not found' });
    }

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

// Удалить студента каскадно
exports.deleteStudent = async (req, res) => {
  try {
    const { studentId } = req.params;

    const student = await User.findByPk(studentId);
    if (!student || student.role !== 'student') {
      return res.status(404).json({ message: 'Student not found' });
    }

    // Всё удаление — в транзакции: либо снесли все связанные записи и пользователя,
    // либо не трогаем ничего (иначе можно оставить «осиротевшего» ученика без данных).
    await sequelize.transaction(async (t) => {
      // 1. HomeworkAnswer → HomeworkSubmission
      const submissions = await HomeworkSubmission.findAll({
        where: { userId: studentId }, attributes: ['id'], transaction: t
      });
      const submissionIds = submissions.map(s => s.id);
      if (submissionIds.length > 0) {
        await HomeworkAnswer.destroy({ where: { submissionId: submissionIds }, transaction: t });
      }
      await HomeworkSubmission.destroy({ where: { userId: studentId }, transaction: t });

      // 2. Все практические таблицы, ссылающиеся на studentId (включая агрегаты —
      //    без них падает FK practice_question_results_studentId_fkey и т.д.)
      const practiceModels = [
        PracticeAttempt, PracticeBest, PracticeDailyLog,
        PracticeQuestionResult, PracticeScoreHistory, PracticeStudentTotals,
        PracticeDailyStats, PracticeTopicTotals, PracticeDifficultyTotals,
        PracticeModeTotals, PracticeRecentError
      ];
      for (const Model of practiceModels) {
        await Model.destroy({ where: { studentId }, transaction: t });
      }

      // 3. Викторины
      await QuizAnswer.destroy({ where: { userId: studentId }, transaction: t });
      await QuizParticipant.destroy({ where: { userId: studentId }, transaction: t });

      // 4. Предметы
      await UserSubject.destroy({ where: { userId: studentId }, transaction: t });

      // 5. Полностью удаляем BotUser-запись (а не просто отвязываем).
      // Иначе удалённый ученик остаётся в списке «пользователей бота» в админке
      // и снова всплывает как кандидат на добавление, хотя боту ничего не писал.
      // Снова появится только если сам напишет боту (registerBotUser создаст запись).
      // Удаляем по обоим ключам: привязка по userId и по telegramId самого ученика.
      await BotUser.destroy({ where: { userId: studentId }, transaction: t });
      if (student.telegramId) {
        await BotUser.destroy({ where: { telegramId: student.telegramId }, transaction: t });
      }

      // 6. Сам студент
      await student.destroy({ transaction: t });
    });

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

    user.role = 'student';
    user.isActive = true;
    user.accessStartDate = accessStartDate || new Date();
    user.accessEndDate = accessEndDate || null;

    await user.save();

    if (subjectIds && subjectIds.length > 0) {
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
