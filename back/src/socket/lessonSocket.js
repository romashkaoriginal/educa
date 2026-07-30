const { isStaffRole } = require('../middleware/telegramAuth');
const { teacherCanManageLesson } = require('../middleware/lessonAccess');
const { User } = require('../models');
const { touchAttendance } = require('../services/lessonAttendance');
const { getLessonState } = require('../services/lessonState');
const { requireLiveAccess, submitPollAnswer, submitQuizAnswer, LessonActionError } = require('../services/lessonActivities');
const { setLessonIo } = require('../services/lessonRealtime');

const activeStudentSockets = new Map();
const keyFor = (lessonId, userId) => `${lessonId}:${userId}`;

function emitError(socket, error) {
  socket.emit('error', {
    code: error.code || 'LESSON_ERROR',
    message: error.message || 'Ошибка занятия'
  });
}

async function resolveStudentId(user, requestedStudentId) {
  const requested = Number(requestedStudentId || user.id);
  if (requested === Number(user.id)) return requested;
  if (!isStaffRole(user.role)) {
    throw new LessonActionError('Нет доступа к данным ученика', 403, 'NO_ACCESS');
  }
  const student = await User.findOne({
    where: { id: requested, role: 'student', isActive: true },
    attributes: ['id']
  });
  if (!student) throw new LessonActionError('Ученик не найден', 404, 'NO_ACCESS');
  return Number(student.id);
}

function setupLessonSocket(io) {
  setLessonIo(io);

  io.on('connection', (socket) => {
    const user = socket.data.dbUser;
    if (!user) return;
    if (user.role === 'student') socket.join(`student-lessons-${user.id}`);

    socket.on('student:subscribe-lessons', async ({ studentId } = {}) => {
      try {
        const effectiveUserId = await resolveStudentId(user, studentId);
        socket.data.lessonStudentId = effectiveUserId;
        socket.join(`student-lessons-${effectiveUserId}`);
      } catch (error) { emitError(socket, error); }
    });

    socket.on('student:join-lesson', async ({ lessonId, studentId, forceReconnect } = {}) => {
      try {
        const effectiveUserId = await resolveStudentId(user, studentId || socket.data.lessonStudentId);
        await requireLiveAccess(lessonId, effectiveUserId);
        const key = keyFor(lessonId, effectiveUserId);
        const existingId = activeStudentSockets.get(key);
        if (existingId && existingId !== socket.id && !forceReconnect) {
          throw new LessonActionError('Занятие уже открыто на другом устройстве', 409, 'ALREADY_CONNECTED');
        }
        if (existingId && existingId !== socket.id && forceReconnect) io.sockets.sockets.get(existingId)?.disconnect(true);
        activeStudentSockets.set(key, socket.id);
        socket.data.lessonId = Number(lessonId);
        socket.data.lessonStudentId = effectiveUserId;
        socket.join(`lesson-${lessonId}`);
        const attendance = await touchAttendance(lessonId, effectiveUserId, 'open');
        const state = await getLessonState(lessonId, effectiveUserId);
        socket.emit('lesson:state', state);
        io.to(`lesson-${lessonId}-admin`).emit('attendance:updated', { attendance });
      } catch (error) {
        emitError(socket, error);
      }
    });

    socket.on('student:request-state', async ({ lessonId, studentId } = {}) => {
      try {
        const effectiveUserId = await resolveStudentId(user, studentId || socket.data.lessonStudentId);
        await requireLiveAccess(lessonId, effectiveUserId);
        socket.emit('lesson:state', await getLessonState(lessonId, effectiveUserId));
      } catch (error) { emitError(socket, error); }
    });

    socket.on('student:leave-lesson', ({ lessonId } = {}) => {
      socket.leave(`lesson-${lessonId}`);
      const key = keyFor(lessonId, socket.data.lessonStudentId || user.id);
      if (activeStudentSockets.get(key) === socket.id) activeStudentSockets.delete(key);
    });

    socket.on('admin:join-lesson', async ({ lessonId } = {}) => {
      try {
        if (!isStaffRole(user.role) || !(await teacherCanManageLesson(user, lessonId))) {
          throw new LessonActionError('Нет прав на занятие', 403, 'NO_ACCESS');
        }
        socket.join(`lesson-${lessonId}`);
        socket.join(`lesson-${lessonId}-admin`);
        socket.emit('lesson:admin-joined', { lessonId: Number(lessonId) });
      } catch (error) { emitError(socket, error); }
    });

    socket.on('student:submit-poll-answer', async ({ pollId, optionId } = {}) => {
      try {
        const effectiveUserId = socket.data.lessonStudentId || user.id;
        const result = await submitPollAnswer({ pollId, optionId, userId: effectiveUserId });
        socket.emit('poll:answer-accepted', { pollId: Number(pollId), optionId: Number(optionId) });
        io.to(`lesson-${result.lessonId}-admin`).emit('poll:results-updated', result.results);
        io.to(`lesson-${result.lessonId}-admin`).emit('attendance:updated', { attendance: result.attendance });
      } catch (error) { emitError(socket, error); }
    });

    socket.on('student:submit-quiz-answer', async ({ quizId, questionId, selectedAnswer } = {}) => {
      try {
        const effectiveUserId = socket.data.lessonStudentId || user.id;
        const result = await submitQuizAnswer({ quizId, questionId, selectedAnswer, userId: effectiveUserId });
        socket.emit('quiz:answer-accepted', { quizId: Number(quizId), questionId: Number(questionId), answer: result.answer });
        io.to(`lesson-${result.lessonId}-admin`).emit('quiz:answer-received', {
          quizId: Number(quizId), questionId: Number(questionId), userId: effectiveUserId
        });
        io.to(`lesson-${result.lessonId}-admin`).emit('attendance:updated', { attendance: result.attendance });
      } catch (error) { emitError(socket, error); }
    });

    socket.on('disconnect', () => {
      for (const [key, socketId] of activeStudentSockets.entries()) {
        if (socketId === socket.id) activeStudentSockets.delete(key);
      }
    });
  });
}

module.exports = setupLessonSocket;
module.exports.getConnectedStudentCount = (lessonId) => {
  const prefix = `${Number(lessonId)}:`;
  return [...activeStudentSockets.keys()].filter((key) => key.startsWith(prefix)).length;
};
