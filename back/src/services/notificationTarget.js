class NotificationTargetError extends Error {
  constructor(message) {
    super(message);
    this.name = 'NotificationTargetError';
  }
}

function parseNotificationTarget(body = {}) {
  const { mode, studentId, filters } = body;

  if (!['single', 'filter'].includes(mode)) {
    throw new NotificationTargetError('Укажите режим отправки: одному получателю или по фильтрам');
  }

  if (mode === 'single') {
    const parsedStudentId = Number(studentId);
    if (!Number.isInteger(parsedStudentId) || parsedStudentId <= 0) {
      throw new NotificationTargetError('Выберите одного ученика');
    }
    if (filters != null) {
      throw new NotificationTargetError('Для отправки одному ученику нельзя передавать массовые фильтры');
    }
    return { mode, studentId: parsedStudentId, filters: null };
  }

  if (studentId != null) {
    throw new NotificationTargetError('Для массовой отправки нельзя передавать отдельного ученика');
  }
  if (filters != null && (typeof filters !== 'object' || Array.isArray(filters))) {
    throw new NotificationTargetError('Некорректные фильтры получателей');
  }

  return { mode, studentId: null, filters: filters || {} };
}

module.exports = { NotificationTargetError, parseNotificationTarget };
