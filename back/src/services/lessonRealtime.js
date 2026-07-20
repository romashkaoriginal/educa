let ioInstance = null;

function setLessonIo(io) {
  ioInstance = io;
}

function getLessonIo() {
  return ioInstance;
}

function emitToLesson(lessonId, event, payload) {
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

module.exports = { setLessonIo, getLessonIo, emitToLesson, emitToLessonAdmins, emitToStudents };
