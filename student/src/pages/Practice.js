import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import './Practice.css';
import { useData } from './DataContext';
import { apiFetch } from './api';

import { API_URL } from '../config';
import StudentBrandMark from '../components/StudentBrandMark';

function getNextScoreMilestone(score) {
  if (score >= 100) return null;
  return Math.floor(score / 10) * 10 + 10;
}

function estimateTasksToMilestone(currentScore, targetScore) {
  return Math.max(1, Math.ceil((targetScore - currentScore) / 2));
}

function getScoreMilestoneHint(predictedScore) {
  if (!predictedScore?.unlocked) return null;
  const score = predictedScore.score ?? 0;
  const target = getNextScoreMilestone(score);
  if (target == null) return null;
  const tasks = estimateTasksToMilestone(score, target);

  const allTopics = predictedScore.topics || [];
  const hasWeak = allTopics.some(t => t.solved > 0 && t.progress < 70);
  const hasNew = allTopics.some(t => t.solved === 0);

  let focusText = 'в разных подразделах';
  if (hasWeak && hasNew) {
    focusText = 'в слабых темах и новых подразделах, которые ещё не проходил';
  } else if (hasWeak) {
    focusText = 'в слабых темах';
  } else if (hasNew) {
    focusText = 'в новых подразделах, которые ещё не проходил';
  }

  return {
    target,
    tasks,
    text: `До ${target}+ — ещё ~${tasks} заданий ${focusText}`,
  };
}

function getPredictedEncouragement(predictedScore) {
  if (!predictedScore) {
    return 'Начни с любой темы — каждое задание приближает к цели 💪';
  }

  if (!predictedScore.unlocked) {
    const solved = predictedScore.solved || 0;
    const required = predictedScore.minRequired || 50;
    const pct = required > 0 ? (solved / required) * 100 : 0;
    if (solved === 0) return 'Первые задания — самые важные. Начни с любой темы!';
    if (pct < 25) return 'Отличное начало! Каждое решённое задание открывает путь к прогнозу ✨';
    if (pct < 50) return 'Уже на четверти пути — не останавливайся, ты молодец!';
    if (pct < 75) return 'Почти откроется прогноз — ещё немного, и увидишь свой балл!';
    return 'Совсем чуть-чуть до первого прогноза — финишная прямая! 🎯';
  }

  const score = predictedScore.score ?? 0;
  if (score < 10) return 'Самое начало пути — каждое задание добавляет баллы! 📈';
  if (score < 20) return 'Первые очки уже есть — продолжай, темп отличный!';
  if (score < 30) return 'База формируется. Слабые темы — лучший способ быстро вырасти!';
  if (score < 40) return 'Хороший прогресс! Ещё немного практики — и будет новая десятка 💪';
  if (score < 50) return 'Ты на верном пути. Регулярность сейчас важнее всего!';
  if (score < 60) return 'Уже середина пути — отличная работа, не сбавляй темп!';
  if (score < 70) return 'Скоро уверенные 70+ — ты уже близко, держи ритм! 🔥';
  if (score < 80) return 'Крепкий уровень! Закрепляй сильные темы и подтягивай остальное 👍';
  if (score < 90) return 'Отличный результат — ты в числе сильных учеников! ⭐';
  if (score < 100) return 'Почти максимум — осталось совсем чуть-чуть до вершины! 🏆';
  return 'Блестяще! Ты на пике — держи форму! 🎉';
}

function Practice({ studentId }) {
  // Используем данные из контекста
  const {
    practiceTopics, subjects, refreshAfterPractice, loading: contextLoading,
    prefetchQuestions, getQuestions, updatePracticeStatsOptimistic, streak, streakLoaded, setStreak, setStreakLoaded, loadStreak,
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
  const [streakBump, setStreakBump] = useState(false);
  const streakTodayDoneInitRef = useRef(false);
  const prevStreakTodayDoneRef = useRef(false);

  useEffect(() => {
    const todayDone = !!streak?.todayDone;
    if (!streakTodayDoneInitRef.current) {
      streakTodayDoneInitRef.current = true;
      prevStreakTodayDoneRef.current = todayDone;
      return;
    }
    if (!prevStreakTodayDoneRef.current && todayDone) {
      setStreakBump(true);
      const timer = setTimeout(() => setStreakBump(false), 1500);
      prevStreakTodayDoneRef.current = todayDone;
      return () => clearTimeout(timer);
    }
    prevStreakTodayDoneRef.current = todayDone;
  }, [streak?.todayDone]);

  const getStreakVisualState = (value) => {
    if (!streakLoaded || !value) return 'empty';
    if (value.todayDone) return 'done';
    if (value.streak > 0) return 'pending';
    return 'empty';
  };

  const streakClassName = (extra = '') => {
    const state = getStreakVisualState(streak);
    return `hero-streak ${state}${streakBump ? ' bump' : ''}${extra ? ` ${extra}` : ''}`;
  };

  const streakCircleClassName = () => {
    const state = getStreakVisualState(streak);
    return `streak-circle on-blue ${state}${streakBump ? ' bump' : ''}`;
  };

  const renderPracticeOverlay = (content) => (
    typeof document === 'undefined' ? content : createPortal(content, document.body)
  );

  const normalizeQuestion = (question) => {
    if (!question) return null;
    let options = question.options;
    if (typeof options === 'string') {
      try {
        options = JSON.parse(options);
      } catch {
        options = [];
      }
    }
    if (!Array.isArray(options)) options = [];
    options = options.map((opt) => String(opt ?? '').trim()).filter(Boolean);
    if (options.length < 2) return null;
    const correctAnswer = Number.isInteger(question.correctAnswer)
      ? question.correctAnswer
      : parseInt(question.correctAnswer, 10);
    if (!Number.isInteger(correctAnswer) || correctAnswer < 0 || correctAnswer >= options.length) {
      return null;
    }
    return {
      ...question,
      questionText: String(question.questionText || '').trim(),
      options,
      correctAnswer,
    };
  };

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

  // Стрик в hero — подгружаем сразу при входе в раздел (важно для мобильного Telegram)
  useEffect(() => {
    loadStreak();
  }, [loadStreak]);

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
    const normalized = normalizeQuestion(question);
    if (!normalized) return null;
    const indices = normalized.options.map((_, i) => i);
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    return {
      ...normalized,
      options: indices.map((i) => normalized.options[i]),
      correctAnswer: indices.indexOf(normalized.correctAnswer),
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
      .map(shuffleOptions)
      .filter(Boolean)
      .sort(() => Math.random() - 0.5);
  };

  const startPracticeFromQuestions = (topic, activeQuestions, label) => {
    const adaptiveQuestions = getAdaptiveQuestions(activeQuestions);
    if (adaptiveQuestions.length === 0) {
      alert('Нет доступных вопросов');
      return;
    }
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
      const questionsList = (data?.questions || []).map(shuffleOptions).filter(Boolean);
      if (questionsList.length === 0) {
        alert(data?.message || 'Нет заданий для тренировки');
        return;
      }
      const virtualTopic = {
        id: `growth-${selectedSubject.id}`,
        name: 'Слабые и новые темы',
        subjectId: selectedSubject.id,
        icon: '🎯'
      };
      startPracticeFromQuestions(virtualTopic, questionsList, 'Тренировка: слабые и новые темы');
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

    if (typeof activePractice.id === 'number') {
      updatePracticeStatsOptimistic(activePractice.id, correctCount, totalCount);
    }

    const questionMap = {};
    questions.forEach(q => { questionMap[q.id] = q; });

    try {
      const response = await apiFetch(`${API_URL}/practice/attempts`, {
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
      });

      if (response.ok) {
        const data = await response.json();
        if (data.streak) {
          setStreak(data.streak);
          setStreakLoaded(true);
        }
        const subjectId = activePractice?.subjectId || selectedSubject?.id;
        await refreshAfterPractice(subjectId, leaderboardPeriod);
      }
    } catch (e) {
      console.error('Error saving attempt:', e);
    }
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

  const closePractice = async () => {
    if (autoNextTimerRef.current) clearTimeout(autoNextTimerRef.current);

    const subjectId = activePractice?.subjectId || selectedSubject?.id;

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

    setActiveTab('practice');

    await refreshAfterPractice(subjectId, leaderboardPeriod);
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
    const currentQuestion = normalizeQuestion(questions[currentQuestionIndex]);
    const progress = questions.length > 0
      ? ((currentQuestionIndex + 1) / questions.length) * 100
      : 0;

    if (!currentQuestion) {
      return renderPracticeOverlay(
        <div className="practice-mode">
          <div className="practice-header">
            <button type="button" className="back-button" onClick={closePractice}>
              ← Назад к списку
            </button>
            <div className="practice-info">
              <h2>{activePractice.name}</h2>
              <p>Загрузка вопросов...</p>
            </div>
          </div>
          <div className="practice-loading-body">Подготавливаем тест...</div>
        </div>
      );
    }

    return renderPracticeOverlay(
      <div className="practice-mode">
        <div className="practice-header">
          <button className="back-button" onClick={closePractice}>
            ← Назад к списку
          </button>
          <div className="practice-info">
            <h2>{activePractice.name}</h2>
            <p>Вопрос {currentQuestionIndex + 1} из {questions.length}</p>
          </div>
          {streak && (
            <div className={streakCircleClassName()}>
              <span className="streak-circle-flame">🔥</span>
              <span className="streak-circle-count">{streak.streak || 0}</span>
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

    return renderPracticeOverlay(
      <div className="practice-mode practice-mode--result">
        <div className="practice-header">
          <button type="button" className="back-button" onClick={closePractice}>← Назад</button>
          <div className="practice-info">
            <h2>{activePractice.name}</h2>
            <p>Практика завершена</p>
          </div>
          {streak && (
            <div className={streakCircleClassName()}>
              <span className="streak-circle-flame">🔥</span>
              <span className="streak-circle-count">{streak.streak || 0}</span>
            </div>
          )}
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
      <div className="section section-practice">
        <div className="practice-hero">
          <div className="practice-hero-glow"></div>
          <div className="practice-hero-content">
            <div className="practice-hero-main">
              <StudentBrandMark variant="hero" />
              <div className="practice-hero-text">
                <div className="practice-hero-eyebrow">РАЗДЕЛ</div>
                <h1 className="practice-hero-title">Практика</h1>
                <p className="practice-hero-sub">Выберите предмет для практики</p>
              </div>
            </div>
            <div className={streakClassName()}>
              <span className="hero-streak-flame">🔥</span>
              <span className="hero-streak-count">{streak?.streak || 0}</span>
            </div>
          </div>
          <svg className="practice-hero-wave" viewBox="0 0 400 40" preserveAspectRatio="none">
            <path d="M0,40 L0,22 Q100,2 200,18 T400,15 L400,40 Z" />
          </svg>
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
  const scoreMilestoneHint = getScoreMilestoneHint(predictedScore);
  const predictedEncouragement = getPredictedEncouragement(predictedScore);
  const actionableWeakTopics = (predictedScore?.weakTopics || []).filter(t => t.solved > 0);
  const actionableNewTopics = predictedScore?.newTopics || [];
  const actionableStrongTopics = (predictedScore?.strongTopics || []).filter(t => t.solved > 0);
  const hasGrowthTopics = actionableWeakTopics.length > 0 || actionableNewTopics.length > 0;
  const unlockPercent = predictedScore?.minRequired
    ? Math.min(100, Math.round(((predictedScore?.solved || 0) / predictedScore.minRequired) * 100))
    : 0;
  const scoreRingClass = !predictedScore?.unlocked
    ? 'locked'
    : predictedScore.score >= 70
      ? 'score-high'
      : predictedScore.score >= 40
        ? 'score-mid'
        : 'score-low';

  return (
    <div className="section section-practice">
      <div className="practice-hero">
        {subjects.length > 1 && selectedSubject && (
          <button className="back-button hero-back-inset" onClick={backToSubjects}>
            ← Назад к предметам
          </button>
        )}
        <div className="practice-hero-glow"></div>
        <div className="practice-hero-content">
          <div className="practice-hero-main">
            <StudentBrandMark variant="hero" />
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
          </div>
          <div className={streakClassName()}>
            <span className="hero-streak-flame">🔥</span>
            <span className="hero-streak-count">{streak?.streak || 0}</span>
          </div>
        </div>
          <svg className="practice-hero-wave" viewBox="0 0 400 40" preserveAspectRatio="none">
            <path d="M0,40 L0,22 Q100,2 200,18 T400,15 L400,40 Z" />
          </svg>
      </div>

      {/* ТАБ-БАР — только внутри предмета */}
      {selectedSubject && (
        <div className="practice-tabs">
          <button
            type="button"
            className={`practice-tab ${activeTab === 'practice' ? 'active' : ''}`}
            onClick={() => setActiveTab('practice')}
          >
            <span className="practice-tab-icon">📝</span>
            <span className="practice-tab-label">Практика</span>
          </button>
          <button
            type="button"
            className={`practice-tab ${activeTab === 'rating' ? 'active' : ''}`}
            onClick={() => setActiveTab('rating')}
          >
            <span className="practice-tab-icon">🏆</span>
            <span className="practice-tab-label">Рейтинг</span>
          </button>
        </div>
      )}

      {/* ===== ВКЛАДКА ПРАКТИКА ===== */}
      {selectedSubject && activeTab === 'practice' && (
        <div className="practice-panel">
          <div className="practice-stats-row">
            <div className="dash-card predicted-score-card">
              <div className="predicted-score-header">
                <span className="predicted-label">Прогноз на ЦТ</span>
                {predictedScore?.unlocked && scoreDelta != null && scoreDelta !== 0 && (
                  <span className={`score-delta ${scoreDelta > 0 ? 'up' : 'down'}`}>
                    {scoreDelta > 0 ? '+' : ''}{scoreDelta}
                  </span>
                )}
                {!predictedScore?.unlocked && (
                  <span className="predicted-unlock-count">
                    {predictedScore?.solved || 0}/{predictedScore?.minRequired || 50}
                  </span>
                )}
              </div>

              <div className="predicted-score-ring-wrap">
                <div
                  className={`predicted-score-ring ${scoreRingClass}`}
                  style={{
                    '--score-pct': predictedScore?.unlocked
                      ? `${predictedScore.score}%`
                      : `${unlockPercent}%`
                  }}
                >
                  {predictedScore?.unlocked ? (
                    <span className="predicted-score-ring-inner">
                      <span className="predicted-score-ring-value">{predictedScore.score}</span>
                      <span className="predicted-score-ring-max">/100</span>
                    </span>
                  ) : (
                    <span className="predicted-score-ring-inner locked">
                      <span className="predicted-score-ring-value">{unlockPercent}%</span>
                    </span>
                  )}
                </div>
              </div>

              {predictedScore?.unlocked ? (
                <>
                  <div className="predicted-meta">
                    Решено {predictedScore.solved} · Точность {predictedScore.accuracy}%
                  </div>
                  {scoreMilestoneHint && (
                    <p className="predicted-action-hint">
                      {scoreMilestoneHint.text}
                    </p>
                  )}
                  <p className="predicted-hint predicted-encouragement">
                    {predictedEncouragement}
                  </p>
                </>
              ) : (
                <>
                  <p className="predicted-locked-title">Прогноз пока недоступен</p>
                  <p className="predicted-hint predicted-encouragement">
                    {predictedEncouragement}
                  </p>
                  <p className="predicted-locked-hint">
                    Осталось {predictedScore?.needed ?? 50} уникальных заданий
                  </p>
                </>
              )}
            </div>

            {subjectDailyGoal && (
              <div className="dash-card daily-goal-card">
                <div className="daily-goal-header">
                  <span>🎯 Цель на сегодня</span>
                  <span className={subjectDailyGoal.completed ? 'goal-done' : ''}>
                    {subjectDailyGoal.solved}/{subjectDailyGoal.goal}
                  </span>
                </div>
                <div className="daily-goal-ring-wrap">
                  <div
                    className={`daily-goal-ring ${subjectDailyGoal.completed ? 'complete' : ''}`}
                    style={{ '--goal-pct': `${subjectDailyGoal.percent}%` }}
                  >
                    <span className="daily-goal-ring-value">{subjectDailyGoal.percent}%</span>
                  </div>
                </div>
                <p className={`goal-msg ${subjectDailyGoal.completed ? 'done' : ''}`}>
                  {subjectDailyGoal.completed
                    ? 'Цель выполнена!'
                    : `Осталось ${subjectDailyGoal.remaining}`}
                </p>
              </div>
            )}
          </div>

          {predictedScore?.unlocked && (actionableStrongTopics.length > 0 || hasGrowthTopics) && (
            <div className="dash-card topics-insight-card">
              {actionableStrongTopics.length > 0 && (
                <div className="topics-group">
                  <div className="topics-group-title">Сильные темы</div>
                  {actionableStrongTopics.map(t => (
                    <div key={t.topicId} className="topic-insight strong">
                      <span>{t.name}</span>
                      <span className="topic-insight-pct">{t.progress}%</span>
                    </div>
                  ))}
                </div>
              )}
              {actionableWeakTopics.length > 0 && (
                <div className="topics-group">
                  <div className="topics-group-title">Слабые темы</div>
                  {actionableWeakTopics.map(t => (
                    <div key={t.topicId} className="topic-insight weak">
                      <span>{t.name}</span>
                      <span className="topic-insight-pct">{t.progress}%</span>
                    </div>
                  ))}
                </div>
              )}
              {actionableNewTopics.length > 0 && (
                <div className="topics-group">
                  <div className="topics-group-title">Новые темы</div>
                  {actionableNewTopics.map(t => (
                    <div key={t.topicId} className="topic-insight new">
                      <span>{t.name}</span>
                      <span className="topic-insight-pct">не начато</span>
                    </div>
                  ))}
                </div>
              )}
              {hasGrowthTopics && (
                <button
                  type="button"
                  className="weak-topics-btn"
                  onClick={startWeakTopicsPractice}
                  disabled={weakTopicsLoading}
                >
                  {weakTopicsLoading ? 'Загрузка...' : 'Потренировать слабые и новые темы'}
                </button>
              )}
            </div>
          )}

          <h2 className="practice-section-heading">Подразделы</h2>

          {filteredTopics.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">📚</div>
              <p className="empty-text">Нет доступных заданий по этому предмету</p>
            </div>
          ) : (
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
                      type="button"
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
          )}
        </div>
      )}

      {/* ===== ВКЛАДКА РЕЙТИНГ ===== */}
      {selectedSubject && activeTab === 'rating' && (
        <div className="rating-panel">
          <div className="rating-period-tabs">
            {[
              { id: 'day', label: 'День' },
              { id: 'week', label: 'Неделя' },
              { id: 'month', label: 'Месяц' },
            ].map(({ id, label }) => (
              <button
                key={id}
                type="button"
                className={`rating-period-tab ${leaderboardPeriod === id ? 'active' : ''}`}
                onClick={() => setLeaderboardPeriod(id)}
              >
                {label}
              </button>
            ))}
          </div>

          {leaderboard?.myPosition && (
            <div className="my-rank-card">
              <div className="my-rank-label">Ваше место</div>
              <div className="my-rank-value">#{leaderboard.myPosition.rank}</div>
              <div className="my-rank-meta">{leaderboard.myPosition.totalSolved} заданий за период</div>
            </div>
          )}

          <div className="rating-list-card">
            <div className="rating-list-header">
              <span>Топ учеников</span>
              <span className="rating-list-count">
                {(leaderboard?.top || []).length} чел.
              </span>
            </div>

            {(leaderboard?.top || []).length === 0 ? (
              <p className="lb-empty">Пока нет данных за этот период</p>
            ) : (
              <div className="leaderboard-list">
                {(leaderboard?.top || []).slice(0, 20).map(entry => {
                  const isMe = entry.studentId === studentId;
                  const rankMedal = entry.rank === 1 ? '🥇' : entry.rank === 2 ? '🥈' : entry.rank === 3 ? '🥉' : null;
                  return (
                    <div
                      key={entry.studentId}
                      className={`lb-row ${isMe ? 'me' : ''} ${entry.rank <= 3 ? 'top3' : ''}`}
                    >
                      <span className="lb-rank">{rankMedal || entry.rank}</span>
                      <span className="lb-name">{entry.firstName} {entry.lastName?.[0]}.</span>
                      <span className="lb-score">{entry.totalSolved}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Без выбранного предмета (один предмет — табы выше, этот блок не нужен) */}
      {!selectedSubject && filteredTopics.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📚</div>
          <p className="empty-text">Нет доступных заданий для практики</p>
        </div>
      ) : !selectedSubject ? (
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
                  type="button"
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