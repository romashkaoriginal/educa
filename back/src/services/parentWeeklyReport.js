const { Op } = require('sequelize');
const {
  Homework,
  HomeworkSubmission,
  Lesson,
  PracticeDailyStats,
  PracticeAttempt,
  PracticeQuestion,
  PracticeTopic,
} = require('../models');
const { calcTopicProgress } = require('./predictedScore');

const DAY_MS = 24 * 60 * 60 * 1000;
const TWO_DAYS_MS = 2 * DAY_MS;
const MINSK_OFFSET = '+03:00';
const MANAGER_CONTACT_URL = 'https://t.me/kubik_ct';

function getManagerContactKeyboard() {
  return {
    inline_keyboard: [[{
      text: 'Связаться с менеджером',
      url: MANAGER_CONTACT_URL
    }]]
  };
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function minskDateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Minsk',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    date: `${value.year}-${value.month}-${value.day}`,
    hour: Number(value.hour),
    minute: Number(value.minute)
  };
}

function shiftDateOnly(dateOnly, days) {
  const date = new Date(`${dateOnly}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function dateOnlyToUtc(dateOnly) {
  return new Date(`${dateOnly}T00:00:00${MINSK_OFFSET}`);
}

function getPreviousWeekPeriod(now = new Date()) {
  const currentDate = minskDateParts(now).date;
  const dayOfWeek = new Date(`${currentDate}T00:00:00Z`).getUTCDay();
  const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const thisMonday = shiftDateOnly(currentDate, -daysSinceMonday);
  const startDate = shiftDateOnly(thisMonday, -7);
  const endDate = shiftDateOnly(thisMonday, -1);
  const nextEndDate = shiftDateOnly(thisMonday, 7);
  return {
    startDate,
    endDate,
    startUtc: dateOnlyToUtc(startDate),
    endExclusiveUtc: dateOnlyToUtc(thisMonday),
    nextStartUtc: dateOnlyToUtc(thisMonday),
    nextEndExclusiveUtc: dateOnlyToUtc(nextEndDate)
  };
}

function getPreviousMonthPeriod(now = new Date()) {
  const currentDate = minskDateParts(now).date;
  const [year, month] = currentDate.split('-').map(Number);
  const thisMonthDate = new Date(Date.UTC(year, month - 1, 1));
  const previousMonthDate = new Date(Date.UTC(year, month - 2, 1));
  const nextMonthDate = new Date(Date.UTC(year, month, 1));
  const thisMonth = thisMonthDate.toISOString().slice(0, 10);
  const startDate = previousMonthDate.toISOString().slice(0, 10);
  const endDate = shiftDateOnly(thisMonth, -1);
  return {
    startDate,
    endDate,
    startUtc: dateOnlyToUtc(startDate),
    endExclusiveUtc: dateOnlyToUtc(thisMonth),
    nextStartUtc: dateOnlyToUtc(thisMonth),
    nextEndExclusiveUtc: dateOnlyToUtc(nextMonthDate.toISOString().slice(0, 10))
  };
}

function getForcedPeriod(reportType, now = new Date()) {
  const currentDate = minskDateParts(now).date;
  const endDate = currentDate;
  let startDate;
  if (reportType === 'weekly') {
    startDate = shiftDateOnly(currentDate, -6);
  } else {
    const [year, month, day] = currentDate.split('-').map(Number);
    const previousMonthSameDay = new Date(Date.UTC(year, month - 2, day));
    startDate = shiftDateOnly(previousMonthSameDay.toISOString().slice(0, 10), 1);
  }
  const nextStartDate = shiftDateOnly(endDate, 1);
  const nextEndDate = reportType === 'weekly'
    ? shiftDateOnly(nextStartDate, 7)
    : shiftDateOnly(nextStartDate, 30);
  return {
    startDate,
    endDate,
    startUtc: dateOnlyToUtc(startDate),
    endExclusiveUtc: dateOnlyToUtc(nextStartDate),
    nextStartUtc: dateOnlyToUtc(nextStartDate),
    nextEndExclusiveUtc: dateOnlyToUtc(nextEndDate)
  };
}

function getUpcomingWeekSchedulePeriod(now = new Date()) {
  const currentDate = minskDateParts(now).date;
  const dayOfWeek = new Date(`${currentDate}T00:00:00Z`).getUTCDay();
  const daysUntilMonday = dayOfWeek === 1 ? 7 : (8 - dayOfWeek) % 7;
  const startDate = shiftDateOnly(currentDate, daysUntilMonday);
  const endDate = shiftDateOnly(startDate, 7);
  return {
    startUtc: dateOnlyToUtc(startDate),
    endExclusiveUtc: dateOnlyToUtc(endDate)
  };
}

function getUpcomingMonthSchedulePeriod(now = new Date()) {
  const currentDate = minskDateParts(now).date;
  const [year, month] = currentDate.split('-').map(Number);
  const startDate = new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);
  const endDate = new Date(Date.UTC(year, month + 1, 1)).toISOString().slice(0, 10);
  return {
    startUtc: dateOnlyToUtc(startDate),
    endExclusiveUtc: dateOnlyToUtc(endDate)
  };
}

function periodDayCount(period) {
  return Math.max(1, Math.round((period.endExclusiveUtc - period.startUtc) / DAY_MS));
}

function isSubjectAccessActive(subject, now = new Date()) {
  const access = subject?.UserSubject;
  if (!access || access.isActive === false) return false;
  if (access.accessStartDate && new Date(access.accessStartDate) > now) return false;
  if (access.accessEndDate && new Date(access.accessEndDate) <= now) return false;
  return true;
}

function submissionPercent(submission) {
  const maxScore = Number(submission?.maxScore || 0);
  if (maxScore <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((Number(submission.totalScore || 0) / maxScore) * 100)));
}

function classifyHomework(homework, submissions, reportCreatedAt) {
  const deadline = homework.closeDate ? new Date(homework.closeDate) : null;
  const qualifying = submissions.filter((submission) => {
    if (!deadline) return true;
    return new Date(submission.submittedAt) <= deadline;
  });

  if (qualifying.length) {
    const best = qualifying.reduce((current, item) => (
      submissionPercent(item) > submissionPercent(current) ? item : current
    ));
    return { status: 'completed', percent: submissionPercent(best) };
  }

  const publishedAt = new Date(homework.openDate);
  const olderThanTwoDays = reportCreatedAt.getTime() - publishedAt.getTime() > TWO_DAYS_MS;
  const deadlineExpired = deadline && deadline < reportCreatedAt;
  if (olderThanTwoDays || deadlineExpired) return { status: 'not_completed', percent: null };
  return { status: 'pending', percent: null };
}

function formatDateRange(startDate, endDate) {
  const formatter = new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Europe/Minsk', day: 'numeric', month: 'long'
  });
  return `${formatter.format(dateOnlyToUtc(startDate))} — ${formatter.format(dateOnlyToUtc(endDate))}`;
}

function formatLessonDate(date) {
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Europe/Minsk',
    day: 'numeric',
    month: 'long'
  }).format(new Date(date));
}

function formatLessonTime(date) {
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Europe/Minsk',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).format(new Date(date));
}

function splitTelegramText(text, limit = 3900) {
  if (text.length <= limit) return [text];
  const chunks = [];
  let current = '';
  for (const line of text.split('\n')) {
    const candidate = current ? `${current}\n${line}` : line;
    if (candidate.length <= limit) {
      current = candidate;
      continue;
    }
    if (current) chunks.push(current);
    current = line;
  }
  if (current) chunks.push(current);
  return chunks;
}

function classifyPracticeTopics(topics, attempts) {
  if (!attempts.length) {
    return { hasPractice: false, strongPracticeTopics: [], weakPracticeTopics: [] };
  }

  // Берём последний ответ на каждое задание только в пределах отчётного
  // периода. Так повторное решение не искажает результат, как и в статистике.
  const latestByQuestion = new Map();
  attempts.forEach((attempt) => latestByQuestion.set(attempt.questionId, attempt));
  const resultsByTopic = new Map();
  latestByQuestion.forEach((attempt) => {
    const results = resultsByTopic.get(attempt.topicId) || [];
    results.push({ difficulty: attempt.question?.difficulty || 'medium', isCorrect: attempt.isCorrect });
    resultsByTopic.set(attempt.topicId, results);
  });

  const topicProgress = topics.map((topic) => {
    const results = resultsByTopic.get(topic.id) || [];
    return {
      name: topic.name,
      attempts: results.length,
      percent: calcTopicProgress(results)
    };
  }).filter((topic) => topic.attempts > 0);

  return {
    hasPractice: true,
    strongPracticeTopics: [...topicProgress]
      .filter((topic) => topic.percent >= 60)
      .sort((a, b) => b.percent - a.percent || b.attempts - a.attempts)
      .slice(0, 3),
    weakPracticeTopics: topicProgress
      .filter((topic) => topic.percent < 70)
      .sort((a, b) => a.percent - b.percent || b.attempts - a.attempts)
      .slice(0, 3)
  };
}

async function buildSubjectReport({
  studentId,
  subject,
  period,
  schedulePeriod = period,
  reportCreatedAt = new Date(),
  includePracticeTopicStrengths = true
}) {
  const lessons = await Lesson.findAll({
    where: {
      subjectId: subject.id,
      [Op.or]: [
        {
          status: 'finished',
          finishedAt: { [Op.gte]: period.startUtc, [Op.lt]: period.endExclusiveUtc }
        },
        {
          // Занятия в расписании иногда остаются в статусе scheduled после
          // фактической даты. Для отчёта это не должно превращаться в
          // «занятий не было». Отменённые занятия намеренно исключены.
          status: { [Op.in]: ['scheduled', 'live', 'finished'] },
          scheduledAt: {
            [Op.gte]: period.startUtc,
            [Op.lt]: period.endExclusiveUtc,
            [Op.lte]: reportCreatedAt
          }
        }
      ]
    },
    attributes: ['topic'],
    order: [['finishedAt', 'ASC'], ['scheduledAt', 'ASC']]
  });
  const passedTopics = [...new Set(lessons.map((lesson) => lesson.topic?.trim()).filter(Boolean))];

  const homeworks = await Homework.findAll({
    where: {
      subjectId: subject.id,
      openDate: { [Op.gte]: period.startUtc, [Op.lt]: period.endExclusiveUtc }
    },
    attributes: ['id', 'title', 'openDate', 'closeDate'],
    order: [['openDate', 'ASC']]
  });
  const homeworkIds = homeworks.map((homework) => homework.id);
  const submissions = homeworkIds.length
    ? await HomeworkSubmission.findAll({
        where: { userId: studentId, homeworkId: { [Op.in]: homeworkIds } },
        attributes: ['homeworkId', 'totalScore', 'maxScore', 'submittedAt']
      })
    : [];
  const submissionsByHomework = new Map();
  submissions.forEach((submission) => {
    const list = submissionsByHomework.get(submission.homeworkId) || [];
    list.push(submission);
    submissionsByHomework.set(submission.homeworkId, list);
  });
  const homeworkResults = homeworks.map((homework) => ({
    id: homework.id,
    title: homework.title,
    ...classifyHomework(homework, submissionsByHomework.get(homework.id) || [], reportCreatedAt)
  }));

  const practiceRows = await PracticeDailyStats.findAll({
    where: {
      studentId,
      subjectId: subject.id,
      date: { [Op.between]: [period.startDate, period.endDate] }
    },
    attributes: ['attempts']
  });
  const practiceTotal = practiceRows.reduce((sum, row) => sum + Number(row.attempts || 0), 0);

  const [practiceTopics, practiceAttempts] = includePracticeTopicStrengths
    ? await Promise.all([
        PracticeTopic.findAll({
          where: { subjectId: subject.id, isActive: true },
          attributes: ['id', 'name', 'icon']
        }),
        PracticeAttempt.findAll({
          where: {
            studentId,
            subjectId: subject.id,
            createdAt: { [Op.gte]: period.startUtc, [Op.lt]: period.endExclusiveUtc }
          },
          attributes: ['topicId', 'questionId', 'isCorrect', 'createdAt'],
          include: [{ model: PracticeQuestion, as: 'question', attributes: ['difficulty'] }],
          order: [['createdAt', 'ASC']]
        })
      ])
    : [[], []];
  const { hasPractice, strongPracticeTopics, weakPracticeTopics } = classifyPracticeTopics(
    practiceTopics.map((topic) => topic.toJSON()),
    practiceAttempts.map((attempt) => attempt.toJSON())
  );

  const nextLessons = await Lesson.findAll({
    where: {
      subjectId: subject.id,
      status: 'scheduled',
      fromSchedule: true,
      scheduledAt: { [Op.gte]: schedulePeriod.startUtc, [Op.lt]: schedulePeriod.endExclusiveUtc }
    },
    attributes: ['topic', 'scheduledAt'],
    order: [['scheduledAt', 'ASC']]
  });
  const nextSchedule = nextLessons
    .map((lesson) => ({ topic: lesson.topic?.trim(), scheduledAt: lesson.scheduledAt }))
    .filter((lesson) => lesson.topic && lesson.scheduledAt);

  return {
    passedTopics,
    homeworkResults,
    practiceTotal,
    hasPractice,
    strongPracticeTopics,
    weakPracticeTopics,
    nextSchedule
  };
}

function formatSubjectReport(subject, report, { reportType = 'weekly', days = 7 } = {}) {
  const homeworkLines = report.homeworkResults.length
    ? report.homeworkResults.map((homework) => {
        if (homework.status === 'completed') return `✅ ${escapeHtml(homework.title)} — выполнена, ${homework.percent}% правильных ответов`;
        if (homework.status === 'not_completed') return `❌ ${escapeHtml(homework.title)} — не выполнена`;
        return `⏳ ${escapeHtml(homework.title)} — ожидает выполнения`;
      })
    : ['— домашних заданий не публиковалось'];
  const average = (report.practiceTotal / days).toFixed(1).replace('.', ',');
  const periodLabel = reportType === 'monthly' ? 'Темы месяца' : 'Темы недели';
  const nextPeriodLabel = reportType === 'monthly' ? 'Расписание на следующий месяц' : 'Расписание на следующую неделю';
  const practiceTopics = reportType === 'weekly'
    ? [
        '',
        '<b>Сильные темы</b>',
        !report.hasPractice
          ? 'Будут доступны, когда ученик будет решать практику'
          : report.strongPracticeTopics?.length
          ? report.strongPracticeTopics.map((topic) => `• ${escapeHtml(topic.name)} — ${topic.percent}% (${topic.attempts} задач)`).join('\n')
          : '— недостаточно данных',
        '',
        '<b>Слабые темы</b>',
        !report.hasPractice
          ? 'Будут доступны, когда ученик будет решать практику'
          : report.weakPracticeTopics?.length
          ? report.weakPracticeTopics.map((topic) => `• ${escapeHtml(topic.name)} — ${topic.percent}% (${topic.attempts} задач)`).join('\n')
          : '— недостаточно данных'
      ]
    : [];

  return [
    `${escapeHtml(subject.icon || '📘')} <b>${escapeHtml(subject.name)}</b>`,
    '',
    `<b>${periodLabel}</b>`,
    report.passedTopics.length ? report.passedTopics.map((topic) => `• ${escapeHtml(topic)}`).join('\n') : '— занятий не было',
    '',
    '<b>Домашние задания</b>',
    homeworkLines.join('\n'),
    '',
    '<b>Практика</b>',
    `Решено задач: <b>${report.practiceTotal}</b>`,
    `Среднее за день: <b>${average}</b>`,
    ...practiceTopics,
    '',
    `<b>${nextPeriodLabel}</b>`,
    report.nextSchedule.length
      ? report.nextSchedule.map((lesson) => reportType === 'monthly'
        ? `• ${escapeHtml(formatLessonDate(lesson.scheduledAt))} — ${escapeHtml(formatLessonTime(lesson.scheduledAt))}`
        : `• ${escapeHtml(formatLessonDate(lesson.scheduledAt))} — ${escapeHtml(formatLessonTime(lesson.scheduledAt))} — ${escapeHtml(lesson.topic)}`).join('\n')
      : '— расписание пока не заполнено'
  ].join('\n');
}

async function buildReportMessages({ student, subjects, reportType = 'weekly', now = new Date() }) {
  const period = reportType === 'monthly' ? getPreviousMonthPeriod(now) : getPreviousWeekPeriod(now);
  const schedulePeriod = reportType === 'monthly'
    ? getUpcomingMonthSchedulePeriod(now)
    : getUpcomingWeekSchedulePeriod(now);
  const studentName = [student.firstName, student.lastName].filter(Boolean).join(' ');
  const title = reportType === 'monthly' ? 'Ежемесячный отчёт' : 'Еженедельный отчёт';
  const messages = [
    `📊 <b>${title}</b>\nУченик: <b>${escapeHtml(studentName)}</b>\nПериод: ${formatDateRange(period.startDate, period.endDate)}`
  ];
  for (const subject of subjects) {
    const report = await buildSubjectReport({
      studentId: student.id,
      subject,
      period,
      schedulePeriod,
      reportCreatedAt: now,
      includePracticeTopicStrengths: reportType === 'weekly'
    });
    messages.push(...splitTelegramText(formatSubjectReport(subject, report, {
      reportType,
      days: periodDayCount(period)
    })));
  }
  return { period, messages };
}

function buildWeeklyReportMessages(options) {
  return buildReportMessages({ ...options, reportType: 'weekly' });
}

function buildMonthlyReportMessages(options) {
  return buildReportMessages({ ...options, reportType: 'monthly' });
}

module.exports = {
  TWO_DAYS_MS,
  MANAGER_CONTACT_URL,
  getManagerContactKeyboard,
  minskDateParts,
  getPreviousWeekPeriod,
  getPreviousMonthPeriod,
  getForcedPeriod,
  periodDayCount,
  getUpcomingWeekSchedulePeriod,
  getUpcomingMonthSchedulePeriod,
  isSubjectAccessActive,
  submissionPercent,
  classifyHomework,
  classifyPracticeTopics,
  splitTelegramText,
  buildSubjectReport,
  formatSubjectReport,
  buildReportMessages,
  buildWeeklyReportMessages,
  buildMonthlyReportMessages
};
