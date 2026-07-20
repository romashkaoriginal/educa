const { LessonAttendance } = require('../models');

async function touchAttendance(lessonId, userId, action = 'action') {
  const now = new Date();
  const [attendance] = await LessonAttendance.findOrCreate({
    where: { lessonId, userId },
    defaults: { lessonId, userId, joinedAt: now, lastActionAt: now }
  });
  const update = { lastActionAt: now };
  if (action === 'open' && !attendance.openedScreenAt) update.openedScreenAt = now;
  if (action === 'stream' && !attendance.clickedStreamAt) update.clickedStreamAt = now;
  if (action !== 'open' && action !== 'stream' && !attendance.firstAnswerAt) update.firstAnswerAt = now;

  const opened = attendance.openedScreenAt || update.openedScreenAt;
  const interacted = attendance.clickedStreamAt || update.clickedStreamAt || attendance.firstAnswerAt || update.firstAnswerAt;
  update.present = Boolean(opened && interacted);
  await attendance.update(update);
  return attendance.reload();
}

module.exports = { touchAttendance };
