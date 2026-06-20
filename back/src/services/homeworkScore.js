const { Op } = require('sequelize');
const {
  Homework, HomeworkQuestion, HomeworkSubmission, HomeworkAnswer, UserSubject
} = require('../models');

// Веса коэффициентов домашки (ТЗ 5.7)
const K_DONE_WEIGHT = 0.4;
const K_CORRECT_WEIGHT = 0.6;
const HOMEWORK_MAX = 20;

// Пустой результат — когда у ученика по предмету нет доступных домашек (ТЗ 5.11)
function emptyHomework() {
  return {
    hasData: false,
    hTotal: 0,
    hDone: 0,
    qTotal: 0,
    qCorrect: 0,
    kDone: 0,
    kCorrect: 0,
    homeworkScore: 0,
    donePercent: 0,
    correctPercent: 0,
    incomplete: []
  };
}

// Расчёт баллов за домашку (0..20) по ТЗ раздел 5.
// Учитываются только домашки, доступные конкретному ученику:
//  • предмет открыт ученику;
//  • дата открытия наступила;
//  • домашка открылась не раньше подключения ученика к курсу.
// Для каждой домашки берётся лучшая попытка (ТЗ 5.10).
async function calculateHomeworkScore(studentId, subjectId) {
  const sid = parseInt(studentId, 10);
  const subId = parseInt(subjectId, 10);

  const userSubject = await UserSubject.findOne({
    where: { userId: sid, subjectId: subId },
    attributes: ['accessStartDate']
  });
  const accessStart = userSubject?.accessStartDate ? new Date(userSubject.accessStartDate) : null;
  const now = new Date();

  const allSubjectHomeworks = await Homework.findAll({
    where: { subjectId: subId, isActive: true },
    attributes: ['id', 'title', 'openDate'],
    include: [{ model: HomeworkQuestion, as: 'questions', attributes: ['id'] }]
  });
  const allSubjectHwIds = new Set(allSubjectHomeworks.map((h) => h.id));

  const submissions = await HomeworkSubmission.findAll({
    where: { userId: sid },
    attributes: ['id', 'homeworkId', 'totalScore']
  });

  const submittedHwIds = new Set(
    submissions.map((s) => s.homeworkId).filter((hwId) => allSubjectHwIds.has(hwId))
  );

  const homeworks = allSubjectHomeworks.filter((hw) => new Date(hw.openDate) <= now);

  // ТЗ 5.2: прошлые домашки до подключения не учитываются — кроме уже сданных учеником
  const availableByRule = homeworks.filter((hw) => {
    if (!accessStart) return true;
    if (submittedHwIds.has(hw.id)) return true;
    return new Date(hw.openDate) >= accessStart;
  });

  // Домашки с попыткой всегда входят в расчёт (в т.ч. закрытые по closeDate)
  const submittedExtra = submittedHwIds.size
    ? allSubjectHomeworks.filter((hw) => submittedHwIds.has(hw.id))
    : [];

  const availableMap = new Map();
  [...availableByRule, ...submittedExtra].forEach((hw) => availableMap.set(hw.id, hw));
  const available = [...availableMap.values()];

  if (available.length === 0) return emptyHomework();

  const hwIds = available.map((h) => h.id);
  const relevantSubmissions = submissions.filter((s) => hwIds.includes(s.homeworkId));

  // Лучшая попытка на каждую домашку (по набранному баллу)
  const bestByHw = {};
  relevantSubmissions.forEach((s) => {
    const cur = bestByHw[s.homeworkId];
    if (!cur || (s.totalScore || 0) > (cur.totalScore || 0)) {
      bestByHw[s.homeworkId] = s;
    }
  });

  const bestSubmissionIds = Object.values(bestByHw).map((s) => s.id);

  // Правильные ответы внутри лучших попыток
  const correctByHw = {};
  if (bestSubmissionIds.length) {
    const subToHw = {};
    Object.values(bestByHw).forEach((s) => { subToHw[s.id] = s.homeworkId; });

    const answers = await HomeworkAnswer.findAll({
      where: { submissionId: { [Op.in]: bestSubmissionIds }, isCorrect: true },
      attributes: ['submissionId']
    });
    answers.forEach((a) => {
      const hwId = subToHw[a.submissionId];
      if (hwId != null) correctByHw[hwId] = (correctByHw[hwId] || 0) + 1;
    });
  }

  let qTotal = 0;
  let qCorrect = 0;
  let hDone = 0;
  const incomplete = [];

  available.forEach((hw) => {
    const qCount = (hw.questions || []).length;
    qTotal += qCount; // ТЗ 5.6: все задания доступных домашек входят в Q_total
    if (bestByHw[hw.id]) {
      hDone += 1;
      qCorrect += correctByHw[hw.id] || 0;
    } else {
      incomplete.push({ id: hw.id, title: hw.title, questionCount: qCount });
    }
  });

  const hTotal = available.length;
  const kDone = hTotal > 0 ? hDone / hTotal : 0;
  const kCorrect = qTotal > 0 ? qCorrect / qTotal : 0;
  const homeworkScore = HOMEWORK_MAX * (K_DONE_WEIGHT * kDone + K_CORRECT_WEIGHT * kCorrect);

  return {
    hasData: true,
    hTotal,
    hDone,
    qTotal,
    qCorrect,
    kDone,
    kCorrect,
    homeworkScore, // не округлён — округляется при сложении итогового балла
    donePercent: Math.round(kDone * 100),
    correctPercent: Math.round(kCorrect * 100),
    incomplete
  };
}

module.exports = { calculateHomeworkScore, emptyHomework, HOMEWORK_MAX };
