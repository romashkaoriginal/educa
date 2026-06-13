import React, { useState, useEffect, useCallback } from 'react';
import './Statistics.css';
import './Practice.css';
import { useData } from './DataContext';
import StudentBrandMark from '../components/StudentBrandMark';
import PredictedScoreCard from '../components/PredictedScoreCard';

const DIFF_LABELS = { easy: 'Лёгкие', medium: 'Средние', hard: 'Сложные' };
const STATUS_CLASS = {
  weak: 'sd-status--weak',
  review: 'sd-status--review',
  normal: 'sd-status--normal',
  good: 'sd-status--good',
  mastered: 'sd-status--mastered',
  learning: 'sd-status--learning',
};

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

function HomeworkStatsPanel({ homeworkStats }) {
  const homeworkBySubject = {};
  if (homeworkStats?.homeworks) {
    homeworkStats.homeworks.forEach((hw) => {
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
  }

  const entries = Object.entries(homeworkBySubject);

  if (entries.length === 0) {
    return (
      <div className="sd-empty">
        <span className="sd-empty-icon">📝</span>
        <p>У вас пока нет домашних заданий</p>
      </div>
    );
  }

  return (
    <div className="sd-dashboard sd-homework-panel">
      {entries.map(([subjectName, data]) => {
        const scorePercent = data.maxScore > 0
          ? Math.round((data.totalScore / data.maxScore) * 100)
          : 0;
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
                <span className={`sd-hw-stat-val sd-hw-pct ${scorePercent >= 70 ? 'good' : scorePercent >= 50 ? 'medium' : 'low'}`}>
                  {scorePercent}%
                </span>
                <span className="sd-hw-stat-label">баллы</span>
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

function Statistics({ studentId }) {
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
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [openSections, setOpenSections] = useState({ topics: false, difficulty: false, modes: false, errors: false });

  const subjectIdMatch = (a, b) => Number(a) === Number(b);

  useEffect(() => {
    loadHomeworkStats(true);
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
    } else {
      setLoadError(true);
    }
    if (!silent) setLoading(false);
  }, [loadSubjectDashboard]);

  useEffect(() => {
    if (selectedSubjectId && mainTab === 'practice') {
      loadDashboard(selectedSubjectId);
    }
  }, [selectedSubjectId, mainTab, dashboardRefreshKey, loadDashboard]);

  useEffect(() => {
    if (subjectDashboard?.subject?.id != null
      && selectedSubjectId != null
      && subjectIdMatch(subjectDashboard.subject.id, selectedSubjectId)) {
      setDashboard(subjectDashboard);
      setLoading(false);
      setLoadError(false);
    }
  }, [subjectDashboard, selectedSubjectId]);

  useEffect(() => {
    if (mainTab === 'homework') loadHomeworkStats(true);
  }, [mainTab, loadHomeworkStats]);

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
  const rec = dashboard?.recommendation;

  return (
    <div className="section section-stats sd-page">
      <div className="section-hero sd-hero">
        <div className="section-hero-glow" />
        <div className="section-hero-content practice-hero-row">
          <StudentBrandMark variant="hero" />
          <h1 className="practice-hero-title practice-hero-title--plain">Статистика</h1>
        </div>
        <svg className="section-hero-wave" viewBox="0 0 400 40" preserveAspectRatio="none">
          <path d="M0,40 L0,22 Q100,2 200,18 T400,15 L400,40 Z" />
        </svg>
      </div>

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
          className={`practice-tab ${mainTab === 'homework' ? 'active' : ''}`}
          onClick={() => setMainTab('homework')}
        >
          <span className="practice-tab-icon">📝</span>
          <span className="practice-tab-label">Домашка</span>
        </button>
      </div>

      {mainTab === 'homework' && (
        <HomeworkStatsPanel homeworkStats={homeworkStats} />
      )}

      {mainTab === 'practice' && subjects.length > 1 && (
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
      )}

      {mainTab === 'practice' && subjects.length === 1 && subject && (
        <div className="sd-subject-single">
          <span>{subject.icon}</span> {subject.name}
        </div>
      )}

      {mainTab === 'practice' && loading && !dashboard ? (
        <div className="sd-loading">
          <div className="sd-loading-pulse" />
          <p>Собираем ваш прогресс…</p>
        </div>
      ) : mainTab === 'practice' && loadError && !dashboard ? (
        <div className="sd-empty">
          <span className="sd-empty-icon">⚠️</span>
          <p>Не удалось загрузить статистику. Проверьте, что сервер обновлён.</p>
          <button type="button" className="sd-cta" onClick={() => loadDashboard(selectedSubjectId)}>
            Повторить
          </button>
        </div>
      ) : mainTab === 'practice' && !dashboard ? (
        <div className="sd-empty">
          <span className="sd-empty-icon">📊</span>
          <p>Решите первые задания в практике — здесь появится ваш прогресс</p>
          <button type="button" className="sd-cta" onClick={() => handleAction('general')}>
            Начать практику
          </button>
        </div>
      ) : mainTab === 'practice' && dashboard ? (
        <div className="sd-dashboard">
          <div className="sd-predicted-wrap">
            <PredictedScoreCard
              predictedScore={buildPredictedFromDashboard(dashboard)}
              subjectName={subjects.length > 1 ? subject?.name : undefined}
            />
            {dashboard.scoreDynamics?.monthDelta != null
              && dashboard.scoreDynamics.monthDelta !== dashboard.scoreDynamics.weekDelta && (
              <p className="sd-month-delta">
                {dashboard.scoreDynamics.monthDelta >= 0 ? '+' : ''}
                {dashboard.scoreDynamics.monthDelta} за месяц
              </p>
            )}
          </div>

          <div className="sd-pill-grid">
            <StatPill icon="✅" label="Правильность" value={`${dashboard.activity?.accuracy ?? 0}%`} />
            <StatPill icon="📝" label="Решено всего" value={dashboard.activity?.total ?? 0} />
            <StatPill icon="📅" label="Сегодня" value={dashboard.activity?.today ?? 0} />
            <StatPill
              icon="🔥"
              label="Стрик"
              value={dashboard.streak?.streak ?? 0}
              sub={dashboard.streak?.best ? `рек. ${dashboard.streak.best}` : null}
            />
          </div>

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
                <p className="sd-weekly-hint">Ещё {dashboard.weeklyGoal.remaining} до цели</p>
              )}
            </div>
          )}

          {dashboard.weakTopics?.length > 0 && (
            <div className="sd-weak-block">
              <h3 className="sd-block-title">Слабые темы</h3>
              <ul className="sd-weak-list">
                {dashboard.weakTopics.slice(0, 3).map((t, i) => (
                  <li key={t.id} className="sd-weak-item">
                    <span className="sd-weak-rank">{i + 1}</span>
                    <span className="sd-weak-icon">{t.icon}</span>
                    <span className="sd-weak-name">{t.name}</span>
                    <span className="sd-weak-pct">{t.accuracy}%</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {rec && (
            <div className="sd-rec-card">
              <span className="sd-rec-kicker">{rec.title}</span>
              <p className="sd-rec-text">{rec.text}</p>
              <button
                type="button"
                className="sd-cta sd-cta--full"
                onClick={() => handleAction(rec.actionType, rec.topicId)}
              >
                {rec.action}
              </button>
            </div>
          )}

          {dashboard.achievements?.length > 0 && (
            <div className="sd-achievements">
              {dashboard.achievements.map((a, i) => (
                <span key={i} className="sd-ach-chip">{a.icon} {a.label}</span>
              ))}
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
                <li key={t.id} className="sd-topic-row">
                  <span className="sd-topic-icon">{t.icon}</span>
                  <div className="sd-topic-info">
                    <span className="sd-topic-name">{t.name}</span>
                    <span className="sd-topic-meta">{t.solved} заданий · {t.accuracy}%</span>
                  </div>
                  <span className={`sd-status ${STATUS_CLASS[t.status] || ''}`}>{t.statusLabel}</span>
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
            <div className="sd-diff-grid">
              {['easy', 'medium', 'hard'].map((d) => {
                const val = dashboard.accuracyByDifficulty?.[d];
                return (
                  <div key={d} className={`sd-diff-row sd-diff-row--${d}`}>
                    <span>{DIFF_LABELS[d]}</span>
                    <span className="sd-diff-val">{val != null ? `${val}%` : '—'}</span>
                  </div>
                );
              })}
            </div>
          </CollapsibleSection>

          <CollapsibleSection
            id="modes"
            title="Режимы практики"
            icon="🎯"
            open={openSections.modes}
            onToggle={toggleSection}
          >
            <div className="sd-mode-list">
              {[
                { key: 'general', label: 'Все тесты', icon: '💪' },
                { key: 'weak', label: 'Слабые темы', icon: '🎯' },
                { key: 'topic', label: 'Конкретная тема', icon: '📚' },
              ].map(({ key, label, icon }) => {
                const m = dashboard.modeStats?.[key] || { total: 0, accuracy: 0 };
                return (
                  <div key={key} className="sd-mode-row">
                    <span>{icon} {label}</span>
                    <span>{m.total} · {m.accuracy}%</span>
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
                <ul className="sd-error-list">
                  {dashboard.recentErrors.map((e) => (
                    <li key={e.id} className="sd-error-item">
                      <span className="sd-error-topic">{e.topicIcon} {e.topicName}</span>
                      <span className="sd-error-meta">
                        {DIFF_LABELS[e.difficulty] || e.difficulty} · {formatRelativeDate(e.date)}
                      </span>
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
