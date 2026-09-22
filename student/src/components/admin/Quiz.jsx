import React, { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import '../../styles/Quiz.css';
import { adminFetch, getTelegramInitData } from './adminApi';

import { API_URL, SOCKET_URL } from '../../config';
import { useSectionRefresh } from './useSectionRefresh';
import { useConfirmDelete } from './useConfirmDelete';
import { getDeleteConfirm } from './cascadeDeleteMessages';
import MathText, { LatexHelp } from '../MathText';
import StreamPresentation from './StreamPresentation';

function Quiz({ subjects, currentUserId, dataRefreshKey = 0, isActive = true, onOpenLesson }) {
  const { confirmDelete, ConfirmDeleteDialog } = useConfirmDelete();
  const [quizzes, setQuizzes] = useState([]);
  const [scheduledLessons, setScheduledLessons] = useState([]);
  const [scheduledLessonsLoading, setScheduledLessonsLoading] = useState(false);
  const [scheduledLessonsError, setScheduledLessonsError] = useState('');
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('list');
  const [activeQuiz, setActiveQuiz] = useState(null);
  const [editingQuiz, setEditingQuiz] = useState(null);
  const [editData, setEditData] = useState({ title: '', lessonId: '' });
  const [editQuestions, setEditQuestions] = useState([]);
  const [editingQuestionId, setEditingQuestionId] = useState(null);
  const [editCurrentQ, setEditCurrentQ] = useState({
    questionText: '', options: ['', '', '', ''],
    correctAnswer: 0, timeLimit: 30, explanation: ''
  });
  const [historyStream, setHistoryStream] = useState(null);
  const [socket, setSocket] = useState(null);

  // Форма создания
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    subjectId: '',
    lessonId: '',
    showLeaderboardAfterQuestion: true,
    showQuestionReview: true,
    showExplanations: true
  });
  const [questions, setQuestions] = useState([]);
  const [currentQ, setCurrentQ] = useState({
    questionText: '', options: ['', '', '', ''],
    correctAnswer: 0, timeLimit: 30, points: 1, explanation: ''
  });

  const [showImportModal, setShowImportModal] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importResult, setImportResult] = useState(null);

  // Live режим
  const [participants, setParticipants] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [totalQuestions, setTotalQuestions] = useState(0);
  const [timeLeft, setTimeLeft] = useState(0);

  // Генерация кода
  const [currentCode, setCurrentCode] = useState(null);
  const [generatingCode, setGeneratingCode] = useState(false);

  // Результаты
  const [resultsQuiz, setResultsQuiz] = useState(null);
  const [resultsData, setResultsData] = useState(null);
  const [loadingResults, setLoadingResults] = useState(false);

  useEffect(() => {
    if (!isActive) return;
    loadQuizzes();
    loadScheduledLessons();
    // The admin keeps visited sections mounted, so data must refresh on every return.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive]);

  // Сокет подключается ТОЛЬКО когда есть код
  useEffect(() => {
    if (view === 'live' && activeQuiz && currentCode && !socket) {
      const newSocket = io(SOCKET_URL, {
        auth: { initData: getTelegramInitData() },
      });

      newSocket.on('connect', () => {
        newSocket.emit('admin:join-quiz', { quizId: activeQuiz.id });
      });

      newSocket.on('participants:updated', ({ participants }) => {
        setParticipants(participants);
        const sorted = [...(participants || [])].sort(
          (a, b) => (parseFloat(b.totalScore) || 0) - (parseFloat(a.totalScore) || 0)
        );
        setLeaderboard(sorted);
      });

      newSocket.on('leaderboard:updated', ({ leaderboard }) => {
        const sorted = [...leaderboard].sort((a, b) =>
          (parseFloat(b.totalScore) || 0) - (parseFloat(a.totalScore) || 0)
        );
        setLeaderboard(sorted);
      });

      newSocket.on('quiz:new-question-admin', ({ question, questionIndex, totalQuestions }) => {
        setCurrentQuestion(question);
        setQuestionIndex(questionIndex);
        setTotalQuestions(totalQuestions);
        setTimeLeft(question.timeLimit);
      });

      newSocket.on('quiz:finished', async () => {
        setCurrentQuestion(null);
        setParticipants([]);
        setLeaderboard([]);
        const quizId = activeQuiz.id;
        const quizSnapshot = { ...activeQuiz, status: 'finished' };
        newSocket.disconnect();
        setSocket(null);
        setResultsQuiz(quizSnapshot);
        setLoadingResults(true);
        setView('results');
        try {
          const response = await adminFetch(`${API_URL}/quiz/${quizId}/results`);
          const data = await response.json();
          setResultsData(data);
        } catch (error) {
          console.error('Error loading results after finish:', error);
          setResultsData(null);
        } finally {
          setLoadingResults(false);
        }
        loadQuizzes();
      });

      setSocket(newSocket);
      return () => { newSocket.disconnect(); };
    }
  }, [view, activeQuiz, currentCode]);

  // Таймер
  useEffect(() => {
    if (timeLeft > 0) {
      const timer = setTimeout(() => setTimeLeft(timeLeft - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [timeLeft]);

  const loadQuizzes = async () => {
    try {
      const response = await adminFetch(`${API_URL}/lesson-admin/standalone-quizzes`);
      const data = await response.json();
      setQuizzes(data.quizzes || []);
    } catch (error) {
      console.error('Error loading quizzes:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadScheduledLessons = async () => {
    setScheduledLessonsLoading(true);
    setScheduledLessonsError('');
    try {
      const response = await adminFetch(`${API_URL}/lesson-admin/scheduled-lessons-for-quizzes`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Не удалось загрузить занятия');
      setScheduledLessons(data.lessons || []);
    } catch (error) {
      console.error('Error loading scheduled lessons:', error);
      setScheduledLessonsError(error.message || 'Не удалось загрузить занятия');
    } finally {
      setScheduledLessonsLoading(false);
    }
  };

  useSectionRefresh(dataRefreshKey, () => {
    loadQuizzes();
    loadScheduledLessons();
  });

  const openCreateView = () => {
    loadScheduledLessons();
    setView('create');
  };

  const openEditView = (quiz) => {
    if (quiz.lesson?.status === 'live') {
      alert('Нельзя изменить викторину: занятие уже идёт');
      return;
    }
    setEditingQuiz(quiz);
    setEditData({ title: quiz.title || '', lessonId: String(quiz.lesson?.id || quiz.lessonId || '') });
    setEditQuestions([...(quiz.questions || [])].sort((a, b) => a.order - b.order));
    setEditingQuestionId(null);
    setEditCurrentQ({ questionText: '', options: ['', '', '', ''], correctAnswer: 0, timeLimit: 30, explanation: '' });
    loadScheduledLessons();
    setView('edit');
  };

  const resetEditCurrentQ = () => {
    setEditingQuestionId(null);
    setEditCurrentQ({ questionText: '', options: ['', '', '', ''], correctAnswer: 0, timeLimit: 30, explanation: '' });
  };

  const startEditQuestion = (question) => {
    setEditingQuestionId(question.id);
    setEditCurrentQ({
      questionText: question.questionText || '',
      options: question.options || ['', '', '', ''],
      correctAnswer: Array.isArray(question.correctAnswer) ? question.correctAnswer[0] : (question.correctAnswer || 0),
      timeLimit: question.timeLimit || 30,
      explanation: question.explanation || ''
    });
  };

  const saveEditQuestion = async () => {
    if (!editingQuiz) return;
    if (!editCurrentQ.questionText.trim()) { alert('Введите текст вопроса'); return; }
    if (editCurrentQ.options.some(o => !o.trim())) { alert('Заполните все варианты ответа'); return; }
    const payload = {
      questionText: editCurrentQ.questionText,
      options: editCurrentQ.options,
      correctAnswer: [editCurrentQ.correctAnswer],
      explanation: editCurrentQ.explanation,
      timeLimit: editCurrentQ.timeLimit
    };
    try {
      const url = editingQuestionId
        ? `${API_URL}/lesson-admin/quizzes/${editingQuiz.id}/questions/${editingQuestionId}`
        : `${API_URL}/lesson-admin/quizzes/${editingQuiz.id}/questions`;
      const response = await adminFetch(url, {
        method: editingQuestionId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingQuestionId ? payload : { ...payload, order: editQuestions.length })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || 'Не удалось сохранить вопрос');
      setEditQuestions((prev) => editingQuestionId
        ? prev.map((q) => (q.id === editingQuestionId ? data.question : q))
        : [...prev, data.question]);
      resetEditCurrentQ();
    } catch (error) {
      console.error('Error saving quiz question:', error);
      alert(error.message || 'Не удалось сохранить вопрос');
    }
  };

  const removeEditQuestion = async (question) => {
    if (!editingQuiz) return;
    const confirmed = await confirmDelete(getDeleteConfirm('quizQuestion', { name: question.questionText || 'вопрос' }));
    if (!confirmed) return;
    try {
      const response = await adminFetch(`${API_URL}/lesson-admin/quizzes/${editingQuiz.id}/questions/${question.id}`, { method: 'DELETE' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || 'Не удалось удалить вопрос');
      setEditQuestions((prev) => prev.filter((q) => q.id !== question.id));
      if (editingQuestionId === question.id) resetEditCurrentQ();
    } catch (error) {
      console.error('Error removing quiz question:', error);
      alert(error.message || 'Не удалось удалить вопрос');
    }
  };

  const addQuestion = () => {
    if (!currentQ.questionText.trim()) { alert('Введите текст вопроса'); return; }
    if (currentQ.options.some(o => !o.trim())) { alert('Заполните все варианты ответа'); return; }
    setQuestions([...questions, { ...currentQ }]);
    setCurrentQ({ questionText: '', options: ['', '', '', ''], correctAnswer: 0, timeLimit: 30, points: 1, explanation: '' });
  };

  const removeQuestion = (index) => setQuestions(questions.filter((_, i) => i !== index));

  const downloadTemplate = async () => {
    try {
      const response = await adminFetch(`${API_URL}/quiz/import-template`);
      if (!response.ok) throw new Error('bad response');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'quiz_template.xlsx';
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      alert('Ошибка скачивания шаблона');
    }
  };

  const openImportModal = () => {
    setImportFile(null);
    setImportResult(null);
    setShowImportModal(true);
  };

  const handleImport = async () => {
    if (!importFile) return;
    setImportLoading(true);
    setImportResult(null);
    try {
      const formData = new FormData();
      formData.append('file', importFile);
      const response = await adminFetch(`${API_URL}/quiz/import-questions`, {
        method: 'POST',
        body: formData
      });
      const data = await response.json();
      if (response.ok) {
        setImportResult(data);
        if (data.questions?.length) {
          setQuestions(prev => [...prev, ...data.questions]);
        }
      } else {
        setImportResult({ error: data.message || 'Ошибка импорта' });
      }
    } catch (e) {
      setImportResult({ error: 'Ошибка сети: ' + e.message });
    } finally {
      setImportLoading(false);
    }
  };

  const saveQuiz = async () => {
    if (!formData.title || !formData.lessonId) { alert('Укажите название и занятие'); return; }
    if (questions.length === 0) { alert('Добавьте хотя бы один вопрос'); return; }
    try {
      const response = await adminFetch(`${API_URL}/lesson-admin/lessons/${formData.lessonId}/quizzes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: formData.title, createdBy: currentUserId || 1 })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Не удалось создать викторину');
      for (let order = 0; order < questions.length; order += 1) {
        const question = questions[order];
        const questionResponse = await adminFetch(`${API_URL}/lesson-admin/quizzes/${data.quiz.id}/questions`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            questionText: question.questionText,
            options: question.options,
            correctAnswer: [question.correctAnswer],
            explanation: question.explanation,
            timeLimit: question.timeLimit,
            order
          })
        });
        if (!questionResponse.ok) {
          const error = await questionResponse.json().catch(() => ({}));
          throw new Error(error.message || `Не удалось сохранить вопрос ${order + 1}`);
        }
      }
      setFormData({ title: '', description: '', subjectId: '', lessonId: '', showLeaderboardAfterQuestion: true, showQuestionReview: true, showExplanations: true });
      setQuestions([]);
      setView('list');
      await Promise.all([loadQuizzes(), loadScheduledLessons()]);
    } catch (error) {
      console.error('Error:', error);
      alert(error.message || 'Ошибка создания');
    }
  };

  // Открыть лобби — БЕЗ автоподключения сокета
  const startLiveQuiz = (quiz) => {
    setActiveQuiz(quiz);
    setView('live');
    setParticipants([]);
    setLeaderboard([]);
    setCurrentQuestion(null);
    setCurrentCode(null); // код нужно сгенерировать
    if (socket) { socket.disconnect(); setSocket(null); }
  };

  // Генерация / перегенерация кода
  const generateCode = async () => {
    setGeneratingCode(true);
    try {
      const response = await adminFetch(`${API_URL}/quiz/${activeQuiz.id}/generate-code`, { method: 'POST' });
      const data = await response.json();
      if (response.ok) {
        setCurrentCode(data.accessCode);
        setActiveQuiz(prev => ({ ...prev, accessCode: data.accessCode }));
        // Отключаем старый сокет чтобы переподключиться с новым кодом
        if (socket) { socket.disconnect(); setSocket(null); }
        setParticipants([]);
      } else {
        alert(data.message || 'Ошибка генерации кода');
      }
    } catch (error) {
      console.error('Generate code error:', error);
      alert('Ошибка генерации кода');
    } finally {
      setGeneratingCode(false);
    }
  };

  const handleStartQuiz = () => {
    if (socket && participants.length > 0) {
      socket.emit('admin:start-quiz', { quizId: activeQuiz.id });
    } else if (participants.length === 0) {
      alert('Подождите, пока ученики подключатся');
    }
  };

  const handleNextQuestion = () => {
    if (socket) socket.emit('admin:next-question', { quizId: activeQuiz.id });
  };

  const handleFinishQuiz = () => {
    if (window.confirm('Завершить викторину досрочно?')) {
      socket.emit('admin:finish-quiz', { quizId: activeQuiz.id });
    }
  };

  const deleteQuiz = async (quiz) => {
    if (quiz.lesson?.status === 'live') {
      alert('Нельзя удалить викторину: занятие уже идёт');
      return;
    }
    const confirmed = await confirmDelete(getDeleteConfirm('quiz', {
      name: quiz.title,
    }));
    if (!confirmed) return;
    try {
      const response = await adminFetch(`${API_URL}/lesson-admin/quizzes/${quiz.id}`, { method: 'DELETE' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || 'Не удалось удалить викторину');
      await Promise.all([loadQuizzes(), loadScheduledLessons()]);
    } catch (error) {
      console.error('Error:', error);
      alert(error.message || 'Не удалось удалить викторину');
    }
  };

  const saveQuizEdits = async () => {
    if (!editingQuiz) return;
    if (!editData.title.trim() || !editData.lessonId) {
      alert('Укажите название и занятие');
      return;
    }
    try {
      const response = await adminFetch(`${API_URL}/lesson-admin/quizzes/${editingQuiz.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: editData.title, lessonId: Number(editData.lessonId) })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || 'Не удалось сохранить изменения');
      setEditingQuiz(null);
      setEditData({ title: '', lessonId: '' });
      setView('list');
      await Promise.all([loadQuizzes(), loadScheduledLessons()]);
    } catch (error) {
      console.error('Error updating lesson quiz:', error);
      alert(error.message || 'Не удалось сохранить изменения');
    }
  };

  const viewResults = async (quiz) => {
    setResultsQuiz(quiz);
    setLoadingResults(true);
    setView('results');
    try {
      const response = await adminFetch(`${API_URL}/quiz/${quiz.id}/results`);
      const data = await response.json();
      setResultsData(data);
    } catch (error) {
      console.error('Error loading results:', error);
    } finally {
      setLoadingResults(false);
    }
  };

  const exitLive = () => {
    socket?.disconnect();
    setSocket(null);
    setView('list');
    setActiveQuiz(null);
    setCurrentCode(null);
    loadQuizzes();
  };

  // ========== РЕЗУЛЬТАТЫ ==========
  if (view === 'results' && resultsQuiz) {
    if (loadingResults) return (
      <div className="admin-section">
        <div className="section-header">
          <button className="back-btn" onClick={() => { setView('list'); setResultsQuiz(null); setResultsData(null); }}>← Назад</button>
          <h2>Загрузка результатов...</h2>
        </div>
      </div>
    );

    if (!resultsData) return (
      <div className="admin-section">
        <div className="section-header">
          <button className="back-btn" onClick={() => { setView('list'); setResultsQuiz(null); }}>← Назад</button>
          <h2>Ошибка загрузки</h2>
        </div>
      </div>
    );

    const { quiz, participants, questionStats } = resultsData;
    return (
      <div className="admin-section quiz-results-view">
        <div className="section-header">
          <button className="back-btn" onClick={() => { setView('list'); setResultsQuiz(null); setResultsData(null); }}>← Назад</button>
          <h2>Результаты викторины</h2>
        </div>
        <div className="results-quiz-info">
          <div className="info-card">
            <h3>{quiz.title}</h3>
            <div className="info-meta">
              <span>{quiz.subject?.icon} {quiz.subject?.name}</span>
              <span>•</span>
              <span>{participants.length} участников</span>
            </div>
            {quiz.description && <div className="quiz-desc"><MathText text={quiz.description} /></div>}
            <div className="quiz-dates">
              <span>Запущена: {new Date(quiz.startedAt).toLocaleString('ru-RU')}</span>
              <span>Завершена: {new Date(quiz.finishedAt).toLocaleString('ru-RU')}</span>
            </div>
          </div>
        </div>
        <div className="results-section">
          <h3>📊 Статистика по вопросам</h3>
          <div className="question-stats-grid">
            {questionStats.map((stat, i) => (
              <div key={stat.questionId} className="question-stat-card">
                <div className="stat-header">
                  <span className="q-number">Вопрос {i + 1}</span>
                  <span className={`accuracy ${parseInt(stat.accuracy) >= 70 ? 'good' : parseInt(stat.accuracy) >= 40 ? 'medium' : 'low'}`}>
                    {stat.accuracy}% правильных
                  </span>
                </div>
                <div className="stat-question"><MathText text={stat.questionText} /></div>
                <div className="stat-footer"><span>{stat.correctAnswers} из {stat.totalAnswers} ответили правильно</span></div>
              </div>
            ))}
          </div>
        </div>
        <div className="results-section">
          <h3>🏆 Лидерборд</h3>
          <div className="results-leaderboard">
            {participants.map((p, i) => (
              <div key={p.id} className={`result-participant rank-${i + 1}`}>
                <div className="participant-rank">{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}</div>
                <div className="participant-avatar">{p.user?.firstName?.[0]}{p.user?.lastName?.[0]}</div>
                <div className="participant-details">
                  <div className="participant-name">{p.user?.firstName} {p.user?.lastName}</div>
                  <div className="participant-username">@{p.user?.telegramUsername}</div>
                </div>
                <div className="participant-stats">
                  <div className="stat-item"><span className="stat-value">{parseFloat(p.totalScore).toFixed(1)}</span><span className="stat-label">баллов</span></div>
                  <div className="stat-item"><span className="stat-value">{p.correctAnswers}/{p.totalQuestions}</span><span className="stat-label">верно</span></div>
                  <div className="stat-item"><span className="stat-value">{p.accuracy}%</span><span className="stat-label">точность</span></div>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="results-section">
          <h3>📝 Детальные ответы участников</h3>
          {participants.map((p, i) => (
            <details key={p.id} className="participant-details-accordion">
              <summary className="accordion-header">
                <span className="participant-rank-mini">{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}</span>
                <span className="participant-name-mini">{p.user?.firstName} {p.user?.lastName}</span>
                <span className="participant-score-mini">{parseFloat(p.totalScore).toFixed(1)} баллов • {p.correctAnswers}/{p.totalQuestions} верно</span>
              </summary>
              <div className="accordion-content">
                {p.answers.map((answer) => {
                  const question = quiz.questions.find(q => q.id === answer.questionId);
                  return (
                    <div key={answer.id} className={`answer-item ${answer.isCorrect ? 'correct' : 'wrong'}`}>
                      <div className="answer-header">
                        <span className="q-num">Вопрос {question?.order + 1}</span>
                        <span className={`answer-badge ${answer.isCorrect ? 'correct' : 'wrong'}`}>{answer.isCorrect ? '✓ Правильно' : '✗ Неправильно'}</span>
                        <span className="answer-score">+{parseFloat(answer.score).toFixed(2)} баллов</span>
                      </div>
                      <div className="answer-question"><MathText text={question?.questionText} /></div>
                      <div className="answer-info">
                        <span>Ответ: вариант {String.fromCharCode(65 + answer.selectedAnswer)}</span>
                        <span>•</span>
                        <span>Время: {(answer.responseTime / 1000).toFixed(1)}с</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </details>
          ))}
        </div>
      </div>
    );
  }

  // ========== LIVE РЕЖИМ ==========
  if (view === 'live' && activeQuiz) {
    return (
      <div className="admin-section quiz-live">
        <div className="live-header">
          <button className="back-btn" onClick={exitLive}>← Назад</button>
          <h2>{activeQuiz.title}</h2>
          {currentCode && (
            <div className="access-code-big">
              <span>КОД:</span>
              <strong>{currentCode}</strong>
            </div>
          )}
        </div>

        <div className="live-grid">
          <div className="live-control">
            {!currentQuestion && (
              <div className="lobby">
                <h3>👥 Лобби</h3>

                {/* Генерация кода */}
                <div className="code-generation">
                  {!currentCode ? (
                    <>
                      <p className="lobby-info">Сгенерируйте код чтобы ученики смогли зайти</p>
                      <button className="generate-code-btn" onClick={generateCode} disabled={generatingCode}>
                        {generatingCode ? 'Генерация...' : '🔑 Сгенерировать код'}
                      </button>
                    </>
                  ) : (
                    <>
                      <div className="generated-code">{currentCode}</div>
                      <button className="regenerate-btn" onClick={generateCode} disabled={generatingCode}>
                        {generatingCode ? 'Генерация...' : '🔄 Новый код (старый перестанет работать)'}
                      </button>
                    </>
                  )}
                </div>

                {currentCode && (
                  <>
                    <div className="participants-count">
                      <span className="count-big">{participants.length}</span>
                      <span>участников подключилось</span>
                    </div>
                    <button className="start-button" onClick={handleStartQuiz} disabled={participants.length === 0}>
                      🚀 Запустить викторину
                    </button>
                  </>
                )}
              </div>
            )}

            {currentQuestion && (
              <div className="current-question-admin">
                <div className="q-header">
                  <span>Вопрос {questionIndex + 1} из {totalQuestions}</span>
                  <span className={`timer ${timeLeft <= 5 ? 'urgent' : ''}`}>⏱ {timeLeft}с</span>
                </div>
                <h3><MathText text={currentQuestion.questionText} /></h3>
                <div className="admin-options">
                  {currentQuestion.options.map((opt, i) => (
                    <div key={i} className={`admin-option ${i === currentQuestion.correctAnswer ? 'correct' : ''}`}>
                      <span>{String.fromCharCode(65 + i)}</span>
                      <span><MathText text={opt} /></span>
                      {i === currentQuestion.correctAnswer && <span className="check">✓</span>}
                    </div>
                  ))}
                </div>
                <div className="control-buttons">
                  <button className="next-button" onClick={handleNextQuestion}>
                    {questionIndex + 1 < totalQuestions ? 'Следующий вопрос →' : 'Завершить'}
                  </button>
                  <button className="finish-button" onClick={handleFinishQuiz}>Завершить досрочно</button>
                </div>
              </div>
            )}
          </div>

          <div className="live-side">
            <div className="participants-list">
              <h3>👥 Участники ({participants.length})</h3>
              <div className="list-scroll">
                {participants.map(p => (
                  <div key={p.id} className="participant-item">
                    <div className="participant-avatar">{p.user?.firstName?.[0]}{p.user?.lastName?.[0]}</div>
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
                {leaderboard.length === 0 ? (
                  <p style={{ color: '#9ca3af', fontSize: 13, padding: '8px 0' }}>Появится после первых ответов</p>
                ) : leaderboard.map((p, i) => (
                  <div key={p.id} className={`leader-item rank-${i + 1}`}>
                    <span className="rank">{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}</span>
                    <span className="name">{p.user?.firstName} {p.user?.lastName}</span>
                    <span className="score">{parseFloat(p.totalScore || 0).toFixed(1)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ========== СОЗДАНИЕ ==========
  if (view === 'create') {
    return (
      <div className="admin-section">
        {showImportModal && (
          <div className="import-modal-overlay" onClick={() => !importLoading && setShowImportModal(false)}>
            <div className="import-modal" onClick={(e) => e.stopPropagation()}>
              <div className="import-modal-header">
                <h2>📥 Загрузка вопросов из Excel</h2>
                <button type="button" className="import-modal-close" onClick={() => !importLoading && setShowImportModal(false)}>✕</button>
              </div>
              <div className="import-modal-body">
                <div className="import-format-hint">
                  <strong>Формат файла (.xlsx):</strong><br />
                  <span className="import-hint-key">question</span> — текст вопроса<br />
                  <span className="import-hint-key">a, b, c, d</span> — четыре варианта ответа<br />
                  <span className="import-hint-key">correct</span> — буква правильного варианта: a / b / c / d<br />
                  <span className="import-hint-key">time</span> — время на ответ, сек (по умолчанию 30)<br />
                  <span className="import-hint-key">points</span> — баллы (по умолчанию 1), <span className="import-hint-key">explanation</span> — необязательно
                </div>
                <button type="button" className="btn-secondary import-template-btn" onClick={downloadTemplate}>
                  ⬇️ Скачать пример Excel
                </button>
                <div className="import-file-group">
                  <label>Выберите файл .xlsx</label>
                  <input
                    type="file"
                    accept=".xlsx,.xls"
                    className="import-file-input"
                    onChange={(e) => { setImportFile(e.target.files[0] || null); setImportResult(null); }}
                  />
                </div>

                {importResult && !importResult.error && (
                  <div className="import-result-ok">
                    ✅ Добавлено вопросов: <strong>{importResult.imported}</strong>
                    {importResult.skipped > 0 && (
                      <>, пропущено: <strong>{importResult.skipped}</strong></>
                    )}
                    {importResult.errors?.length > 0 && (
                      <div className="import-result-errors">
                        {importResult.errors.map((er, i) => (
                          <div key={i}>Строка {er.row}: {er.reason}</div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {importResult?.error && (
                  <div className="import-result-error">❌ {importResult.error}</div>
                )}
              </div>
              <div className="import-modal-footer">
                <button type="button" className="import-btn-secondary" onClick={() => !importLoading && setShowImportModal(false)}>
                  {importResult && !importResult.error ? 'Готово' : 'Отмена'}
                </button>
                <button
                  type="button"
                  className="import-btn-primary"
                  onClick={handleImport}
                  disabled={!importFile || importLoading}
                >
                  {importLoading ? 'Загружаю...' : 'Загрузить'}
                </button>
              </div>
            </div>
          </div>
        )}
        <div className="section-header">
          <button className="back-btn" onClick={() => setView('list')}>← Назад</button>
          <h2>Создать викторину</h2>
        </div>
        <div className="quiz-form">
          <input type="text" placeholder="Название викторины" value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })} className="form-input" />
          <textarea placeholder="Описание (необязательно)" value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })} className="form-textarea" />
          <select value={formData.lessonId} disabled={scheduledLessonsLoading} onChange={(e) => {
            const lesson = scheduledLessons.find((item) => Number(item.id) === Number(e.target.value));
            setFormData({ ...formData, lessonId: e.target.value, subjectId: lesson?.subjectId || '' });
          }} className="form-select">
            <option value="">Выберите занятие</option>
            {scheduledLessons.map((lesson) => (
              <option key={lesson.id} value={lesson.id} disabled={lesson.hasQuiz}>
                {lesson.subject?.name} · {new Date(lesson.scheduledAt).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' })} · {lesson.teacher?.firstName || 'преподаватель'}{lesson.hasQuiz ? ' · викторина уже привязана' : ''}
              </option>
            ))}
          </select>
          {scheduledLessonsLoading && <p className="quiz-form-hint">Обновляем список занятий...</p>}
          {!scheduledLessonsLoading && scheduledLessonsError && (
            <p className="quiz-form-hint">
              {scheduledLessonsError}.{' '}
              <button type="button" className="quiz-inline-retry" onClick={loadScheduledLessons}>Повторить</button>
            </p>
          )}
          {!scheduledLessonsLoading && !scheduledLessonsError && scheduledLessons.length === 0 && (
            <p className="quiz-form-hint">Нет запланированных занятий, доступных для привязки.</p>
          )}
          <p className="quiz-form-hint">Викторина появится у учеников только после начала выбранного занятия. На самом занятии её можно лишь запустить и провести.</p>
          <div className="questions-section">
            <div className="questions-section-header">
              <h3>Вопросы ({questions.length})</h3>
              <button type="button" className="import-excel-btn" onClick={openImportModal}>
                📥 Загрузить из Excel
              </button>
            </div>
            {questions.map((q, i) => (
              <div key={i} className="question-item">
                <div className="q-num">{i + 1}</div>
                <div className="q-content">
                  <strong><MathText text={q.questionText} /></strong>
                  <div className="q-meta">⏱ {q.timeLimit}с • ⭐ {q.points} балл • ✓ {String.fromCharCode(65 + q.correctAnswer)}</div>
                </div>
                <button onClick={() => removeQuestion(i)} className="remove-btn">✕</button>
              </div>
            ))}
            <div className="add-question-form">
              <input type="text" placeholder="Текст вопроса" value={currentQ.questionText}
                onChange={(e) => setCurrentQ({ ...currentQ, questionText: e.target.value })} className="form-input" />
              <LatexHelp />
              {currentQ.options.map((opt, i) => (
                <div key={i} className="option-input-row">
                  <input type="radio" name="correctAnswer" checked={currentQ.correctAnswer === i}
                    onChange={() => setCurrentQ({ ...currentQ, correctAnswer: i })} />
                  <span>{String.fromCharCode(65 + i)}</span>
                  <input type="text" placeholder={`Вариант ${String.fromCharCode(65 + i)}`} value={opt}
                    onChange={(e) => { const o = [...currentQ.options]; o[i] = e.target.value; setCurrentQ({ ...currentQ, options: o }); }}
                    className="form-input" />
                </div>
              ))}
              <div className="form-row">
                <label>Время (сек):</label>
                <input type="number" value={currentQ.timeLimit}
                  onChange={(e) => setCurrentQ({ ...currentQ, timeLimit: parseInt(e.target.value) || 30 })} className="form-input" />
                <label>Баллы:</label>
                <input type="number" step="0.5" value={currentQ.points}
                  onChange={(e) => setCurrentQ({ ...currentQ, points: parseFloat(e.target.value) || 1 })} className="form-input" />
              </div>
              <input type="text" placeholder="Объяснение (необязательно)" value={currentQ.explanation}
                onChange={(e) => setCurrentQ({ ...currentQ, explanation: e.target.value })} className="form-input" />
              <button onClick={addQuestion} className="add-btn">+ Добавить вопрос</button>
            </div>
          </div>
          <button onClick={saveQuiz} className="save-btn">💾 Сохранить викторину</button>
        </div>
      </div>
    );
  }

  // ========== РЕДАКТИРОВАНИЕ ===========
  if (view === 'edit' && editingQuiz) {
    const currentLessonInList = scheduledLessons.some((lesson) => Number(lesson.id) === Number(editingQuiz.lesson?.id || editingQuiz.lessonId));
    return (
      <div className="admin-section">
        <div className="section-header">
          <button className="back-btn" onClick={() => { setView('list'); setEditingQuiz(null); }}>← Назад</button>
          <h2>Редактировать викторину</h2>
        </div>
        <div className="quiz-form quiz-edit-form">
          <label className="quiz-field-label" htmlFor="quiz-edit-title">Название</label>
          <input id="quiz-edit-title" type="text" value={editData.title}
            onChange={(e) => setEditData({ ...editData, title: e.target.value })} className="form-input" />
          <label className="quiz-field-label" htmlFor="quiz-edit-lesson">Занятие</label>
          <select id="quiz-edit-lesson" value={editData.lessonId} disabled={scheduledLessonsLoading}
            onChange={(e) => setEditData({ ...editData, lessonId: e.target.value })} className="form-select">
            {!currentLessonInList && (
              <option value={editingQuiz.lesson?.id || editingQuiz.lessonId}>
                {editingQuiz.lesson?.subject?.name} · {editingQuiz.lesson?.topic || 'Текущее занятие'} · текущее
              </option>
            )}
            {scheduledLessons.map((lesson) => {
              const isCurrent = Number(lesson.id) === Number(editingQuiz.lesson?.id || editingQuiz.lessonId);
              return (
                <option key={lesson.id} value={lesson.id} disabled={lesson.hasQuiz && !isCurrent}>
                  {lesson.subject?.name} · {new Date(lesson.scheduledAt).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' })} · {lesson.teacher?.firstName || 'преподаватель'}{lesson.hasQuiz && !isCurrent ? ' · викторина уже привязана' : ''}
                </option>
              );
            })}
          </select>
          {scheduledLessonsLoading && <p className="quiz-form-hint">Обновляем список занятий...</p>}
          {!scheduledLessonsLoading && scheduledLessonsError && <p className="quiz-form-hint">{scheduledLessonsError}</p>}
          <p className="quiz-form-hint">Перепривязка доступна только к предстоящему занятию. Во время идущего занятия изменить или удалить викторину нельзя.</p>
          <button onClick={saveQuizEdits} className="save-btn">Сохранить изменения</button>

          <div className="questions-section">
            <div className="questions-section-header">
              <h3>Вопросы ({editQuestions.length})</h3>
            </div>
            {editingQuiz.status !== 'draft' && (
              <p className="quiz-form-hint">Вопросы можно менять только пока викторина в черновике — она уже {editingQuiz.status === 'active' ? 'запущена' : 'завершена'}.</p>
            )}
            {editQuestions.map((q, i) => (
              <div key={q.id} className="question-item">
                <div className="q-num">{i + 1}</div>
                <div className="q-content">
                  <strong><MathText text={q.questionText} /></strong>
                  <div className="q-meta">⏱ {q.timeLimit}с • ✓ {String.fromCharCode(65 + (Array.isArray(q.correctAnswer) ? q.correctAnswer[0] : q.correctAnswer))}</div>
                </div>
                {editingQuiz.status === 'draft' && (
                  <>
                    <button onClick={() => startEditQuestion(q)} className="edit-btn">Изменить</button>
                    <button onClick={() => removeEditQuestion(q)} className="remove-btn">✕</button>
                  </>
                )}
              </div>
            ))}
            {editingQuiz.status === 'draft' && (
              <div className="add-question-form">
                <input type="text" placeholder="Текст вопроса" value={editCurrentQ.questionText}
                  onChange={(e) => setEditCurrentQ({ ...editCurrentQ, questionText: e.target.value })} className="form-input" />
                <LatexHelp />
                {editCurrentQ.options.map((opt, i) => (
                  <div key={i} className="option-input-row">
                    <input type="radio" name="editCorrectAnswer" checked={editCurrentQ.correctAnswer === i}
                      onChange={() => setEditCurrentQ({ ...editCurrentQ, correctAnswer: i })} />
                    <span>{String.fromCharCode(65 + i)}</span>
                    <input type="text" placeholder={`Вариант ${String.fromCharCode(65 + i)}`} value={opt}
                      onChange={(e) => { const o = [...editCurrentQ.options]; o[i] = e.target.value; setEditCurrentQ({ ...editCurrentQ, options: o }); }}
                      className="form-input" />
                  </div>
                ))}
                <div className="form-row">
                  <label>Время (сек):</label>
                  <input type="number" value={editCurrentQ.timeLimit}
                    onChange={(e) => setEditCurrentQ({ ...editCurrentQ, timeLimit: parseInt(e.target.value) || 30 })} className="form-input" />
                </div>
                <input type="text" placeholder="Объяснение (необязательно)" value={editCurrentQ.explanation}
                  onChange={(e) => setEditCurrentQ({ ...editCurrentQ, explanation: e.target.value })} className="form-input" />
                <div className="form-row">
                  <button onClick={saveEditQuestion} className="add-btn">{editingQuestionId ? '💾 Сохранить вопрос' : '+ Добавить вопрос'}</button>
                  {editingQuestionId && <button onClick={resetEditCurrentQ} className="btn-secondary">Отмена</button>}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ========== СПИСОК ==========
  return (
    <div className="admin-section">
      <div className="section-header">
        <h2>🎯 Викторины</h2>
        <button className="primary-btn" onClick={openCreateView}>+ Создать</button>
      </div>
      {loading ? <p>Загрузка...</p> : (
        <div className="quizzes-grid">
          {quizzes.length === 0 ? (
            <div className="empty-state"><p>Нет викторин. Создайте первую!</p></div>
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
              <div className="quiz-description">{q.lesson?.topic || 'Без темы'} · {q.lesson?.scheduledAt ? new Date(q.lesson.scheduledAt).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' }) : 'занятие не указано'}</div>
              <div className="quiz-info">
                <span>📚 {q.questions?.length || 0} вопросов</span>
                <span>👥 {q.participants?.length || 0} участников</span>
              </div>
              <div className="quiz-actions">
                <button onClick={() => onOpenLesson?.(q.lesson?.id || q.lessonId)} className="live-btn">Открыть занятие →</button>
                {q.status === 'finished' && <button onClick={() => setHistoryStream({ lessonQuizId: q.id, subjectName: q.lesson?.subject?.name })} className="edit-btn">Итоги</button>}
                <button onClick={() => openEditView(q)} className="edit-btn" disabled={q.lesson?.status === 'live'} title={q.lesson?.status === 'live' ? 'Занятие уже идёт' : 'Изменить название или занятие'}>Изменить</button>
                <button onClick={() => deleteQuiz(q)} className="delete-btn" disabled={q.lesson?.status === 'live'} title={q.lesson?.status === 'live' ? 'Занятие уже идёт' : 'Удалить викторину'}>Удалить</button>
              </div>
            </div>
          ))}
        </div>
      )}
      {ConfirmDeleteDialog}
      {historyStream && <StreamPresentation source={historyStream} onClose={() => setHistoryStream(null)} />}
    </div>
  );
}

export default Quiz;
