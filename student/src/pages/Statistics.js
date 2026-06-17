import React, { useState, useEffect, useCallback, useRef } from 'react';
import './Statistics.css';
import './Practice.css';
import { useData } from './DataContext';
import StudentBrandMark from '../components/StudentBrandMark';
import PredictedScoreCard from '../components/PredictedScoreCard';

const DIFF_LABELS = { easy: 'Лёгкие', medium: 'Средние', hard: 'Сложные' };
const DIFF_WORD = { easy: 'лёгкое', medium: 'среднее', hard: 'сложное' };
const DIFF_TARGETS = { easy: 10, medium: 10, hard: 5 };
const DIFF_WEIGHTS = { easy: 0.30, medium: 0.40, hard: 0.30 };
const STATUS_CLASS = {
  weak: 'sd-status--weak',
  review: 'sd-status--review',
  normal: 'sd-status--normal',
  good: 'sd-status--good',
  mastered: 'sd-status--mastered',
  learning: 'sd-status--learning',
};

function pluralRu(n, one, few, many) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}
const pluralTasks = (n) => pluralRu(n, 'задание', 'задания', 'заданий');
const pluralPoints = (n) => pluralRu(n, 'балл', 'балла', 'баллов');
const pluralAnswers = (n) => pluralRu(n, 'правильный ответ', 'правильных ответа', 'правильных ответов');

function calcDifficultyMastery(correct, solved, target) {
  if (solved <= 0 || target <= 0) return 0;
  const accuracy = correct / solved;
  const volume = Math.min(1, solved / target);
  return accuracy * volume;
}

function estimateCorrectAnswersToTarget(topic, targetProgress) {
  if (!topic?.difficulties?.length) return null;

  const states = topic.difficulties.map((d) => ({
    difficulty: d.difficulty,
    solved: Number(d.solved) || 0,
    correct: Number(d.correct) || 0,
    target: Number(d.target) || DIFF_TARGETS[d.difficulty] || 10,
    weight: DIFF_WEIGHTS[d.difficulty] || 0,
  })).filter((d) => d.weight > 0);

  if (!states.length) return null;

  const progressOf = () => states.reduce((sum, d) => (
    sum + calcDifficultyMastery(d.correct, d.solved, d.target) * d.weight * 100
  ), 0);

  let progress = progressOf();
  if (progress >= targetProgress) return 0;

  let answers = 0;
  const maxAnswers = 80;
  while (progress < targetProgress && answers < maxAnswers) {
    let best = null;
    let bestGain = 0;

    states.forEach((d) => {
      const before = calcDifficultyMastery(d.correct, d.solved, d.target) * d.weight * 100;
      const after = calcDifficultyMastery(d.correct + 1, d.solved + 1, d.target) * d.weight * 100;
      const gain = after - before;
      if (gain > bestGain) {
        bestGain = gain;
        best = d;
      }
    });

    if (!best || bestGain <= 0) break;
    best.correct += 1;
    best.solved += 1;
    answers += 1;
    progress = progressOf();
  }

  return answers || null;
}

function formatRelativeDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const diff = Math.floor((now - d) / 86400000);
  if (diff === 0) return 'сегодня';
  if (diff === 1) return 'вчера';
  if (diff < 7) return `${diff} дн. назад`;
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

function buildPredictedFromDashboard(dashboard) {
  if (!dashboard?.prediction) return null;
  return {
    ...dashboard.prediction,
    delta: dashboard.scoreDynamics?.weekDelta ?? dashboard.prediction.delta,
    accuracy: dashboard.activity?.accuracy ?? dashboard.prediction.accuracy,
    topics: (dashboard.topics || []).map((t) => ({
      solved: t.solved,
      progress: t.accuracy,
    })),
  };
}

function StatPill({ icon, label, value, sub }) {
  return (
    <div className="sd-pill">
      <span className="sd-pill-icon">{icon}</span>
      <div className="sd-pill-body">
        <span className="sd-pill-value">{value}</span>
        <span className="sd-pill-label">{label}</span>
        {sub && <span className="sd-pill-sub">{sub}</span>}
      </div>
    </div>
  );
}

function CollapsibleSection({ id, title, icon, open, onToggle, children, badge }) {
  return (
    <section className={`sd-section ${open ? 'open' : ''}`}>
      <button type="button" className="sd-section-head" onClick={() => onToggle(id)}>
        <span className="sd-section-title">
          <span className="sd-section-icon">{icon}</span>
          {title}
        </span>
        {badge != null && <span className="sd-section-badge">{badge}</span>}
        <span className="sd-section-chevron" aria-hidden>›</span>
      </button>
      {open && <div className="sd-section-body">{children}</div>}
    </section>
  );
}

function countHomeworkSubjects(homeworkStats) {
  const names = new Set();
  homeworkStats?.homeworks?.forEach((hw) => {
    names.add(hw.subject?.name || 'Без предмета');
  });
  return names.size;
}

function HomeworkStatsPanel({ homeworkStats, compact = false, subjectId = null }) {
  const homeworkBySubject = {};
  const allHomeworks = (homeworkStats?.homeworks || []).filter((hw) =>
    subjectId == null || Number(hw.subjectId ?? hw.subject?.id) === Number(subjectId)
  );

  allHomeworks.forEach((hw) => {
    const subjectName = hw.subject?.name || 'Без предмета';
    const subjectIcon = hw.subject?.icon || '📖';
    if (!homeworkBySubject[subjectName]) {
      homeworkBySubject[subjectName] = {
        icon: subjectIcon,
        total: 0,
        completed: 0,
        totalScore: 0,
        maxScore: 0,
        correctAnswers: 0,
        totalQuestions: 0,
      };
    }
    homeworkBySubject[subjectName].total += 1;
    const questionsInHw = (hw.questions || []).length;
    homeworkBySubject[subjectName].totalQuestions += questionsInHw;

    if (hw.bestSubmission) {
      homeworkBySubject[subjectName].completed += 1;
      homeworkBySubject[subjectName].totalScore += hw.bestSubmission.totalScore || 0;
      homeworkBySubject[subjectName].maxScore += hw.bestSubmission.maxScore || 0;
      const correct = hw.bestSubmission.correctAnswers !== undefined
        ? hw.bestSubmission.correctAnswers
        : (hw.bestSubmission.maxScore > 0
          ? Math.round((hw.bestSubmission.totalScore / hw.bestSubmission.maxScore) * questionsInHw)
          : 0);
      homeworkBySubject[subjectName].correctAnswers += correct;
    }
  });

  const entries = Object.entries(homeworkBySubject);

  if (entries.length === 0) {
    return (
      <div className="sd-empty">
        <span className="sd-empty-icon">📝</span>
        <p>У тебя пока нет домашних заданий</p>
      </div>
    );
  }

  return (
    <div className={`sd-dashboard sd-homework-panel ${compact ? 'sd-homework-panel--compact' : ''}`}>
      {/* Общая сводка по предмету */}
      {entries.map(([subjectName, data]) => {
        const answerPercent = data.totalQuestions > 0
          ? Math.round((data.correctAnswers / data.totalQuestions) * 100)
          : 0;
        return (
          <div key={subjectName} className="sd-hw-card">
            <div className="sd-hw-head">
              <span className="sd-hw-icon">{data.icon}</span>
              <span className="sd-hw-name">{subjectName}</span>
            </div>
            <div className="sd-hw-stats">
              <div className="sd-hw-stat">
                <span className="sd-hw-stat-val">{data.completed}/{data.total}</span>
                <span className="sd-hw-stat-label">сдано</span>
              </div>
              <div className="sd-hw-stat">
                <span className="sd-hw-stat-val">{data.correctAnswers}/{data.totalQuestions}</span>
                <span className="sd-hw-stat-label">ответов</span>
              </div>
              <div className="sd-hw-stat">
                <span className={`sd-hw-stat-val ${answerPercent >= 70 ? 'sd-hw-good' : answerPercent >= 50 ? 'sd-hw-medium' : 'sd-hw-low'}`}>
                  {answerPercent}%
                </span>
                <span className="sd-hw-stat-label">верно</span>
              </div>
            </div>
            <div className="sd-hw-bar">
              <div className="sd-hw-bar-fill" style={{ width: `${answerPercent}%` }} />
            </div>
          </div>
        );
      })}

    </div>
  );
}

// Заблокированный для гостя блок домашки в статистике (ТЗ §10):
// контент заблюрен, поверх — замок, клик открывает модалку заявки.
function GuestLockedBlock({ onLockedClick, children }) {
  return (
    <div className="sd-guest-locked" onClick={onLockedClick}>
      <div className="sd-guest-locked-content">{children}</div>
      <div className="sd-guest-locked-overlay">
        <span className="sd-guest-locked-icon">🔒</span>
        <span className="sd-guest-locked-text">Доступно только ученикам</span>
      </div>
    </div>
  );
}

function Statistics({ studentId, isGuest = false, onLockedClick }) {
  const {
    subjects,
    subjectDashboard,
    loadSubjectDashboard,
    loadHomeworkStats,
    homeworkStats,
    requestPractice,
    dashboardRefreshKey,
  } = useData();

  const [mainTab, setMainTab] = useState('practice');
  const [selectedSubjectId, setSelectedSubjectId] = useState(null);
  const [dashboard, setDashboard] = useState(null);
  const [dashboardMap, setDashboardMap] = useState({}); // subjectId → dashboard (для суммы баллов)
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [openSections, setOpenSections] = useState({ topics: false, difficulty: false, errors: false });
  const [scoreBreakdownOpen, setScoreBreakdownOpen] = useState(false);
  const lastRefreshKeyRef = useRef(null);

  const subjectIdMatch = (a, b) => Number(a) === Number(b);
  const homeworkSubjectCount = countHomeworkSubjects(homeworkStats);

  useEffect(() => {
    loadHomeworkStats(false); // не форсировать, только если не загружено
  }, [loadHomeworkStats]);

  useEffect(() => {
    if (subjects.length && !selectedSubjectId) {
      setSelectedSubjectId(subjects[0].id);
    }
  }, [subjects, selectedSubjectId]);

  const loadDashboard = useCallback(async (subjectId, silent = false) => {
    if (!subjectId) return;
    if (!silent) setLoading(true);
    setLoadError(false);
    const data = await loadSubjectDashboard(subjectId);
    if (data) {
      setDashboard(data);
      setDashboardMap(prev => ({ ...prev, [Number(subjectId)]: data }));
    } else {
      setLoadError(true);
    }
    if (!silent) setLoading(false);
  }, [loadSubjectDashboard]);

  // Загружаем дашборд при смене предмета или при реальном обновлении данных (после практики/домашки)
  useEffect(() => {
    if (!selectedSubjectId) return;
    const cached = dashboardMap[Number(selectedSubjectId)];
    const isRealRefresh = dashboardRefreshKey !== lastRefreshKeyRef.current && lastRefreshKeyRef.current !== null;
    const wrongSubject = !dashboard || !subjectIdMatch(dashboard?.subject?.id, selectedSubjectId);

    // Мгновенный переход: если данные предмета уже в кэше — показываем сразу, без спиннера
    if (cached && wrongSubject) {
      setDashboard(cached);
      setLoading(false);
      setLoadError(false);
    }

    if (!cached || isRealRefresh) {
      // Нет кэша или реальное обновление данных — тихо подгружаем
      lastRefreshKeyRef.current = dashboardRefreshKey;
      loadDashboard(selectedSubjectId, !!cached);
    } else {
      lastRefreshKeyRef.current = dashboardRefreshKey;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSubjectId, dashboardRefreshKey, dashboardMap]);

  // Обновляем из кэша контекста если пришли свежие данные
  useEffect(() => {
    if (subjectDashboard?.subject?.id != null
      && selectedSubjectId != null
      && subjectIdMatch(subjectDashboard.subject.id, selectedSubjectId)) {
      setDashboard(subjectDashboard);
      setDashboardMap(prev => ({ ...prev, [Number(selectedSubjectId)]: subjectDashboard }));
      setLoading(false);
      setLoadError(false);
    }
  }, [subjectDashboard, selectedSubjectId]);

  // Подгружаем остальные предметы фоново для суммарного балла
  useEffect(() => {
    subjects.forEach(s => {
      if (!dashboardMap[Number(s.id)]) {
        loadSubjectDashboard(s.id).then(data => {
          if (data) setDashboardMap(prev => ({ ...prev, [Number(s.id)]: data }));
        });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjects]);

  const toggleSection = (id) => {
    setOpenSections((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleAction = (actionType, topicId) => {
    if (!selectedSubjectId) return;
    requestPractice({
      subjectId: selectedSubjectId,
      mode: actionType === 'topic' ? 'topic' : actionType === 'weak' ? 'weak' : 'general',
      topicId: topicId || undefined,
    });
  };

  const subject = subjects.find((s) => subjectIdMatch(s.id, selectedSubjectId));
  const showStatsTabs = homeworkSubjectCount > 1;
  const showInlineHomework = !showStatsTabs && homeworkSubjectCount === 1;
  const activePracticeView = showStatsTabs ? mainTab === 'practice' : true;

  // Балл и прогноз для текущего предмета
  const pred = dashboard?.prediction;
  const ringUnlocked = pred?.unlocked === true;
  const ringScore = ringUnlocked ? (pred.score ?? 0) : 0;
  const ringPct = ringUnlocked ? `${ringScore}%` : '0%';
  const neededForUnlock = pred && !ringUnlocked ? (pred.needed ?? 50) : 0;
  const todayDelta = dashboard?.scoreDynamics?.todayDelta ?? null;

  // ─── Блок наставника: фиксированная структура, адаптивный контент ───
  const coach = (() => {
    if (!pred) return null;

    const topics = dashboard?.topics || [];

    // ── Прогноз закрыт ──
    if (!ringUnlocked) {
      const needed = neededForUnlock;
      const solved = pred.solved ?? 0;
      const startTopic = [...topics].sort((a, b) => (a.uniqueSolved ?? 0) - (b.uniqueSolved ?? 0))[0] || null;

      const headlines = [
        'Хочешь узнать свой балл ЦТ?',
        'Открой прогноз — начни решать',
        needed <= 10 ? 'Ещё чуть-чуть — и прогноз готов!' : 'Ты уже на пути к прогнозу',
      ];
      const headline = solved === 0 ? headlines[0] : needed <= 10 ? headlines[2] : headlines[1];

      return {
        locked: true,
        headline,
        scoreLabel: `Решено заданий: ${solved} из ${needed + solved}`,
        topicName: startTopic?.name || null,
        topicId: startTopic?.id || null,
        taskCount: needed,
        taskDesc: needed <= 10
          ? `Дорешай ещё ${needed} ${pluralTasks(needed)} — и прогноз появится`
          : `Реши ${needed} ${pluralTasks(needed)}, чтобы открыть прогноз`,
        mode: 'general',
        cta: solved === 0 ? 'Начать практику →' : 'Продолжить →',
      };
    }

    // ── Прогноз открыт ──
    const score = pred.score ?? 0;
    const predTopics = pred.topics || [];
    const dashboardTopicById = Object.fromEntries(
      (topics || []).map((t) => [String(t.id), t])
    );

    // Лучший рычаг: тема с наибольшим потенциальным приростом балла
    const levers = predTopics
      .filter((t) => t.solved > 0 && t.progress < 90)
      .map((t) => {
        const targetProgress = t.progress < 70 ? 70 : t.progress < 80 ? 80 : 90;
        const estimatedAnswers = estimateCorrectAnswersToTarget(t, targetProgress);
        const fallbackAnswers = Math.max(3, Math.ceil((targetProgress - t.progress) / 4));
        const topicStat = dashboardTopicById[String(t.topicId)];
        const unsolvedUnique = topicStat?.totalQuestions > 0
          ? Math.max(0, topicStat.totalQuestions - (topicStat.uniqueSolved || 0))
          : null;
        const tasks = Math.max(1, Math.min(
          estimatedAnswers || fallbackAnswers,
          unsolvedUnique != null && unsolvedUnique > 0 ? unsolvedUnique : 30
        ));
        const gain = Math.max(1, Math.round(((targetProgress - t.progress) * t.normalizedWeight) / 100));
        return {
          ...t,
          gain,
          tasks,
          targetProgress,
          uniqueSolved: topicStat?.uniqueSolved ?? t.solved,
          totalQuestions: topicStat?.totalQuestions ?? null,
        };
      })
      .filter((t) => t.tasks > 0)
      .sort((a, b) => b.gain - a.gain || a.tasks - b.tasks);

    const best = levers[0] || null;

    const headlines = score >= 90
      ? 'Топовый результат — держи планку!'
      : score >= 75
        ? 'Хочешь 90+ на ЦТ? Тогда решай'
        : score >= 50
          ? 'Хочешь выше на ЦТ? Тогда решай'
          : 'Хочешь 100 на ЦТ? Тогда решай';

    const taskDesc = best
      ? `Сделай ещё ${best.tasks} ${pluralAnswers(best.tasks)} в этой теме, чтобы поднять баллы`
      : 'Реши задания в слабых темах, чтобы поднять баллы';

    return {
      locked: false,
      headline: headlines,
      scoreLabel: `Сейчас у тебя ${score} ${pluralPoints(score)}.`,
      topicName: best?.name || null,
      topicId: best?.topicId || null,
      taskCount: best?.tasks || null,
      taskDesc,
      gain: best?.gain || null,
      mode: best ? 'topic' : 'weak',
      cta: 'Решать задания →',
    };
  })();

  return (
    <div className={`section section-stats sd-page ${!showStatsTabs ? 'sd-page--unified' : ''}`}>
      <div className="section-hero sd-hero">
        <div className="section-hero-glow" />
        <div className="section-hero-content practice-hero-row">
          <StudentBrandMark variant="hero" />
          <h1 className="practice-hero-title practice-hero-title--plain">Статистика</h1>
          <div className="sd-hero-score-wrap">
            {subject && <span className="sd-hero-score-subject">{subject.name}</span>}
            <div className="sd-hero-score-panel">
              <div className="sd-hero-score-ring-cluster">
                {ringUnlocked && (
                  <div className={`sd-hero-side-col${scoreBreakdownOpen ? ' sd-hero-side-col--open' : ''}`}>
                    {todayDelta != null && todayDelta !== 0 && (
                      <div className={`sd-today-delta ${todayDelta > 0 ? 'sd-today-delta--up' : 'sd-today-delta--down'}`}>
                        <span className="sd-today-delta-arrow">{todayDelta > 0 ? '▲' : '▼'}</span>
                        <span className="sd-today-delta-val">{todayDelta > 0 ? '+' : ''}{todayDelta}</span>
                        <span className="sd-today-delta-label">сегодня</span>
                      </div>
                    )}
                    <div
                      className={`sd-hero-score-split${scoreBreakdownOpen ? ' sd-hero-score-split--open' : ''}`}
                      aria-hidden={!scoreBreakdownOpen}
                    >
                      <div className="sd-hero-score-split-inner">
                        <span>Практика {pred.practiceScore ?? 0}/80</span>
                        <span>
                          {pred.homeworkAvailable
                            ? `Домашка ${pred.homeworkScore ?? 0}/20`
                            : 'Домашка —'}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
                <button
                  type="button"
                  className={`sd-hero-score-ring ${ringUnlocked ? 'unlocked' : 'locked'}${scoreBreakdownOpen ? ' sd-hero-score-ring--open' : ''}`}
                  style={{ '--score-pct': ringPct }}
                  onClick={() => ringUnlocked && setScoreBreakdownOpen((v) => !v)}
                  aria-expanded={scoreBreakdownOpen}
                  aria-label={scoreBreakdownOpen ? 'Скрыть разбивку балла' : 'Показать разбивку балла'}
                  disabled={!ringUnlocked}
                >
                  {ringUnlocked ? (
                    <>
                      <span className="sd-hero-score-val">{ringScore}</span>
                      <span className="sd-hero-score-max">/100</span>
                    </>
                  ) : (
                    <span className="sd-hero-score-val sd-hero-score-val--lock">?</span>
                  )}
                </button>
              </div>
            </div>
            <span className="sd-hero-score-label">баллов ЦТ</span>
          </div>
        </div>
        <svg className="section-hero-wave" viewBox="0 0 400 40" preserveAspectRatio="none">
          <path d="M0,40 L0,22 Q100,2 200,18 T400,15 L400,40 Z" />
        </svg>
      </div>

      {showStatsTabs && (
        <div className="practice-tabs sd-main-tabs">
          <button
            type="button"
            className={`practice-tab ${mainTab === 'practice' ? 'active' : ''}`}
            onClick={() => setMainTab('practice')}
          >
            <span className="practice-tab-icon">💪</span>
            <span className="practice-tab-label">Практика</span>
          </button>
          <button
            type="button"
            className={`practice-tab ${mainTab === 'homework' ? 'active' : ''} ${isGuest ? 'practice-tab--locked' : ''}`}
            onClick={() => (isGuest ? onLockedClick?.() : setMainTab('homework'))}
          >
            <span className="practice-tab-icon">📝{isGuest ? ' 🔒' : ''}</span>
            <span className="practice-tab-label">Домашка</span>
          </button>
        </div>
      )}

      {/* Табы предметов видны и в практике, и в домашке — чтобы домашка менялась при смене предмета */}
      {subjects.length > 1 && (
        <div className="sd-subject-tabs-wrap">
          <div className="sd-subject-tabs" role="tablist">
            {subjects.map((s) => (
              <button
                key={s.id}
                type="button"
                role="tab"
                aria-selected={subjectIdMatch(s.id, selectedSubjectId)}
                className={`sd-subject-tab ${subjectIdMatch(s.id, selectedSubjectId) ? 'active' : ''}`}
                onClick={() => setSelectedSubjectId(s.id)}
              >
                <span className="sd-subject-tab-icon">{s.icon}</span>
                <span className="sd-subject-tab-name">{s.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {showStatsTabs && mainTab === 'homework' && !isGuest && (
        <HomeworkStatsPanel homeworkStats={homeworkStats} subjectId={selectedSubjectId} />
      )}

      {activePracticeView && subjects.length === 1 && subject && (
        <div className="sd-subject-single">
          <span>{subject.icon}</span> {subject.name}
        </div>
      )}

      {activePracticeView && coach && (
        <div className={`sd-coach${coach.locked ? ' sd-coach--locked' : ''}`}>
          <p className="sd-coach-headline">{coach.headline}</p>
          <p className="sd-coach-score">{coach.scoreLabel}</p>
          {coach.topicName && (
            <div className="sd-coach-topic">
              <span className="sd-coach-topic-label">Начни с темы</span>
              <span className="sd-coach-topic-name">«{coach.topicName}»</span>
            </div>
          )}
          <p className="sd-coach-task">{coach.taskDesc}</p>
          <button
            type="button"
            className="sd-coach-cta"
            onClick={() => handleAction(coach.mode || 'general', coach.topicId)}
          >
            {coach.cta}
          </button>
        </div>
      )}

      {activePracticeView && loading && !dashboard ? (
        <div className="sd-loading">
          <div className="sd-loading-pulse" />
          <p>Собираем твой прогресс…</p>
        </div>
      ) : activePracticeView && loadError && !dashboard ? (
        <div className="sd-empty">
          <span className="sd-empty-icon">⚠️</span>
          <p>Не удалось загрузить статистику. Проверь, что сервер обновлён.</p>
          <button type="button" className="sd-cta" onClick={() => loadDashboard(selectedSubjectId)}>
            Повторить
          </button>
        </div>
      ) : activePracticeView && !dashboard ? (
        <div className="sd-empty">
          <span className="sd-empty-icon">📊</span>
          <p>Реши первые задания в практике — здесь появится твой прогресс</p>
          <button type="button" className="sd-cta" onClick={() => handleAction('general')}>
            Начать практику
          </button>
        </div>
      ) : activePracticeView && dashboard ? (
        <div className="sd-dashboard">
          {/* Гость: блок домашки всегда виден, но заблокирован (ТЗ §9, §10) */}
          {isGuest && (
            <>
              <div className="sd-section-divider"><span>Домашка</span></div>
              <GuestLockedBlock onLockedClick={onLockedClick}>
                <HomeworkStatsPanel homeworkStats={homeworkStats} subjectId={selectedSubjectId} compact />
              </GuestLockedBlock>
              <div className="sd-section-divider"><span>Практика</span></div>
            </>
          )}
          {!isGuest && showInlineHomework && (
            <>
              <div className="sd-section-divider"><span>Домашка</span></div>
              <HomeworkStatsPanel homeworkStats={homeworkStats} subjectId={selectedSubjectId} compact />
              <div className="sd-section-divider"><span>Практика</span></div>
            </>
          )}
          {dashboard.weeklyGoal && (
            <div className="sd-weekly">
              <div className="sd-weekly-head">
                <span>Цель недели</span>
                <span>{dashboard.weeklyGoal.done}/{dashboard.weeklyGoal.target}</span>
              </div>
              <div className="sd-weekly-bar">
                <div className="sd-weekly-fill" style={{ width: `${dashboard.weeklyGoal.percent}%` }} />
              </div>
              {dashboard.weeklyGoal.remaining > 0 && (
                <p className="sd-weekly-hint">Ещё {dashboard.weeklyGoal.remaining} заданий до цели</p>
              )}
            </div>
          )}

          <div className="sd-pill-grid">
            <StatPill icon="✅" label="Правильность" value={`${dashboard.activity?.accuracy ?? 0}%`} />
            <StatPill icon="📝" label="Решено всего" value={dashboard.activity?.total ?? 0} />
            <StatPill icon="📅" label="Решено сегодня" value={dashboard.activity?.today ?? 0} />
            <StatPill
              icon="🔥"
              label="Стрик"
              value={dashboard.streak?.streak ?? 0}
              sub={dashboard.streak?.best ? `лучшая серия: ${dashboard.streak.best}` : null}
            />
          </div>

          {dashboard.weakTopics?.length > 0 && (
            <div className="sd-weak-block">
              <h3 className="sd-block-title">Слабые темы</h3>
              <ul className="sd-weak-list">
                {dashboard.weakTopics.slice(0, 3).map((t, i) => (
                  <li
                    key={t.id}
                    className="sd-weak-item sd-weak-item--clickable"
                    role="button"
                    tabIndex={0}
                    onClick={() => handleAction('topic', t.id)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAction('topic', t.id)}
                  >
                    <span className="sd-weak-rank">{i + 1}</span>
                    <span className="sd-weak-icon">{t.icon}</span>
                    <span className="sd-weak-name">{t.name}</span>
                    <span className="sd-weak-pct">{t.accuracy}%</span>
                    <span className={`sd-status ${STATUS_CLASS[t.status] || ''}`}>{t.statusLabel}</span>
                    <span className="sd-weak-go">→</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <CollapsibleSection
            id="topics"
            title="Темы"
            icon="📚"
            badge={dashboard.topics?.length}
            open={openSections.topics}
            onToggle={toggleSection}
          >
            <ul className="sd-topic-list">
              {dashboard.topics?.map((t) => (
                <li
                  key={t.id}
                  className="sd-topic-row sd-topic-row--clickable"
                  role="button"
                  tabIndex={0}
                  onClick={() => handleAction('topic', t.id)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAction('topic', t.id)}
                >
                  <span className="sd-topic-icon">{t.icon}</span>
                  <div className="sd-topic-info">
                    <span className="sd-topic-name">{t.name}</span>
                    <span className="sd-topic-meta">{t.accuracy}% верно</span>
                  </div>
                  <span className={`sd-status ${STATUS_CLASS[t.status] || ''}`}>{t.statusLabel}</span>
                  <span className="sd-topic-go">→</span>
                </li>
              ))}
            </ul>
          </CollapsibleSection>

          <CollapsibleSection
            id="difficulty"
            title="По сложности"
            icon="📊"
            open={openSections.difficulty}
            onToggle={toggleSection}
          >
            <p className="sd-diff-hint">
              Процент — это правильность решений: сколько заданий каждого уровня ты решил верно.
            </p>
            <div className="sd-diff-grid">
              {['easy', 'medium', 'hard'].map((d) => {
                const val = dashboard.accuracyByDifficulty?.[d];
                return (
                  <div key={d} className={`sd-diff-row sd-diff-row--${d}`}>
                    <span>{DIFF_LABELS[d]}</span>
                    <span className="sd-diff-val">
                      {val != null ? (
                        <>
                          <strong>{val}%</strong>
                          <span className="sd-diff-verno">верно</span>
                        </>
                      ) : '—'}
                    </span>
                  </div>
                );
              })}
            </div>
          </CollapsibleSection>

          <CollapsibleSection
            id="errors"
            title="Последние ошибки"
            icon="🔍"
            badge={dashboard.recentErrors?.length}
            open={openSections.errors}
            onToggle={toggleSection}
          >
            {dashboard.recentErrors?.length ? (
              <>
                <p className="sd-error-intro">
                  Задания, в которых ты ошибся. Разбери их — это быстро поднимает балл.
                </p>
                <ul className="sd-error-list">
                  {dashboard.recentErrors.map((e) => (
                    <li key={e.id} className="sd-error-item">
                      <div className="sd-error-head">
                        <span className="sd-error-topic">{e.topicIcon} {e.topicName}</span>
                        <span className={`sd-error-diff sd-error-diff--${e.difficulty}`}>
                          {DIFF_WORD[e.difficulty] || e.difficulty}
                        </span>
                      </div>
                      {e.questionText && (
                        <p className="sd-error-q">{e.questionText}</p>
                      )}
                      <div className="sd-error-answers">
                        {e.userAnswer != null && (
                          <p className="sd-error-answer sd-error-answer--wrong">
                            <span className="sd-error-answer-label">Твой ответ:</span> {e.userAnswer}
                          </p>
                        )}
                        {e.correctAnswer != null && (
                          <p className="sd-error-answer sd-error-answer--right">
                            <span className="sd-error-answer-label">Правильный ответ:</span> {e.correctAnswer}
                          </p>
                        )}
                      </div>
                      {e.explanation && (
                        <div className="sd-error-exp-block">
                          <span className="sd-error-exp-label">Объяснение</span>
                          <p className="sd-error-exp">{e.explanation}</p>
                        </div>
                      )}
                      <span className="sd-error-meta">Ошибка · {formatRelativeDate(e.date)}</span>
                    </li>
                  ))}
                </ul>
                <button type="button" className="sd-cta sd-cta--outline" onClick={() => handleAction('weak')}>
                  Разобрать ошибки
                </button>
              </>
            ) : (
              <p className="sd-muted">Ошибок пока нет — так держать!</p>
            )}
          </CollapsibleSection>

          <div className="sd-activity-detail">
            <span>За неделю: {dashboard.activity?.week ?? 0}</span>
            <span>За месяц: {dashboard.activity?.month ?? 0}</span>
            <span>Дней с практикой: {dashboard.activity?.practiceDays ?? 0}</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default Statistics;
