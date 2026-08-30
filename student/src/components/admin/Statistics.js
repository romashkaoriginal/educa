import React, { useState, useEffect } from 'react';
import '../../styles/Statistics.css';
import { adminFetch } from './adminApi';
import { API_URL } from '../../config';
import { useSectionRefresh } from './useSectionRefresh';
import MathText from '../MathText';

function AdminStatistics({ currentUser, dataRefreshKey = 0 }) {
  const userRole = currentUser?.role || 'admin';
  const isManager = userRole === 'manager';
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Режим: 'all' = все ученики, 'student' = конкретный
  const [mode, setMode] = useState('all');
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [activeTab, setActiveTab] = useState('practice');

  // Данные для режима "все"
  const [allPractice, setAllPractice] = useState(null);
  const [allHomework, setAllHomework] = useState(null);
  const [allLoading, setAllLoading] = useState(false);

  // Данные для режима "ученик"
  const [studentPractice, setStudentPractice] = useState(null);
  const [studentPredicted, setStudentPredicted] = useState(null);
  const [studentHomework, setStudentHomework] = useState(null);
  const [studentLoading, setStudentLoading] = useState(false);

  useEffect(() => { loadStudents(); }, []);

  useEffect(() => {
    if (mode === 'all') loadAllStats();
  }, [mode, activeTab]);

  useEffect(() => {
    if (mode === 'student' && selectedStudent) loadStudentStats();
  }, [mode, selectedStudent, activeTab]);

  useSectionRefresh(dataRefreshKey, () => {
    loadStudents();
    if (mode === 'all') loadAllStats();
    else if (selectedStudent) loadStudentStats();
  });

  const loadStudents = async () => {
    try {
      const res = await adminFetch(`${API_URL}/stats/students`);
      const data = await res.json();
      setStudents(data.students || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const loadAllStats = async () => {
    setAllLoading(true);
    try {
      if (activeTab === 'practice') {
        const res = await adminFetch(`${API_URL}/stats/admin?section=practice`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Не удалось загрузить статистику практики');
        setAllPractice(data.practice || { summary: {}, subjects: [] });
      }

      if (activeTab === 'homework') {
        const res = await adminFetch(`${API_URL}/stats/admin?section=homework`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Не удалось загрузить статистику ДЗ');
        setAllHomework(data.homework || { summary: {}, subjects: [] });
      }
    } catch (e) { console.error(e); }
    finally { setAllLoading(false); }
  };

  // ===== КОНКРЕТНЫЙ УЧЕНИК =====
  const loadStudentStats = async () => {
    setStudentLoading(true);
    try {
      if (activeTab === 'practice') {
        const [statsRes, predictedRes] = await Promise.all([
          adminFetch(`${API_URL}/practice/stats/${selectedStudent.id}`),
          adminFetch(`${API_URL}/practice/admin-predicted/${selectedStudent.id}`)
        ]);
        const data = await statsRes.json();
        const predictedData = await predictedRes.json();
        setStudentPredicted(predictedData.subjects || []);

        // Группируем topicStats по предметам
        const bySubject = {};
        (data.topicStats || []).forEach(t => {
          const sName = t.topic?.subject?.name || 'Без предмета';
          const sIcon = t.topic?.subject?.icon || '📖';
          if (!bySubject[sName]) bySubject[sName] = { icon: sIcon, name: sName, topics: [] };
          bySubject[sName].topics.push({
            name: t.topic?.name || '—',
            icon: t.topic?.icon || '📝',
            total: t.total || 0,
            correct: t.correct || 0,
            percent: t.successRate || 0
          });
        });
        setStudentPractice(Object.values(bySubject));
      }

      if (activeTab === 'homework') {
        const res = await adminFetch(`${API_URL}/homework/student/${selectedStudent.id}/stats`);
        const data = await res.json();
        // Группируем по предмету
        const bySubject = {};
        (data.homeworks || []).forEach(hw => {
          const sName = hw.subject?.name || 'Без предмета';
          const sIcon = hw.subject?.icon || '📖';
          if (!bySubject[sName]) bySubject[sName] = { icon: sIcon, name: sName, homeworks: [] };
          bySubject[sName].homeworks.push({
            id: hw.id,
            title: hw.title,
            bestSubmission: hw.bestSubmission,
            submissionCount: hw.submissionCount,
            maxAttempts: hw.maxAttempts,
            openDate: hw.openDate,
            closeDate: hw.closeDate
          });
        });
        setStudentHomework(Object.values(bySubject));
      }
    } catch (e) { console.error(e); }
    finally { setStudentLoading(false); }
  };

  const filteredStudents = students.filter(s => {
    const q = searchQuery.toLowerCase();
    return s.firstName?.toLowerCase().includes(q) ||
      s.lastName?.toLowerCase().includes(q) ||
      s.telegramUsername?.toLowerCase().includes(q);
  });

  // ===== КОМПОНЕНТ ПРОГРЕСС-БАРА =====
  const PercentBadge = ({ value }) => (
    <span className={`as-percent ${value >= 70 ? 'good' : value >= 50 ? 'medium' : 'low'}`}>{value}%</span>
  );

  // ===== РЕНДЕР =====
  return (
    <div className="admin-section">

      {/* HEADER */}
      <div className="as-header">
        <div className="as-header-left">
          {mode === 'student' && (
            <button className="back-btn" onClick={() => { setMode('all'); setSelectedStudent(null); }}>← Назад</button>
          )}
          <h2>
            {mode === 'all' ? '📊 Статистика учеников' : `📊 ${selectedStudent?.firstName} ${selectedStudent?.lastName || ''}`}
          </h2>
        </div>

        {/* Переключатель все / конкретный */}
        {mode === 'all' && (
          <div className="as-mode-hint">Нажмите на ученика для детальной статистики</div>
        )}
      </div>

      {/* ВКЛАДКИ */}
      <div className="stats-tabs" style={{marginBottom: 20}}>
        <button className={`stats-tab ${activeTab === 'practice' ? 'active' : ''}`} onClick={() => setActiveTab('practice')}>
          💪 Практика
        </button>
        <button className={`stats-tab ${activeTab === 'homework' ? 'active' : ''}`} onClick={() => setActiveTab('homework')}>
          📝 Домашка
        </button>
      </div>

      {/* ===== РЕЖИМ "ВСЕ УЧЕНИКИ" ===== */}
      {mode === 'all' && (
        <div className="as-layout">
          {/* Список учеников слева */}
          <div className="as-sidebar">
            <input
              type="text"
              className="search-input"
              placeholder="🔍 Поиск..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{marginBottom: 12}}
            />
            {loading ? <p>Загрузка...</p> : filteredStudents.map(s => (
              <button key={s.id} className="as-student-btn" onClick={() => { setSelectedStudent(s); setMode('student'); }}>
                <div className="as-ava">{s.firstName?.[0]}{s.lastName?.[0]}</div>
                <div className="as-stu-info">
                  <div className="as-stu-name">{s.firstName} {s.lastName}</div>
                  <div className="as-stu-sub">{s.subjects?.map(sub => sub.icon).join(' ')}</div>
                </div>
              </button>
            ))}
          </div>

          {/* Контент справа */}
          <div className="as-content">
            {allLoading ? <p>Загрузка...</p> : (
              <>
                {/* ПРАКТИКА - все */}
                {activeTab === 'practice' && allPractice && (
                  allPractice.subjects?.length === 0
                    ? <div className="empty-state"><div className="empty-icon">📚</div><p>Практику пока никто не решал</p></div>
                    : <>
                      <AnalyticsOverview
                        items={[
                          { label: 'Решают практику', value: `${allPractice.summary?.activeStudents || 0} из ${allPractice.summary?.eligibleStudents || 0}`, hint: 'хотя бы одна попытка' },
                          { label: 'Решали сегодня', value: allPractice.summary?.todayStudents || 0, hint: 'уникальных учеников' },
                          { label: 'Общая точность', value: `${allPractice.summary?.accuracy || 0}%`, hint: `${allPractice.summary?.totalAttempts || 0} попыток` },
                        ]}
                      />
                      {allPractice.subjects.map((subj) => (
                      <div key={subj.subject.id} className="stats-block">
                        <div className="as-analytics-title-row">
                          <h3>{subj.subject.icon} {subj.subject.name}</h3>
                          <span className={`as-percent ${subj.accuracy >= 70 ? 'good' : subj.accuracy >= 50 ? 'medium' : 'low'}`}>
                            точность {subj.accuracy}%
                          </span>
                        </div>
                        <div className="as-practice-subject-stats">
                          <div className="as-stat-item">
                            <span className="as-stat-label">Решают практику</span>
                            <span className="as-stat-value">
                              {subj.activeStudents} из {subj.eligibleStudents}
                              <span className={`as-percent ${subj.activePercent >= 70 ? 'good' : subj.activePercent >= 40 ? 'medium' : 'low'}`}>
                                {subj.activePercent}%
                              </span>
                            </span>
                          </div>
                          <div className="as-stat-item">
                            <span className="as-stat-label">Сегодня</span>
                            <span className="as-stat-value">{subj.todayAttempts} попыток · {subj.todayStudents} уч.</span>
                          </div>
                          <div className="as-stat-item">
                            <span className="as-stat-label">За всё время</span>
                            <span className="as-stat-value">{subj.totalAttempts} попыток</span>
                          </div>
                        </div>
                        <div className="as-problems-grid">
                          <ProblemList title="Проблемные темы" items={subj.problemTopics} emptyText="Ошибок по темам пока нет" />
                          <ProblemList title="Проблемные задания" items={subj.problemQuestions} emptyText="Ошибок по заданиям пока нет" questions />
                        </div>
                      </div>
                    ))}
                    </>
                )}

                {/* ДОМАШКА - все */}
                {activeTab === 'homework' && allHomework && (
                  allHomework.subjects?.length === 0
                    ? <div className="empty-state"><div className="empty-icon">📝</div><p>Нет данных</p></div>
                    : <>
                      <AnalyticsOverview
                        items={[
                          { label: 'Сдали хотя бы одно ДЗ', value: `${allHomework.summary?.activeStudents || 0} из ${allHomework.summary?.eligibleStudents || 0}`, hint: 'уникальных учеников' },
                          { label: 'Всего сданных работ', value: allHomework.summary?.completedWorks || 0, hint: 'лучшие попытки' },
                          { label: 'Общий средний балл', value: `${allHomework.summary?.averageScore || 0}%`, hint: 'по лучшим попыткам' },
                        ]}
                      />
                      {allHomework.subjects.map((subj) => (
                      <div key={subj.subject.id} className="stats-block">
                        <div className="as-hw-subject-header">
                          <h3>{subj.subject.icon} {subj.subject.name}</h3>
                          <div className="as-hw-subject-summary">
                            <span>{subj.summary.activeStudents} из {subj.summary.eligibleStudents} учеников</span>
                            <span className={`as-percent ${subj.summary.averageScore >= 70 ? 'good' : subj.summary.averageScore >= 50 ? 'medium' : 'low'}`}>
                              средний {subj.summary.averageScore}%
                            </span>
                          </div>
                        </div>
                        <div className="as-hw-list">
                          {subj.homeworks.map((hw) => (
                            <AllHomeworkRow key={hw.id} hw={hw} students={students} />
                          ))}
                        </div>
                      </div>
                    ))}
                    </>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* ===== РЕЖИМ "КОНКРЕТНЫЙ УЧЕНИК" ===== */}
      {mode === 'student' && selectedStudent && (
        <div className="as-content" style={{maxWidth:'100%'}}>
          {studentLoading ? <p>Загрузка...</p> : (
            <>
              {/* ПРАКТИКА - ученик */}
              {activeTab === 'practice' && (
                <>
                  {studentPredicted && studentPredicted.length > 0 && (
                    <div className="stats-block predicted-analytics-block">
                      <h3>🎯 Прогнозный балл ЦТ</h3>
                      {studentPredicted.map((subj, pi) => (
                        <div key={pi} className="predicted-subject-card">
                          <div className="predicted-subject-header">
                            <span>{subj.subject?.icon} {subj.subject?.name}</span>
                            {subj.unlocked ? (
                              <span className="predicted-score-badge">{subj.score}/100</span>
                            ) : (
                              <span className="predicted-locked-badge">🔒 {subj.solved}/50</span>
                            )}
                          </div>

                          {isManager ? (
                            <div className="predicted-manager-summary">
                              Решено уникальных заданий: <strong>{subj.solved}</strong>
                            </div>
                          ) : subj.unlocked ? (
                            <>
                              <div className="predicted-summary-row">
                                <span>Решено: {subj.solved}</span>
                                <span>Точность: {subj.accuracy}%</span>
                              </div>

                              {subj.weakTopics?.length > 0 && (
                                <div className="predicted-weak-block">
                                  <div className="predicted-section-label">Слабые темы</div>
                                  {subj.weakTopics.map(t => (
                                    <div key={t.topicId} className="predicted-topic-row weak">
                                      <span>{t.name}</span>
                                      <PercentBadge value={t.progress} />
                                    </div>
                                  ))}
                                </div>
                              )}

                              {subj.topics?.length > 0 && (
                                <div className="predicted-topics-block">
                                  <div className="predicted-section-label">Прогресс по темам</div>
                                  {subj.topics.map(t => (
                                    <div key={t.topicId} className="predicted-topic-row">
                                      <span>{t.icon} {t.name}</span>
                                      <PercentBadge value={t.progress} />
                                    </div>
                                  ))}
                                </div>
                              )}

                              {subj.topics?.some(t => t.difficulties?.length) && (
                                <div className="predicted-diff-block">
                                  <div className="predicted-section-label">По сложности</div>
                                  {subj.topics.map(t => (
                                    <div key={`diff-${t.topicId}`} className="predicted-diff-topic">
                                      <div className="predicted-diff-topic-name">{t.name}</div>
                                      <div className="predicted-diff-grid">
                                        {(t.difficulties || []).map(d => (
                                          <div key={d.difficulty} className="predicted-diff-item">
                                            <span className={`diff-tag ${d.difficulty}`}>
                                              {d.difficulty === 'easy' ? '🟢' : d.difficulty === 'medium' ? '🟡' : '🔴'}
                                              {' '}{d.solved}/{d.target}
                                            </span>
                                            <span>{d.accuracy}% · M {d.mastery}%</span>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}

                              {subj.history?.length > 1 && (
                                <div className="predicted-history-block">
                                  <div className="predicted-section-label">
                                    Динамика балла
                                    {subj.history.length >= 2 && (
                                      <span className={`history-growth ${subj.history[subj.history.length - 1].score >= subj.history[0].score ? 'up' : 'down'}`}>
                                        {' '}{subj.history[subj.history.length - 1].score - subj.history[0].score >= 0 ? '+' : ''}
                                        {subj.history[subj.history.length - 1].score - subj.history[0].score}
                                      </span>
                                    )}
                                  </div>
                                  <div className="predicted-history-list">
                                    {subj.history.map((h, hi) => (
                                      <div key={hi} className="predicted-history-item">
                                        <span>{h.date}</span>
                                        <span>{h.score} баллов ({h.solvedCount} зад.)</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </>
                          ) : (
                            <p className="predicted-unlock-hint">
                              Нужно решить ещё {subj.needed ?? (50 - (subj.solved || 0))} заданий для прогноза
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {studentPractice && (
                    studentPractice.length === 0
                      ? (!studentPredicted?.length && (
                        <div className="empty-state"><div className="empty-icon">📚</div><p>Ещё не решал задания</p></div>
                      ))
                      : studentPractice.map((subj, si) => (
                        <div key={si} className="stats-block">
                          <h3>{subj.icon} {subj.name} — сессии по темам</h3>
                          <div className="topics-list">
                            {subj.topics.map((t, ti) => (
                              <div key={ti} className="topic-stat-row">
                                <div className="topic-info">
                                  <span className="topic-icon">{t.icon}</span>
                                  <span className="topic-name">{t.name}</span>
                                </div>
                                <div className="topic-numbers">
                                  <span className="count">{t.correct}/{t.total}</span>
                                  <PercentBadge value={t.percent} />
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))
                  )}
                </>
              )}

              {/* ДОМАШКА - ученик */}
              {activeTab === 'homework' && studentHomework && (
                studentHomework.length === 0
                  ? <div className="empty-state"><div className="empty-icon">📝</div><p>Нет домашних заданий</p></div>
                  : studentHomework.map((subj, si) => (
                    <div key={si} className="stats-block">
                      <h3>{subj.icon} {subj.name}</h3>
                      <div className="homework-stats-list">
                        {subj.homeworks.map((hw, hi) => {
                          const sub = hw.bestSubmission;
                          const pct = sub ? Math.round(sub.totalScore / sub.maxScore * 100) : null;
                          const now = new Date();
                          const expired = new Date(hw.closeDate) < now;
                          return (
                            <div key={hi} className="homework-stat-card">
                              <div className="hw-stat-header">
                                <div className="hw-stat-title-block">
                                  <div className="hw-stat-title">{hw.title}</div>
                                </div>
                                {sub
                                  ? <span className="hw-status-badge status-active">✅ Выполнено</span>
                                  : <span className={`hw-status-badge ${expired ? 'status-expired' : 'status-upcoming'}`}>
                                      {expired ? '❌ Не сдано' : '⏳ Ожидается'}
                                    </span>
                                }
                              </div>
                              {sub ? (
                                <div className="hw-stat-result">
                                  <div className="hw-stat-score">
                                    <span className="hw-score-label">Лучший результат:</span>
                                    <span className="hw-score-value">
                                      {sub.correctAnswers != null
                                        ? `${sub.correctAnswers}/${sub.totalAnswers} вопр.`
                                        : `${sub.totalScore}/${sub.maxScore} б.`}
                                      {' '}({pct}%)
                                    </span>
                                  </div>
                                  <div className="progress-bar">
                                    <div className="progress-fill" style={{
                                      width: `${pct}%`,
                                      background: pct >= 70 ? 'linear-gradient(90deg,#10b981,#34d399)'
                                        : pct >= 50 ? 'linear-gradient(90deg,#f59e0b,#fbbf24)'
                                        : 'linear-gradient(90deg,#ef4444,#f87171)'
                                    }}></div>
                                  </div>
                                  <div className="hw-stat-attempts">
                                    Попыток: {hw.submissionCount || 1}{hw.maxAttempts ? ` из ${hw.maxAttempts}` : ''}
                                  </div>
                                </div>
                              ) : (
                                <div className="hw-stat-not-completed">
                                  <span className="not-completed-icon">📋</span>
                                  <span>{expired ? 'Пропущено' : 'Ещё не выполнено'}</span>
                                </div>
                              )}
                              <div className="hw-stat-dates">
                                <div className="hw-date-item">
                                  <span className="hw-date-label">⏰ Дедлайн:</span>
                                  <span className={`hw-date-value ${expired && !sub ? 'expired' : ''}`}>
                                    {new Date(hw.closeDate).toLocaleString('ru-RU', {day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'})}
                                  </span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function AnalyticsOverview({ items }) {
  return (
    <div className="as-overview" aria-label="Сводные показатели">
      {items.map((item) => (
        <div className="as-overview-item" key={item.label}>
          <span className="as-overview-label">{item.label}</span>
          <strong className="as-overview-value">{item.value}</strong>
          <span className="as-overview-hint">{item.hint}</span>
        </div>
      ))}
    </div>
  );
}

function ProblemList({ title, items = [], emptyText, questions = false }) {
  return (
    <section className="as-problem-section">
      <h4>{title}</h4>
      {items.length === 0 ? (
        <p className="as-problem-empty">{emptyText}</p>
      ) : (
        <ol className="as-problem-list">
          {items.map((item) => (
            <li key={questions ? item.questionId : item.topicId}>
              <div className="as-problem-copy">
                <span className="as-problem-name">{questions ? <MathText text={item.questionText} /> : `${item.icon || '📝'} ${item.name}`}</span>
                {questions && <span className="as-problem-topic">{item.topicName}</span>}
              </div>
              <div className="as-problem-metrics">
                <span className="as-percent low">{item.errorRate}% ошибок</span>
                <span>{item.errorCount} из {item.attempts} · {item.affectedStudents} уч.</span>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

// Отдельный компонент для строки домашки в режиме "все"
function AllHomeworkRow({ hw, students }) {
  const [expanded, setExpanded] = useState(false);

  const completedStudents = hw.completedStudents || [];
  const completedIds = new Set(completedStudents.map((result) => result.userId));
  const eligibleIds = new Set(hw.eligibleStudentIds || []);
  const notCompleted = students.filter((student) =>
    eligibleIds.has(student.id) && !completedIds.has(student.id)
  );

  return (
    <div className="as-hw-row">
      <button
        type="button"
        className="as-hw-row-header"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
      >
        <div className="as-hw-title">
          <span className="question-expand-icon">{expanded ? '▼' : '▶'}</span>
          {hw.title}
        </div>
        <div className="as-hw-meta">
          <span className="as-hw-done">{hw.completedCount}/{hw.eligibleStudents} сдали</span>
          <span className={`as-percent ${hw.completionPercent >= 70 ? 'good' : hw.completionPercent >= 40 ? 'medium' : 'low'}`}>
            {hw.completionPercent}%
          </span>
          {hw.completedCount > 0 && (
            <span className={`as-percent ${hw.averageScore >= 70 ? 'good' : hw.averageScore >= 50 ? 'medium' : 'low'}`}>
              средний {hw.averageScore}%
            </span>
          )}
        </div>
      </button>

      {expanded && (
        <div className="as-hw-details">
          <div className="as-hw-section">
            <div className="as-hw-section-title">Частые ошибки</div>
            {hw.commonErrors?.length > 0 ? (
              <ol className="as-hw-error-list">
                {hw.commonErrors.map((error) => (
                  <li key={error.questionId}>
                    <span><MathText text={error.questionText} /></span>
                    <span className="as-hw-error-metric">{error.errorRate}% · {error.errorCount} уч.</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="as-problem-empty">Недостаточно ответов или ошибок пока нет</p>
            )}
          </div>
          {/* Кто сдал */}
          {completedStudents.length > 0 && (
            <div className="as-hw-section">
              <div className="as-hw-section-title">Выполнили ({completedStudents.length})</div>
              {completedStudents.map((result) => {
                const pct = result.percentage || 0;
                return (
                  <div key={result.userId} className="as-hw-student-row">
                    <span className="as-hw-student-name">{result.student?.firstName} {result.student?.lastName}</span>
                    <span className="as-hw-student-score">{result.totalScore}/{result.maxScore}</span>
                    <span className={`as-percent ${pct >= 70 ? 'good' : pct >= 50 ? 'medium' : 'low'}`}>{pct}%</span>
                  </div>
                );
              })}
            </div>
          )}
          {/* Кто не сдал */}
          {notCompleted.length > 0 && (
            <div className="as-hw-section">
              <div className="as-hw-section-title">Не выполнили ({notCompleted.length})</div>
              {notCompleted.map((s) => (
                <div key={s.id} className="as-hw-student-row not-done">
                  <span className="as-hw-student-name">{s.firstName} {s.lastName}</span>
                  <span className="as-hw-not-done">не сдано</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default AdminStatistics;
