let ioInstance = null;

function setLessonIo(io) {
  ioInstance = io;
}

function getLessonIo() {
  return ioInstance;
}

// Событие занятия почти всегда означает смену состояния, которое ученики
// сейчас же запросят. Сбрасываем общий кэш здесь, а не в каждом роуте: иначе
// один забытый вызов раздал бы всей комнате устаревший экран.
// Инвалидатор передаётся снаружи, чтобы этот модуль не зависел от lessonState.
let invalidateState = null;

function setStateInvalidator(fn) {
  invalidateState = fn;
}

function emitToLesson(lessonId, event, payload) {
  if (event.startsWith('quiz:') || event.startsWith('poll:')) invalidateState?.(lessonId);
  ioInstance?.to(`lesson-${lessonId}`).emit(event, payload);
}

function emitToLessonAdmins(lessonId, event, payload) {
  ioInstance?.to(`lesson-${lessonId}-admin`).emit(event, payload);
}

function emitToStudents(userIds, event, payload) {
  if (!ioInstance) return;
  [...new Set(userIds.map(Number))].forEach((userId) => {
    ioInstance.to(`student-lessons-${userId}`).emit(event, payload);
  });
}

module.exports = {
  setLessonIo, setStateInvalidator, getLessonIo, emitToLesson, emitToLessonAdmins, emitToStudents
};
