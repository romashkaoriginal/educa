const { Op } = require('sequelize');
const {
  PracticeAttempt,
  PracticeQuestionResult,
  PracticeBest,
  PracticeScoreHistory,
  PracticeDailyLog,
  PracticeTopic,
  User,
  Subject
} = require('../models');
const {
  clearAggregatesForScope,
  migratePracticeStatsFromAttempts,
  rebuildPracticeStatsFromResults
} = require('../services/practiceStatsAggregate');

exports.clearStudentAnswersBySubject = async (req, res) => {
  try {
    const { studentId, subjectId } = req.body;
    if (!studentId || !subjectId) {
      return res.status(400).json({ error: 'Укажите ученика и предмет' });
    }

    const sid = parseInt(studentId, 10);
    const subId = parseInt(subjectId, 10);

    const [student, subject] = await Promise.all([
      User.findByPk(sid, { attributes: ['id', 'firstName', 'lastName', 'role'] }),
      Subject.findByPk(subId, { attributes: ['id', 'name'] })
    ]);

    if (!student || student.role !== 'student') {
      return res.status(404).json({ error: 'Ученик не найден' });
    }
    if (!subject) {
      return res.status(404).json({ error: 'Предмет не найден' });
    }

    const topics = await PracticeTopic.findAll({
      where: { subjectId: subId },
      attributes: ['id'],
      raw: true
    });
    const topicIds = topics.map((t) => t.id);

    const [attempts, results, bests, history, dailyLogs, aggregates] = await Promise.all([
      PracticeAttempt.destroy({ where: { studentId: sid, subjectId: subId } }),
      PracticeQuestionResult.destroy({ where: { studentId: sid, subjectId: subId } }),
      topicIds.length
        ? PracticeBest.destroy({ where: { studentId: sid, topicId: { [Op.in]: topicIds } } })
        : 0,
      PracticeScoreHistory.destroy({ where: { studentId: sid, subjectId: subId } }),
      PracticeDailyLog.destroy({ where: { studentId: sid, subjectId: subId } }),
      clearAggregatesForScope(sid, subId)
    ]);

    res.json({
      success: true,
      student: { id: student.id, name: `${student.firstName} ${student.lastName}`.trim() },
      subject: subject.toJSON(),
      deleted: {
        attempts,
        questionResults: results,
        bests,
        scoreHistory: history,
        dailyLogs,
        aggregates
      }
    });
  } catch (error) {
    console.error('Clear student answers error:', error);
    res.status(500).json({ error: 'Не удалось очистить данные' });
  }
};

exports.clearStudentStreak = async (req, res) => {
  try {
    const { studentId, subjectId } = req.body;
    if (!studentId) {
      return res.status(400).json({ error: 'Укажите ученика' });
    }

    const sid = parseInt(studentId, 10);
    const student = await User.findByPk(sid, { attributes: ['id', 'firstName', 'lastName', 'role'] });
    if (!student || student.role !== 'student') {
      return res.status(404).json({ error: 'Ученик не найден' });
    }

    const where = { studentId: sid };
    if (subjectId != null && subjectId !== '') {
      where.subjectId = parseInt(subjectId, 10);
    }

    const deleted = await PracticeDailyLog.destroy({ where });

    res.json({
      success: true,
      student: { id: student.id, name: `${student.firstName} ${student.lastName}`.trim() },
      subjectId: subjectId ? parseInt(subjectId, 10) : null,
      deletedDailyLogs: deleted
    });
  } catch (error) {
    console.error('Clear student streak error:', error);
    res.status(500).json({ error: 'Не удалось очистить стрик' });
  }
};

exports.migratePracticeStats = async (req, res) => {
  try {
    const { studentId, subjectId } = req.body;
    const sid = studentId != null && studentId !== '' ? parseInt(studentId, 10) : null;
    const subId = subjectId != null && subjectId !== '' ? parseInt(subjectId, 10) : null;

    if (sid) {
      const student = await User.findByPk(sid, { attributes: ['id', 'role', 'firstName', 'lastName'] });
      if (!student || student.role !== 'student') {
        return res.status(404).json({ error: 'Ученик не найден' });
      }
    }

    if (subId) {
      const subject = await Subject.findByPk(subId, { attributes: ['id', 'name'] });
      if (!subject) {
        return res.status(404).json({ error: 'Предмет не найден' });
      }
    }

    const result = await migratePracticeStatsFromAttempts({
      studentId: sid,
      subjectId: subId
    });

    res.json({
      success: true,
      scope: {
        studentId: sid,
        subjectId: subId
      },
      ...result
    });
  } catch (error) {
    console.error('Migrate practice stats error:', error);
    const status = error?.code === 'MIGRATE_ALREADY_DONE' ? 409 : 500;
    res.status(status).json({
      error: error?.code === 'MIGRATE_ALREADY_DONE'
        ? 'Повторный перенос невозможен'
        : 'Не удалось перенести статистику',
      details: error?.message || String(error)
    });
  }
};

exports.rebuildPracticeStats = async (req, res) => {
  try {
    const { studentId, subjectId } = req.body;
    const sid = studentId != null && studentId !== '' ? parseInt(studentId, 10) : null;
    const subId = subjectId != null && subjectId !== '' ? parseInt(subjectId, 10) : null;

    if (sid) {
      const student = await User.findByPk(sid, { attributes: ['id', 'role', 'firstName', 'lastName'] });
      if (!student || student.role !== 'student') {
        return res.status(404).json({ error: 'Ученик не найден' });
      }
    }

    if (subId) {
      const subject = await Subject.findByPk(subId, { attributes: ['id', 'name'] });
      if (!subject) {
        return res.status(404).json({ error: 'Предмет не найден' });
      }
    }

    const result = await rebuildPracticeStatsFromResults({
      studentId: sid,
      subjectId: subId
    });

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.json({
      success: true,
      scope: {
        studentId: sid,
        subjectId: subId
      },
      ...result
    });
  } catch (error) {
    console.error('Rebuild practice stats error:', error);
    res.status(500).json({
      error: 'Не удалось восстановить сводки',
      details: error?.message || String(error)
    });
  }
};
