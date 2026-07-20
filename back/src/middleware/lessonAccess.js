const { Op } = require('sequelize');
const {
  UserSubject, Group, GroupStudent, TeacherSubject, Lesson, LessonGroup
} = require('../models');

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

async function getAccessibleGroupIds(userId) {
  const subjectIds = await getAccessibleSubjectIds(userId);
  if (!subjectIds.length) return [];
  const memberships = await GroupStudent.findAll({
    where: { userId },
    include: [{
      model: Group,
      as: 'group',
      required: true,
      where: { isActive: true, subjectId: { [Op.in]: subjectIds } },
      attributes: []
    }],
    attributes: ['groupId'],
    raw: true
  });
  return memberships.map((row) => Number(row.groupId));
}

async function assertStudentCanAccessLesson(lessonId, userId) {
  const lesson = await Lesson.findByPk(lessonId, { attributes: ['id', 'subjectId'] });
  if (!lesson) return { ok: false, status: 404, message: 'Занятие не найдено' };

  const subjectIds = await getAccessibleSubjectIds(userId);
  if (!subjectIds.includes(Number(lesson.subjectId))) {
    return { ok: false, status: 403, message: 'Нет доступа к предмету занятия' };
  }

  const groupIds = await getAccessibleGroupIds(userId);
  if (!groupIds.length) return { ok: false, status: 403, message: 'Нет доступа к группе занятия' };
  const linked = await LessonGroup.count({
    where: { lessonId: lesson.id, groupId: { [Op.in]: groupIds } }
  });
  return linked
    ? { ok: true, lesson }
    : { ok: false, status: 403, message: 'Занятие назначено другой группе' };
}

async function teacherCanManageLesson(user, lessonId) {
  if (!user) return false;
  if (user.role === 'admin') return true;
  if (user.role !== 'teacher') return false;
  const lesson = await Lesson.findByPk(lessonId, { attributes: ['id', 'teacherId'] });
  if (!lesson) return false;
  if (Number(lesson.teacherId) === Number(user.id)) return true;
  const groupLinks = await LessonGroup.findAll({ where: { lessonId }, attributes: ['groupId'], raw: true });
  if (!groupLinks.length) return false;
  return Boolean(await TeacherSubject.count({
    where: { teacherId: user.id, groupId: { [Op.in]: groupLinks.map((row) => row.groupId) } }
  }));
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

async function validateGroupStudent(groupId, userId) {
  const group = await Group.findByPk(groupId);
  if (!group || !group.isActive) return { ok: false, message: 'Группа не найдена или неактивна' };
  const access = await UserSubject.findOne({
    where: { userId, subjectId: group.subjectId, ...activeAccessWhere() }
  });
  return access
    ? { ok: true, group }
    : { ok: false, message: 'У ученика нет действующего доступа к предмету группы' };
}

module.exports = {
  activeAccessWhere,
  getAccessibleSubjectIds,
  getAccessibleGroupIds,
  assertStudentCanAccessLesson,
  teacherCanManageLesson,
  assertTeacherOwnsLesson,
  validateGroupStudent
};
