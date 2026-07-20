const { isStaffRole } = require('../middleware/telegramAuth');
const { assertStudentCanAccessLesson, teacherCanManageLesson } = require('../middleware/lessonAccess');
const { touchAttendance } = require('../services/lessonAttendance');
const { getLessonState } = require('../services/lessonState');
const { submitPollAnswer, submitQuizAnswer, LessonActionError } = require('../services/lessonActivities');
const { setLessonIo } = require('../services/lessonRealtime');

const activeStudentSockets = new Map();
const keyFor = (lessonId, userId) => `${lessonId}:${userId}`;

function emitError(socket, error) {
  socket.emit('error', {
    code: error.code || 'LESSON_ERROR',
    message: error.message || 'Ошибка занятия'
  });
}

function setupLessonSocket(io) {
  setLessonIo(io);

  io.on('connection', (socket) => {
    const user = socket.data.dbUser;
    if (!user) return;
    if (user.role === 'student') socket.join(`student-lessons-${user.id}`);

    socket.on('student:join-lesson', async ({ lessonId, forceReconnect } = {}) => {
      try {
        const access = await assertStudentCanAccessLesson(lessonId, user.id);
        if (!access.ok) throw new LessonActionError(access.message, access.status, 'NO_ACCESS');
        const key = keyFor(lessonId, user.id);
        const existingId = activeStudentSockets.get(key);
        if (existingId && existingId !== socket.id && !forceReconnect) {
          throw new LessonActionError('Занятие уже открыто на другом устройстве', 409, 'ALREADY_CONNECTED');
        }
        if (existingId && existingId !== socket.id && forceReconnect) io.sockets.sockets.get(existingId)?.disconnect(true);
        activeStudentSockets.set(key, socket.id);
        socket.data.lessonId = Number(lessonId);
        socket.join(`lesson-${lessonId}`);
        const attendance = await touchAttendance(lessonId, user.id, 'open');
        const state = await getLessonState(lessonId, user.id);
        socket.emit('lesson:state', state);
        io.to(`lesson-${lessonId}-admin`).emit('attendance:updated', { attendance });
      } catch (error) {
        emitError(socket, error);
      }
    });

    socket.on('student:request-state', async ({ lessonId } = {}) => {
      try {
        const access = await assertStudentCanAccessLesson(lessonId, user.id);
        if (!access.ok) throw new LessonActionError(access.message, access.status, 'NO_ACCESS');
        socket.emit('lesson:state', await getLessonState(lessonId, user.id));
      } catch (error) { emitError(socket, error); }
    });

    socket.on('student:leave-lesson', ({ lessonId } = {}) => {
      socket.leave(`lesson-${lessonId}`);
      const key = keyFor(lessonId, user.id);
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
        const result = await submitPollAnswer({ pollId, optionId, userId: user.id });
        socket.emit('poll:answer-accepted', { pollId: Number(pollId), optionId: Number(optionId) });
        io.to(`lesson-${result.lessonId}-admin`).emit('poll:results-updated', result.results);
        io.to(`lesson-${result.lessonId}-admin`).emit('attendance:updated', { attendance: result.attendance });
      } catch (error) { emitError(socket, error); }
    });

    socket.on('student:submit-quiz-answer', async ({ quizId, questionId, selectedAnswer } = {}) => {
      try {
        const result = await submitQuizAnswer({ quizId, questionId, selectedAnswer, userId: user.id });
        socket.emit('quiz:answer-accepted', { quizId: Number(quizId), questionId: Number(questionId), answer: result.answer });
        io.to(`lesson-${result.lessonId}-admin`).emit('quiz:answer-received', {
          quizId: Number(quizId), questionId: Number(questionId), userId: user.id
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
