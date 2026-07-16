import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import './Practice.css';
import { useData } from './DataContext';
import { apiFetch } from './api';

import { API_URL } from '../config';
import StudentBrandMark from '../components/StudentBrandMark';
import mathSubjectBg from '../assets/math.png';
import physSubjectBg from '../assets/phys.png';
import russSubjectBg from '../assets/russ.png';
import englishSubjectBg from '../assets/english.png';

// URL оптимизированного изображения практики по storageKey (ТЗ §7).
const practiceImageUrl = (storageKey) =>
  storageKey ? `${API_URL}/practice-images/${storageKey}` : null;

// Точное совпадение множеств индексов (multiple choice: верно, только если
// выбраны все правильные варианты и ни одного лишнего).
const sameAnswerSet = (a, b) => {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  const setB = new Set(b);
  return a.every((v) => setB.has(v));
};

const SUBJECT_CARD_BACKGROUNDS = [
  { match: ['математ', 'math'], image: mathSubjectBg },
  { match: ['физик', 'phys'], image: physSubjectBg },
  { match: ['русск', 'russ'], image: russSubjectBg },
  { match: ['англ', 'english'], image: englishSubjectBg },
];

function getPracticeSubjectCardBg(subject) {
  const haystack = `${subject?.name || ''} ${subject?.icon || ''}`.toLowerCase();
  const found = SUBJECT_CARD_BACKGROUNDS.find(({ match }) =>
    match.some((token) => haystack.includes(token))
  );
  return found?.image || null;
}

const PROBE_CHANCE = 0.12;
const RECENT_WINDOW = 10;
const CALIBRATION_LIMIT = 50;
const CALIBRATION_ERROR_MEDIUM = 6;
const CALIBRATION_ERROR_EASY = 14;

function shuffleArr(arr) {
  return [...arr].sort(() => Math.random() - 0.5);
}

function questionDifficulty(q) {
  if (q?.difficulty === 'hard') return 'hard';
  if (q?.difficulty === 'easy') return 'easy';
  return 'medium';
}

function filterByTier(questions, tier) {
  return questions.filter((q) => questionDifficulty(q) === tier);
}

function tierToLevel(tier) {
  if (tier === 'hard') return 2;
  if (tier === 'easy') return 0;
  return 1;
}

function levelToTier(level) {
  if (level < 0.45) return 'easy';
  if (level < 1.45) return 'medium';
  return 'hard';
}

function getTrailingStreak(answers) {
  let correctStreak = 0;
  let wrongStreak = 0;
  for (let i = answers.length - 1; i >= 0; i -= 1) {
    if (answers[i].isCorrect) {
      if (wrongStreak > 0) break;
      correctStreak += 1;
    } else {
      if (correctStreak > 0) break;
      wrongStreak += 1;
    }
  }
  return { correctStreak, wrongStreak };
}

function statsForTier(answers, tier) {
  const slice = answers.slice(-RECENT_WINDOW);
  let total = 0;
  let correct = 0;
  slice.forEach((a) => {
    const d = a.difficulty || 'medium';
    if (d !== tier) return;
    total += 1;
    if (a.isCorrect) correct += 1;
  });
  return { total, correct, rate: total ? correct / total : null };
}

/** Умный уровень сложности 0 (easy) … 2 (hard) по истории ответов */
function computeAdaptiveLevel(sessionAnswers) {
  const n = sessionAnswers.length;
  if (n === 0) return 0.85;

  const recent = sessionAnswers.slice(-8);
  const accuracy = recent.filter((a) => a.isCorrect).length / recent.length;
  const { correctStreak, wrongStreak } = getTrailingStreak(sessionAnswers);

  let level = 1;
  if (accuracy >= 0.88) level = 1.85;
  else if (accuracy >= 0.7) level = 1.45;
  else if (accuracy >= 0.5) level = 1.05;
  else if (accuracy >= 0.35) level = 0.65;
  else level = 0.25;

  if (correctStreak >= 5) level += 0.55;
  else if (correctStreak >= 3) level += 0.35;
  else if (correctStreak >= 2) level += 0.18;

  if (wrongStreak >= 3) level -= 0.75;
  else if (wrongStreak >= 2) level -= 0.48;
  else if (wrongStreak === 1) level -= 0.12;

  const easyStats = statsForTier(sessionAnswers, 'easy');
  const hardStats = statsForTier(sessionAnswers, 'hard');

  if (easyStats.total >= 2 && easyStats.rate === 1 && correctStreak >= 2) {
    level += 0.42;
  }
  if (hardStats.total >= 2 && hardStats.rate !== null && hardStats.rate <= 0.34) {
    level -= 0.55;
  }
  if (hardStats.total >= 1 && hardStats.rate === 1 && correctStreak >= 2) {
    level += 0.25;
  }

  const last = sessionAnswers[n - 1];
  const lastTier = last?.difficulty || 'medium';
  const lastLevel = tierToLevel(lastTier);
  if (!last.isCorrect && lastLevel > level + 0.35) {
    level -= 0.22;
  }
  if (last.isCorrect && lastLevel < level - 0.35) {
    level += 0.18;
  }

  return Math.max(0, Math.min(2, level));
}

function pickTierForNext(sessionAnswers) {
  const n = sessionAnswers.length;

  if (n < 3) {
    return Math.random() < 0.55 ? 'easy' : 'medium';
  }

  if (n >= 5 && Math.random() < PROBE_CHANCE) {
    const roll = Math.random();
    if (roll < 0.28) return 'easy';
    if (roll < 0.62) return 'medium';
    return 'hard';
  }

  const level = computeAdaptiveLevel(sessionAnswers);
  let tier = levelToTier(level);

  const fraction = level - tierToLevel(tier);
  if (fraction > 0.28 && Math.random() < 0.38) {
    if (tier === 'easy') tier = 'medium';
    else if (tier === 'medium') tier = fraction > 0.55 ? 'hard' : 'easy';
    else if (tier === 'hard') tier = 'medium';
  }

  return tier;
}

function pickWeightedFromPools(candidates, primaryTier, level) {
  const tiers = ['easy', 'medium', 'hard'];
  const primary = filterByTier(candidates, primaryTier);
  const pools = tiers
    .map((tier) => ({
      tier,
      items: filterByTier(candidates, tier),
      weight: tier === primaryTier ? 0.68 : Math.abs(tierToLevel(tier) - level) <= 1 ? 0.16 : 0.04,
    }))
    .filter((p) => p.items.length > 0);

  if (pools.length === 0) return null;

  const totalWeight = pools.reduce((sum, p) => sum + p.weight, 0);
  let roll = Math.random() * totalWeight;
  for (const pool of pools) {
    roll -= pool.weight;
    if (roll <= 0) return shuffleArr(pool.items)[0];
  }
  return shuffleArr(pools[pools.length - 1].items)[0];
}

/** Калибровка: пока нет прогнозного балла — оцениваем уровень (~50 уникальных заданий) */
function getCalibrationTier(sessionAnswers) {
  const n = sessionAnswers.length;
  const errors = sessionAnswers.filter((a) => !a.isCorrect).length;
  const recent = sessionAnswers.slice(-8);
  const recentErrors = recent.filter((a) => !a.isCorrect).length;

  if (recentErrors >= 4 || errors >= CALIBRATION_ERROR_EASY) return 'easy';
  if (recentErrors >= 2 || errors >= CALIBRATION_ERROR_MEDIUM) return 'medium';

  if (n < 6) return Math.random() < 0.7 ? 'hard' : 'medium';
  return 'hard';
}

function pickCalibrationFromPool(candidates, sessionAnswers) {
  const n = sessionAnswers.length;

  let tier = getCalibrationTier(sessionAnswers);
  if (n >= 10 && Math.random() < 0.14) {
    const roll = Math.random();
    tier = roll < 0.3 ? 'easy' : roll < 0.65 ? 'medium' : 'hard';
  }

  let source = filterByTier(candidates, tier);
  if (source.length === 0) source = candidates;

  const seenTopics = new Set(sessionAnswers.map((a) => a.topicId));
  const freshTopicPool = source.filter((q) => !seenTopics.has(q.topicId));
  if (freshTopicPool.length > 0 && Math.random() < 0.45) {
    source = freshTopicPool;
  } else {
    const recentTopics = new Set(sessionAnswers.slice(-2).map((a) => a.topicId));
    const diverse = source.filter((q) => !recentTopics.has(q.topicId));
    if (diverse.length > 0) source = diverse;
  }

  if (n < CALIBRATION_LIMIT) {
    const tierPool = filterByTier(source, tier);
    if (tierPool.length > 0 && Math.random() < 0.78) source = tierPool;
  }

  return shuffleArr(source)[0];
}

function pickAdaptiveFromPool(candidates, sessionAnswers) {
  const targetTier = pickTierForNext(sessionAnswers);
  const level = computeAdaptiveLevel(sessionAnswers);

  let picked = pickWeightedFromPools(candidates, targetTier, level);
  if (!picked) {
    const tierPool = filterByTier(candidates, targetTier);
    picked = tierPool.length > 0 ? shuffleArr(tierPool)[0] : shuffleArr(candidates)[0];
  }

  const recentTopics = new Set(sessionAnswers.slice(-3).map((a) => a.topicId));
  const diverse = candidates.filter(
    (q) => q.id !== picked.id && !recentTopics.has(q.topicId) && questionDifficulty(q) === questionDifficulty(picked)
  );
  if (diverse.length > 0 && Math.random() < 0.55) {
    return shuffleArr(diverse)[0];
  }

  return picked;
}

function pickFromPool(pool, sessionAnswers, mode, options = {}) {
  if (!pool.length) return null;

  const sessionAnsweredIds = new Set(sessionAnswers.map((a) => a.questionId));
  const globalSolvedIds = options.globalSolvedIds || new Set();

  let candidates = pool.filter((q) => !sessionAnsweredIds.has(q.id));

  if (!options.hasPredictedScore) {
    const unseen = candidates.filter((q) => !globalSolvedIds.has(q.id));
    if (unseen.length > 0) candidates = unseen;
  }

  if (candidates.length === 0) {
    candidates = pool.filter((q) => !sessionAnsweredIds.has(q.id));
  }
  if (candidates.length === 0) candidates = pool;

  if (mode === 'general') {
    if (options.hasPredictedScore) {
      return pickAdaptiveFromPool(candidates, sessionAnswers);
    }
    return pickCalibrationFromPool(candidates, sessionAnswers);
  }

  return shuffleArr(candidates)[0];
}

const GOAL_HINT = 'Решай любые задания — новые правильные ответы заполняют цель';
const STREAK_HINT = 'Выполни ежедневную цель, чтобы продлить серию';

function HeroMetricHint({ id, openId, onToggle, hint, children, align = 'center' }) {
  const active = openId === id;
  const triggerRef = useRef(null);
  const [popoverData, setPopoverData] = useState(null);

  useEffect(() => {
    if (!active || !triggerRef.current) { setPopoverData(null); return; }
    const rect = triggerRef.current.getBoundingClientRect();
    const POPOVER_W = 168;
    const style = { position: 'fixed', zIndex: 9999, width: 'max-content', maxWidth: POPOVER_W };

    const spaceBelow = window.innerHeight - rect.bottom;
    const showBelow = rect.top < 120 || spaceBelow > 80;

    // Горизонталь: прижимаем к правому краю кнопки, не выходя за экран
    let left;
    const btnCenterX = rect.left + rect.width / 2;
    if (align === 'end') {
      left = Math.max(8, rect.right - POPOVER_W);
    } else {
      left = Math.max(8, btnCenterX - POPOVER_W / 2);
    }
    left = Math.min(left, window.innerWidth - POPOVER_W - 8);
    style.left = left;

    // Вертикаль
    if (showBelow) {
      style.top = rect.bottom + 8;
    } else {
      style.bottom = window.innerHeight - rect.top + 8;
    }

    // Позиция стрелки относительно popover
    const arrowX = btnCenterX - left - 5; // -5 = половина стрелки
    setPopoverData({ style, arrowX, showBelow });
  }, [active, align]);

  return (
    <div className={`hero-metric-hint-wrap hero-metric-hint-wrap--${align}`}>
      <button
        ref={triggerRef}
        type="button"
        className="hero-metric-hint-trigger"
        onClick={() => onToggle(id)}
        aria-expanded={active}
        aria-label={active ? undefined : 'Подсказка'}
      >
        {children}
      </button>
      {active && popoverData && typeof document !== 'undefined' && createPortal(
        <div className="hero-metric-hint-popover hero-metric-hint-popover--portal" role="tooltip" style={popoverData.style}>
          {hint}
          <span
            className="hero-metric-hint-arrow"
            style={{
              left: Math.max(6, Math.min(popoverData.arrowX, 148)),
              [popoverData.showBelow ? 'top' : 'bottom']: -5,
              transform: popoverData.showBelow ? 'rotate(225deg)' : 'rotate(45deg)',
            }}
          />
        </div>,
        document.body
      )}
    </div>
  );
}

function Practice({ studentId, isTabActive = true, onClose, onActivate }) {
  // Используем данные из контекста
  const {
    practiceTopics, subjects, refreshAfterPractice, loading: contextLoading,
    prefetchQuestions, getQuestions, updatePracticeStatsOptimistic, streak, streakLoaded, setStreak, setStreakLoaded, loadStreak,
    dailyGoal, loadDailyGoal, patchDailyGoal,
    predictedScore, loadPredictedScore,
    leaderboard, loadLeaderboard,
    loadWeakTopicsQuestions,
    loadSubjectDashboard,
    practiceIntent, clearPracticeIntent,
    practiceHomeToken,
  } = useData();
  
  const [selectedSubject, setSelectedSubject] = useState(null);
  const [leaderboardPeriod, setLeaderboardPeriod] = useState('day');
  const [practiceLoading, setPracticeLoading] = useState(false);
  const [showTopicPicker, setShowTopicPicker] = useState(false);
  const [activeTab, setActiveTab] = useState('practice');
  
  const [activePractice, setActivePractice] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  // Массив выбранных индексов (multiple choice) — до подтверждения копится тут,
  // после ответа хранит зафиксированный набор.
  const [selectedAnswer, setSelectedAnswer] = useState([]);
  const [userAnswers, setUserAnswers] = useState([]);
  const [remainingQuestions, setRemainingQuestions] = useState([]);
  const [sessionAnswers, setSessionAnswers] = useState([]);
  
  const [answered, setAnswered] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [showExplanationHint, setShowExplanationHint] = useState(false);
  // Полноэкранный просмотрщик изображения (ТЗ §3.2).
  const [lightboxSrc, setLightboxSrc] = useState(null);
  // Фаза закрытия модалки объяснения — держим её в DOM на время анимации сворачивания.
  const [explanationClosing, setExplanationClosing] = useState(false);
  const explanationCloseTimerRef = useRef(null);
  // Анимировать выезд лишних вариантов только при свежем ответе.
  // При возврате к уже отвеченному вопросу варианты сразу скрыты, без повторной анимации.
  const [animateDismiss, setAnimateDismiss] = useState(false);
  
  const [confetti, setConfetti] = useState(false);

  // Светящаяся сфера, летящая к дневной цели
  const [orbs, setOrbs] = useState([]); // {id, x0, y0, x1, y1}
  const [goalPeek, setGoalPeek] = useState(false); // кольцо выехало
  const [goalPulse, setGoalPulse] = useState(false); // кольцо пульсит
  const [sessionSolved, setSessionSolved] = useState(0); // оптимистичный прирост до ответа сервера
  const [bursts, setBursts] = useState([]); // micro-celebration: вспышки частиц из точки тапа
  const goalRingRef = useRef(null);
  const orbIdRef = useRef(0);
  const burstIdRef = useRef(0);
  const goalHideTimerRef = useRef(null);
  const pendingSavesRef = useRef([]);
  const orbFlushQueueRef = useRef([]);
  const practiceModeRef = useRef('general');
  const globalSolvedIdsRef = useRef(new Set());
  const questionPoolRef = useRef([]);
  const questionsRef = useRef([]);
  const pendingAutoNextSessionRef = useRef(null); // sessionAnswers для подбора следующего вопроса
  const prefetchedNextRef = useRef(null); // { question, answerCount } — следующий вопрос, подобранный фоново

  const [streakBump, setStreakBump] = useState(false);
  const [openMetricHint, setOpenMetricHint] = useState(null);
  const streakTodayDoneInitRef = useRef(false);
  const prevStreakTodayDoneRef = useRef(false);

  const subjectDailyGoal = dailyGoal?.goals?.find(
    (g) => Number(g.subjectId) === Number(selectedSubject?.id)
  );

  const getEffectiveTodayDone = () => {
    if (activePractice?.subjectId) {
      const goal = dailyGoal?.goals?.find(
        (g) => Number(g.subjectId) === Number(activePractice.subjectId)
      );
      if (goal) return goal.completed || (goal.solved + sessionSolved >= goal.goal);
    }
    if (subjectDailyGoal) return subjectDailyGoal.completed;
    return !!streak?.todayDone;
  };

  useEffect(() => {
    const todayDone = getEffectiveTodayDone();
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
  }, [subjectDailyGoal?.completed, streak?.todayDone, activePractice?.subjectId, sessionSolved, dailyGoal]);

  useEffect(() => {
    if (!openMetricHint) return undefined;
    const close = (e) => {
      if (!e.target.closest('.hero-metric-hint-wrap')) {
        setOpenMetricHint(null);
      }
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [openMetricHint]);

  const toggleMetricHint = (id) => {
    setOpenMetricHint((prev) => (prev === id ? null : id));
  };

  const getStreakVisualState = (value, todayDoneOverride = null) => {
    if (!streakLoaded || !value) return 'empty';
    const todayDone = todayDoneOverride != null ? todayDoneOverride : value.todayDone;
    if (todayDone) return 'done';
    if (value.streak > 0) return 'pending';
    return 'empty';
  };

  const streakClassName = (extra = '') => {
    const state = getStreakVisualState(streak, getEffectiveTodayDone());
    return `hero-streak ${state}${streakBump ? ' bump' : ''}${extra ? ` ${extra}` : ''}`;
  };

  const streakCircleClassName = () => {
    const state = getStreakVisualState(streak, getEffectiveTodayDone());
    return `streak-circle on-blue ${state}${streakBump ? ' bump' : ''}`;
  };

  // Оверлей теста идёт в портал на document.body, поэтому .tab-hidden родителя его не скрывает.
  // Когда таб «Практика» неактивен — прячем оверлей через display:none, сохраняя стейт теста,
  // чтобы при возврате тест продолжался с того же места.
  const renderPracticeOverlay = (content) => {
    const wrapped = (
      <div className="practice-overlay-portal" style={isTabActive ? undefined : { display: 'none' }}>
        {content}
      </div>
    );
    return typeof document === 'undefined' ? wrapped : createPortal(wrapped, document.body);
  };

  useEffect(() => {
    if (!showTopicPicker) return undefined;
    const content = document.querySelector('.student-app .content');
    content?.classList.add('topic-picker-scroll-lock');
    return () => content?.classList.remove('topic-picker-scroll-lock');
  }, [showTopicPicker]);

  const renderTopicPicker = () => {
    if (!showTopicPicker) return null;
    const node = (
      <div
        className="topic-picker-overlay"
        onClick={() => setShowTopicPicker(false)}
        role="dialog"
        aria-modal="true"
        aria-labelledby="topic-picker-title"
      >
        <div className="topic-picker" onClick={(e) => e.stopPropagation()}>
          <h3 id="topic-picker-title" className="topic-picker-title">Выбери тему</h3>
          <div className="topic-picker-scroll-wrap">
            <div className="topic-picker-list">
              {filteredTopics.map(topic => (
                <button
                  key={topic.id}
                  type="button"
                  className="topic-picker-item"
                  onClick={() => startPractice(topic)}
                >
                  <span className="topic-picker-icon">{topic.icon || '📝'}</span>
                  <span className="topic-picker-name">{topic.name}</span>
                </button>
              ))}
            </div>
          </div>
          <button type="button" className="topic-picker-cancel" onClick={() => setShowTopicPicker(false)}>
            Отмена
          </button>
        </div>
      </div>
    );
    return typeof document === 'undefined' ? node : createPortal(node, document.body);
  };

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

    // correctAnswer — массив индексов (multiple choice). Раньше было одно число —
    // приводим к массиву для обратной совместимости на переходный период.
    const rawCorrect = Array.isArray(question.correctAnswer)
      ? question.correctAnswer
      : [question.correctAnswer];
    const correctAnswer = [...new Set(
      rawCorrect
        .map((v) => (Number.isInteger(v) ? v : parseInt(v, 10)))
        .filter((v) => Number.isInteger(v) && v >= 0 && v < options.length)
    )];
    if (correctAnswer.length === 0) return null;

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

  // Стрик привязан к дневной цели выбранного предмета
  useEffect(() => {
    loadStreak(selectedSubject?.id ?? null);
  }, [loadStreak, selectedSubject?.id]);

  // Prefetch вопросов фоново при входе в раздел практики
  useEffect(() => {
    if (practiceTopics.length > 0) {
      prefetchQuestions(practiceTopics);
    }
  }, [practiceTopics, prefetchQuestions]);

  // Загрузка целей, рейтинга и прогноза при выборе предмета
  useEffect(() => {
    if (selectedSubject?.id) {
      loadDailyGoal();
      loadLeaderboard(selectedSubject.id, leaderboardPeriod);
      loadPredictedScore(selectedSubject.id);
    }
  }, [selectedSubject, leaderboardPeriod, loadDailyGoal, loadLeaderboard, loadPredictedScore]);

  const getGeneralPickOptions = () => ({
    hasPredictedScore: !!predictedScore?.unlocked,
    globalSolvedIds: globalSolvedIdsRef.current,
  });

  const getPickOptionsForMode = () => (
    practiceModeRef.current === 'general'
      ? getGeneralPickOptions()
      : { hasPredictedScore: !!predictedScore?.unlocked, globalSolvedIds: globalSolvedIdsRef.current }
  );

  const clearPrefetch = () => {
    prefetchedNextRef.current = null;
  };

  const computeNextQuestion = (sessionSnapshot) => {
    const nextRaw = pickFromPool(
      questionPoolRef.current,
      sessionSnapshot,
      practiceModeRef.current,
      getPickOptionsForMode()
    );
    return nextRaw ? shuffleOptions(nextRaw) : null;
  };

  const prefetchNextQuestion = (sessionSnapshot) => {
    clearPrefetch();
    const answerCount = sessionSnapshot.length;
    const run = () => {
      if (!questionPoolRef.current.length) return;
      if (pendingAutoNextSessionRef.current?.length !== answerCount) return;
      const nextQ = computeNextQuestion(sessionSnapshot);
      if (nextQ && pendingAutoNextSessionRef.current?.length === answerCount) {
        prefetchedNextRef.current = { question: nextQ, answerCount };
      }
    };
    if (typeof requestIdleCallback !== 'undefined') {
      requestIdleCallback(run, { timeout: 300 });
    } else {
      setTimeout(run, 0);
    }
  };

  const syncGlobalSolvedIds = (prediction) => {
    globalSolvedIdsRef.current = new Set(prediction?.solvedQuestionIds || []);
  };

  useEffect(() => {
    if (predictedScore?.solvedQuestionIds) {
      syncGlobalSolvedIds(predictedScore);
    }
  }, [predictedScore]);

  // Очистка таймера при размонтировании
  useEffect(() => {
    return () => {
      if (goalHideTimerRef.current) clearTimeout(goalHideTimerRef.current);
      if (explanationCloseTimerRef.current) clearTimeout(explanationCloseTimerRef.current);
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
      correctAnswer: normalized.correctAnswer.map((oldIdx) => indices.indexOf(oldIdx)),
    };
  };

  const persistPracticeAnswerRemote = async (question, answerPayload, practiceSnapshot) => {
    if (!question?.id || !question?.topicId || !practiceSnapshot?.subjectId) return null;

    const task = (async () => {
      try {
        const response = await apiFetch(`${API_URL}/practice/answer`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            studentId,
            topicId: question.topicId,
            subjectId: practiceSnapshot.subjectId,
            questionId: question.id,
            isCorrect: !!answerPayload.isCorrect,
            difficulty: question.difficulty || 'medium',
            selectedAnswer: answerPayload.selectedAnswer,
            practiceMode: practiceModeRef.current || 'general',
          }),
        });

        if (!response.ok) return null;

        globalSolvedIdsRef.current.add(question.id);

        const data = await response.json();
        if (data.goal) patchDailyGoal(data.goal);
        if (data.streak) {
          setStreak(data.streak);
          setStreakLoaded(true);
        }
        setSessionSolved((s) => Math.max(0, s - 1));
        if (answerPayload.isCorrect && practiceSnapshot?.subjectId) {
          loadPredictedScore(practiceSnapshot.subjectId);
        }
        if (practiceSnapshot?.subjectId) {
          loadSubjectDashboard(practiceSnapshot.subjectId);
        }
        return data;
      } catch (error) {
        console.error('Error saving practice answer:', error);
        return null;
      }
    })();

    pendingSavesRef.current.push(task);
    task.finally(() => {
      pendingSavesRef.current = pendingSavesRef.current.filter((p) => p !== task);
    });
    return task;
  };

  const flushPendingGoalSaves = async () => {
    const queued = [...orbFlushQueueRef.current];
    orbFlushQueueRef.current = [];
    for (const item of queued) {
      await persistPracticeAnswerRemote(item.question, item.answerPayload, item.practiceSnapshot);
    }
    await Promise.all([...pendingSavesRef.current]);
  };

  const loadAllSubjectQuestions = async (topics) => {
    const all = [];
    for (const topic of topics) {
      const qs = await getQuestions(topic);
      for (const q of qs) {
        all.push({ ...q, topicId: q.topicId || topic.id });
      }
    }
    return all;
  };

  const startPracticeFromQuestions = (topic, activeQuestions, label, goalData, mode = 'topic', pickOptions = {}) => {
    const pool = activeQuestions.map(shuffleOptions).filter(Boolean);
    if (pool.length === 0) {
      alert('Нет доступных вопросов');
      return;
    }

    practiceModeRef.current = mode;
    questionPoolRef.current = pool;
    clearPrefetch();
    const pickOpts = mode === 'general'
      ? { ...getGeneralPickOptions(), ...pickOptions }
      : { ...pickOptions, hasPredictedScore: !!predictedScore?.unlocked, globalSolvedIds: globalSolvedIdsRef.current };
    setSessionSolved(0);
    setGoalPeek(false);
    setGoalPulse(false);
    setOrbs([]);
    orbFlushQueueRef.current = [];

    const firstRaw = pickFromPool(pool, [], mode, pickOpts);
    const first = shuffleOptions(firstRaw) || pool[0];

    setActivePractice({ ...topic, name: label || topic.name });
    setQuestions([first]);
    questionsRef.current = [first];
    setRemainingQuestions([]);
    setSessionAnswers([]);
    setCurrentQuestionIndex(0);
    setSelectedAnswer([]);
    setUserAnswers([]);
    setAnswered(false);
    setShowExplanationHint(false);
  };

  const startGeneralPractice = async () => {
    if (!selectedSubject) return;
    setPracticeLoading(true);
    try {
      const goalData = await loadDailyGoal();
      const prediction = await loadPredictedScore(selectedSubject.id);
      syncGlobalSolvedIds(prediction);
      const topics = practiceTopics.filter(t => t.subjectId === selectedSubject.id);
      const allQuestions = await loadAllSubjectQuestions(topics);
      if (allQuestions.length === 0) {
        alert('Нет доступных заданий');
        return;
      }
      startPracticeFromQuestions(
        { id: `general-${selectedSubject.id}`, name: 'Практика', subjectId: selectedSubject.id },
        allQuestions,
        'Практика',
        goalData,
        'general'
      );
    } catch (error) {
      console.error('Error starting general practice:', error);
      alert('Не удалось загрузить задания');
    } finally {
      setPracticeLoading(false);
    }
  };

  const startPractice = async (topic) => {
    try {
      setShowTopicPicker(false);
      const goalData = await loadDailyGoal();
      const subjectId = topic.subjectId || selectedSubject?.id;
      const prediction = subjectId ? await loadPredictedScore(subjectId) : null;
      syncGlobalSolvedIds(prediction);
      const activeQuestions = await getQuestions(topic);
      const withTopic = activeQuestions.map(q => ({ ...q, topicId: q.topicId || topic.id }));
      startPracticeFromQuestions(topic, withTopic, topic.name, goalData, 'topic');
    } catch (error) {
      console.error('Error loading questions:', error);
      alert('Ошибка загрузки вопросов');
    }
  };

  const startWeakTopicsPractice = async () => {
    if (!selectedSubject) return;
    setPracticeLoading(true);
    try {
      const goalData = await loadDailyGoal();
      const prediction = await loadPredictedScore(selectedSubject.id);
      syncGlobalSolvedIds(prediction);
      const data = await loadWeakTopicsQuestions(selectedSubject.id);
      const questionsList = (data?.questions || []).map(q => shuffleOptions(q)).filter(Boolean);
      if (questionsList.length === 0) {
        alert(data?.message || 'Нет заданий для тренировки');
        return;
      }
      startPracticeFromQuestions(
        { id: `weak-${selectedSubject.id}`, name: 'Слабые темы', subjectId: selectedSubject.id },
        questionsList,
        'Слабые темы',
        goalData,
        'weak'
      );
    } catch (error) {
      console.error('Error starting weak topics:', error);
      alert('Не удалось загрузить задания');
    } finally {
      setPracticeLoading(false);
    }
  };

  const returnToStatsRef = useRef(false);

  const practiceIntentRef = useRef(null);
  useEffect(() => {
    if (!practiceIntent || !subjects.length) return;
    if (practiceIntentRef.current === practiceIntent) return;
    practiceIntentRef.current = practiceIntent;
    returnToStatsRef.current = !!practiceIntent.returnToStats;

    const subject = subjects.find((s) => Number(s.id) === Number(practiceIntent.subjectId));
    if (!subject) {
      clearPracticeIntent();
      practiceIntentRef.current = null;
      return;
    }

    const run = async () => {
      setSelectedSubject(subject);

      try {
        if (practiceIntent.mode === 'weak') {
          setPracticeLoading(true);
          const goalData = await loadDailyGoal();
          const data = await loadWeakTopicsQuestions(subject.id);
          const questionsList = (data?.questions || []).map((q) => shuffleOptions(q)).filter(Boolean);
          if (questionsList.length === 0) {
            alert(data?.message || 'Нет заданий для тренировки');
          } else {
            onActivate?.();
            startPracticeFromQuestions(
              { id: `weak-${subject.id}`, name: 'Слабые темы', subjectId: subject.id },
              questionsList,
              'Слабые темы',
              goalData,
              'weak'
            );
          }
          setPracticeLoading(false);
        } else if (practiceIntent.mode === 'topic' && practiceIntent.topicId) {
          const topic = practiceTopics.find((t) => t.id === practiceIntent.topicId);
          if (topic) {
            onActivate?.();
            await startPractice(topic);
          }
        } else {
          setPracticeLoading(true);
          const goalData = await loadDailyGoal();
          const topics = practiceTopics.filter((t) => t.subjectId === subject.id);
          const allQuestions = await loadAllSubjectQuestions(topics);
          if (allQuestions.length === 0) {
            alert('Нет доступных заданий');
          } else {
            onActivate?.();
            startPracticeFromQuestions(
              { id: `general-${subject.id}`, name: 'Практика', subjectId: subject.id },
              allQuestions,
              'Практика',
              goalData,
              'general'
            );
          }
          setPracticeLoading(false);
        }
      } catch (e) {
        console.error('Practice intent error:', e);
        setPracticeLoading(false);
      } finally {
        clearPracticeIntent();
        practiceIntentRef.current = null;
      }
    };

    run();
  }, [practiceIntent, subjects, practiceTopics]); // eslint-disable-line

  // Запуск светящейся сферы от кнопки ответа к кольцу дневной цели
  const launchOrbToGoal = (answerIndex, question, answerPayload, practiceSnapshot) => {
    const orbItem = { question, answerPayload, practiceSnapshot };
    orbFlushQueueRef.current.push(orbItem);

    const btn = document.querySelectorAll('.answer-option')[answerIndex];
    if (!btn) {
      orbFlushQueueRef.current = orbFlushQueueRef.current.filter((x) => x !== orbItem);
      persistPracticeAnswerRemote(question, answerPayload, practiceSnapshot);
      return;
    }
    const br = btn.getBoundingClientRect();
    const x0 = br.left + br.width / 2;
    const y0 = br.top + br.height / 2;

    if (goalHideTimerRef.current) clearTimeout(goalHideTimerRef.current);
    setGoalPeek(true);

    setTimeout(() => {
      const ring = goalRingRef.current;
      const rr = ring ? ring.getBoundingClientRect() : { left: 24, top: 90, width: 48, height: 48 };
      const x1 = rr.left + rr.width / 2;
      const y1 = rr.top + rr.height / 2;

      const id = ++orbIdRef.current;
      setOrbs(prev => [...prev, { id, x0, y0, x1, y1 }]);

      setTimeout(() => {
        orbFlushQueueRef.current = orbFlushQueueRef.current.filter((x) => x !== orbItem);
        setSessionSolved((s) => s + 1);
        setGoalPulse(true);
        haptic('light');
        setTimeout(() => setGoalPulse(false), 450);
        setOrbs(prev => prev.filter(o => o.id !== id));
        persistPracticeAnswerRemote(question, answerPayload, practiceSnapshot);
        goalHideTimerRef.current = setTimeout(() => setGoalPeek(false), 1200);
      }, 650);
    }, 300);
  };

  // Micro-celebration: выпускаем частицы из центра нажатой кнопки
  const launchBurst = (answerIndex) => {
    const btn = document.querySelectorAll('.answer-option')[answerIndex];
    if (!btn) return;
    const br = btn.getBoundingClientRect();
    const cx = br.left + br.width / 2;
    const cy = br.top + br.height / 2;
    const id = ++burstIdRef.current;
    // 7 частиц, разлетающихся по кругу
    const particles = Array.from({ length: 7 }).map((_, i) => {
      const angle = (Math.PI * 2 * i) / 7 + (Math.random() - 0.5) * 0.5;
      const dist = 38 + Math.random() * 26;
      return {
        i,
        dx: Math.cos(angle) * dist,
        dy: Math.sin(angle) * dist - 10, // лёгкий подъём вверх
        c: i % 6,
      };
    });
    setBursts((prev) => [...prev, { id, cx, cy, particles }]);
    setTimeout(() => {
      setBursts((prev) => prev.filter((b) => b.id !== id));
    }, 700);
  };

  const blurActiveElement = () => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  };

  // Закрытие модалки объяснения: запускаем анимацию сворачивания, затем размонтируем.
  const closeExplanation = () => {
    if (explanationCloseTimerRef.current) return; // уже закрывается
    setExplanationClosing(true);
    explanationCloseTimerRef.current = setTimeout(() => {
      setShowExplanationHint(false);
      setExplanationClosing(false);
      explanationCloseTimerRef.current = null;
    }, 240); // должно совпадать с длительностью explanationModalOut
  };

  // answerIndexes — массив выбранных вариантов (multiple choice, подтверждено кнопкой).
  const submitAnswer = async (answerIndexes) => {
    if (answered) return; // Предотвращаем повторный клик
    if (!answerIndexes || answerIndexes.length === 0) return;

    const currentQuestion = questions[currentQuestionIndex];
    const correct = sameAnswerSet(answerIndexes, currentQuestion.correctAnswer);
    // Анимации (орб/всплеск) привязаны к одной кнопке — берём первую выбранную.
    const anchorIndex = answerIndexes[0];

    setSelectedAnswer(answerIndexes);
    setAnswered(true);
    setIsCorrect(correct);
    setAnimateDismiss(true);
    // Объяснение открывается по кнопке (модалка поверх экрана), не само — чтобы не мешать.
    blurActiveElement();

    const practiceSnapshot = activePractice;

    const answerPayload = {
      questionId: currentQuestion.id,
      selectedAnswer: answerIndexes,
      correctAnswer: currentQuestion.correctAnswer,
      isCorrect: correct,
    };

    // Дофамин: вибрация + конфетти; шкала и сохранение — когда орб долетит
    if (correct) {
      haptic('success');
      launchBurst(anchorIndex);
      setConfetti(true);
      setTimeout(() => setConfetti(false), 1200);
      launchOrbToGoal(anchorIndex, currentQuestion, answerPayload, practiceSnapshot);
    } else {
      haptic('error');
      persistPracticeAnswerRemote(currentQuestion, answerPayload, practiceSnapshot);
    }

    const newAnswers = [...userAnswers, answerPayload];
    setUserAnswers(newAnswers);

    // Обновляем sessionAnswers для адаптивности
    const newSessionAnswers = [...sessionAnswers, {
      questionId: currentQuestion.id,
      topicId: currentQuestion.topicId,
      difficulty: currentQuestion.difficulty || 'medium',
      isCorrect: correct
    }];
    setSessionAnswers(newSessionAnswers);

    // Переход к следующему вопросу теперь только по кнопке (advanceToNextQuestion).
    // Храним актуальные ответы сессии для корректного подбора следующего вопроса.
    pendingAutoNextSessionRef.current = newSessionAnswers;
    prefetchNextQuestion(newSessionAnswers);
  };

  // Берёт следующий вопрос из пула и показывает его. Дёргается кнопкой «Следующий вопрос».
  const advanceToNextQuestion = () => {
    const sessionSnapshot = pendingAutoNextSessionRef.current || sessionAnswers;
    pendingAutoNextSessionRef.current = null;

    const cached = prefetchedNextRef.current;
    let nextQ = null;
    if (cached && cached.answerCount === sessionSnapshot.length) {
      nextQ = cached.question;
      prefetchedNextRef.current = null;
    } else {
      nextQ = computeNextQuestion(sessionSnapshot);
    }
    if (!nextQ) return;

    setSelectedAnswer([]);
    setAnswered(false);
    setIsCorrect(false);
    setAnimateDismiss(false);
    setShowExplanationHint(false);
    blurActiveElement();

    setCurrentQuestionIndex(prev => prev + 1);
    setQuestions(prev => {
      const updated = [...prev, nextQ];
      questionsRef.current = updated;
      return updated;
    });
  };

  useEffect(() => {
    if (!activePractice) return undefined;
    blurActiveElement();
    return undefined;
  }, [activePractice, currentQuestionIndex, questions[currentQuestionIndex]?.id]);

  // Фоновая предзагрузка изображения следующего вопроса (ТЗ §7): не грузим
  // все сразу, только соседний, чтобы картинка была готова к показу.
  useEffect(() => {
    if (!activePractice) return;
    const next = questions[currentQuestionIndex + 1];
    const key = next?.questionImage?.storageKey;
    if (key && typeof Image !== 'undefined') {
      const img = new Image();
      img.src = practiceImageUrl(key);
    }
  }, [activePractice, currentQuestionIndex, questions]);

  const restoreQuestionState = (index) => {
    const ans = userAnswers[index];
    if (ans) {
      setSelectedAnswer(ans.selectedAnswer);
      setAnswered(true);
      setIsCorrect(ans.isCorrect);
    } else {
      setSelectedAnswer([]);
      setAnswered(false);
      setIsCorrect(false);
    }
    setAnimateDismiss(false); // вернулись к отвеченному вопросу — без повторной анимации выезда
    setShowExplanationHint(false);
  };

  const goToPreviousQuestion = () => {
    if (currentQuestionIndex <= 0) return;
    const prevIndex = currentQuestionIndex - 1;
    setCurrentQuestionIndex(prevIndex);
    restoreQuestionState(prevIndex);
  };

  // Листание вперёд по уже показанным вопросам (история). Новый вопрос берёт advanceToNextQuestion.
  const goToNextQuestion = () => {
    if (currentQuestionIndex >= questions.length - 1) return;
    const nextIndex = currentQuestionIndex + 1;
    setCurrentQuestionIndex(nextIndex);
    restoreQuestionState(nextIndex);
  };

  const savePracticeSession = async (answers, practiceSnapshot = activePractice) => {
    if (!answers.length || !practiceSnapshot) return;

    await flushPendingGoalSaves();

    const correctCount = answers.filter(a => a.isCorrect).length;
    const totalCount = answers.length;

    if (typeof practiceSnapshot.id === 'number') {
      updatePracticeStatsOptimistic(practiceSnapshot.id, correctCount, totalCount);
    }

    const questionMap = {};
    questionsRef.current.forEach(q => { questionMap[q.id] = q; });

    const topicId = typeof practiceSnapshot.id === 'number'
      ? practiceSnapshot.id
      : (answers.map(a => questionMap[a.questionId]?.topicId).find(id => id != null) || null);

    try {
      const response = await apiFetch(`${API_URL}/practice/session-summary`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId,
          topicId,
          subjectId: practiceSnapshot.subjectId,
          correct: correctCount,
          total: totalCount,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.streak) {
          setStreak(data.streak);
          setStreakLoaded(true);
        }
      }
    } catch (e) {
      console.error('Error saving session summary:', e);
    }

    const subjectId = practiceSnapshot.subjectId || selectedSubject?.id;
    await refreshAfterPractice(subjectId, leaderboardPeriod);
  };

  const closePractice = async () => {
    await flushPendingGoalSaves();

    const answersToSave = [...userAnswers];
    const practiceSnapshot = activePractice;
    const subjectId = practiceSnapshot?.subjectId || selectedSubject?.id;

    // Сначала уведомляем родителя (переключение таба) — до сброса activePractice,
    // чтобы список практики не мелькал перед переходом в статистику.
    const wasFromStats = returnToStatsRef.current;
    returnToStatsRef.current = false;
    onClose?.({ returnToStats: wasFromStats });

    setActivePractice(null);
    setQuestions([]);
    questionsRef.current = [];
    questionPoolRef.current = [];
    setCurrentQuestionIndex(0);
    setSelectedAnswer([]);
    setUserAnswers([]);
    setAnswered(false);
    setShowExplanationHint(false);
    setRemainingQuestions([]);
    setSessionAnswers([]);
    setSessionSolved(0);
    setGoalPeek(false);
    setOrbs([]);
    pendingAutoNextSessionRef.current = null;
    clearPrefetch();

    if (!wasFromStats) {
      setActiveTab('practice');
    }

    if (answersToSave.length > 0) {
      await savePracticeSession(answersToSave, practiceSnapshot);
    } else {
      await refreshAfterPractice(subjectId, leaderboardPeriod);
    }
  };

  const backToSubjects = () => {
    returnToStatsRef.current = false;
    setSelectedSubject(null);
    setActiveTab('practice');
  };

  const resetHomeRef = useRef(() => {});
  resetHomeRef.current = async () => {
    setShowTopicPicker(false);
    setActiveTab('practice');
    if (activePractice) {
      await closePractice();
    }
    if (subjects.length > 1) {
      setSelectedSubject(null);
    }
  };

  useEffect(() => {
    if (!practiceHomeToken) return;
    resetHomeRef.current();
  }, [practiceHomeToken]);

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
  if (activePractice) {
    const currentQuestion = normalizeQuestion(questions[currentQuestionIndex]);
    const showTopicInQuestion = practiceModeRef.current === 'topic' || practiceModeRef.current === 'weak';
    const sessionTopicTitle = showTopicInQuestion && currentQuestion
      ? (practiceTopics.find(t => t.id === currentQuestion.topicId)?.name || activePractice.name)
      : null;
    const headerTitle = practiceModeRef.current === 'general'
      ? 'Практика'
      : (selectedSubject?.name || activePractice.name);
    const canGoBack = currentQuestionIndex > 0;
    const canGoForward = currentQuestionIndex < questions.length - 1;
    // На последнем (текущем) вопросе после ответа — кнопка взять новый вопрос
    const canAdvance = answered && currentQuestionIndex === questions.length - 1;
    const backLabel = returnToStatsRef.current ? '← Назад в статистику' : '← Назад к списку';

    if (!currentQuestion) {
      return renderPracticeOverlay(
        <div className="practice-mode">
          <div className="practice-header">
            <button type="button" className="back-button" onClick={closePractice}>
              {backLabel}
            </button>
            <div className="practice-info">
              <h2>{headerTitle}</h2>
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
            {backLabel}
          </button>
          <div className="practice-info">
            <h2>{headerTitle}</h2>
          </div>
          {streak && (
            <HeroMetricHint
              id="streak-session"
              openId={openMetricHint}
              onToggle={toggleMetricHint}
              hint={STREAK_HINT}
              align="end"
            >
              <div className={streakCircleClassName()}>
                <span className="streak-circle-flame">🔥</span>
                <span className="streak-circle-count">{streak.streak || 0}</span>
              </div>
            </HeroMetricHint>
          )}
        </div>

        {(() => {
          const goal = dailyGoal?.goals?.find(
            (g) => Number(g.subjectId) === Number(activePractice?.subjectId)
          );
          const baseSolved = goal?.solved || 0;
          const target = goal?.goal || dailyGoal?.dailyGoal || 15;
          const liveSolved = baseSolved + sessionSolved;
          const pct = Math.min(100, Math.round((liveSolved / target) * 100));
          const complete = liveSolved >= target;
          return (
            <div className={`goal-peek ${goalPeek ? 'show' : ''} ${goalPulse ? 'pulse' : ''}`}>
              <div
                ref={goalRingRef}
                className={`goal-peek-ring ${complete ? 'complete' : ''}`}
                style={{ '--goal-pct': `${pct}%` }}
              >
                <span className="goal-peek-value">{pct}%</span>
              </div>
              <div className="goal-peek-label">
                <span className="goal-peek-title">🎯 Цель дня</span>
                <span className="goal-peek-count">{liveSolved}/{target}</span>
              </div>
            </div>
          );
        })()}

        {orbs.map(orb => (
          <span
            key={orb.id}
            className="light-orb"
            style={{
              '--x0': `${orb.x0}px`, '--y0': `${orb.y0}px`,
              '--x1': `${orb.x1}px`, '--y1': `${orb.y1}px`,
            }}
          />
        ))}

        {confetti && (
          <div className="confetti-layer">
            {Array.from({ length: 18 }).map((_, i) => (
              <span key={i} className={`confetti-piece c${i % 6}`} style={{ left: `${(i * 5.5) + 2}%`, animationDelay: `${(i % 5) * 0.05}s` }}></span>
            ))}
          </div>
        )}

        {bursts.map((burst) => (
          <div
            key={burst.id}
            className="tap-burst"
            style={{ left: `${burst.cx}px`, top: `${burst.cy}px` }}
            aria-hidden
          >
            {burst.particles.map((p) => (
              <span
                key={p.i}
                className={`tap-burst-particle bc${p.c}`}
                style={{ '--dx': `${p.dx}px`, '--dy': `${p.dy}px` }}
              />
            ))}
          </div>
        ))}

        <div
          className={`question-container question-density--${
            (() => {
              // Объяснение теперь в модалке поверх экрана и не делит высоту с вопросом,
              // поэтому плотность считаем только по вопросу и вариантам.
              const qLen = (currentQuestion.questionText || '').length;
              const optLen = currentQuestion.options.reduce((s, o) => s + (o || '').length, 0);
              const total = qLen + optLen;
              if (total > 320 || qLen > 150) return 'xl';
              if (total > 200 || qLen > 90) return 'lg';
              if (total > 110) return 'md';
              return 'sm';
            })()
          }`}
        >
          <div className="question-meta-row">
            {sessionTopicTitle && (
              <div className="practice-session-topic">{sessionTopicTitle}</div>
            )}
            <div className="question-header">
              {currentQuestion.difficulty && (
                <span className={`difficulty-badge ${currentQuestion.difficulty}`}>
                  {currentQuestion.difficulty === 'easy' && '🟢 Легкий'}
                  {currentQuestion.difficulty === 'medium' && '🟡 Средний'}
                  {currentQuestion.difficulty === 'hard' && '🔴 Сложный'}
                </span>
              )}
              {(currentQuestion.explanation || currentQuestion.hintImage) && (
                <button
                  type="button"
                  className="hint-button"
                  onClick={() => setShowExplanationHint(true)}
                >
                  💡 {answered ? 'Объяснение' : 'Подсказка'}
                </button>
              )}
            </div>
          </div>

          <div
            className={`question-card ${!currentQuestion.questionText ? 'question-card--image-only' : ''}`}
            key={`q-${currentQuestion.id}`}
          >
            {/* Порядок: изображение → текст → варианты (ТЗ §3.1) */}
            {currentQuestion.questionImage && (
              <div
                className="question-image"
                onClick={() => setLightboxSrc(practiceImageUrl(currentQuestion.questionImage.storageKey))}
                style={
                  currentQuestion.questionImage.width && currentQuestion.questionImage.height
                    ? { aspectRatio: `${currentQuestion.questionImage.width} / ${currentQuestion.questionImage.height}` }
                    : undefined
                }
              >
                <img
                  src={practiceImageUrl(currentQuestion.questionImage.storageKey)}
                  alt="Изображение вопроса"
                  loading="eager"
                />
              </div>
            )}
            {currentQuestion.questionText && (
              <>
                <span className="question-card-mark" aria-hidden>“</span>
                <h3 className="question-text">{currentQuestion.questionText}</h3>
              </>
            )}
          </div>

          <div className="answers-list" key={currentQuestion.id}>
            {currentQuestion.options.map((option, index) => {
              const isSelected = selectedAnswer.includes(index);
              const isCorrectOption = currentQuestion.correctAnswer.includes(index);
              const showCorrect = answered && isCorrectOption;
              const showWrong = answered && isSelected && !isCorrectOption;
              const showMuted = answered && !showCorrect && !showWrong;

              const toggleOption = () => {
                if (answered) return;
                setSelectedAnswer((prev) => (
                  prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index]
                ));
              };

              return (
                <div
                  key={`${currentQuestion.id}-${index}`}
                  role="button"
                  tabIndex={-1}
                  className={`answer-option ${isSelected ? 'selected' : ''} ${showCorrect ? 'correct' : ''} ${showWrong ? 'wrong' : ''} ${showMuted ? 'muted' : ''} ${answered ? 'is-locked' : ''}`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={toggleOption}
                >
                  <span className="answer-letter">
                    {String.fromCharCode(65 + index)}
                  </span>
                  <span className="answer-text">
                    {option}
                  </span>
                  {answered && showCorrect && (
                    <span className="answer-verdict answer-verdict--correct" aria-label="Правильный ответ">
                      <span className="answer-verdict-icon">✓</span>
                      <span className="answer-verdict-label">
                        {isSelected ? 'Верно' : 'Правильный'}
                      </span>
                    </span>
                  )}
                  {answered && showWrong && (
                    <span className="answer-verdict answer-verdict--wrong" aria-label="Неверный ответ">
                      <span className="answer-verdict-icon">✕</span>
                      <span className="answer-verdict-label">Неверно</span>
                    </span>
                  )}
                  {!answered && isSelected && (
                    <span className="answer-verdict-icon answer-check-mark" aria-hidden>✓</span>
                  )}
                </div>
              );
            })}
          </div>

          {!answered && (
            <button
              type="button"
              className="answer-submit-btn"
              disabled={selectedAnswer.length === 0}
              onClick={() => submitAnswer(selectedAnswer)}
            >
              Ответить
            </button>
          )}

          {(canGoBack || canGoForward || canAdvance) && (
            <div className="question-nav-row">
              {canGoBack ? (
                <button type="button" className="question-nav-btn" onClick={goToPreviousQuestion}>
                  ← Предыдущий
                </button>
              ) : (
                <span />
              )}
              {canGoForward ? (
                <button type="button" className="question-nav-btn question-nav-btn--forward" onClick={goToNextQuestion}>
                  Следующий →
                </button>
              ) : canAdvance ? (
                <button type="button" className="question-nav-btn question-nav-btn--next" onClick={advanceToNextQuestion}>
                  Следующий вопрос →
                </button>
              ) : null}
            </div>
          )}
        </div>

        {(showExplanationHint || explanationClosing) && (currentQuestion.explanation || currentQuestion.hintImage) && (
          <div
            className={`explanation-modal-overlay ${explanationClosing ? 'is-closing' : ''}`}
            onClick={closeExplanation}
          >
            <div
              className={`explanation-modal ${answered ? 'explanation-modal--answer' : 'explanation-modal--hint'}`}
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
            >
              <div className="explanation-modal-head">
                <span className="explanation-modal-title">
                  💡 {answered ? 'Объяснение' : 'Подсказка'}
                </span>
                <button
                  type="button"
                  className="explanation-modal-close"
                  onClick={closeExplanation}
                  aria-label="Закрыть"
                >
                  ✕
                </button>
              </div>
              <div className="explanation-modal-body">
                {currentQuestion.hintImage && (
                  <div
                    className="explanation-modal-image"
                    onClick={() => setLightboxSrc(practiceImageUrl(currentQuestion.hintImage.storageKey))}
                  >
                    <img
                      src={practiceImageUrl(currentQuestion.hintImage.storageKey)}
                      alt="Изображение подсказки"
                    />
                  </div>
                )}
                {currentQuestion.explanation && (
                  <div className="explanation-modal-text">{currentQuestion.explanation}</div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Полноэкранный просмотрщик изображения (ТЗ §3.2): закрытие по фону/кнопке */}
        {lightboxSrc && typeof document !== 'undefined' && createPortal(
          <div className="image-lightbox-overlay" onClick={() => setLightboxSrc(null)}>
            <button
              type="button"
              className="image-lightbox-close"
              onClick={() => setLightboxSrc(null)}
              aria-label="Закрыть"
            >
              ✕
            </button>
            <img
              className="image-lightbox-img"
              src={lightboxSrc}
              alt="Изображение вопроса"
              onClick={(e) => e.stopPropagation()}
            />
          </div>,
          document.body
        )}
      </div>
    );
  }

  // ========== ЭКРАН ВЫБОРА ПРЕДМЕТА (если их несколько) ==========
  if (subjects.length > 1 && !selectedSubject) {
    return (
      <div className="section section-practice">
        <div className="practice-hero">
          <div className="practice-hero-glow"></div>
          <div className="practice-hero-content practice-hero-row">
            <StudentBrandMark variant="hero" />
            <div className="practice-hero-text practice-hero-text--compact">
              <h1 className="practice-hero-title practice-hero-title--plain">Практика</h1>
            </div>
            <HeroMetricHint
              id="streak-list"
              openId={openMetricHint}
              onToggle={toggleMetricHint}
              hint={STREAK_HINT}
              align="end"
            >
              <div className={streakClassName()}>
                <span className="hero-streak-flame">🔥</span>
                <span className="hero-streak-count">{streak?.streak || 0}</span>
              </div>
            </HeroMetricHint>
          </div>
          <svg className="practice-hero-wave" viewBox="0 0 400 40" preserveAspectRatio="none">
            <path d="M0,40 L0,22 Q100,2 200,18 T400,15 L400,40 Z" />
          </svg>
        </div>

        <div className="subjects-grid">
          {subjects.map(subject => {
            const cardBg = getPracticeSubjectCardBg(subject);

            return (
              <button
                key={subject.id}
                type="button"
                className="subject-card practice-subject-card"
                style={cardBg ? { backgroundImage: `url(${cardBg})` } : undefined}
                onClick={() => setSelectedSubject(subject)}
                aria-label={subject.name}
              />
            );
          })}
        </div>
      </div>
    );
  }

  const filteredTopics = selectedSubject 
    ? practiceTopics.filter(topic => topic.subjectId === selectedSubject.id)
    : practiceTopics;

  return (
    <div className="section section-practice">
      <div className="practice-hero">
        {subjects.length > 1 && selectedSubject && (
          <button className="back-button hero-back-inset" onClick={backToSubjects}>
            ← Назад к предметам
          </button>
        )}
        <div className="practice-hero-glow"></div>
        <div className="practice-hero-content practice-hero-row">
          <StudentBrandMark variant="hero" />
          <h1 className="practice-hero-title practice-hero-title--plain">
            {selectedSubject ? selectedSubject.name : 'Практика'}
          </h1>
          {subjectDailyGoal && (
            <div className="hero-goal-col">
              <span className={`hero-goal-caption ${subjectDailyGoal.completed ? 'goal-done' : ''}`}>
                {subjectDailyGoal.solved} из {subjectDailyGoal.goal}
              </span>
              <HeroMetricHint
                id="goal"
                openId={openMetricHint}
                onToggle={toggleMetricHint}
                hint={GOAL_HINT}
                align="center"
              >
                <div
                  className={`daily-goal-ring hero-daily-goal-ring ${subjectDailyGoal.completed ? 'complete' : ''}`}
                  style={{ '--goal-pct': `${subjectDailyGoal.percent}%` }}
                  aria-label={`Цель на сегодня: ${subjectDailyGoal.solved} из ${subjectDailyGoal.goal}`}
                >
                  <span className="daily-goal-ring-value">{subjectDailyGoal.percent}%</span>
                </div>
              </HeroMetricHint>
            </div>
          )}
          <HeroMetricHint
            id="streak"
            openId={openMetricHint}
            onToggle={toggleMetricHint}
            hint={STREAK_HINT}
            align="end"
          >
            <div className={streakClassName()}>
              <span className="hero-streak-flame">🔥</span>
              <span className="hero-streak-count">{streak?.streak || 0}</span>
            </div>
          </HeroMetricHint>
        </div>
          <svg className="practice-hero-wave" viewBox="0 0 400 40" preserveAspectRatio="none">
            <path d="M0,40 L0,22 Q100,2 200,18 T400,15 L400,40 Z" />
          </svg>
      </div>

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

      {selectedSubject && activeTab === 'practice' && (
        <div className="practice-panel">
          <div className="practice-mode-buttons">
            <button
              type="button"
              className="practice-mode-btn"
              onClick={startGeneralPractice}
              disabled={practiceLoading}
            >
              <span className="practice-mode-btn-icon">💪</span>
              <span className="practice-mode-btn-text">
                <span className="practice-mode-btn-title">Практиковаться</span>
                <span className="practice-mode-btn-sub">Адаптивная подборка — бесконечно</span>
              </span>
              <span className="practice-mode-btn-arrow">→</span>
            </button>
            <button
              type="button"
              className="practice-mode-btn"
              onClick={startWeakTopicsPractice}
              disabled={practiceLoading}
            >
              <span className="practice-mode-btn-icon">🎯</span>
              <span className="practice-mode-btn-text">
                <span className="practice-mode-btn-title">Слабые темы</span>
                <span className="practice-mode-btn-sub">Только темы, где были ошибки</span>
              </span>
              <span className="practice-mode-btn-arrow">→</span>
            </button>
            <button
              type="button"
              className="practice-mode-btn"
              onClick={() => setShowTopicPicker(true)}
              disabled={practiceLoading || filteredTopics.length === 0}
            >
              <span className="practice-mode-btn-icon">📚</span>
              <span className="practice-mode-btn-text">
                <span className="practice-mode-btn-title">Конкретная тема</span>
                <span className="practice-mode-btn-sub">Выбери подраздел сам</span>
              </span>
              <span className="practice-mode-btn-arrow">→</span>
            </button>
          </div>
        </div>
      )}

      {renderTopicPicker()}

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
              <div className="my-rank-label">Твоё место</div>
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
    </div>
  );
}

export default Practice;
