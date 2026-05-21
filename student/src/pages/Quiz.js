import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import './Quiz.css';

const API_URL = 'https://educa-production-a98e.up.railway.app/api';
const SOCKET_URL = 'https://educa-production-a98e.up.railway.app';

function Quiz({ studentId }) {
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
  
  // Лидерборд (только для отображения во время игры)
  const [participants, setParticipants] = useState([]);
  const [myScore, setMyScore] = useState(0);

  const questionStartTime = useRef(null);

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

      // Обновление участников (для мини-лидерборда во время игры)
      newSocket.on('participants:updated', ({ participants }) => {
        // Сортируем по totalScore
        const sorted = [...participants].sort((a, b) => 
          (parseFloat(b.totalScore) || 0) - (parseFloat(a.totalScore) || 0)
        );
        setParticipants(sorted);
      });

      newSocket.on('quiz:finished', () => {
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
    setParticipants([]);
    setMyScore(0);
    setError('');
  };

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
    
    // Найти моё место в списке участников
    const myRank = participants.findIndex(p => p.userId === studentId) + 1;

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

        {/* МИНИ-ЛИДЕРБОРД во время игры */}
        {participants.length > 0 && (
          <div className="mini-leaderboard">
            <h3>🏆 Топ-3 (текущая викторина)</h3>
            {participants.slice(0, 3).map((p, i) => (
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
                <span className="mini-score">{parseFloat(p.totalScore || 0).toFixed(1)}</span>
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
    return (
      <div className="section quiz-section results">
        <div className="results-header">
          <h1>🎉 Викторина завершена!</h1>
        </div>

        <div className="my-result">
          <div className="rank-badge">
            ⭐
          </div>
          <div className="my-result-info">
            <div className="my-result-label">Ваш результат</div>
            <div className="my-result-score">⭐ {myScore.toFixed(1)} баллов</div>
          </div>
        </div>

        <button className="exit-button big" onClick={exitQuiz}>← К викторинам</button>
      </div>
    );
  }

  // ========== ГЛАВНЫЙ ЭКРАН ==========
  return (
    <div className="section quiz-section">
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
    </div>
  );
}

export default Quiz;