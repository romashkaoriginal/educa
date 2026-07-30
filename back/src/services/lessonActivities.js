const { UniqueConstraintError } = require('sequelize');
const {
  Lesson, LessonPoll, LessonPollOption, LessonPollAnswer,
  LessonQuiz, LessonQuizQuestion, LessonQuizAnswer, LessonQuizDelivery
} = require('../models');
const { assertStudentCanAccessLesson } = require('../middleware/lessonAccess');
const { touchAttendance } = require('./lessonAttendance');
const { getPollResults, serializeActiveQuiz } = require('./lessonState');

class LessonActionError extends Error {
  constructor(message, status = 400, code = 'LESSON_ACTION_FAILED') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const normalizedAnswers = (value) => {
  const values = Array.isArray(value) ? value : [value];
  return [...new Set(values.map(Number).filter(Number.isInteger))].sort((a, b) => a - b);
};

async function requireLiveAccess(lessonId, userId) {
  const access = await assertStudentCanAccessLesson(lessonId, userId);
  if (!access.ok) throw new LessonActionError(access.message, access.status, 'NO_ACCESS');
  // Access checks intentionally use a narrow projection. Do not infer the
  // session state from that partial model: status would be undefined and every
  // valid student action would be rejected with LESSON_NOT_LIVE.
  const accessLesson = access.lesson;
  const hasSessionState = accessLesson
    && typeof accessLesson.status === 'string'
    && Object.prototype.hasOwnProperty.call(accessLesson.dataValues || accessLesson, 'sessionEndsAt');
  const lesson = hasSessionState ? accessLesson : await Lesson.findByPk(lessonId);
  if (!lesson || lesson.status !== 'live' || (lesson.sessionEndsAt && new Date(lesson.sessionEndsAt) <= new Date())) {
    throw new LessonActionError('Занятие уже завершено', 409, 'LESSON_NOT_LIVE');
  }
  return lesson;
}

async function submitPollAnswer({ pollId, optionId, userId }) {
  const poll = await LessonPoll.findByPk(pollId);
  if (!poll) throw new LessonActionError('Голосование не найдено', 404, 'NOT_FOUND');
  await requireLiveAccess(poll.lessonId, userId);
  if (poll.status !== 'active' || (poll.autoCloseAt && new Date(poll.autoCloseAt) <= new Date())) {
    throw new LessonActionError('Голосование закрыто', 409, 'POLL_CLOSED');
  }
  const option = await LessonPollOption.findOne({ where: { id: optionId, pollId: poll.id } });
  if (!option) throw new LessonActionError('Вариант ответа не найден', 400, 'INVALID_OPTION');
  try {
    const answer = await LessonPollAnswer.create({ pollId: poll.id, optionId: option.id, userId });
    const attendance = await touchAttendance(poll.lessonId, userId, 'poll');
    return { answer, attendance, results: await getPollResults(poll.id), lessonId: poll.lessonId };
  } catch (error) {
    if (error instanceof UniqueConstraintError) {
      throw new LessonActionError('Ответ уже принят', 409, 'ALREADY_ANSWERED');
    }
    throw error;
  }
}

async function submitQuizAnswer({ quizId, questionId, selectedAnswer, userId }) {
  const quiz = await LessonQuiz.findByPk(quizId);
  if (!quiz) throw new LessonActionError('Викторина не найдена', 404, 'NOT_FOUND');
  await requireLiveAccess(quiz.lessonId, userId);
  if (quiz.status !== 'active') throw new LessonActionError('Викторина не активна', 409, 'QUIZ_CLOSED');

  const question = await LessonQuizQuestion.findOne({ where: { id: questionId, lessonQuizId: quiz.id } });
  if (!question) throw new LessonActionError('Вопрос не найден', 404, 'NOT_FOUND');
  if (quiz.mode === 'single_step') {
    const questions = await LessonQuizQuestion.findAll({ where: { lessonQuizId: quiz.id }, order: [['order', 'ASC']], attributes: ['id'] });
    const current = questions[quiz.currentQuestionIndex];
    if (!current || Number(current.id) !== Number(question.id) || quiz.questionRevealState !== 'question') {
      throw new LessonActionError('Этот вопрос сейчас недоступен', 409, 'QUESTION_HIDDEN');
    }
  }

  const selected = normalizedAnswers(selectedAnswer);
  const correct = normalizedAnswers(question.correctAnswer);
  if (!selected.length || selected.some((index) => index < 0 || index >= question.options.length)) {
    throw new LessonActionError('Некорректный ответ', 400, 'INVALID_ANSWER');
  }
  const isCorrect = selected.length === correct.length && selected.every((item, index) => item === correct[index]);
  try {
    const answer = await LessonQuizAnswer.create({
      lessonQuizId: quiz.id,
      questionId: question.id,
      userId,
      selectedAnswer: selected,
      isCorrect
    });
    const attendance = await touchAttendance(quiz.lessonId, userId, 'quiz');
    return {
      answer,
      attendance,
      lessonId: quiz.lessonId,
      activeQuiz: await serializeActiveQuiz(quiz.lessonId, userId)
    };
  } catch (error) {
    if (error instanceof UniqueConstraintError) {
      throw new LessonActionError('Ответ уже принят', 409, 'ALREADY_ANSWERED');
    }
    throw error;
  }
}

async function markQuizQuestionReceived({ quizId, questionId, userId }) {
  const quiz = await LessonQuiz.findByPk(quizId);
  if (!quiz) throw new LessonActionError('Викторина не найдена', 404, 'NOT_FOUND');
  await requireLiveAccess(quiz.lessonId, userId);
  if (quiz.status !== 'active') throw new LessonActionError('Викторина не активна', 409, 'QUIZ_CLOSED');

  const question = await LessonQuizQuestion.findOne({ where: { id: questionId, lessonQuizId: quiz.id } });
  if (!question) throw new LessonActionError('Вопрос не найден', 404, 'NOT_FOUND');
  if (quiz.mode === 'single_step') {
    const questions = await LessonQuizQuestion.findAll({
      where: { lessonQuizId: quiz.id }, order: [['order', 'ASC']], attributes: ['id']
    });
    const current = questions[quiz.currentQuestionIndex];
    if (!current || Number(current.id) !== Number(question.id) || quiz.questionRevealState === 'hidden') {
      throw new LessonActionError('Этот вопрос ещё не показан', 409, 'QUESTION_HIDDEN');
    }
  }

  const [delivery, created] = await LessonQuizDelivery.findOrCreate({
    where: { questionId: question.id, userId },
    defaults: { lessonQuizId: quiz.id, questionId: question.id, userId }
  });
  return { delivery, created, lessonId: quiz.lessonId };
}

module.exports = {
  LessonActionError, normalizedAnswers, requireLiveAccess,
  submitPollAnswer, submitQuizAnswer, markQuizQuestionReceived
};
