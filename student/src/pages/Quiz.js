import React, { useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import { apiFetch } from './api';
import { useData } from './DataContext';
import './Quiz.css';

import { API_URL, SOCKET_URL } from '../config';

// Анимированный счётчик: число докручивается от 0 к target
function useCountUp(target, duration = 900, active = true) {
  const [value, setValue] = React.useState(0);
  React.useEffect(() => {
    if (!active) { setValue(target); return undefined; }
    const end = parseFloat(target) || 0;
    if (end <= 0) { setValue(0); return undefined; }
    let raf;
    const start = performance.now();
    const tick = (now) => {
      const p = Math.min(1, (now - start) / duration);
      // easeOutCubic
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(Math.round(end * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
      else setValue(end);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration, active]);
  return value;
}

function formatQuizLine(subjectName, title, separator = '.') {
  if (subjectName && title) return `${subjectName}${separator} ${title}`;
  return title || subjectName || 'Викторина';
}

function formatScore(value) {
  const n = parseFloat(value) || 0;
  if (Number.isInteger(n)) return String(n);
  const rounded = Math.round(n * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function formatQuizDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
}

function quizStatusLabel(status) {
  return status === 'finished' ? 'завершена' : 'не завершена';
}

function QuizShell({ children, className = '', sessionLock = false }) {
  return (
    <div className={`section section-quiz quiz-ui ${sessionLock ? 'quiz-ui--session' : ''} ${className}`.trim()}>
      <div className="quiz-ui__inner">{children}</div>
    </div>
  );
}

function MiniLeaderboard({ participants, studentId, myRank, compact = false }) {
  const top = participants.slice(0, compact ? 5 : 8);
  if (top.length === 0) {
    return <p className="quiz-ui-sidebar__empty">Пока нет результатов</p>;
  }
  return (
    <>
      <ol className="quiz-ui-mini-lb">
        {top.map((p) => (
          <li
            key={p.userId}
            className={`quiz-ui-mini-lb__row${p.userId === studentId ? ' is-me' : ''}${p.rank === 1 ? ' is-top1' : ''}`}
          >
            <span className="quiz-ui-mini-lb__rank">{p.rank}.</span>
            <span className="quiz-ui-mini-lb__name">
              {p.userId === studentId ? 'Вы' : p.firstName}
              {!compact && p.userId !== studentId && p.lastName?.[0] ? ` ${p.lastName[0]}.` : ''}
            </span>
            <span className="quiz-ui-mini-lb__score">{formatScore(p.totalScore)}</span>
          </li>
        ))}
      </ol>
      {myRank > 0 && (
        <p className="quiz-ui-sidebar__footer">#{myRank} из {participants.length}</p>
      )}
    </>
  );
}

function ScoreChip({ score }) {
  return (
    <div className="quiz-ui-score-chip">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l2.9 6.26L22 9.27l-5 4.87L18.2 22 12 18.27 5.8 22 7 14.14l-5-4.87 7.1-1.01L12 2z" /></svg>
      {formatScore(score)}
    </div>
  );
}

function Quiz({ studentId, studentName = 'Ученик' }) {
  const { requestPractice } = useData();
  const [view, setView] = useState('enter');
  const [accessCode, setAccessCode] = useState('');
  const [quiz, setQuiz] = useState(null);
  const [socket, setSocket] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [quizHistory, setQuizHistory] = useState([]);
  const [finishedInfo, setFinishedInfo] = useState(null);
  const [reconnectOffer, setReconnectOffer] = useState(null);
  const [participantCount, setParticipantCount] = useState(0);
  const [participants, setParticipants] = useState([]);

  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [totalQuestions, setTotalQuestions] = useState(0);
  const [timeLeft, setTimeLeft] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [answered, setAnswered] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [answerFeedback, setAnswerFeedback] = useState(null);

  const [questionResult, setQuestionResult] = useState(null);
  const [myScore, setMyScore] = useState(0);
  const [finalResults, setFinalResults] = useState(null);
  const [resultsSource, setResultsSource] = useState('live');
  const [showErrorsDetail, setShowErrorsDetail] = useState(false);
  const [leaderboardMeta, setLeaderboardMeta] = useState({ previousRank: null, currentRank: null });
  const [enterTab, setEnterTab] = useState('join');

  const questionStartTime = useRef(null);
  const pendingQuizRef = useRef(null);
  const selectedAnswerRef = useRef(null);
  const timedOutRef = useRef(false);
  const currentQuestionRef = useRef(null);
  const prevRankRef = useRef(null);

  // Счёт для финального экрана (хук на верхнем уровне — без нарушения правил React)
  const finalScoreTarget = view === 'results' ? (parseFloat(finalResults?.me?.totalScore) || 0) : 0;
  const animatedScore = useCountUp(finalScoreTarget, 950, view === 'results');

  const cleanupSocket = useCallback(() => {
    if (socket) {
      if (quiz?.id) {
        socket.emit('student:leave-quiz', { quizId: quiz.id, userId: studentId });
      }
      socket.disconnect();
      setSocket(null);
    }
  }, [socket, quiz?.id, studentId]);

  useEffect(() => () => { cleanupSocket(); }, [cleanupSocket]);

  const loadQuizHistory = useCallback(async () => {
    try {
      const res = await apiFetch(`${API_URL}/quiz/student/${studentId}/stats`);
      if (!res.ok) return;
      const data = await res.json();
      setQuizHistory(data.quizzes || []);
    } catch (e) {
      console.error('Load quiz history:', e);
    }
  }, [studentId]);

  useEffect(() => { loadQuizHistory(); }, [loadQuizHistory]);

  const sessionLocked = ['lobby', 'playing', 'question-result', 'leaderboard'].includes(view);

  useEffect(() => {
    const appRoot = document.querySelector('.student-app');
    const content = document.querySelector('.student-app .content');
    if (sessionLocked) {
      appRoot?.classList.add('quiz-session-active');
      content?.classList.add('quiz-scroll-lock');
    }
    return () => {
      appRoot?.classList.remove('quiz-session-active');
      content?.classList.remove('quiz-scroll-lock');
    };
  }, [sessionLocked]);

  useEffect(() => {
    if (view !== 'playing' || timeLeft <= 0) return undefined;
    const timer = setTimeout(() => setTimeLeft((t) => t - 1), 1000);
    return () => clearTimeout(timer);
  }, [timeLeft, view]);

  useEffect(() => {
    if (view !== 'playing' || answered || !currentQuestion || timeLeft > 0) return;
    timedOutRef.current = true;
    setTimedOut(true);
    setAnswered(true);
  }, [timeLeft, view, answered, currentQuestion]);

  const setupSocketListeners = (newSocket, quizData, forceReconnect = false) => {
    newSocket.on('student:joined', ({ quiz: q, participantCount: count }) => {
      setLoading(false);
      setReconnectOffer(null);
      setQuiz((prev) => ({ ...prev, ...q }));
      setParticipantCount(count || 0);
      setView(q.status === 'active' ? 'playing' : 'lobby');
    });

    newSocket.on('quiz:started', () => setView('playing'));

    newSocket.on('quiz:new-question', ({ question, questionIndex: idx, totalQuestions: total }) => {
      setCurrentQuestion(question);
      currentQuestionRef.current = question;
      setQuestionIndex(idx);
      setTotalQuestions(total);
      setTimeLeft(question.timeLimit);
      setSelectedAnswer(null);
      setAnswered(false);
      setTimedOut(false);
      selectedAnswerRef.current = null;
      timedOutRef.current = false;
      setQuestionResult(null);
      setAnswerFeedback(null);
      setView('playing');
      questionStartTime.current = Date.now();
    });

    newSocket.on('student:answer-accepted', (data) => {
      setAnswered(true);
      if (quizData.showLeaderboardAfterQuestion !== false && data?.isCorrect != null) {
        setAnswerFeedback({
          isCorrect: data.isCorrect,
          earned: parseFloat(data.score) || 0,
          maxPoints: parseFloat(data.maxPoints) || 0,
          correctAnswer: data.correctAnswer
        });
        if (data.totalScore != null) {
          setMyScore(parseFloat(data.totalScore) || 0);
        }
      }
    });

    newSocket.on('quiz:question-ended', async ({ correctAnswer, explanation, maxPoints, questionId }) => {
      const wasTimedOut = timedOutRef.current;
      let mySelected = selectedAnswerRef.current;
      let earned = 0;

      try {
        const res = await apiFetch(`${API_URL}/quiz/${quizData.id}/results`);
        if (res.ok) {
          const data = await res.json();
          const me = data.participants?.find((p) => p.userId === studentId);
          const ans = me?.answers?.find((a) => a.questionId === questionId);
          if (ans) {
            earned = parseFloat(ans.score) || 0;
            mySelected = ans.selectedAnswer;
            setMyScore(parseFloat(me.totalScore) || 0);
          }
        }
      } catch (_) { /* use local state */ }

      const isCorrect = !wasTimedOut && mySelected === correctAnswer;

      setQuestionResult({
        isCorrect,
        timedOut: wasTimedOut,
        selectedAnswer: wasTimedOut ? null : mySelected,
        correctAnswer,
        explanation,
        earned,
        maxPoints: maxPoints || 0,
        options: currentQuestionRef.current?.options || [],
        myRank: null
      });

      if (quizData.showLeaderboardAfterQuestion !== false) {
        try {
          const res = await apiFetch(`${API_URL}/quiz/${quizData.id}/results`);
          if (res.ok) {
            const data = await res.json();
            const sorted = [...(data.participants || [])].sort(
              (a, b) => (parseFloat(b.totalScore) || 0) - (parseFloat(a.totalScore) || 0)
            );
            const rank = sorted.findIndex((p) => p.userId === studentId) + 1;
            if (rank > 0) {
              setQuestionResult((prev) => ({ ...prev, myRank: rank, totalParticipants: sorted.length }));
            }
          }
        } catch (_) { /* optional rank */ }
      }

      setView('question-result');
    });

    newSocket.on('quiz:leaderboard', ({ participants: ranked }) => {
      const list = ranked || [];
      const newRank = list.findIndex((p) => p.userId === studentId) + 1;
      setLeaderboardMeta({ previousRank: prevRankRef.current, currentRank: newRank || null });
      if (newRank > 0) prevRankRef.current = newRank;
      setParticipants(list);
      setView('leaderboard');
    });

    newSocket.on('participants:updated', ({ participants: list }) => {
      const sorted = [...(list || [])].sort(
        (a, b) => (parseFloat(b.totalScore) || 0) - (parseFloat(a.totalScore) || 0)
      );
      setParticipants(sorted.map((p, i) => ({
        rank: i + 1,
        userId: p.userId,
        firstName: p.user?.firstName,
        lastName: p.user?.lastName,
        totalScore: parseFloat(p.totalScore) || 0
      })));
      setParticipantCount(list?.length || 0);
    });

    newSocket.on('quiz:finished', async () => {
      await loadFinalResults(quizData.id);
      setResultsSource('live');
      setShowErrorsDetail(false);
      setView('results');
      loadQuizHistory();
    });

    newSocket.on('error', ({ code, message }) => {
      if (code === 'ALREADY_CONNECTED') {
        setReconnectOffer({ quizId: quizData.id, message });
        setLoading(false);
        return;
      }
      setError(message || 'Ошибка подключения');
      setLoading(false);
    });

    newSocket.emit('student:join-quiz', {
      quizId: quizData.id,
      userId: studentId,
      forceReconnect
    });
  };

  const connectToQuiz = (quizData, forceReconnect = false) => {
    pendingQuizRef.current = quizData;
    setQuiz(quizData);
    setError('');
    setFinishedInfo(null);

    const newSocket = io(SOCKET_URL);
    newSocket.on('connect', () => {
      setupSocketListeners(newSocket, quizData, forceReconnect);
    });
    setSocket(newSocket);
  };

  const joinQuiz = async (forceReconnect = false) => {
    if (!accessCode.trim()) {
      setError('Введите код викторины');
      return;
    }
    setLoading(true);
    setError('');
    setFinishedInfo(null);
    setReconnectOffer(null);

    try {
      const response = await apiFetch(
        `${API_URL}/quiz/code/${accessCode.toUpperCase()}?studentId=${studentId}`
      );
      const data = await response.json();

      if (!response.ok) {
        if (data.code === 'FINISHED') {
          setFinishedInfo(data);
          setError(data.message);
        } else if (data.code === 'NO_ACCESS') {
          setError(data.message || 'У вас нет доступа к этой викторине.');
        } else {
          setError(data.message || 'Викторина с таким кодом не найдена. Проверьте код и попробуйте еще раз.');
        }
        setLoading(false);
        return;
      }

      connectToQuiz(data.quiz, forceReconnect);
      setParticipantCount(data.participantCount || 0);
    } catch (e) {
      console.error('Join quiz:', e);
      setError('Ошибка подключения');
      setLoading(false);
    }
  };

  const loadFinalResults = async (quizId) => {
    try {
      const res = await apiFetch(`${API_URL}/quiz/${quizId}/results`);
      if (!res.ok) return;
      const data = await res.json();
      const me = data.participants?.find((p) => p.userId === studentId);
      const rank = data.participants?.findIndex((p) => p.userId === studentId) + 1;
      if (me) me.rank = rank;
      setFinalResults({ quiz: data.quiz, me, participants: data.participants });
      if (me) setMyScore(parseFloat(me.totalScore) || 0);
    } catch (e) {
      console.error('Load final results:', e);
    }
  };

  const openPastQuiz = async (quizId, source = 'history') => {
    setLoading(true);
    setShowErrorsDetail(false);
    await loadFinalResults(quizId);
    setResultsSource(source);
    setLoading(false);
    setView('results');
  };

  const backFromResults = () => {
    setFinalResults(null);
    setShowErrorsDetail(false);
    if (resultsSource === 'history') {
      setEnterTab('history');
      setView('enter');
      return;
    }
    if (resultsSource === 'live') {
      exitQuiz();
      return;
    }
    setView('enter');
  };

  useEffect(() => {
    if (view !== 'playing' || !currentQuestion?.id) return undefined;
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    return undefined;
  }, [view, currentQuestion?.id, questionIndex]);

  const submitAnswer = (answerIndex) => {
    if (answered || timeLeft <= 0 || !currentQuestion || !socket) return;
    setSelectedAnswer(answerIndex);
    selectedAnswerRef.current = answerIndex;
    setAnswered(true);
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    const responseTime = Date.now() - (questionStartTime.current || Date.now());

    socket.emit('student:submit-answer', {
      quizId: quiz.id,
      questionId: currentQuestion.id,
      userId: studentId,
      selectedAnswer: answerIndex,
      responseTime
    });
  };

  const exitQuiz = () => {
    cleanupSocket();
    setView('enter');
    setAccessCode('');
    setQuiz(null);
    setCurrentQuestion(null);
    currentQuestionRef.current = null;
    setParticipants([]);
    setMyScore(0);
    setFinalResults(null);
    setQuestionResult(null);
    setAnswerFeedback(null);
    setFinishedInfo(null);
    setReconnectOffer(null);
    setError('');
    setResultsSource('live');
    setShowErrorsDetail(false);
    setEnterTab('join');
  };

  const goToPractice = () => {
    const subjectId = finalResults?.quiz?.subjectId || quiz?.subjectId || quiz?.subject?.id;
    if (subjectId) requestPractice({ subjectId, mode: 'general' });
    exitQuiz();
  };

  const leaderboardEnabled = quiz?.showLeaderboardAfterQuestion !== false;
  const myRank = participants.findIndex((p) => p.userId === studentId) + 1;

  const renderHistoryList = (onItemClickSource) => (
    quizHistory.length === 0 ? (
      <p className="quiz-ui-empty">Вы ещё не участвовали в викторинах.</p>
    ) : (
      <ul className="quiz-ui-history-list quiz-ui-history-full">
        {quizHistory.map((item) => (
          <li key={item.quizId}>
            <button
              type="button"
              className="quiz-ui-history-item"
              onClick={() => item.quizStatus === 'finished' && openPastQuiz(item.quizId, onItemClickSource)}
              disabled={item.quizStatus !== 'finished' || loading}
            >
              <div className="quiz-ui-history-item__top">
                <span className="quiz-ui-history-item__title">
                  {formatQuizLine(item.subjectName, item.quizTitle, ':')}
                </span>
                <span className={`quiz-ui-badge quiz-ui-badge--${item.quizStatus === 'finished' ? 'done' : 'pending'}`}>
                  {quizStatusLabel(item.quizStatus)}
                </span>
              </div>
              <span className="quiz-ui-history-item__meta">{formatQuizDate(item.finishedAt || item.joinedAt)}</span>
              <span className="quiz-ui-history-item__meta">
                {formatScore(item.totalScore)} баллов · {item.correctAnswers}/{item.totalQuestions} правильных
                {item.rank ? ` · ${item.rank} место` : ''}
              </span>
            </button>
          </li>
        ))}
      </ul>
    )
  );

  // ========== ЛОББИ / ОЖИДАНИЕ ==========
  if (view === 'lobby') {
    return (
      <QuizShell className="quiz-ui-lobby" sessionLock>
        <div className="quiz-ui-lobby__pulse"><span>✓</span></div>
        <span className="quiz-ui__eyebrow">Комната ожидания</span>
        <h1 className="quiz-ui__title">{formatQuizLine(quiz?.subject?.name, quiz?.title, ':')}</h1>
        <div className="quiz-ui-status-chip">Вы подключены</div>
        <div className="quiz-ui-info-grid">
          <div className="quiz-ui-info-row"><span>Вы подключены как</span><span>{studentName}</span></div>
          {quiz?.subject && (
            <div className="quiz-ui-info-row"><span>Предмет</span><span>{quiz.subject.icon} {quiz.subject.name}</span></div>
          )}
          <div className="quiz-ui-info-row"><span>Участников</span><span>{participantCount}</span></div>
        </div>
        <p className="quiz-ui-wait-text">Ждем запуска преподавателем…</p>
        <button type="button" className="quiz-ui-btn quiz-ui-btn--danger-outline" onClick={exitQuiz}>Выйти из викторины</button>
      </QuizShell>
    );
  }

  // ========== ЭКРАН ВОПРОСА ==========
  if (view === 'playing') {
    if (!currentQuestion) {
      return (
        <QuizShell>
          <div className="quiz-ui-loading">
            <div className="quiz-ui-spinner" />
            <p>Ждем следующий вопрос…</p>
          </div>
        </QuizShell>
      );
    }

    const timeLimit = currentQuestion.timeLimit || 1;
    const timeProgress = Math.max(0, Math.min(100, (timeLeft / timeLimit) * 100));
    const showInstantFeedback = leaderboardEnabled && answerFeedback;

    return (
      <QuizShell className={`quiz-ui-play${leaderboardEnabled ? ' quiz-ui-play--with-lb' : ''}`} sessionLock>
        <div className="quiz-ui-play-layout">
          <div className="quiz-ui-play-main">
            <header className="quiz-ui-play__header">
              <div className="quiz-ui-play__meta">
                <span className="quiz-ui-play__label">Вопрос {questionIndex + 1} из {totalQuestions}</span>
                <div className="quiz-ui-segments">
                  {Array.from({ length: totalQuestions }, (_, i) => (
                    <div
                      key={i}
                      className={`quiz-ui-segment${i < questionIndex ? ' is-done' : ''}${i === questionIndex ? ' is-current' : ''}`}
                    />
                  ))}
                </div>
              </div>
              <ScoreChip score={myScore} />
            </header>

            <div className={`quiz-ui-timer-bar ${timeLeft <= 5 ? 'is-urgent' : ''}`}>
              <div className="quiz-ui-timer-bar__top">
                <span className="quiz-ui-timer-bar__label">Осталось времени</span>
                <span className="quiz-ui-timer-bar__value">{timeLeft} сек.</span>
              </div>
              <div className="quiz-ui-timer-bar__track">
                <div className="quiz-ui-timer-bar__fill" style={{ width: `${timeProgress}%` }} />
              </div>
            </div>

            <div className="quiz-ui-card quiz-ui-question-card">
              <h2>{currentQuestion.questionText}</h2>
              <div className="quiz-ui-points-badge">Баллы за вопрос: до {currentQuestion.points || 1}</div>

              <div className="quiz-ui-answers" key={currentQuestion.id}>
                {currentQuestion.options.map((option, index) => {
                  const letter = String.fromCharCode(65 + index);
                  const isSelected = answered && selectedAnswer === index;
                  const isLocked = answered || timeLeft <= 0;
                  const isCorrectOption = showInstantFeedback && index === answerFeedback.correctAnswer;
                  const isWrongSelected = showInstantFeedback && isSelected && !answerFeedback.isCorrect;
                  return (
                    <button
                      key={`${currentQuestion.id}-${index}`}
                      type="button"
                      className={`quiz-ui-answer quiz-ui-answer--${index} ${isSelected ? 'is-selected' : ''} ${isLocked ? 'is-locked' : ''} ${isCorrectOption ? 'is-correct' : ''} ${isWrongSelected ? 'is-wrong' : ''}`}
                      onClick={() => submitAnswer(index)}
                      onPointerUp={(e) => e.currentTarget.blur()}
                      disabled={isLocked}
                    >
                      <span className="quiz-ui-answer__mark">{letter}</span>
                      <span className="quiz-ui-answer__text">{option}</span>
                      {isCorrectOption && <span className="quiz-ui-answer__icon">✓</span>}
                      {isWrongSelected && <span className="quiz-ui-answer__icon">✗</span>}
                      {isSelected && answered && !showInstantFeedback && (
                        <span className="quiz-ui-answer__check">✓</span>
                      )}
                    </button>
                  );
                })}
              </div>

              {showInstantFeedback && (
                <div className={`quiz-ui-toast ${answerFeedback.isCorrect ? 'quiz-ui-toast--correct' : 'quiz-ui-toast--wrong'}`}>
                  {answerFeedback.isCorrect ? (
                    <>
                      ✓ Верно! +{formatScore(answerFeedback.earned)}
                      {answerFeedback.maxPoints > 0 ? ` из ${formatScore(answerFeedback.maxPoints)}` : ''} баллов
                      {answerFeedback.maxPoints > 0 && answerFeedback.earned < answerFeedback.maxPoints && (
                        <span className="quiz-ui-toast__hint"> · быстрее = больше баллов</span>
                      )}
                    </>
                  ) : (
                    <>✗ Неверно. 0 баллов</>
                  )}
                </div>
              )}
              {answered && !timedOut && !leaderboardEnabled && (
                <div className="quiz-ui-toast quiz-ui-toast--wait">
                  <div className="quiz-ui-dots"><span /><span /><span /></div>
                  Ответ принят. Ждем остальных участников.
                </div>
              )}
              {timedOut && selectedAnswer == null && (
                <div className="quiz-ui-toast quiz-ui-toast--timeout">
                  Время вышло. Ответ не засчитан.
                </div>
              )}
            </div>
          </div>

          {leaderboardEnabled && (
            <aside className="quiz-ui-sidebar" aria-label="Лидерборд">
              <h3 className="quiz-ui-sidebar__title">🏆 Топ</h3>
              <MiniLeaderboard participants={participants} studentId={studentId} myRank={myRank} compact />
            </aside>
          )}
        </div>
      </QuizShell>
    );
  }

  // ========== РЕЗУЛЬТАТ ВОПРОСА (§6) ==========
  if (view === 'question-result' && questionResult) {
    const options = questionResult.options?.length
      ? questionResult.options
      : (currentQuestion?.options || []);
    const opt = (idx) => (options[idx] ?? `#${idx + 1}`);
    const title = questionResult.isCorrect
      ? 'Верно!'
      : (questionResult.timedOut ? 'Время вышло' : 'Неверно');
    const showRank = leaderboardEnabled && questionResult.myRank > 0;

    return (
      <QuizShell className="quiz-ui-qresult-screen" sessionLock>
        <div className={`quiz-ui-play-layout${leaderboardEnabled ? ' quiz-ui-play-layout--with-lb' : ''}`}>
          <div className={`quiz-ui-card quiz-ui-qresult ${questionResult.isCorrect ? 'is-correct' : 'is-wrong'}`}>
          <div className="quiz-ui-qresult__icon">{questionResult.isCorrect ? '✓' : '✗'}</div>
          <h2 className="quiz-ui-qresult__title">{title}</h2>

          {questionResult.isCorrect ? (
            <>
              <p className="quiz-ui-qresult__score">
                +{formatScore(questionResult.earned)}
                {questionResult.maxPoints > 0 ? ` из ${formatScore(questionResult.maxPoints)}` : ''} баллов
              </p>
              <div className="quiz-ui-qresult__details">
                <div className="quiz-ui-qresult__row">
                  <span className="quiz-ui-qresult__label">Правильный ответ:</span>
                  <strong>{opt(questionResult.correctAnswer)}</strong>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="quiz-ui-qresult__details">
                {!questionResult.timedOut && questionResult.selectedAnswer != null && (
                  <div className="quiz-ui-qresult__row">
                    <span className="quiz-ui-qresult__label">Ваш ответ:</span>
                    <strong>{opt(questionResult.selectedAnswer)}</strong>
                  </div>
                )}
                <div className="quiz-ui-qresult__row">
                  <span className="quiz-ui-qresult__label">Правильный ответ:</span>
                  <strong>{opt(questionResult.correctAnswer)}</strong>
                </div>
              </div>
              <p className="quiz-ui-qresult__score">Вы получили: 0 баллов</p>
            </>
          )}

          {questionResult.explanation && (
            <div className="quiz-ui-qresult__details">
              <div className="quiz-ui-qresult__row">
                <span className="quiz-ui-qresult__label">Объяснение:</span>
                <p>{questionResult.explanation}</p>
              </div>
            </div>
          )}

          {showRank && (
            <p className="quiz-ui-qresult__rank">
              Ваше место: {questionResult.myRank} из {questionResult.totalParticipants || participantCount}
            </p>
          )}

          <p className="quiz-ui-hint">Ожидайте следующий вопрос…</p>
          </div>
          {leaderboardEnabled && (
            <aside className="quiz-ui-sidebar" aria-label="Лидерборд">
              <h3 className="quiz-ui-sidebar__title">🏆 Топ</h3>
              <MiniLeaderboard participants={participants} studentId={studentId} myRank={myRank} compact />
            </aside>
          )}
        </div>
      </QuizShell>
    );
  }

  // ========== ЛИДЕРБОРД (§7) ==========
  if (view === 'leaderboard') {
    const rankChange = leaderboardMeta.previousRank && leaderboardMeta.currentRank
      ? leaderboardMeta.previousRank - leaderboardMeta.currentRank
      : 0;

    return (
      <QuizShell className="quiz-ui-lb quiz-ui-lb--session" sessionLock>
        <div className="quiz-ui-play-layout quiz-ui-play-layout--with-lb">
          <div className="quiz-ui-lb-main">
            <h2 className="quiz-ui-lb__title">Лидерборд</h2>
            <ol className="quiz-ui-lb__list quiz-ui-lb__list--compact">
              {participants.slice(0, 8).map((p) => (
                <li
                  key={p.userId}
                  className={`quiz-ui-lb__row${p.userId === studentId ? ' is-me' : ''}${p.rank === 1 ? ' is-top1' : ''}`}
                >
                  <span className="quiz-ui-lb__rank">{p.rank}.</span>
                  <span className="quiz-ui-lb__name">
                    {p.userId === studentId ? 'Вы' : p.firstName}
                    {p.userId !== studentId && p.lastName?.[0] ? ` ${p.lastName[0]}.` : ''}
                  </span>
                  <span className="quiz-ui-lb__score">{formatScore(p.totalScore)}</span>
                </li>
              ))}
            </ol>
            {rankChange !== 0 && (
              <p className={`quiz-ui-lb__change ${rankChange > 0 ? 'is-up' : 'is-down'}`}>
                {rankChange > 0 ? `↑ +${rankChange}` : `↓ ${rankChange}`}
              </p>
            )}
            <p className="quiz-ui-hint">Ожидайте следующий вопрос…</p>
          </div>
          <aside className="quiz-ui-sidebar" aria-label="Ваше место">
            <h3 className="quiz-ui-sidebar__title">🏆 Топ</h3>
            <MiniLeaderboard participants={participants} studentId={studentId} myRank={myRank} compact />
          </aside>
        </div>
      </QuizShell>
    );
  }

  // ========== ФИНАЛ / ПРОСМОТР ПРОШЛОЙ ВИКТОРИНЫ (§8) ==========
  if (view === 'results' && finalResults?.me) {
    const { me, quiz: q } = finalResults;
    const wrongAnswers = (me.answers || []).filter((a) => !a.isCorrect);
    const answeredCount = (me.answers || []).length;
    const unanswered = Math.max(0, (me.totalQuestions || 0) - answeredCount);
    const wrongCount = wrongAnswers.length;
    const accuracy = me.accuracy ?? (me.totalQuestions ? Math.round((me.correctAnswers / me.totalQuestions) * 100) : 0);
    const isPastView = resultsSource === 'history' || resultsSource === 'enter';
    const showReview = q?.showQuestionReview !== false;
    const showExplanations = q?.showExplanations !== false;
    const practiceSubjectId = q?.subjectId || q?.subject?.id;
    const allQuestions = q?.questions || [];

    const getAnswerForQuestion = (questionId) => (me.answers || []).find((a) => a.questionId === questionId);

    return (
      <QuizShell>
        <div className="quiz-ui-final__hero">
          <h1>{isPastView ? 'Результат викторины' : 'Викторина завершена'}</h1>
          <p>{formatQuizLine(q?.subject?.name, q?.title, ':')}</p>
          <div className="quiz-ui-final__score">
            {animatedScore}
            <span>баллов</span>
          </div>
        </div>

        <div className="quiz-ui-stats-bento">
          <div className="quiz-ui-stat"><span>Правильных</span><strong>{me.correctAnswers}/{me.totalQuestions}</strong></div>
          <div className="quiz-ui-stat"><span>Неправильных</span><strong>{wrongCount}</strong></div>
          <div className="quiz-ui-stat"><span>Место</span><strong>{me.rank || '—'}/{finalResults.participants?.length || '—'}</strong></div>
          <div className="quiz-ui-stat"><span>Точность</span><strong>{accuracy}%</strong></div>
          <div className="quiz-ui-stat"><span>Без ответа</span><strong>{unanswered}</strong></div>
        </div>

        {showReview && allQuestions.length > 0 && (
          <div className="quiz-ui-panel">
            <h3>Результаты по вопросам</h3>
            <ul className="quiz-ui-review-list">
              {allQuestions.map((question) => {
                const ans = getAnswerForQuestion(question.id);
                const status = !ans ? 'Без ответа' : (ans.isCorrect ? 'Верно' : 'Неверно');
                return (
                  <li key={question.id} className={ans?.isCorrect ? 'is-correct' : (ans ? 'is-wrong' : 'is-empty')}>
                    <span>Вопрос {(question.order ?? 0) + 1}. {question.questionText?.slice(0, 70)}</span>
                    <strong>{status}</strong>
                    {showExplanations && question.explanation && (
                      <p className="quiz-ui-expl">{question.explanation}</p>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {wrongAnswers.length > 0 && (
          <div className="quiz-ui-panel">
            <div className="quiz-ui-panel-head">
              <h3>Ошибки</h3>
              <button type="button" className="quiz-ui-link-btn" onClick={() => setShowErrorsDetail((v) => !v)}>
                {showErrorsDetail ? 'Скрыть' : 'Разобрать ошибки'}
              </button>
            </div>
            <ul className="quiz-ui-errors-list">
              {wrongAnswers.map((a) => (
                <li key={a.id}>
                  Вопрос {(a.question?.order ?? 0) + 1}. {a.question?.questionText?.slice(0, 80)}
                </li>
              ))}
            </ul>
            {showErrorsDetail && showExplanations && (
              <div className="quiz-ui-error-detail">
                {wrongAnswers.map((a) => {
                  const qText = a.question?.questionText || 'Вопрос';
                  const options = a.question?.options || [];
                  const myAns = a.selectedAnswer != null ? options[a.selectedAnswer] : '—';
                  const correctAns = options[a.question?.correctAnswer] ?? '—';
                  return (
                    <div key={`detail-${a.id}`} className="quiz-ui-error-card">
                      <strong>Вопрос {(a.question?.order ?? 0) + 1}. {qText}</strong>
                      <p><span>Ваш ответ:</span> {myAns}</p>
                      <p><span>Правильный ответ:</span> {correctAns}</p>
                      {a.question?.explanation && (
                        <p><span>Объяснение:</span> {a.question.explanation}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <div className="quiz-ui-btn-row">
          {practiceSubjectId && resultsSource === 'live' && (
            <button type="button" className="quiz-ui-btn quiz-ui-btn--secondary" onClick={goToPractice}>
              Перейти к практике по теме
            </button>
          )}
          <button type="button" className="quiz-ui-btn quiz-ui-btn--primary" onClick={backFromResults}>
            {resultsSource === 'history' ? 'Назад к истории' : 'Вернуться в викторины'}
          </button>
        </div>
      </QuizShell>
    );
  }

  // ========== ЭКРАН ВХОДА + ИСТОРИЯ (вкладки) ==========
  if (view === 'enter') {
    return (
      <QuizShell className="quiz-ui-enter-root">
        <div className="quiz-enter-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={enterTab === 'join'}
            className={`quiz-enter-tab ${enterTab === 'join' ? 'is-active' : ''}`}
            onClick={() => setEnterTab('join')}
          >
            Подключиться
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={enterTab === 'history'}
            className={`quiz-enter-tab ${enterTab === 'history' ? 'is-active' : ''}`}
            onClick={() => setEnterTab('history')}
          >
            Мои викторины
          </button>
        </div>

        {enterTab === 'join' ? (
          <div className="quiz-enter-classic">
            <div className="quiz-icon-big">🎯</div>
            <h1 className="quiz-title">Викторины</h1>
            <p className="quiz-subtitle">Введите код, который дал преподаватель на уроке.</p>
            <div className="code-input-container">
              <input
                type="text"
                className="code-input"
                placeholder="КОД"
                value={accessCode}
                onChange={(e) => { setAccessCode(e.target.value.toUpperCase()); setError(''); setFinishedInfo(null); }}
                maxLength={10}
                onKeyDown={(e) => e.key === 'Enter' && joinQuiz()}
              />
            </div>
            {error && <div className="error-message">{error}</div>}
            {finishedInfo?.participated && (
              <button type="button" className="join-button secondary" onClick={() => openPastQuiz(finishedInfo.quizId, 'enter')}>
                Посмотреть результат
              </button>
            )}
            {reconnectOffer && (
              <div className="reconnect-block">
                <p>{reconnectOffer.message}</p>
                <button type="button" className="join-button secondary" onClick={() => joinQuiz(true)}>Переподключиться</button>
              </div>
            )}
            <button type="button" className="join-button" onClick={() => joinQuiz()} disabled={loading || !accessCode.trim()}>
              {loading ? 'Подключение…' : 'Подключиться'}
            </button>
          </div>
        ) : (
          <div className="quiz-enter-history-tab">
            {renderHistoryList('history')}
          </div>
        )}
      </QuizShell>
    );
  }

  return null;
}

export default Quiz;