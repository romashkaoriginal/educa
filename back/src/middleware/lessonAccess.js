const { Op } = require('sequelize');
const { UserSubject, TeacherSubject, Lesson } = require('../models');

const activeAccessWhere = (now = new Date()) => ({
  isActive: true,
  [Op.and]: [
    { [Op.or]: [{ accessStartDate: null }, { accessStartDate: { [Op.lte]: now } }] },
    { [Op.or]: [{ accessEndDate: null }, { accessEndDate: { [Op.gt]: now } }] }
  ]
});

async function getAccessibleSubjectIds(userId) {
  const rows = await UserSubject.findAll({
    where: { userId, ...activeAccessWhere() },
    attributes: ['subjectId'],
    raw: true
  });
  return rows.map((row) => Number(row.subjectId));
}

// ТЗ §3.1/§8.8, §8.15: занятия больше не привязываются к группам. Доступ ученика
// определяется исключительно действующим доступом к предмету занятия.
async function assertStudentCanAccessLesson(lessonId, userId) {
  const lesson = await Lesson.findByPk(lessonId, {
    attributes: ['id', 'subjectId', 'status', 'sessionEndsAt']
  });
  if (!lesson) return { ok: false, status: 404, message: 'Занятие не найдено' };

  const subjectIds = await getAccessibleSubjectIds(userId);
  return subjectIds.includes(Number(lesson.subjectId))
    ? { ok: true, lesson }
    : { ok: false, status: 403, message: 'Нет доступа к предмету занятия' };
}

// Преподаватель ведёт занятие своего предмета: либо он назначен на занятие явно,
// либо предмет занятия входит в его назначения (ТЗ §3.1 — преподаватель и предмет
// определяются автоматически, вручную их в расписании не выбирают).
async function getTeacherSubjectIds(teacherId) {
  const rows = await TeacherSubject.findAll({
    where: { teacherId }, attributes: ['subjectId'], raw: true
  });
  return [...new Set(rows.map((row) => Number(row.subjectId)))];
}

async function teacherCanManageLesson(user, lessonId) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  if (user.role !== 'teacher') return false;
  const lesson = await Lesson.findByPk(lessonId, { attributes: ['id', 'teacherId', 'subjectId'] });
  if (!lesson) return false;
  if (Number(lesson.teacherId) === Number(user.id)) return true;
  const subjectIds = await getTeacherSubjectIds(user.id);
  return subjectIds.includes(Number(lesson.subjectId));
}

const assertTeacherOwnsLesson = (paramName = 'id') => async (req, res, next) => {
  try {
    const lessonId = Number(req.params[paramName] || req.lessonId);
    if (!lessonId) return res.status(400).json({ message: 'Некорректный id занятия' });
    if (!(await teacherCanManageLesson(req.dbUser, lessonId))) {
      return res.status(403).json({ message: 'Нет прав на это занятие' });
    }
    req.lessonId = lessonId;
    next();
  } catch (error) {
    console.error('Lesson teacher access error:', error);
    res.status(500).json({ message: 'Ошибка проверки доступа' });
  }
};

module.exports = {
  activeAccessWhere,
  getAccessibleSubjectIds,
  getTeacherSubjectIds,
  assertStudentCanAccessLesson,
  teacherCanManageLesson,
  assertTeacherOwnsLesson
};
