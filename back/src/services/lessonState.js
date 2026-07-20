const { Op } = require('sequelize');
const {
  Lesson, Subject, User, Group, LessonPoll, LessonPollOption, LessonPollAnswer,
  LessonQuiz, LessonQuizQuestion, LessonQuizAnswer, LessonQuestion, LessonMaterial,
  PracticeImage
} = require('../models');

const lessonInclude = [
  { model: Subject, as: 'subject', attributes: ['id', 'name', 'icon'] },
  { model: User, as: 'teacher', attributes: ['id', 'firstName', 'lastName'] },
  { model: Group, as: 'groups', attributes: ['id', 'name'], through: { attributes: [] } }
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
    where: { lessonId, status: 'active' },
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
  const reveal = quiz.questionRevealState === 'answer';
  const answers = await LessonQuizAnswer.findAll({
    where: { lessonQuizId: quiz.id, userId },
    attributes: ['questionId', 'selectedAnswer', 'isCorrect'],
    raw: true
  });
  const answerByQuestion = new Map(answers.map((answer) => [Number(answer.questionId), answer]));
  const base = quiz.toJSON();
  delete base.questions;

  if (quiz.mode === 'self_paced') {
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
    const current = questions[quiz.currentQuestionIndex] || null;
    if (quiz.questionRevealState === 'hidden') {
      base.currentQuestion = null;
    } else {
      base.currentQuestion = stripQuestionAnswer(current, reveal);
      if (!quiz.explanationRevealed || !quiz.showExplanations) {
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
  return { lesson, activePoll, activeQuiz, myQuestions, materials };
}

module.exports = {
  lessonInclude,
  stripQuestionAnswer,
  getPollResults,
  serializeActivePoll,
  serializeActiveQuiz,
  getLessonState
};
