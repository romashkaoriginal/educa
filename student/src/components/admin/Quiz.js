import React, { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import './Quiz.css';

const API_URL = 'https://educa-production-a98e.up.railway.app/api';
const SOCKET_URL = 'https://educa-production-a98e.up.railway.app';

function Quiz({ subjects, currentUserId }) {
  const [quizzes, setQuizzes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('list'); // list, create, live
  const [activeQuiz, setActiveQuiz] = useState(null);
  const [socket, setSocket] = useState(null);

  // Форма создания
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    subjectId: ''
  });
  const [questions, setQuestions] = useState([]);
  const [currentQ, setCurrentQ] = useState({
    questionText: '',
    options: ['', '', '', ''],
    correctAnswer: 0,
    timeLimit: 30,
    points: 1,
    explanation: ''
  });

  // Live режим
  const [participants, setParticipants] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [totalQuestions, setTotalQuestions] = useState(0);
  const [timeLeft, setTimeLeft] = useState(0);

  useEffect(() => {
    loadQuizzes();
  }, []);

  useEffect(() => {
    if (view === 'live' && activeQuiz && !socket) {
      const newSocket = io(SOCKET_URL);
      
      newSocket.on('connect', () => {
        newSocket.emit('admin:join-quiz', { quizId: activeQuiz.id });
      });

      newSocket.on('participants:updated', ({ participants }) => {
        setParticipants(participants);
      });

      newSocket.on('leaderboard:updated', ({ leaderboard }) => {
        setLeaderboard(leaderboard);
      });

      newSocket.on('quiz:new-question-admin', ({ question, questionIndex, totalQuestions }) => {
        setCurrentQuestion(question);
        setQuestionIndex(questionIndex);
        setTotalQuestions(totalQuestions);
        setTimeLeft(question.timeLimit);
      });

      newSocket.on('quiz:finished', ({ leaderboard }) => {
        setLeaderboard(leaderboard);
        setCurrentQuestion(null);
        alert('Викторина завершена!');
      });

      setSocket(newSocket);

      return () => {
        newSocket.disconnect();
      };
    }
  }, [view, activeQuiz]);

  // Таймер
  useEffect(() => {
    if (timeLeft > 0) {
      const timer = setTimeout(() => setTimeLeft(timeLeft - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [timeLeft]);

  const loadQuizzes = async () => {
    try {
      const response = await fetch(`${API_URL}/quiz/all`);
      const data = await response.json();
      setQuizzes(data.quizzes || []);
    } catch (error) {
      console.error('Error loading quizzes:', error);
    } finally {
      setLoading(false);
    }
  };

  const addQuestion = () => {
    if (!currentQ.questionText.trim()) {
      alert('Введите текст вопроса');
      return;
    }
    if (currentQ.options.some(o => !o.trim())) {
      alert('Заполните все варианты ответа');
      return;
    }

    setQuestions([...questions, { ...currentQ }]);
    setCurrentQ({
      questionText: '',
      options: ['', '', '', ''],
      correctAnswer: 0,
      timeLimit: 30,
      points: 1,
      explanation: ''
    });
  };

  const removeQuestion = (index) => {
    setQuestions(questions.filter((_, i) => i !== index));
  };

  const saveQuiz = async () => {
    if (!formData.title || !formData.subjectId) {
      alert('Заполните название и предмет');
      return;
    }
    if (questions.length === 0) {
      alert('Добавьте хотя бы один вопрос');
      return;
    }

    try {
      const response = await fetch(`${API_URL}/quiz/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          subjectId: parseInt(formData.subjectId),
          questions,
          createdBy: currentUserId || 1
        })
      });

      if (response.ok) {
        alert('Викторина создана!');
        setFormData({ title: '', description: '', subjectId: '' });
        setQuestions([]);
        setView('list');
        loadQuizzes();
      }
    } catch (error) {
      console.error('Error:', error);
      alert('Ошибка создания');
    }
  };

  const startLiveQuiz = (quiz) => {
    setActiveQuiz(quiz);
    setView('live');
    setParticipants([]);
    setLeaderboard([]);
    setCurrentQuestion(null);
  };

  const handleStartQuiz = () => {
    if (socket && participants.length > 0) {
      socket.emit('admin:start-quiz', { quizId: activeQuiz.id });
    } else {
      alert('Подождите, пока ученики подключатся');
    }
  };

  const handleNextQuestion = () => {
    if (socket) {
      socket.emit('admin:next-question', { quizId: activeQuiz.id });
    }
  };

  const handleFinishQuiz = () => {
    if (window.confirm('Завершить викторину досрочно?')) {
      socket.emit('admin:finish-quiz', { quizId: activeQuiz.id });
    }
  };

  const deleteQuiz = async (id) => {
    if (!window.confirm('Удалить викторину?')) return;
    try {
      await fetch(`${API_URL}/quiz/${id}`, { method: 'DELETE' });
      loadQuizzes();
    } catch (error) {
      console.error('Error:', error);
    }
  };

  // LIVE РЕЖИМ
  if (view === 'live' && activeQuiz) {
    return (
      <div className="admin-section quiz-live">
        <div className="live-header">
          <button className="back-btn" onClick={() => {
            socket?.disconnect();
            setSocket(null);
            setView('list');
            setActiveQuiz(null);
          }}>← Назад</button>
          <h2>{activeQuiz.title}</h2>
          <div className="access-code-big">
            <span>КОД:</span>
            <strong>{activeQuiz.accessCode}</strong>
          </div>
        </div>

        <div className="live-grid">
          {/* Контроль */}
          <div className="live-control">
            {!currentQuestion && (
              <div className="lobby">
                <h3>👥 Лобби</h3>
                <p className="lobby-info">Ученики подключаются по коду <strong>{activeQuiz.accessCode}</strong></p>
                <div className="participants-count">
                  <span className="count-big">{participants.length}</span>
                  <span>участников</span>
                </div>
                <button 
                  className="start-button"
                  onClick={handleStartQuiz}
                  disabled={participants.length === 0}
                >
                  🚀 Запустить викторину
                </button>
              </div>
            )}

            {currentQuestion && (
              <div className="current-question-admin">
                <div className="q-header">
                  <span>Вопрос {questionIndex + 1} из {totalQuestions}</span>
                  <span className={`timer ${timeLeft <= 5 ? 'urgent' : ''}`}>⏱ {timeLeft}с</span>
                </div>
                <h3>{currentQuestion.questionText}</h3>
                <div className="admin-options">
                  {currentQuestion.options.map((opt, i) => (
                    <div key={i} className={`admin-option ${i === currentQuestion.correctAnswer ? 'correct' : ''}`}>
                      <span>{String.fromCharCode(65 + i)}</span>
                      <span>{opt}</span>
                      {i === currentQuestion.correctAnswer && <span className="check">✓</span>}
                    </div>
                  ))}
                </div>
                <div className="control-buttons">
                  <button className="next-button" onClick={handleNextQuestion}>
                    {questionIndex + 1 < totalQuestions ? 'Следующий вопрос →' : 'Завершить'}
                  </button>
                  <button className="finish-button" onClick={handleFinishQuiz}>
                    Завершить досрочно
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Участники + Лидерборд */}
          <div className="live-side">
            <div className="participants-list">
              <h3>👥 Участники ({participants.length})</h3>
              <div className="list-scroll">
                {participants.map(p => (
                  <div key={p.id} className="participant-item">
                    <div className="participant-avatar">
                      {p.user?.firstName?.[0]}{p.user?.lastName?.[0]}
                    </div>
                    <div>
                      <div>{p.user?.firstName} {p.user?.lastName}</div>
                      <small>@{p.user?.telegramUsername}</small>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="leaderboard-live">
              <h3>🏆 Лидерборд</h3>
              <div className="list-scroll">
                {leaderboard.map((p, i) => (
                  <div key={p.id} className={`leader-item rank-${i + 1}`}>
                    <span className="rank">
                      {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
                    </span>
                    <span className="name">{p.user?.firstName} {p.user?.lastName}</span>
                    <span className="score">{parseFloat(p.totalScore).toFixed(1)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // СОЗДАНИЕ
  if (view === 'create') {
    return (
      <div className="admin-section">
        <div className="section-header">
          <button className="back-btn" onClick={() => setView('list')}>← Назад</button>
          <h2>Создать викторину</h2>
        </div>

        <div className="quiz-form">
          <input
            type="text"
            placeholder="Название викторины"
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            className="form-input"
          />
          <textarea
            placeholder="Описание (необязательно)"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            className="form-textarea"
          />
          <select
            value={formData.subjectId}
            onChange={(e) => setFormData({ ...formData, subjectId: e.target.value })}
            className="form-select"
          >
            <option value="">Выберите предмет</option>
            {subjects.map(s => (
              <option key={s.id} value={s.id}>{s.icon} {s.name}</option>
            ))}
          </select>

          <div className="questions-section">
            <h3>Вопросы ({questions.length})</h3>
            {questions.map((q, i) => (
              <div key={i} className="question-item">
                <div className="q-num">{i + 1}</div>
                <div className="q-content">
                  <strong>{q.questionText}</strong>
                  <div className="q-meta">
                    ⏱ {q.timeLimit}с • ⭐ {q.points} балл • ✓ {String.fromCharCode(65 + q.correctAnswer)}
                  </div>
                </div>
                <button onClick={() => removeQuestion(i)} className="remove-btn">✕</button>
              </div>
            ))}

            <div className="add-question-form">
              <input
                type="text"
                placeholder="Текст вопроса"
                value={currentQ.questionText}
                onChange={(e) => setCurrentQ({ ...currentQ, questionText: e.target.value })}
                className="form-input"
              />
              {currentQ.options.map((opt, i) => (
                <div key={i} className="option-input-row">
                  <input
                    type="radio"
                    name="correctAnswer"
                    checked={currentQ.correctAnswer === i}
                    onChange={() => setCurrentQ({ ...currentQ, correctAnswer: i })}
                  />
                  <span>{String.fromCharCode(65 + i)}</span>
                  <input
                    type="text"
                    placeholder={`Вариант ${String.fromCharCode(65 + i)}`}
                    value={opt}
                    onChange={(e) => {
                      const newOpts = [...currentQ.options];
                      newOpts[i] = e.target.value;
                      setCurrentQ({ ...currentQ, options: newOpts });
                    }}
                    className="form-input"
                  />
                </div>
              ))}
              <div className="form-row">
                <label>Время (сек):</label>
                <input
                  type="number"
                  value={currentQ.timeLimit}
                  onChange={(e) => setCurrentQ({ ...currentQ, timeLimit: parseInt(e.target.value) || 30 })}
                  className="form-input"
                />
                <label>Баллы:</label>
                <input
                  type="number"
                  step="0.5"
                  value={currentQ.points}
                  onChange={(e) => setCurrentQ({ ...currentQ, points: parseFloat(e.target.value) || 1 })}
                  className="form-input"
                />
              </div>
              <input
                type="text"
                placeholder="Объяснение (необязательно)"
                value={currentQ.explanation}
                onChange={(e) => setCurrentQ({ ...currentQ, explanation: e.target.value })}
                className="form-input"
              />
              <button onClick={addQuestion} className="add-btn">+ Добавить вопрос</button>
            </div>
          </div>

          <button onClick={saveQuiz} className="save-btn">💾 Сохранить викторину</button>
        </div>
      </div>
    );
  }

  // СПИСОК
  return (
    <div className="admin-section">
      <div className="section-header">
        <h2>🎯 Викторины</h2>
        <button className="primary-btn" onClick={() => setView('create')}>+ Создать</button>
      </div>

      {loading ? <p>Загрузка...</p> : (
        <div className="quizzes-grid">
          {quizzes.length === 0 ? (
            <div className="empty-state">
              <p>Нет викторин. Создайте первую!</p>
            </div>
          ) : quizzes.map(q => (
            <div key={q.id} className="quiz-card">
              <div className="quiz-header">
                <span className="subject-icon">{q.subject?.icon}</span>
                <div>
                  <h3>{q.title}</h3>
                  <small>{q.subject?.name}</small>
                </div>
                <span className={`status-badge status-${q.status}`}>
                  {q.status === 'draft' && '📝 Черновик'}
                  {q.status === 'active' && '🔴 Активна'}
                  {q.status === 'finished' && '✅ Завершена'}
                </span>
              </div>
              <p className="quiz-description">{q.description}</p>
              <div className="quiz-info">
                <span>📚 {q.questions?.length || 0} вопросов</span>
                <span>👥 {q.participants?.length || 0} участников</span>
              </div>
              <div className="quiz-code">
                Код: <strong>{q.accessCode}</strong>
              </div>
              <div className="quiz-actions">
                {q.status !== 'finished' && (
                  <button onClick={() => startLiveQuiz(q)} className="live-btn">
                    🎮 Запустить
                  </button>
                )}
                <button onClick={() => deleteQuiz(q.id)} className="delete-btn">
                  🗑
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default Quiz;