import React, { useState, useEffect, useRef } from 'react';
import './Practice.css';
import { useData } from './DataContext';
import { apiFetch } from './api';

import { API_URL } from '../config';

function Practice({ studentId }) {
  // Используем данные из контекста
  const {
    practiceTopics, subjects, refreshAfterPractice, loading: contextLoading,
    prefetchQuestions, getQuestions, updatePracticeStatsOptimistic, streak,
    predictedScore, loadPredictedScore, dailyGoal, loadDailyGoal,
    leaderboard, loadLeaderboard, scoreHistory, loadScoreHistory,
    loadWeakTopicsQuestions
  } = useData();
  
  const [selectedSubject, setSelectedSubject] = useState(null);
  const [leaderboardPeriod, setLeaderboardPeriod] = useState('day');
  const [weakTopicsLoading, setWeakTopicsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('practice'); // 'practice' | 'rating'
  
  const [activePractice, setActivePractice] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [userAnswers, setUserAnswers] = useState([]);
  const [remainingQuestions, setRemainingQuestions] = useState([]);
  const [sessionAnswers, setSessionAnswers] = useState([]); // для адаптивности
  const [showResult, setShowResult] = useState(false);
  const [practiceResult, setPracticeResult] = useState(null);
  
  const [answered, setAnswered] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [showExplanationHint, setShowExplanationHint] = useState(false);
  
  const autoNextTimerRef = useRef(null);
  const [confetti, setConfetti] = useState(false);

  const RESULT_DURATION = 1500; // 1.5 секунды показ результата

  // Тактильная отдача через Telegram
  const haptic = (type) => {
    try {
      const tg = window.Telegram?.WebApp;
      if (tg?.HapticFeedback) {
        if (type === 'success') tg.HapticFeedback.notificationOccurred('success');
        else if (type === 'error') tg.HapticFeedback.notificationOccurred('error');
        else tg.HapticFeedback.impactOccurred('light');
      }
    } catch (e) { /* ignore */ }
  };

  // Автоматический выбор предмета если он один
  useEffect(() => {
    if (subjects.length === 1 && !selectedSubject) {
      setSelectedSubject(subjects[0]);
    }
  }, [subjects, selectedSubject]);

  // Prefetch вопросов фоново при входе в раздел практики
  useEffect(() => {
    if (practiceTopics.length > 0) {
      prefetchQuestions(practiceTopics);
    }
  }, [practiceTopics, prefetchQuestions]);

  // Загрузка прогноза, целей и рейтинга при выборе предмета
  useEffect(() => {
    if (selectedSubject?.id) {
      loadPredictedScore(selectedSubject.id);
      loadDailyGoal();
      loadScoreHistory(selectedSubject.id);
      loadLeaderboard(selectedSubject.id, leaderboardPeriod);
    }
  }, [selectedSubject, leaderboardPeriod, loadPredictedScore, loadDailyGoal, loadScoreHistory, loadLeaderboard]);

  // Очистка таймера при размонтировании
  useEffect(() => {
    return () => {
      if (autoNextTimerRef.current) clearTimeout(autoNextTimerRef.current);
    };
  }, []);

  // Перемешиваем варианты ответов в вопросе
  const shuffleOptions = (question) => {
    const indices = question.options.map((_, i) => i);
    // Fisher-Yates shuffle
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    return {
      ...question,
      options: indices.map(i => question.options[i]),
      correctAnswer: indices.indexOf(question.correctAnswer)
    };
  };

  // Динамический выбор следующего вопроса на основе текущей сессии
  const pickNextQuestion = (remaining, sessionAnswers) => {
    if (remaining.length === 0) return null;
    if (remaining.length === 1) return remaining[0];

    const shuffle = arr => [...arr].sort(() => Math.random() - 0.5);

    // Нет ответов ещё — рандом
    if (sessionAnswers.length === 0) {
      return shuffle(remaining)[0];
    }

    // Смотрим последние 3 ответа
    const last3 = sessionAnswers.slice(-3);
    const last3Correct = last3.filter(a => a.isCorrect).length;
    const last3Rate = last3Correct / last3.length; // 0..1

    // Смотрим последние 3 ответа только на лёгких
    const last3Easy = sessionAnswers.filter(a => a.difficulty === 'easy').slice(-3);
    const easyRate = last3Easy.length > 0
      ? last3Easy.filter(a => a.isCorrect).length / last3Easy.length
      : null;

    const easy = remaining.filter(q => q.difficulty === 'easy');
    const medium = remaining.filter(q => !q.difficulty || q.difficulty === 'medium');
    const hard = remaining.filter(q => q.difficulty === 'hard');

    let preferred = [];

    if (last3Rate >= 0.8) {
      // Хорошо справляется — подкидываем сложнее
      preferred = hard.length > 0 ? hard : medium.length > 0 ? medium : remaining;
    } else if (last3Rate >= 0.5) {
      // Средне — medium или hard
      preferred = medium.length > 0 ? medium : hard.length > 0 ? hard : remaining;
    } else {
      // Ошибается — возвращаем к лёгким
      preferred = easy.length > 0 ? easy : medium.length > 0 ? medium : remaining;
    }

    // Если preferred пустой — берём из remaining
    if (preferred.length === 0) preferred = remaining;
    return shuffle(preferred)[0];
  };

  // Начальная раскладка — всё вперемешку
  const getAdaptiveQuestions = (allQuestions) => {
    return [...allQuestions]
      .sort(() => Math.random() - 0.5)
      .map(shuffleOptions);
  };

  const startPracticeFromQuestions = (topic, activeQuestions, label) => {
    if (activeQuestions.length === 0) {
      alert('Нет доступных вопросов');
      return;
    }
    const adaptiveQuestions = getAdaptiveQuestions(activeQuestions);
    setActivePractice({ ...topic, name: label || topic.name });
    setQuestions(adaptiveQuestions);
    setRemainingQuestions(adaptiveQuestions.slice(1));
    setSessionAnswers([]);
    setCurrentQuestionIndex(0);
    setSelectedAnswer(null);
    setUserAnswers([]);
    setShowResult(false);
    setAnswered(false);
    setShowExplanationHint(false);
  };

  const startPractice = async (topic) => {
    try {
      const activeQuestions = await getQuestions(topic);
      startPracticeFromQuestions(topic, activeQuestions);
    } catch (error) {
      console.error('Error loading questions:', error);
      alert('Ошибка загрузки вопросов');
    }
  };

  const startWeakTopicsPractice = async () => {
    if (!selectedSubject) return;
    setWeakTopicsLoading(true);
    try {
      const data = await loadWeakTopicsQuestions(selectedSubject.id);
      const questionsList = (data?.questions || []).map(shuffleOptions);
      if (questionsList.length === 0) {
        alert(data?.message || 'Нет заданий по слабым темам');
        return;
      }
      const virtualTopic = {
        id: `weak-${selectedSubject.id}`,
        name: 'Слабые темы',
        subjectId: selectedSubject.id,
        icon: '🎯'
      };
      startPracticeFromQuestions(virtualTopic, questionsList, 'Тренировка слабых тем');
    } catch (error) {
      console.error('Error starting weak topics:', error);
      alert('Не удалось загрузить задания');
    } finally {
      setWeakTopicsLoading(false);
    }
  };

  const submitAnswer = async (answerIndex) => {
    if (answered) return; // Предотвращаем повторный клик

    const currentQuestion = questions[currentQuestionIndex];
    const correct = answerIndex === currentQuestion.correctAnswer;

    setSelectedAnswer(answerIndex);
    setAnswered(true);
    setIsCorrect(correct);
    setShowExplanationHint(false);

    // Дофамин: вибрация + конфетти
    if (correct) {
      haptic('success');
      setConfetti(true);
      setTimeout(() => setConfetti(false), 1200);
    } else {
      haptic('error');
    }

    const newAnswers = [...userAnswers, {
      questionId: currentQuestion.id,
      selectedAnswer: answerIndex,
      correctAnswer: currentQuestion.correctAnswer,
      isCorrect: correct
    }];
    setUserAnswers(newAnswers);

    // Обновляем sessionAnswers для адаптивности
    const newSessionAnswers = [...sessionAnswers, {
      questionId: currentQuestion.id,
      difficulty: currentQuestion.difficulty || 'medium',
      isCorrect: correct
    }];
    setSessionAnswers(newSessionAnswers);

    // Автопереход через 1.5 секунды
    autoNextTimerRef.current = setTimeout(() => {
      if (remainingQuestions.length > 0) {
        // Динамически выбираем следующий вопрос
        const nextQ = shuffleOptions(pickNextQuestion(remainingQuestions, newSessionAnswers));
        const newRemaining = remainingQuestions.filter(q => q.id !== nextQ.id);
        setRemainingQuestions(newRemaining);
        setCurrentQuestionIndex(currentQuestionIndex + 1);
        setSelectedAnswer(null);
        setAnswered(false);
        setIsCorrect(false);
        // Подменяем вопрос в массиве questions для корректного отображения
        setQuestions(prev => {
          const updated = [...prev];
          updated[currentQuestionIndex + 1] = nextQ;
          return updated;
        });
      } else {
        finishPractice(newAnswers);
      }
    }, RESULT_DURATION);
  };

  const finishPractice = async (answers) => {
    const correctCount = answers.filter(a => a.isCorrect).length;
    const totalCount = answers.length;
    const scorePercentage = Math.round((correctCount / totalCount) * 100);

    setPracticeResult({ correctCount, totalCount, scorePercentage, answers });
    setShowResult(true);

    // Оптимистично обновляем статистику темы
    if (typeof activePractice.id === 'number') {
      updatePracticeStatsOptimistic(activePractice.id, correctCount, totalCount);
    }

    // Отправляем итог теста на сервер (fire-and-forget)
    const questionMap = {};
    questions.forEach(q => { questionMap[q.id] = q; });

    apiFetch(`${API_URL}/practice/attempts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        studentId,
        topicId: typeof activePractice.id === 'number'
          ? activePractice.id
          : (answers.map(a => questionMap[a.questionId]?.topicId).find(id => id != null) || null),
        subjectId: activePractice.subjectId,
        correct: correctCount,
        total: totalCount,
        answers: answers.map(a => ({
          questionId: a.questionId,
          difficulty: questionMap[a.questionId]?.difficulty || 'medium',
          isCorrect: a.isCorrect,
          topicId: questionMap[a.questionId]?.topicId || (typeof activePractice.id === 'number' ? activePractice.id : null)
        })).filter(a => a.questionId && a.topicId)
      })
    }).catch(e => console.error('Error saving attempt:', e));
  };

  // Найти следующую тему для кнопки "Следующий тест"
  const getNextTopic = () => {
    const list = selectedSubject
      ? practiceTopics.filter(t => t.subjectId === selectedSubject.id)
      : practiceTopics;
    const withQuestions = list.filter(t => t.questions && t.questions.length > 0);
    if (withQuestions.length === 0) return null;
    const idx = withQuestions.findIndex(t => t.id === activePractice?.id);
    if (idx === -1) return withQuestions[0];
    return withQuestions[(idx + 1) % withQuestions.length];
  };

  const goToNextTopic = () => {
    const next = getNextTopic();
    if (next) startPractice(next);
  };

  const closePractice = () => {
    if (autoNextTimerRef.current) clearTimeout(autoNextTimerRef.current);

    setActivePractice(null);
    setQuestions([]);
    setCurrentQuestionIndex(0);
    setSelectedAnswer(null);
    setUserAnswers([]);
    setShowResult(false);
    setPracticeResult(null);
    setAnswered(false);
    setShowExplanationHint(false);
    setRemainingQuestions([]);
    setSessionAnswers([]);
    
    // Обновляем данные через контекст
    setActiveTab('practice');
    refreshAfterPractice(activePractice?.subjectId || selectedSubject?.id, leaderboardPeriod);
  };

  const backToSubjects = () => {
    setSelectedSubject(null);
    setActiveTab('practice');
  };

  if (contextLoading.practice && practiceTopics.length === 0) {
    return (
      <div className="section">
        <h1 className="section-title">Практика</h1>
        <p style={{ textAlign: 'center', color: '#6b7280', padding: '40px' }}>
          Загрузка практики...
        </p>
      </div>
    );
  }

  // ========== ЭКРАН ПРОХОЖДЕНИЯ ==========
  if (activePractice && !showResult) {
    const currentQuestion = questions[currentQuestionIndex];
    const progress = ((currentQuestionIndex + 1) / questions.length) * 100;

    return (
      <div className="practice-mode">
        <div className="practice-header">
          <button className="back-button" onClick={closePractice}>
            ← Назад к списку
          </button>
          <div className="practice-info">
            <h2>{activePractice.name}</h2>
            <p>Вопрос {currentQuestionIndex + 1} из {questions.length}</p>
          </div>
          {streak?.streak > 0 && (
            <div className={`streak-circle on-blue ${streak.todayDone ? 'done' : 'pending'}`}>
              <span className="streak-circle-flame">🔥</span>
              <span className="streak-circle-count">{streak.streak}</span>
            </div>
          )}
        </div>

        {confetti && (
          <div className="confetti-layer">
            {Array.from({ length: 18 }).map((_, i) => (
              <span key={i} className={`confetti-piece c${i % 6}`} style={{ left: `${(i * 5.5) + 2}%`, animationDelay: `${(i % 5) * 0.05}s` }}></span>
            ))}
          </div>
        )}

        <div className="practice-progressbar">
          <div className="practice-progressbar-fill" style={{ width: `${progress}%` }}></div>
        </div>

        <div className="question-container">
          <div className="question-header">
            {currentQuestion.difficulty && (
              <span className={`difficulty-badge ${currentQuestion.difficulty}`}>
                {currentQuestion.difficulty === 'easy' && '🟢 Легкий'}
                {currentQuestion.difficulty === 'medium' && '🟡 Средний'}
                {currentQuestion.difficulty === 'hard' && '🔴 Сложный'}
              </span>
            )}
            {currentQuestion.explanation && !answered && (
              <button 
                className="hint-button"
                onClick={() => setShowExplanationHint(!showExplanationHint)}
              >
                💡 {showExplanationHint ? 'Скрыть подсказку' : 'Подсказка'}
              </button>
            )}
          </div>

          <h3 className="question-text">{currentQuestion.questionText}</h3>

          {showExplanationHint && currentQuestion.explanation && !answered && (
            <div className="hint-box">
              <div className="hint-title">💡 Подсказка:</div>
              <div className="hint-text">{currentQuestion.explanation}</div>
            </div>
          )}

          <div className="answers-list">
            {currentQuestion.options.map((option, index) => {
              const isSelected = selectedAnswer === index;
              const showCorrect = answered && index === currentQuestion.correctAnswer;
              const showWrong = answered && isSelected && !isCorrect;

              return (
                <button
                  key={index}
                  className={`answer-option ${isSelected ? 'selected' : ''} ${showCorrect ? 'correct' : ''} ${showWrong ? 'wrong' : ''}`}
                  onClick={() => submitAnswer(index)}
                  disabled={answered}
                >
                  <span className="answer-letter">
                    {String.fromCharCode(65 + index)}
                  </span>
                  <span className="answer-text">
                    {option}
                  </span>
                </button>
              );
            })}
          </div>

          {answered && (
  <>
    <div className={`answer-result-box ${isCorrect ? 'correct-result' : 'wrong-result'}`}>
      <div className="result-icon">
        {isCorrect ? '✅' : '❌'}
      </div>
      <div className="result-text">
        {isCorrect ? 'Правильно!' : 'Неправильно'}
      </div>
    </div>

    {/* Объяснение показывается ПОСЛЕ ответа */}
    {currentQuestion.explanation && (
      <div className="explanation-box">
        <div className="hint-title">💡 Объяснение:</div>
        <div className="hint-text">{currentQuestion.explanation}</div>
      </div>
    )}
  </>
)}
        </div>
      </div>
    );
  }

  // ========== ЭКРАН РЕЗУЛЬТАТОВ ==========
  if (showResult && practiceResult) {
    const { correctCount, totalCount, scorePercentage } = practiceResult;
    const rateClass = scorePercentage >= 70 ? 'good' : scorePercentage >= 50 ? 'medium' : 'low';
    const nextTopic = getNextTopic();
    const hasNext = nextTopic && nextTopic.id !== activePractice?.id;

    return (
      <div className="practice-screen">
        <div className="practice-header">
          <button className="back-button" onClick={closePractice}>← Назад</button>
          <div className="practice-info">
            <h2>{activePractice.name}</h2>
            <p>Практика завершена</p>
          </div>
        </div>

        <div className="practice-result-body">
          <div className="result-hero">
            <div className="result-hero-emoji">
              {scorePercentage >= 70 ? '🎉' : scorePercentage >= 50 ? '👍' : '💪'}
            </div>
            <h1 className="result-hero-title">
              {scorePercentage >= 70 ? 'Отличная работа!' : scorePercentage >= 50 ? 'Хороший результат!' : 'Есть над чем поработать'}
            </h1>
            <p className="result-hero-subtitle">{activePractice.name}</p>
          </div>

          <div className="result-numbers">
            <div className="result-num-block">
              <div className={`result-num ${rateClass}`}>{correctCount}<span className="result-num-total">/{totalCount}</span></div>
              <div className="result-num-label">правильных ответов</div>
            </div>
            <div className="result-num-divider"></div>
            <div className="result-num-block">
              <div className={`result-num ${rateClass}`}>{scorePercentage}<span className="result-num-total">%</span></div>
              <div className="result-num-label">точность</div>
            </div>
          </div>

          <div className="result-progress-track">
            <div className={`result-progress-bar ${rateClass}`} style={{ width: `${scorePercentage}%` }}></div>
          </div>

          <div className="result-actions">
            <button className="primary-button" onClick={() => startPractice(activePractice)}>
              🔄 Пройти снова
            </button>
            {hasNext && (
              <button className="secondary-button" onClick={goToNextTopic}>
                Следующий тест →
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ========== ЭКРАН ВЫБОРА ПРЕДМЕТА (если их несколько) ==========
  if (subjects.length > 1 && !selectedSubject) {
    return (
      <div className="section">
        <div className="practice-hero">
          <div className="practice-hero-glow"></div>
          <div className="practice-hero-content">
            <div className="practice-hero-text">
              <div className="practice-hero-eyebrow">РАЗДЕЛ</div>
              <h1 className="practice-hero-title">Практика</h1>
              <p className="practice-hero-sub">Выберите предмет для практики</p>
            </div>
            {streak?.streak > 0 && (
              <div className={`hero-streak ${streak.todayDone ? 'done' : 'pending'}`}>
                <span className="hero-streak-flame">🔥</span>
                <span className="hero-streak-count">{streak.streak}</span>
              </div>
            )}
          </div>
        </div>

        <div className="subjects-grid">
          {subjects.map(subject => {
            const subjectTopics = practiceTopics.filter(t => t.subjectId === subject.id);
            const totalQuestions = subjectTopics.reduce((sum, t) => sum + (t.questions?.length || 0), 0);

            return (
              <button
                key={subject.id}
                className="subject-card"
                onClick={() => setSelectedSubject(subject)}
              >
                <span className="subject-icon-big">{subject.icon}</span>
                <h3>{subject.name}</h3>
                <p>{subjectTopics.length} подразделов</p>
                <p className="subject-meta">📚 {totalQuestions} вопросов</p>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  const filteredTopics = selectedSubject 
    ? practiceTopics.filter(topic => topic.subjectId === selectedSubject.id)
    : practiceTopics;

  const subjectDailyGoal = dailyGoal?.goals?.find(g => g.subjectId === selectedSubject?.id);
  const scoreDelta = predictedScore?.delta;
  const remainingTo70 = predictedScore?.unlocked && predictedScore.score < 70
    ? Math.max(1, Math.ceil((70 - predictedScore.score) / 2))
    : null;

  return (
    <div className="section">
      {subjects.length > 1 && selectedSubject && (
        <button className="back-button hero-back" onClick={backToSubjects}>
          ← Назад к предметам
        </button>
      )}
      <div className="practice-hero">
        <div className="practice-hero-glow"></div>
        <div className="practice-hero-content">
          <div className="practice-hero-text">
            <div className="practice-hero-eyebrow">{selectedSubject ? 'ПРЕДМЕТ' : 'РАЗДЕЛ'}</div>
            <h1 className="practice-hero-title">
              {selectedSubject ? (
                <><span className="hero-title-emoji">{selectedSubject.icon}</span> {selectedSubject.name}</>
              ) : 'Практика'}
            </h1>
            <p className="practice-hero-sub">
              {selectedSubject
                ? `${filteredTopics.length} подразделов · ${filteredTopics.reduce((s, t) => s + (t.questions?.length || 0), 0)} вопросов`
                : 'Тренируйся в своём темпе'}
            </p>
          </div>
          {streak?.streak > 0 && (
            <div className={`hero-streak ${streak.todayDone ? 'done' : 'pending'}`}>
              <span className="hero-streak-flame">🔥</span>
              <span className="hero-streak-count">{streak.streak}</span>
            </div>
          )}
        </div>
      </div>

      {/* ТАБ-БАР — только внутри предмета */}
      {selectedSubject && (
        <div className="practice-tabs">
          <button
            className={`practice-tab ${activeTab === 'practice' ? 'active' : ''}`}
            onClick={() => setActiveTab('practice')}
          >
            📝 Практика
          </button>
          <button
            className={`practice-tab ${activeTab === 'rating' ? 'active' : ''}`}
            onClick={() => setActiveTab('rating')}
          >
            🏆 Рейтинг
          </button>
        </div>
      )}

      {selectedSubject && activeTab === 'rating' && (
        <div className="practice-dashboard">
          {/* Прогнозный балл ЦТ */}
          <div className="dash-card predicted-score-card">
            {predictedScore?.unlocked ? (
              <>
                <div className="predicted-score-header">
                  <span className="predicted-label">Ожидаемый балл на ЦТ</span>
                  {scoreDelta != null && scoreDelta !== 0 && (
                    <span className={`score-delta ${scoreDelta > 0 ? 'up' : 'down'}`}>
                      {scoreDelta > 0 ? '+' : ''}{scoreDelta}
                    </span>
                  )}
                </div>
                <div className="predicted-score-value">
                  {predictedScore.score}<span className="predicted-score-max">/100</span>
                </div>
                <div className="predicted-meta">
                  Решено: {predictedScore.solved} · Точность: {predictedScore.accuracy}%
                </div>
                {remainingTo70 && (
                  <p className="predicted-hint">
                    Хотите поднять прогноз до 70+? Решите ещё ~{remainingTo70} заданий по слабым темам.
                  </p>
                )}
              </>
            ) : (
              <>
                <div className="predicted-locked-title">Прогнозный балл пока недоступен</div>
                <div className="predicted-locked-progress">
                  Решено: {predictedScore?.solved || 0} из {predictedScore?.minRequired || 50}
                </div>
                <div className="predicted-locked-bar">
                  <div
                    className="predicted-locked-fill"
                    style={{ width: `${Math.min(100, ((predictedScore?.solved || 0) / (predictedScore?.minRequired || 50)) * 100)}%` }}
                  />
                </div>
                <p className="predicted-locked-hint">
                  Осталось: {predictedScore?.needed ?? 50} заданий. Решите первые 50, чтобы узнать прогноз.
                </p>
              </>
            )}
          </div>

          {/* Ежедневная цель */}
          {subjectDailyGoal && (
            <div className="dash-card daily-goal-card">
              <div className="daily-goal-header">
                <span>🎯 Ежедневная цель</span>
                <span className={subjectDailyGoal.completed ? 'goal-done' : ''}>
                  {subjectDailyGoal.solved}/{subjectDailyGoal.goal}
                </span>
              </div>
              <div className="daily-goal-bar">
                <div
                  className={`daily-goal-fill ${subjectDailyGoal.completed ? 'complete' : ''}`}
                  style={{ width: `${subjectDailyGoal.percent}%` }}
                />
              </div>
              {subjectDailyGoal.completed
                ? <p className="goal-msg done">Цель на сегодня выполнена!</p>
                : <p className="goal-msg">Осталось {subjectDailyGoal.remaining} заданий</p>}
            </div>
          )}

          {/* Сильные / слабые темы */}
          {predictedScore?.unlocked && (predictedScore.strongTopics?.length > 0 || predictedScore.weakTopics?.length > 0) && (
            <div className="dash-card topics-insight-card">
              {predictedScore.strongTopics?.length > 0 && (
                <div className="topics-group">
                  <div className="topics-group-title">Сильные темы</div>
                  {predictedScore.strongTopics.map(t => (
                    <div key={t.topicId} className="topic-insight strong">
                      <span>{t.name}</span>
                      <span className="topic-insight-pct">{t.progress}%</span>
                    </div>
                  ))}
                </div>
              )}
              {predictedScore.weakTopics?.length > 0 && (
                <div className="topics-group">
                  <div className="topics-group-title">Слабые темы</div>
                  {predictedScore.weakTopics.map(t => (
                    <div key={t.topicId} className="topic-insight weak">
                      <span>{t.name}</span>
                      <span className="topic-insight-pct">{t.progress}%</span>
                    </div>
                  ))}
                </div>
              )}
              <button
                className="weak-topics-btn"
                onClick={startWeakTopicsPractice}
                disabled={weakTopicsLoading}
              >
                {weakTopicsLoading ? 'Загрузка...' : 'Потренировать слабые темы'}
              </button>
            </div>
          )}

          {/* Рейтинг */}
          <div className="dash-card leaderboard-card">
            <div className="leaderboard-header">
              <span>🏆 Рейтинг</span>
              <div className="leaderboard-tabs">
                {['day', 'week', 'month'].map(p => (
                  <button
                    key={p}
                    className={`lb-tab ${leaderboardPeriod === p ? 'active' : ''}`}
                    onClick={() => setLeaderboardPeriod(p)}
                  >
                    {p === 'day' ? 'День' : p === 'week' ? 'Неделя' : 'Месяц'}
                  </button>
                ))}
              </div>
            </div>
            {leaderboard?.myPosition && (
              <div className="my-rank">
                Ваше место: <strong>#{leaderboard.myPosition.rank}</strong>
                {' '}({leaderboard.myPosition.totalSolved} заданий)
              </div>
            )}
            <div className="leaderboard-list">
              {(leaderboard?.top || []).slice(0, 10).map(entry => (
                <div key={entry.studentId} className={`lb-row ${entry.studentId === studentId ? 'me' : ''}`}>
                  <span className="lb-rank">{entry.rank}</span>
                  <span className="lb-name">{entry.firstName} {entry.lastName?.[0]}.</span>
                  <span className="lb-score">{entry.totalSolved}</span>
                </div>
              ))}
              {(!leaderboard?.top || leaderboard.top.length === 0) && (
                <p className="lb-empty">Пока нет данных за этот период</p>
              )}
            </div>
          </div>
        </div>
      )}

      {(!selectedSubject || activeTab === 'practice') && filteredTopics.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📚</div>
          <p className="empty-text">
            Нет доступных заданий для практики по этому предмету.
          </p>
        </div>
      ) : (!selectedSubject || activeTab === 'practice') ? (
        <div className="practice-grid">
          {filteredTopics.map(topic => {
            const hasStats = topic.stats && topic.stats.total > 0;
            const rate = hasStats ? topic.stats.successRate : 0;
            const rateClass = rate >= 70 ? 'good' : rate >= 50 ? 'medium' : 'low';
            const qCount = topic.questions?.length || 0;
            return (
              <div key={topic.id} className="topic-card">
                <div className="topic-card-top">
                  <div className="topic-icon">{topic.icon || '📝'}</div>
                  <div className="topic-head">
                    <h3 className="topic-name">{topic.name}</h3>
                    <span className="topic-qcount">{qCount} вопросов</span>
                  </div>
                  {hasStats && (
                    <div className={`topic-rate-chip ${rateClass}`}>{rate}%</div>
                  )}
                </div>

                {topic.description && (
                  <p className="topic-desc">{topic.description}</p>
                )}

                {hasStats && (
                  <div className="topic-progress">
                    <div className="topic-progress-track">
                      <div className={`topic-progress-fill ${rateClass}`} style={{ width: `${rate}%` }}></div>
                    </div>
                    <span className="topic-progress-label">{topic.stats.correct}/{topic.stats.total}</span>
                  </div>
                )}

                <button
                  className="topic-start-btn"
                  onClick={() => startPractice(topic)}
                  disabled={qCount === 0}
                >
                  {hasStats ? 'Пройти снова' : 'Начать'} <span className="btn-arrow">→</span>
                </button>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export default Practice;