const { Op } = require('sequelize');
const { buildLessonQuizLeaderboard } = require('./streamPresentation');
const {
  Lesson, Subject, User, LessonPoll, LessonPollOption, LessonPollAnswer,
  LessonQuiz, LessonQuizQuestion, LessonQuizAnswer, LessonQuizDelivery, LessonQuizParticipant, LessonQuestion, LessonMaterial,
  PracticeImage
} = require('../models');

// ТЗ §8.8: занятия не привязаны к группам, поэтому группы больше не подгружаются.
const lessonInclude = [
  { model: Subject, as: 'subject', attributes: ['id', 'name', 'icon'] },
  { model: User, as: 'teacher', attributes: ['id', 'firstName', 'lastName'] }
];

function stripQuestionAnswer(question, reveal = false) {
  const json = question && (question.toJSON ? question.toJSON() : { ...question });
  if (!json) return null;
  json.multiple = Array.isArray(json.correctAnswer) && json.correctAnswer.length > 1;
  if (!reveal) {
    delete json.correctAnswer;
    delete json.explanation;
    delete json.hintImageId;
    delete json.hintImage;
  }
  return json;
}

async function getPollResults(pollId) {
  const poll = await LessonPoll.findByPk(pollId, {
    include: [{ model: LessonPollOption, as: 'options', include: [{ model: LessonPollAnswer, as: 'answers' }] }]
  });
  if (!poll) return null;
  const total = (poll.options || []).reduce((sum, option) => sum + option.answers.length, 0);
  return {
    pollId: poll.id,
    total,
    options: (poll.options || []).sort((a, b) => a.order - b.order).map((option) => ({
      id: option.id,
      text: option.text,
      count: option.answers.length,
      percent: total ? Math.round((option.answers.length / total) * 100) : 0
    }))
  };
}

async function serializeActivePoll(lessonId, userId) {
  const poll = await LessonPoll.findOne({
    where: {
      lessonId,
      [Op.or]: [
        { status: 'active' },
        { status: 'closed', resultsRevealedAt: { [Op.not]: null } }
      ]
    },
    order: [['startedAt', 'DESC']],
    include: [{ model: LessonPollOption, as: 'options' }]
  });
  if (!poll) return null;
  const answer = await LessonPollAnswer.findOne({ where: { pollId: poll.id, userId } });
  const json = poll.toJSON();
  json.options.sort((a, b) => a.order - b.order);
  json.hasAnswered = Boolean(answer);
  json.myOptionId = answer?.optionId || null;
  if (json.showResultsToStudents && json.resultsRevealedAt) json.results = await getPollResults(poll.id);
  return json;
}

async function serializeActiveQuiz(lessonId, userId) {
  const quiz = await LessonQuiz.findOne({
    where: { lessonId, status: { [Op.in]: ['draft', 'active', 'finished'] } },
    order: [['startedAt', 'DESC']],
    include: [{
      model: LessonQuizQuestion,
      as: 'questions',
      include: [
        { model: PracticeImage, as: 'questionImage', attributes: ['storageKey'] },
        { model: PracticeImage, as: 'hintImage', attributes: ['storageKey'] }
      ]
    }]
  });
  if (!quiz) return null;
  const questions = [...(quiz.questions || [])].sort((a, b) => a.order - b.order);
  // Правильный вариант остаётся только в кабинете преподавателя и на
  // презентационном экране. Ученический API никогда не выдаёт ключ ответа.
  const reveal = false;
  const answers = await LessonQuizAnswer.findAll({
    where: { lessonQuizId: quiz.id, userId },
    // Даже признак «верно/неверно» раскрывает ключ в одиночном вопросе.
    attributes: ['questionId', 'selectedAnswer'],
    raw: true
  });
  const answerByQuestion = new Map(answers.map((answer) => [Number(answer.questionId), answer]));
  const base = quiz.toJSON();
  delete base.questions;
  base.totalQuestions = questions.length;
  base.serverNow = Date.now();
  base.phase = quiz.status === 'active' ? 'waiting' : 'lobby';

  const participant = await LessonQuizParticipant.findOne({ where: { lessonQuizId: quiz.id, userId }, attributes: ['id'] });
  base.joined = Boolean(participant);
  if (quiz.status === 'draft') {
    base.phase = 'lobby';
    base.currentQuestion = null;
    return base;
  }

  const current = questions[quiz.currentQuestionIndex] || null;
  const deadline = current && quiz.questionStartedAt
    ? new Date(quiz.questionStartedAt).getTime() + Number(current.timeLimit || 30) * 1000
    : null;
  base.deadline = deadline;
  const leaderboardPhase = quiz.status === 'finished' || (quiz.mode === 'single_step' && (quiz.questionRevealState === 'answer' || (deadline && Date.now() >= deadline)));
  if (leaderboardPhase) {
    const [allAnswers, roster] = await Promise.all([
      LessonQuizAnswer.findAll({
        where: { lessonQuizId: quiz.id },
        include: [{ model: User, as: 'user', attributes: ['id', 'firstName'] }]
      }),
      LessonQuizParticipant.findAll({
        where: { lessonQuizId: quiz.id },
        include: [{ model: User, as: 'user', attributes: ['id', 'firstName'] }]
      })
    ]);
    const ranked = buildLessonQuizLeaderboard(allAnswers, roster, quiz.isAnonymous, Infinity);
    base.phase = quiz.status === 'finished' ? 'finished' : 'leaderboard';
    base.leaderboard = ranked.slice(0, 10);
    base.myStanding = ranked.find((entry) => entry.id === Number(userId)) || null;
    base.participantCount = ranked.length;
    base.currentQuestion = null;
    base.myAnswer = null;
    return base;
  }

  if (quiz.mode === 'self_paced') {
    base.phase = 'question';
    base.questions = questions.map((question) => {
      const safe = stripQuestionAnswer(question, reveal);
      if (!quiz.explanationRevealed || !quiz.showExplanations) {
        delete safe.explanation;
        delete safe.hintImageId;
        delete safe.hintImage;
      }
      return { ...safe, myAnswer: answerByQuestion.get(Number(question.id)) || null };
    });
  } else {
    if (quiz.questionRevealState === 'hidden') {
      base.currentQuestion = null;
    } else {
      base.phase = 'question';
      base.currentQuestion = stripQuestionAnswer(current, reveal);
      if (base.currentQuestion && (!quiz.explanationRevealed || !quiz.showExplanations)) {
        delete base.currentQuestion.explanation;
        delete base.currentQuestion.hintImageId;
        delete base.currentQuestion.hintImage;
      }
    }
    base.myAnswer = current ? answerByQuestion.get(Number(current.id)) || null : null;
  }
  return base;
}

async function getLessonState(lessonId, userId) {
  const lesson = await Lesson.findByPk(lessonId, { include: lessonInclude });
  if (!lesson) return null;
  const [activePoll, activeQuiz, myQuestions, materials] = await Promise.all([
    serializeActivePoll(lessonId, userId),
    serializeActiveQuiz(lessonId, userId),
    LessonQuestion.findAll({ where: { lessonId, userId }, order: [['createdAt', 'DESC']] }),
    lesson.status === 'finished'
      ? LessonMaterial.findAll({ where: { lessonId }, order: [['createdAt', 'DESC']] })
      : []
  ]);
  // Экран ученика рисуется только по тому, что реально доступно сейчас (ТЗ §4).
  // Вопросы преподавателю доступны только во время активного занятия и только
  // если преподаватель их не отключил.
  const isLive = lesson.status === 'live'
    && (!lesson.sessionEndsAt || new Date(lesson.sessionEndsAt) > new Date());
  return {
    lesson,
    isLive,
    canAskQuestions: isLive && lesson.questionsEnabled !== false,
    activePoll: isLive ? activePoll : null,
    activeQuiz: isLive ? activeQuiz : null,
    myQuestions,
    materials
  };
}

module.exports = {
  lessonInclude,
  stripQuestionAnswer,
  getPollResults,
  serializeActivePoll,
  serializeActiveQuiz,
  getLessonState
};
