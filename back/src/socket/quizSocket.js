const { Quiz, QuizQuestion, QuizParticipant, QuizAnswer, User } = require('../models');

// Хранилище таймеров для каждого вопроса
const questionTimers = {};

function setupQuizSocket(io) {
  io.on('connection', (socket) => {
    console.log('🔌 Client connected:', socket.id);

    // АДМИН: подключение к комнате викторины
    socket.on('admin:join-quiz', async ({ quizId }) => {
      socket.join(`quiz-${quizId}-admin`);
      socket.join(`quiz-${quizId}`);
      console.log(`👨‍💼 Admin joined quiz ${quizId}`);

      // Отправляем текущее состояние
      const participants = await getParticipants(quizId);
      io.to(`quiz-${quizId}-admin`).emit('participants:updated', { participants });
    });

    // СТУДЕНТ: присоединение к викторине
    socket.on('student:join-quiz', async ({ quizId, userId }) => {
      try {
        // Регистрируем участника
        const [participant] = await QuizParticipant.findOrCreate({
          where: { quizId, userId },
          defaults: { quizId, userId, totalScore: 0 }
        });

        socket.join(`quiz-${quizId}`);
        socket.data = { quizId, userId, participantId: participant.id };

        console.log(`👨‍🎓 Student ${userId} joined quiz ${quizId}`);

        // Получить инфо о викторине
        const quiz = await Quiz.findByPk(quizId);

        socket.emit('student:joined', {
          quiz: {
            id: quiz.id,
            title: quiz.title,
            status: quiz.status,
            currentQuestionIndex: quiz.currentQuestionIndex
          }
        });

        // Обновить список участников у админа
        const participants = await getParticipants(quizId);
        io.to(`quiz-${quizId}-admin`).emit('participants:updated', { participants });
      } catch (error) {
        console.error('Student join error:', error);
        socket.emit('error', { message: 'Ошибка подключения' });
      }
    });

    // АДМИН: запустить викторину
    socket.on('admin:start-quiz', async ({ quizId }) => {
      try {
        await Quiz.update(
          { 
            status: 'active', 
            startedAt: new Date(),
            currentQuestionIndex: 0,
            questionStartedAt: new Date()
          },
          { where: { id: quizId } }
        );

        const question = await QuizQuestion.findOne({
          where: { quizId, order: 0 }
        });

        if (question) {
          // Отправляем все вопросы с правильными ответами для мгновенной проверки
          const allQuestions = await QuizQuestion.findAll({
            where: { quizId },
            order: [['order', 'ASC']]
          });
          const answersMap = {};
          allQuestions.forEach(q => {
            answersMap[q.id] = { correctAnswer: q.correctAnswer, explanation: q.explanation };
          });

          io.to(`quiz-${quizId}`).emit('quiz:started', { answersMap });
          sendQuestion(io, quizId, question, 0);
        }
      } catch (error) {
        console.error('Start quiz error:', error);
      }
    });

    // АДМИН: следующий вопрос
    socket.on('admin:next-question', async ({ quizId }) => {
      try {
        const quiz = await Quiz.findByPk(quizId);
        const nextIndex = quiz.currentQuestionIndex + 1;

        // Очистить таймер
        if (questionTimers[quizId]) {
          clearTimeout(questionTimers[quizId]);
          delete questionTimers[quizId];
        }

        const totalQuestions = await QuizQuestion.count({ where: { quizId } });

        if (nextIndex >= totalQuestions) {
          // Завершаем
          await Quiz.update(
            { status: 'finished', finishedAt: new Date() },
            { where: { id: quizId } }
          );

          io.to(`quiz-${quizId}`).emit('quiz:finished');
          return;
        }

        await Quiz.update(
          { currentQuestionIndex: nextIndex, questionStartedAt: new Date() },
          { where: { id: quizId } }
        );

        const question = await QuizQuestion.findOne({
          where: { quizId, order: nextIndex }
        });

        if (question) {
          sendQuestion(io, quizId, question, nextIndex);
        }
      } catch (error) {
        console.error('Next question error:', error);
      }
    });

    // АДМИН: завершить досрочно
    socket.on('admin:finish-quiz', async ({ quizId }) => {
      try {
        if (questionTimers[quizId]) {
          clearTimeout(questionTimers[quizId]);
          delete questionTimers[quizId];
        }

        await Quiz.update(
          { status: 'finished', finishedAt: new Date() },
          { where: { id: quizId } }
        );

        io.to(`quiz-${quizId}`).emit('quiz:finished');
      } catch (error) {
        console.error('Finish quiz error:', error);
      }
    });

    // СТУДЕНТ: ответ на вопрос
    socket.on('student:submit-answer', async ({ quizId, questionId, userId, selectedAnswer, responseTime }) => {
      try {
        // Проверка не отвечал ли уже
        const existing = await QuizAnswer.findOne({
          where: { questionId, userId }
        });

        if (existing) return;

        // Получаем участника
        const participant = await QuizParticipant.findOne({
          where: { quizId, userId }
        });

        if (!participant) {
          console.error('Participant not found for quiz:', quizId, 'user:', userId);
          return;
        }

        const question = await QuizQuestion.findByPk(questionId);
        const isCorrect = selectedAnswer === question.correctAnswer;

        // Расчёт баллов: чем быстрее, тем больше (макс 1 балл, мин 0.5)
        let score = 0;
        if (isCorrect) {
          const timeRatio = 1 - (responseTime / (question.timeLimit * 1000));
          score = Math.max(0.5, Math.min(1, 0.5 + timeRatio * 0.5)) * question.points;
        }

        await QuizAnswer.create({
          quizId,
          questionId,
          userId,
          participantId: participant.id,
          selectedAnswer,
          isCorrect,
          responseTime,
          score
        });

        // Обновляем сумму очков
        const totalScore = await QuizAnswer.sum('score', {
          where: { quizId, userId }
        });

        await QuizParticipant.update(
          { totalScore: totalScore || 0, lastActivityAt: new Date() },
          { where: { quizId, userId } }
        );

        socket.emit('student:answer-received', { isCorrect, score });

        // Обновить список участников для всех (для мини-лидерборда)
        const participants = await getParticipants(quizId);
        io.to(`quiz-${quizId}`).emit('participants:updated', { participants });
      } catch (error) {
        console.error('Submit answer error:', error);
      }
    });

    socket.on('disconnect', () => {
      console.log('🔌 Client disconnected:', socket.id);
    });
  });
}

// Отправить вопрос всем участникам
async function sendQuestion(io, quizId, question, index) {
  const totalQuestions = await QuizQuestion.count({ where: { quizId } });

  // Для студентов - без правильного ответа!
  const studentQuestion = {
    id: question.id,
    questionText: question.questionText,
    options: question.options,
    timeLimit: question.timeLimit,
    points: question.points,
    order: question.order,
    totalQuestions
  };

  // Для админа - с правильным ответом
  const adminQuestion = {
    ...studentQuestion,
    correctAnswer: question.correctAnswer,
    explanation: question.explanation
  };

  io.to(`quiz-${quizId}`).emit('quiz:new-question', {
    question: studentQuestion,
    questionIndex: index,
    totalQuestions
  });

  io.to(`quiz-${quizId}-admin`).emit('quiz:new-question-admin', {
    question: adminQuestion,
    questionIndex: index,
    totalQuestions
  });

  // Таймер — показываем правильный ответ и автоматически переходим к следующему
  questionTimers[quizId] = setTimeout(async () => {
    io.to(`quiz-${quizId}`).emit('quiz:question-ended', {
      correctAnswer: question.correctAnswer,
      explanation: question.explanation
    });

    // Пауза 2 секунды чтобы показать правильный ответ, потом следующий вопрос
    await new Promise(r => setTimeout(r, 2000));

    const quiz = await Quiz.findByPk(quizId);
    if (!quiz || quiz.status !== 'active') return;

    const nextIndex = quiz.currentQuestionIndex + 1;
    const totalQuestions = await QuizQuestion.count({ where: { quizId } });

    if (nextIndex >= totalQuestions) {
      await Quiz.update({ status: 'finished', finishedAt: new Date() }, { where: { id: quizId } });
      io.to(`quiz-${quizId}`).emit('quiz:finished');
    } else {
      await Quiz.update(
        { currentQuestionIndex: nextIndex, questionStartedAt: new Date() },
        { where: { id: quizId } }
      );
      const nextQuestion = await QuizQuestion.findOne({ where: { quizId, order: nextIndex } });
      if (nextQuestion) sendQuestion(io, quizId, nextQuestion, nextIndex);
    }
  }, question.timeLimit * 1000);
}

async function getParticipants(quizId) {
  return await QuizParticipant.findAll({
    where: { quizId },
    include: [
      { model: User, as: 'user', attributes: ['id', 'firstName', 'lastName', 'telegramUsername'] }
    ],
    order: [['joinedAt', 'ASC']]
  });
}

module.exports = setupQuizSocket;