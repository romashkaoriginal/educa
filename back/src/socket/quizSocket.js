const { Quiz, QuizQuestion, QuizParticipant, QuizAnswer, User } = require('../models');
const { isStaffRole } = require('../middleware/telegramAuth');

const questionTimers = {};
const activeStudentSockets = new Map();

function sessionKey(quizId, userId) {
  return `${quizId}:${userId}`;
}

function delay(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function requireStaffSocket(socket) {
  return socket.data.dbUser && isStaffRole(socket.data.dbUser.role);
}

function setupQuizSocket(io) {
  io.on('connection', (socket) => {
    console.log('🔌 Client connected:', socket.id, 'user', socket.data.dbUser?.id);

    socket.on('admin:join-quiz', async ({ quizId }) => {
      if (!requireStaffSocket(socket)) {
        socket.emit('error', { message: 'Access denied' });
        return;
      }
      socket.join(`quiz-${quizId}-admin`);
      socket.join(`quiz-${quizId}`);
      console.log(`👨‍💼 Admin joined quiz ${quizId}`);

      const participants = await getParticipants(quizId);
      io.to(`quiz-${quizId}-admin`).emit('participants:updated', { participants });
    });

    socket.on('student:join-quiz', async ({ quizId, forceReconnect, studentId }) => {
      try {
        // Стафф может играть ОТ ИМЕНИ выбранного ученика (studentId).
        // Обычный пользователь — всегда сам за себя.
        const isStaff = isStaffRole(socket.data.dbUser.role);
        let userId = socket.data.dbUser.id;
        if (studentId && Number(studentId) !== Number(userId)) {
          if (!isStaff) {
            socket.emit('error', { code: 'NO_ACCESS', message: 'Access denied' });
            return;
          }
          const student = await User.findByPk(studentId, { attributes: ['id', 'isActive'] });
          if (!student || !student.isActive) {
            socket.emit('error', { code: 'NO_ACCESS', message: 'Ученик не найден' });
            return;
          }
          userId = Number(studentId);
        }
        socket.data.effectiveUserId = userId;
        const key = sessionKey(quizId, userId);
        const existingSocketId = activeStudentSockets.get(key);

        if (existingSocketId && existingSocketId !== socket.id && !forceReconnect) {
          socket.emit('error', {
            code: 'ALREADY_CONNECTED',
            message: 'Вы уже подключены к этой викторине.'
          });
          return;
        }

        if (forceReconnect && existingSocketId && existingSocketId !== socket.id) {
          const oldSocket = io.sockets.sockets.get(existingSocketId);
          if (oldSocket) oldSocket.disconnect(true);
        }

        await QuizParticipant.findOrCreate({
          where: { quizId, userId },
          defaults: { quizId, userId, totalScore: 0 }
        });

        activeStudentSockets.set(key, socket.id);
        socket.join(`quiz-${quizId}`);
        socket.data = { ...socket.data, quizId, userId, role: 'student' };

        console.log(`👨‍🎓 Student ${userId} joined quiz ${quizId}`);

        const quiz = await Quiz.findByPk(quizId, {
          include: [{ model: require('../models').Subject, as: 'subject' }]
        });

        const participants = await getParticipants(quizId);

        socket.emit('student:joined', {
          quiz: {
            id: quiz.id,
            title: quiz.title,
            description: quiz.description,
            status: quiz.status,
            subject: quiz.subject,
            subjectId: quiz.subjectId,
            currentQuestionIndex: quiz.currentQuestionIndex,
            showLeaderboardAfterQuestion: quiz.showLeaderboardAfterQuestion !== false,
            showQuestionReview: quiz.showQuestionReview !== false,
            showExplanations: quiz.showExplanations !== false
          },
          participantCount: participants.length
        });

        io.to(`quiz-${quizId}-admin`).emit('participants:updated', { participants });
        io.to(`quiz-${quizId}`).emit('participants:updated', { participants });
      } catch (error) {
        console.error('Student join error:', error);
        socket.emit('error', { message: 'Ошибка подключения' });
      }
    });

    socket.on('admin:start-quiz', async ({ quizId }) => {
      if (!requireStaffSocket(socket)) {
        socket.emit('error', { message: 'Access denied' });
        return;
      }
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

        const question = await QuizQuestion.findOne({ where: { quizId, order: 0 } });
        if (question) {
          io.to(`quiz-${quizId}`).emit('quiz:started', {});
          await sendQuestion(io, quizId, question, 0);
        }
      } catch (error) {
        console.error('Start quiz error:', error);
      }
    });

    socket.on('admin:next-question', async ({ quizId }) => {
      if (!requireStaffSocket(socket)) {
        socket.emit('error', { message: 'Access denied' });
        return;
      }
      try {
        if (questionTimers[quizId]) {
          clearTimeout(questionTimers[quizId].main);
          clearTimeout(questionTimers[quizId].advance);
          delete questionTimers[quizId];
        }

        const quiz = await Quiz.findByPk(quizId);
        const nextIndex = quiz.currentQuestionIndex + 1;
        const totalQuestions = await QuizQuestion.count({ where: { quizId } });

        if (nextIndex >= totalQuestions) {
          await finishQuiz(io, quizId);
          return;
        }

        await Quiz.update(
          { currentQuestionIndex: nextIndex, questionStartedAt: new Date() },
          { where: { id: quizId } }
        );

        const question = await QuizQuestion.findOne({ where: { quizId, order: nextIndex } });
        if (question) await sendQuestion(io, quizId, question, nextIndex);
      } catch (error) {
        console.error('Next question error:', error);
      }
    });

    socket.on('admin:finish-quiz', async ({ quizId }) => {
      if (!requireStaffSocket(socket)) {
        socket.emit('error', { message: 'Access denied' });
        return;
      }
      try {
        if (questionTimers[quizId]) {
          clearTimeout(questionTimers[quizId].main);
          clearTimeout(questionTimers[quizId].advance);
          delete questionTimers[quizId];
        }
        await finishQuiz(io, quizId);
      } catch (error) {
        console.error('Finish quiz error:', error);
      }
    });

    socket.on('student:submit-answer', async ({ quizId, questionId, selectedAnswer, responseTime }) => {
      try {
        const userId = socket.data.effectiveUserId || socket.data.dbUser.id;
        const existing = await QuizAnswer.findOne({ where: { questionId, userId } });
        if (existing) return;

        const participant = await QuizParticipant.findOne({ where: { quizId, userId } });
        if (!participant) return;

        const question = await QuizQuestion.findByPk(questionId);
        if (!question) return;

        const isCorrect = selectedAnswer === question.correctAnswer;
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

        const totalScore = await QuizAnswer.sum('score', { where: { quizId, userId } });
        await QuizParticipant.update(
          { totalScore: totalScore || 0, lastActivityAt: new Date() },
          { where: { quizId, userId } }
        );

        const quiz = await Quiz.findByPk(quizId, { attributes: ['showLeaderboardAfterQuestion'] });
        const payload = { accepted: true };
        if (quiz?.showLeaderboardAfterQuestion !== false) {
          payload.isCorrect = isCorrect;
          payload.score = score;
          payload.maxPoints = parseFloat(question.points) || 0;
          payload.correctAnswer = question.correctAnswer;
          payload.totalScore = parseFloat(totalScore) || 0;
        }
        socket.emit('student:answer-accepted', payload);

        const participants = await getParticipants(quizId);
        io.to(`quiz-${quizId}`).emit('participants:updated', { participants });
      } catch (error) {
        console.error('Submit answer error:', error);
      }
    });

    socket.on('student:leave-quiz', ({ quizId }) => {
      const userId = socket.data.effectiveUserId || socket.data.dbUser.id;
      const key = sessionKey(quizId, userId);
      if (activeStudentSockets.get(key) === socket.id) {
        activeStudentSockets.delete(key);
      }
      socket.leave(`quiz-${quizId}`);
    });

    socket.on('disconnect', () => {
      console.log('🔌 Client disconnected:', socket.id);
      for (const [key, sid] of activeStudentSockets.entries()) {
        if (sid === socket.id) activeStudentSockets.delete(key);
      }
    });
  });
}

async function finishQuiz(io, quizId) {
  await Quiz.update({ status: 'finished', finishedAt: new Date() }, { where: { id: quizId } });
  io.to(`quiz-${quizId}`).emit('quiz:finished');
}

async function sendQuestion(io, quizId, question, index) {
  const totalQuestions = await QuizQuestion.count({ where: { quizId } });

  const studentQuestion = {
    id: question.id,
    questionText: question.questionText,
    options: question.options,
    timeLimit: question.timeLimit,
    points: question.points,
    order: question.order
  };

  io.to(`quiz-${quizId}`).emit('quiz:new-question', {
    question: studentQuestion,
    questionIndex: index,
    totalQuestions
  });

  io.to(`quiz-${quizId}-admin`).emit('quiz:new-question-admin', {
    question: { ...studentQuestion, correctAnswer: question.correctAnswer, explanation: question.explanation },
    questionIndex: index,
    totalQuestions
  });

  const mainTimer = setTimeout(async () => {
    // Время вышло у всех одновременно. Помечаем конец вопроса (клиент гасит
    // приём ответов), затем без промежуточных экранов сразу идём дальше.
    io.to(`quiz-${quizId}`).emit('quiz:question-ended', {
      questionId: question.id,
      correctAnswer: question.correctAnswer,
      explanation: question.explanation,
      maxPoints: question.points
    });

    // Короткая техническая пауза, чтобы клиент успел зафиксировать ответ.
    await delay(400);

    const quiz = await Quiz.findByPk(quizId);
    if (!quiz || quiz.status !== 'active') return;

    const nextIndex = quiz.currentQuestionIndex + 1;
    const total = await QuizQuestion.count({ where: { quizId } });

    if (nextIndex >= total) {
      await finishQuiz(io, quizId);
      return;
    }

    await Quiz.update(
      { currentQuestionIndex: nextIndex, questionStartedAt: new Date() },
      { where: { id: quizId } }
    );

    const nextQuestion = await QuizQuestion.findOne({ where: { quizId, order: nextIndex } });
    if (nextQuestion) await sendQuestion(io, quizId, nextQuestion, nextIndex);
  }, question.timeLimit * 1000);

  questionTimers[quizId] = { main: mainTimer };
}

async function getParticipants(quizId) {
  return QuizParticipant.findAll({
    where: { quizId },
    include: [
      { model: User, as: 'user', attributes: ['id', 'firstName', 'lastName', 'telegramUsername'] }
    ],
    order: [['joinedAt', 'ASC']]
  });
}

module.exports = setupQuizSocket;
