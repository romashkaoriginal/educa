import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import './Quiz.css';

const API_URL = 'https://educa-production-a98e.up.railway.app/api';
const SOCKET_URL = 'https://educa-production-a98e.up.railway.app';

function Quiz({ studentId }) {
  const [mainTab, setMainTab] = useState('play'); // play, leaderboard
  const [view, setView] = useState('enter'); // enter, lobby, playing, results
  const [accessCode, setAccessCode] = useState('');
  const [quiz, setQuiz] = useState(null);
  const [socket, setSocket] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Игровые состояния
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [totalQuestions, setTotalQuestions] = useState(0);
  const [timeLeft, setTimeLeft] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [answered, setAnswered] = useState(false);
  const [answerResult, setAnswerResult] = useState(null);
  const [showCorrect, setShowCorrect] = useState(false);
  const [correctAnswer, setCorrectAnswer] = useState(null);
  const [explanation, setExplanation] = useState(null);
  
  // Лидерборды
  const [leaderboard, setLeaderboard] = useState([]);
  const [finalLeaderboard, setFinalLeaderboard] = useState([]);
  const [myRank, setMyRank] = useState(null);
  const [myScore, setMyScore] = useState(0);

  // Глобальный лидерборд
  const [globalSubjects, setGlobalSubjects] = useState([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState(null);
  const [globalLeaderboard, setGlobalLeaderboard] = useState([]);
  const [loadingGlobal, setLoadingGlobal] = useState(false);

  const questionStartTime = useRef(null);

  // Загрузка предметов для глобального лидерборда
  useEffect(() => {
    if (mainTab === 'leaderboard') {
      loadStudentSubjects();
    }
  }, [mainTab]);

  // Загрузка глобального лидерборда при смене предмета
  useEffect(() => {
    if (selectedSubjectId) {
      loadGlobalLeaderboard(selectedSubjectId);
    }
  }, [selectedSubjectId]);

  // Очистка сокета
  useEffect(() => {
    return () => {
      if (socket) socket.disconnect();
    };
  }, [socket]);

  // Таймер
  useEffect(() => {
    if (timeLeft > 0 && !answered) {
      const timer = setTimeout(() => setTimeLeft(timeLeft - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [timeLeft, answered]);

  const loadStudentSubjects = async () => {
    try {
      const response = await fetch(`${API_URL}/quiz/student/${studentId}/subjects`);
      const data = await response.json();
      setGlobalSubjects(data.subjects || []);
      
      // Автоматически выбираем первый предмет
      if (data.subjects && data.subjects.length > 0 && !selectedSubjectId) {
        setSelectedSubjectId(data.subjects[0].id);
      }
    } catch (error) {
      console.error('Error loading subjects:', error);
    }
  };

  const loadGlobalLeaderboard = async (subjectId) => {
    setLoadingGlobal(true);
    try {
      const response = await fetch(`${API_URL}/quiz/leaderboard/${subjectId}`);
      const data = await response.json();
      setGlobalLeaderboard(data.leaderboard || []);
    } catch (error) {
      console.error('Error loading global leaderboard:', error);
    } finally {
      setLoadingGlobal(false);
    }
  };

  const joinQuiz = async () => {
    if (!accessCode.trim()) {
      setError('Введите код викторины');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await fetch(`${API_URL}/quiz/code/${accessCode.toUpperCase()}`);
      const data = await response.json();

      if (!response.ok) {
        setError(data.message || 'Викторина не найдена');
        setLoading(false);
        return;
      }

      setQuiz(data.quiz);

      const newSocket = io(SOCKET_URL);

      newSocket.on('connect', () => {
        newSocket.emit('student:join-quiz', {
          quizId: data.quiz.id,
          userId: studentId
        });
      });

      newSocket.on('student:joined', ({ quiz }) => {
        setLoading(false);
        if (quiz.status === 'active') {
          setView('playing');
        } else {
          setView('lobby');
        }
      });

      newSocket.on('quiz:started', () => setView('playing'));

      newSocket.on('quiz:new-question', ({ question, questionIndex, totalQuestions }) => {
        setCurrentQuestion(question);
        setQuestionIndex(questionIndex);
        setTotalQuestions(totalQuestions);
        setTimeLeft(question.timeLimit);
        setSelectedAnswer(null);
        setAnswered(false);
        setAnswerResult(null);
        setShowCorrect(false);
        setCorrectAnswer(null);
        setExplanation(null);
        questionStartTime.current = Date.now();
      });

      newSocket.on('quiz:question-ended', ({ correctAnswer, explanation }) => {
        setShowCorrect(true);
        setCorrectAnswer(correctAnswer);
        setExplanation(explanation);
      });

      newSocket.on('student:answer-received', ({ isCorrect, score }) => {
        setAnswerResult({ isCorrect, score });
        setMyScore(prev => prev + score);
      });

      newSocket.on('leaderboard:updated', ({ leaderboard }) => {
        setLeaderboard(leaderboard);
        const myIndex = leaderboard.findIndex(p => p.userId === studentId);
        if (myIndex !== -1) {
          setMyRank(myIndex + 1);
          setMyScore(parseFloat(leaderboard[myIndex].totalScore));
        }
      });

      newSocket.on('quiz:finished', ({ leaderboard }) => {
        setFinalLeaderboard(leaderboard);
        const myIndex = leaderboard.findIndex(p => p.userId === studentId);
        if (myIndex !== -1) {
          setMyRank(myIndex + 1);
          setMyScore(parseFloat(leaderboard[myIndex].totalScore));
        }
        setView('results');
      });

      newSocket.on('error', ({ message }) => {
        setError(message);
        setLoading(false);
      });

      setSocket(newSocket);

    } catch (error) {
      console.error('Error joining quiz:', error);
      setError('Ошибка подключения');
      setLoading(false);
    }
  };

  const submitAnswer = (answerIndex) => {
    if (answered || timeLeft === 0) return;

    const responseTime = Date.now() - questionStartTime.current;
    setSelectedAnswer(answerIndex);
    setAnswered(true);

    socket.emit('student:submit-answer', {
      quizId: quiz.id,
      questionId: currentQuestion.id,
      userId: studentId,
      selectedAnswer: answerIndex,
      responseTime
    });
  };

  const exitQuiz = () => {
    if (socket) {
      socket.disconnect();
      setSocket(null);
    }
    setView('enter');
    setAccessCode('');
    setQuiz(null);
    setCurrentQuestion(null);
    setLeaderboard([]);
    setFinalLeaderboard([]);
    setMyScore(0);
    setMyRank(null);
    setError('');
  };

  // Если в игре - не показываем главные вкладки
  if (view !== 'enter') {
    // ========== ЛОББИ ==========
    if (view === 'lobby') {
      return (
        <div className="section quiz-section">
          <div className="quiz-lobby">
            <div className="lobby-pulse">
              <div className="pulse-circle"></div>
              <div className="pulse-circle"></div>
              <div className="pulse-circle"></div>
            </div>

            <h1>Ожидание старта</h1>
            <p className="lobby-subtitle">Преподаватель скоро запустит викторину</p>

            <div className="lobby-quiz-info">
              <div className="info-row">
                <span className="info-label">Викторина:</span>
                <span className="info-value">{quiz?.title}</span>
              </div>
              <div className="info-row">
                <span className="info-label">Предмет:</span>
                <span className="info-value">{quiz?.subject?.icon} {quiz?.subject?.name}</span>
              </div>
              <div className="info-row">
                <span className="info-label">Вопросов:</span>
                <span className="info-value">{quiz?.questions?.length}</span>
              </div>
              <div className="info-row">
                <span className="info-label">Код:</span>
                <span className="info-value access-code">{quiz?.accessCode}</span>
              </div>
            </div>

            <button className="exit-button" onClick={exitQuiz}>← Выйти</button>
          </div>
        </div>
      );
    }

    // ========== ПРОХОЖДЕНИЕ ==========
    if (view === 'playing') {
      if (!currentQuestion) {
        return (
          <div className="section quiz-section">
            <div className="quiz-waiting">
              <div className="loading-spinner-big"></div>
              <p>Загрузка вопроса...</p>
            </div>
          </div>
        );
      }

      const progress = ((questionIndex + 1) / totalQuestions) * 100;
      const timeProgress = (timeLeft / currentQuestion.timeLimit) * 100;

      return (
        <div className="section quiz-section playing">
          <div className="quiz-playing-header">
            <div className="question-counter">Вопрос {questionIndex + 1} / {totalQuestions}</div>
            <div className="my-score-mini">⭐ {myScore.toFixed(1)}</div>
          </div>

          <div className="questions-progress">
            <div className="questions-progress-fill" style={{ width: `${progress}%` }}></div>
          </div>

          <div className="time-container">
            <div className="time-display">
              <span className={`time-number ${timeLeft <= 5 ? 'urgent' : ''}`}>{timeLeft}</span>
              <span className="time-label">сек</span>
            </div>
            <div className="time-progress-bar">
              <div 
                className={`time-progress-fill ${timeLeft <= 5 ? 'urgent' : ''}`}
                style={{ width: `${timeProgress}%` }}
              ></div>
            </div>
          </div>

          <div className="question-card">
            <h2 className="question-text">{currentQuestion.questionText}</h2>

            <div className="answer-grid">
              {currentQuestion.options.map((option, index) => {
                const isSelected = selectedAnswer === index;
                const isCorrect = showCorrect && correctAnswer === index;
                const isWrong = showCorrect && isSelected && correctAnswer !== index;

                return (
                  <button
                    key={index}
                    className={`answer-btn answer-${index} ${isSelected ? 'selected' : ''} ${isCorrect ? 'correct' : ''} ${isWrong ? 'wrong' : ''}`}
                    onClick={() => submitAnswer(index)}
                    disabled={answered || timeLeft === 0}
                  >
                    <span className="answer-letter">{String.fromCharCode(65 + index)}</span>
                    <span className="answer-text">{option}</span>
                    {isCorrect && <span className="answer-icon">✓</span>}
                    {isWrong && <span className="answer-icon">✗</span>}
                  </button>
                );
              })}
            </div>

            {answered && answerResult && !showCorrect && (
              <div className={`answer-feedback ${answerResult.isCorrect ? 'correct' : 'wrong'}`}>
                <div className="feedback-icon">{answerResult.isCorrect ? '✅' : '⏳'}</div>
                <div className="feedback-text">
                  {answerResult.isCorrect 
                    ? `Ответ принят! +${answerResult.score.toFixed(1)} баллов` 
                    : 'Ответ принят. Ждём остальных...'}
                </div>
              </div>
            )}

            {showCorrect && (
              <div className="question-result">
                <div className={`result-banner ${selectedAnswer === correctAnswer ? 'correct' : 'wrong'}`}>
                  {selectedAnswer === correctAnswer 
                    ? '🎉 Правильно!' 
                    : selectedAnswer === null 
                    ? '⏰ Время вышло' 
                    : '❌ Неправильно'}
                </div>
                {explanation && (
                  <div className="explanation-box">
                    <strong>💡 Объяснение:</strong>
                    <p>{explanation}</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {leaderboard.length > 0 && (
            <div className="mini-leaderboard">
              <h3>🏆 Топ-3 (текущая викторина)</h3>
              {leaderboard.slice(0, 3).map((p, i) => (
                <div 
                  key={p.id} 
                  className={`mini-leader ${p.userId === studentId ? 'me' : ''}`}
                >
                  <span className="mini-rank">
                    {i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'}
                  </span>
                  <span className="mini-name">
                    {p.user?.firstName} {p.user?.lastName?.[0]}.
                  </span>
                  <span className="mini-score">{parseFloat(p.totalScore).toFixed(1)}</span>
                </div>
              ))}
              {myRank > 3 && (
                <div className="my-rank-info">
                  Ваше место: <strong>#{myRank}</strong>
                </div>
              )}
            </div>
          )}
        </div>
      );
    }

    // ========== РЕЗУЛЬТАТЫ ==========
    if (view === 'results') {
      const top3 = finalLeaderboard.slice(0, 3);

      return (
        <div className="section quiz-section results">
          <div className="results-header">
            <h1>🎉 Викторина завершена!</h1>
          </div>

          <div className="my-result">
            <div className={`rank-badge rank-${myRank}`}>
              {myRank === 1 ? '🥇' : myRank === 2 ? '🥈' : myRank === 3 ? '🥉' : `#${myRank}`}
            </div>
            <div className="my-result-info">
              <div className="my-result-label">Ваше место</div>
              <div className="my-result-rank">
                {myRank}-е место из {finalLeaderboard.length}
              </div>
              <div className="my-result-score">⭐ {myScore.toFixed(1)} баллов</div>
            </div>
          </div>

          {top3.length >= 3 && (
            <div className="podium">
              <div className="podium-place place-2">
                <div className="podium-avatar">
                  {top3[1].user?.firstName?.[0]}{top3[1].user?.lastName?.[0]}
                </div>
                <div className="podium-name">
                  {top3[1].user?.firstName} {top3[1].user?.lastName?.[0]}.
                </div>
                <div className="podium-score">{parseFloat(top3[1].totalScore).toFixed(1)}</div>
                <div className="podium-stand silver">🥈<span>2</span></div>
              </div>

              <div className="podium-place place-1">
                <div className="crown">👑</div>
                <div className="podium-avatar">
                  {top3[0].user?.firstName?.[0]}{top3[0].user?.lastName?.[0]}
                </div>
                <div className="podium-name">
                  {top3[0].user?.firstName} {top3[0].user?.lastName?.[0]}.
                </div>
                <div className="podium-score">{parseFloat(top3[0].totalScore).toFixed(1)}</div>
                <div className="podium-stand gold">🥇<span>1</span></div>
              </div>

              <div className="podium-place place-3">
                <div className="podium-avatar">
                  {top3[2].user?.firstName?.[0]}{top3[2].user?.lastName?.[0]}
                </div>
                <div className="podium-name">
                  {top3[2].user?.firstName} {top3[2].user?.lastName?.[0]}.
                </div>
                <div className="podium-score">{parseFloat(top3[2].totalScore).toFixed(1)}</div>
                <div className="podium-stand bronze">🥉<span>3</span></div>
              </div>
            </div>
          )}

          <div className="full-leaderboard">
            <h3>🏆 Лидерборд викторины</h3>
            {finalLeaderboard.map((p, i) => (
              <div 
                key={p.id} 
                className={`leader-row ${p.userId === studentId ? 'me' : ''} ${i < 3 ? 'top3' : ''}`}
              >
                <span className="leader-rank">
                  {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
                </span>
                <div className="leader-avatar">
                  {p.user?.firstName?.[0]}{p.user?.lastName?.[0]}
                </div>
                <div className="leader-info">
                  <div className="leader-name">
                    {p.user?.firstName} {p.user?.lastName}
                    {p.userId === studentId && <span className="me-badge">Вы</span>}
                  </div>
                  <div className="leader-username">@{p.user?.telegramUsername}</div>
                </div>
                <div className="leader-score">
                  <strong>{parseFloat(p.totalScore).toFixed(1)}</strong>
                  <span>баллов</span>
                </div>
              </div>
            ))}
          </div>

          <button className="exit-button big" onClick={exitQuiz}>← К викторинам</button>
        </div>
      );
    }
  }

  // ========== ГЛАВНЫЙ ЭКРАН С ВКЛАДКАМИ ==========
  return (
    <div className="section quiz-section">
      {/* Главные вкладки */}
      <div className="main-tabs">
        <button 
          className={`main-tab ${mainTab === 'play' ? 'active' : ''}`}
          onClick={() => setMainTab('play')}
        >
          🎮 Играть
        </button>
        <button 
          className={`main-tab ${mainTab === 'leaderboard' ? 'active' : ''}`}
          onClick={() => setMainTab('leaderboard')}
        >
          🏆 Лидерборд
        </button>
      </div>

      {/* ВКЛАДКА: ИГРАТЬ */}
      {mainTab === 'play' && (
        <div className="quiz-enter">
          <div className="quiz-icon-big">🎯</div>
          <h1 className="quiz-title">Викторина</h1>
          <p className="quiz-subtitle">Введите код викторины от преподавателя</p>

          <div className="code-input-container">
            <input
              type="text"
              className="code-input"
              placeholder="XXXXXX"
              value={accessCode}
              onChange={(e) => {
                setAccessCode(e.target.value.toUpperCase());
                setError('');
              }}
              maxLength={10}
              onKeyDown={(e) => e.key === 'Enter' && joinQuiz()}
              autoFocus
            />
          </div>

          {error && <div className="error-message">⚠️ {error}</div>}

          <button
            className="join-button"
            onClick={joinQuiz}
            disabled={loading || !accessCode.trim()}
          >
            {loading ? 'Подключение...' : '🚀 Присоединиться'}
          </button>

          <div className="quiz-hint">
            💡 Код состоит из 6 символов и выдаётся преподавателем
          </div>
        </div>
      )}

      {/* ВКЛАДКА: ГЛОБАЛЬНЫЙ ЛИДЕРБОРД */}
      {mainTab === 'leaderboard' && (
        <div className="global-leaderboard-container">
          <div className="global-header">
            <h2>🏆 Лидерборд</h2>
            <p>Топ-100 учеников по очкам викторин</p>
          </div>

          {globalSubjects.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">📚</div>
              <p>У вас пока нет привязанных предметов</p>
            </div>
          ) : (
            <>
              {/* Выбор предмета */}
              {globalSubjects.length > 1 && (
                <div className="subject-tabs">
                  {globalSubjects.map(subject => (
                    <button
                      key={subject.id}
                      className={`subject-tab ${selectedSubjectId === subject.id ? 'active' : ''}`}
                      onClick={() => setSelectedSubjectId(subject.id)}
                    >
                      <span className="subject-tab-icon">{subject.icon}</span>
                      <span>{subject.name}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* Текущий предмет (если один) */}
              {globalSubjects.length === 1 && (
                <div className="single-subject-banner">
                  <span className="subject-icon-big">{globalSubjects[0].icon}</span>
                  <h3>{globalSubjects[0].name}</h3>
                </div>
              )}

              {/* Лидерборд */}
              {loadingGlobal ? (
                <div className="quiz-waiting">
                  <div className="loading-spinner-big"></div>
                  <p>Загрузка лидерборда...</p>
                </div>
              ) : globalLeaderboard.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-icon">🏆</div>
                  <p>Лидерборд пустой</p>
                  <p style={{ fontSize: 14, color: '#6b7280', marginTop: 8 }}>
                    Пройдите викторину чтобы попасть сюда!
                  </p>
                </div>
              ) : (
                <div className="global-leaderboard">
                  {/* Топ-3 подиум */}
                  {globalLeaderboard.length >= 3 && (
                    <div className="podium">
                      <div className="podium-place place-2">
                        <div className="podium-avatar">
                          {globalLeaderboard[1].firstName?.[0]}{globalLeaderboard[1].lastName?.[0]}
                        </div>
                        <div className="podium-name">
                          {globalLeaderboard[1].firstName} {globalLeaderboard[1].lastName?.[0]}.
                        </div>
                        <div className="podium-score">
                          {parseFloat(globalLeaderboard[1].totalScore).toFixed(1)}
                        </div>
                        <div className="podium-stand silver">🥈<span>2</span></div>
                      </div>

                      <div className="podium-place place-1">
                        <div className="crown">👑</div>
                        <div className="podium-avatar">
                          {globalLeaderboard[0].firstName?.[0]}{globalLeaderboard[0].lastName?.[0]}
                        </div>
                        <div className="podium-name">
                          {globalLeaderboard[0].firstName} {globalLeaderboard[0].lastName?.[0]}.
                        </div>
                        <div className="podium-score">
                          {parseFloat(globalLeaderboard[0].totalScore).toFixed(1)}
                        </div>
                        <div className="podium-stand gold">🥇<span>1</span></div>
                      </div>

                      <div className="podium-place place-3">
                        <div className="podium-avatar">
                          {globalLeaderboard[2].firstName?.[0]}{globalLeaderboard[2].lastName?.[0]}
                        </div>
                        <div className="podium-name">
                          {globalLeaderboard[2].firstName} {globalLeaderboard[2].lastName?.[0]}.
                        </div>
                        <div className="podium-score">
                          {parseFloat(globalLeaderboard[2].totalScore).toFixed(1)}
                        </div>
                        <div className="podium-stand bronze">🥉<span>3</span></div>
                      </div>
                    </div>
                  )}

                  {/* Список с 4 места */}
                  <div className="leaderboard-list">
                    {globalLeaderboard.map((p, i) => (
                      <div 
                        key={p.userId} 
                        className={`leader-row ${p.userId === studentId ? 'me' : ''} ${i < 3 ? 'top3' : ''}`}
                      >
                        <span className="leader-rank">
                          {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
                        </span>
                        <div className="leader-avatar">
                          {p.firstName?.[0]}{p.lastName?.[0]}
                        </div>
                        <div className="leader-info">
                          <div className="leader-name">
                            {p.firstName} {p.lastName}
                            {p.userId === studentId && <span className="me-badge">Вы</span>}
                          </div>
                          <div className="leader-stats">
                            🎯 {p.quizzesPlayed} викторин • ✓ {p.correctAnswers}/{p.totalAnswers}
                          </div>
                        </div>
                        <div className="leader-score">
                          <strong>{parseFloat(p.totalScore).toFixed(1)}</strong>
                          <span>баллов</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default Quiz;