import React, { useState, useEffect } from 'react';
import '../../styles/Statistics.css';
import { adminFetch } from './adminApi';
import { useAdminData } from './AdminDataContext';

const API_URL = 'https://educa-production-a98e.up.railway.app/api';

function AdminStatistics() {
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Режим: 'all' = все ученики, 'student' = конкретный
  const [mode, setMode] = useState('all');
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [activeTab, setActiveTab] = useState('practice');

  // Данные для режима "все"
  const [allPractice, setAllPractice] = useState(null);   // { bySubject: [{subject, total, correct, percent, topics:[]}] }
  const [allHomework, setAllHomework] = useState(null);   // { bySubject: [{subject, homeworks:[{title, completedCount, totalStudents, percent}]}] }
  const [allLoading, setAllLoading] = useState(false);

  // Данные для режима "ученик"
  const [studentPractice, setStudentPractice] = useState(null);
  const [studentHomework, setStudentHomework] = useState(null);
  const [studentLoading, setStudentLoading] = useState(false);

  useEffect(() => { loadStudents(); }, []);

  useEffect(() => {
    if (mode === 'all') loadAllStats();
  }, [mode, activeTab]);

  useEffect(() => {
    if (mode === 'student' && selectedStudent) loadStudentStats();
  }, [mode, selectedStudent, activeTab]);

  const loadStudents = async () => {
    try {
      const res = await adminFetch(`${API_URL}/students`);
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

        // Данные уже агрегированы на бэкенде из PracticeDailyLog
        const total = students.length || 1;
        setAllPractice((data.practice || []).map(s => ({
          icon: s.subject?.icon || '📖',
          name: s.subject?.name || 'Без предмета',
          activeStudents: s.uniqueStudents,
          totalStudents: total,
          activePercent: total > 0 ? Math.round(s.uniqueStudents / total * 100) : 0,
          todayTotal: s.totalAttempts,
          todayStudentsCount: s.uniqueStudents,
          avgPerStudentToday: s.avgPerStudent
        })));
      }

      if (activeTab === 'homework') {
        const hwRes = await adminFetch(`${API_URL}/homework/all`);
        const hwData = await hwRes.json();
        const homeworks = hwData.homeworks || [];

        const results = await Promise.all(homeworks.map(async hw => {
          const rRes = await adminFetch(`${API_URL}/homework/${hw.id}/results`);
          const rData = await rRes.json();
          return { hw, results: rData.results || [] };
        }));

        // Группируем по предмету
        const bySubject = {};
        results.forEach(({ hw, results: hwResults }) => {
          const sName = hw.subject?.name || 'Без предмета';
          const sIcon = hw.subject?.icon || '📖';
          if (!bySubject[sName]) bySubject[sName] = { icon: sIcon, name: sName, homeworks: [], totalHw: 0, totalCompleted: 0 };

          const completedIds = new Set(hwResults.map(r => r.userId || r.student?.id));
          const bestByStudent = {};
          hwResults.forEach(r => {
            const sid = r.userId || r.student?.id;
            const pct = r.maxScore > 0 ? Math.round(r.totalScore / r.maxScore * 100) : 0;
            if (!bestByStudent[sid] || pct > bestByStudent[sid]) bestByStudent[sid] = pct;
          });
          const avgScore = completedIds.size > 0
            ? Math.round(Object.values(bestByStudent).reduce((a, b) => a + b, 0) / completedIds.size)
            : 0;

          bySubject[sName].totalHw++;
          if (completedIds.size > 0) bySubject[sName].totalCompleted++;

          bySubject[sName].homeworks.push({
            id: hw.id, title: hw.title,
            completedCount: completedIds.size,
            totalStudents: students.length,
            completedPercent: students.length > 0 ? Math.round(completedIds.size / students.length * 100) : 0,
            avgScore,
            results: hwResults,
            openDate: hw.openDate,
            closeDate: hw.closeDate
          });
        });

        setAllHomework(Object.values(bySubject).map(s => ({
          ...s,
          completionPercent: s.totalHw > 0 ? Math.round(s.totalCompleted / s.totalHw * 100) : 0
        })));
      }
    } catch (e) { console.error(e); }
    finally { setAllLoading(false); }
  };

  // ===== КОНКРЕТНЫЙ УЧЕНИК =====
  const loadStudentStats = async () => {
    setStudentLoading(true);
    try {
      if (activeTab === 'practice') {
        const res = await adminFetch(`${API_URL}/practice/stats/${selectedStudent.id}`);
        const data = await res.json();
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
                  allPractice.length === 0
                    ? <div className="empty-state"><div className="empty-icon">📚</div><p>Нет данных</p></div>
                    : allPractice.map((subj, si) => (
                      <div key={si} className="stats-block">
                        <h3>{subj.icon} {subj.name}</h3>
                        <div className="as-practice-subject-stats">
                          <div className="as-stat-item">
                            <span className="as-stat-label">👥 Решают практику</span>
                            <span className="as-stat-value">
                              {subj.activeStudents} из {subj.totalStudents}
                              <span className={`as-percent ${subj.activePercent >= 70 ? 'good' : subj.activePercent >= 40 ? 'medium' : 'low'}`} style={{marginLeft:8}}>
                                {subj.activePercent}%
                              </span>
                            </span>
                          </div>
                          <div className="as-stat-item">
                            <span className="as-stat-label">📅 Заданий решено сегодня</span>
                            <span className="as-stat-value">{subj.todayTotal} зад. ({subj.todayStudentsCount} уч.)</span>
                          </div>
                          <div className="as-stat-item">
                            <span className="as-stat-label">📝 Среднее на ученика сегодня</span>
                            <span className="as-stat-value">{subj.avgPerStudentToday} зад.</span>
                          </div>
                        </div>
                      </div>
                    ))
                )}

                {/* ДОМАШКА - все */}
                {activeTab === 'homework' && allHomework && (
                  allHomework.length === 0
                    ? <div className="empty-state"><div className="empty-icon">📝</div><p>Нет данных</p></div>
                    : allHomework.map((subj, si) => (
                      <div key={si} className="stats-block">
                        <div className="as-hw-subject-header">
                          <h3 style={{margin:0}}>{subj.icon} {subj.name}</h3>
                          <div className="as-hw-subject-summary">
                            <span className="as-stat-label">Выполняемость:</span>
                            <span className={`as-percent ${subj.completionPercent >= 70 ? 'good' : subj.completionPercent >= 40 ? 'medium' : 'low'}`}>
                              {subj.completionPercent}%
                            </span>
                            <span style={{fontSize:12,color:'#9ca3af'}}>({subj.totalCompleted} из {subj.totalHw} домашек сдано хоть кем-то)</span>
                          </div>
                        </div>
                        <div className="as-hw-list">
                          {subj.homeworks.map((hw, hi) => (
                            <AllHomeworkRow key={hi} hw={hw} students={students} />
                          ))}
                        </div>
                      </div>
                    ))
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
              {activeTab === 'practice' && studentPractice && (
                studentPractice.length === 0
                  ? <div className="empty-state"><div className="empty-icon">📚</div><p>Ещё не решал задания</p></div>
                  : studentPractice.map((subj, si) => (
                    <div key={si} className="stats-block">
                      <h3>{subj.icon} {subj.name}</h3>
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
                                    <span className="hw-score-value">{sub.totalScore}/{sub.maxScore} ({pct}%)</span>
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

// Отдельный компонент для строки домашки в режиме "все"
function AllHomeworkRow({ hw, students }) {
  const [expanded, setExpanded] = useState(false);

  const completedIds = new Set(hw.results.map(r => r.userId || r.student?.id));
  const notCompleted = students.filter(s => !completedIds.has(s.id));

  return (
    <div className="as-hw-row">
      <div className="as-hw-row-header" onClick={() => setExpanded(!expanded)} style={{cursor:'pointer'}}>
        <div className="as-hw-title">
          <span className="question-expand-icon">{expanded ? '▼' : '▶'}</span>
          {hw.title}
        </div>
        <div className="as-hw-meta">
          <span className="as-hw-done">{hw.completedCount}/{hw.totalStudents} сдали</span>
          {hw.completedCount > 0 && <span className="as-percent-badge"><span className={`as-percent ${hw.avgScore >= 70 ? 'good' : hw.avgScore >= 50 ? 'medium' : 'low'}`}>ср. {hw.avgScore}%</span></span>}
        </div>
      </div>

      {expanded && (
        <div className="as-hw-details">
          {/* Кто сдал */}
          {hw.results.length > 0 && (
            <div className="as-hw-section">
              <div className="as-hw-section-title">✅ Выполнили ({hw.results.length})</div>
              {hw.results.map((r, i) => {
                const pct = r.maxScore > 0 ? Math.round(r.totalScore / r.maxScore * 100) : 0;
                return (
                  <div key={i} className="as-hw-student-row">
                    <span className="as-hw-student-name">{r.student?.firstName} {r.student?.lastName}</span>
                    <span className="as-hw-student-score">{r.totalScore}/{r.maxScore}</span>
                    <span className={`as-percent ${pct >= 70 ? 'good' : pct >= 50 ? 'medium' : 'low'}`}>{pct}%</span>
                  </div>
                );
              })}
            </div>
          )}
          {/* Кто не сдал */}
          {notCompleted.length > 0 && (
            <div className="as-hw-section">
              <div className="as-hw-section-title">❌ Не выполнили ({notCompleted.length})</div>
              {notCompleted.map((s, i) => (
                <div key={i} className="as-hw-student-row not-done">
                  <span className="as-hw-student-name">{s.firstName} {s.lastName}</span>
                  <span style={{fontSize:12, color:'#9ca3af'}}>не сдано</span>
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