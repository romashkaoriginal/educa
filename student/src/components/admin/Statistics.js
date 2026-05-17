import React, { useState, useEffect } from 'react';
import '../../styles/Statistics.css';

const API_URL = 'https://educa-production-a98e.up.railway.app/api';

function AdminStatistics() {
  const [students, setStudents] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [selectedSubject, setSelectedSubject] = useState('all');
  const [activeTab, setActiveTab] = useState('practice');
  const [stats, setStats] = useState(null);
  const [homeworkStats, setHomeworkStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadStudents();
    loadSubjects();
  }, []);

  useEffect(() => {
    if (selectedStudent) {
      loadStudentStats();
    }
  }, [selectedStudent, activeTab]);

  const loadStudents = async () => {
    try {
      const response = await fetch(`${API_URL}/students`);
      const data = await response.json();
      setStudents(data.students || []);
    } catch (error) {
      console.error('Error loading students:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadSubjects = async () => {
    try {
      const response = await fetch(`${API_URL}/subjects`);
      const data = await response.json();
      setSubjects(data.subjects || []);
    } catch (error) {
      console.error('Error loading subjects:', error);
    }
  };

  const loadStudentStats = async () => {
    if (!selectedStudent) return;

    try {
      if (activeTab === 'practice') {
        const response = await fetch(`${API_URL}/practice/stats/${selectedStudent.id}`);
        const data = await response.json();
        setStats(data);
      } else if (activeTab === 'homework') {
        const response = await fetch(`${API_URL}/homework/student/${selectedStudent.id}/stats`);
        const data = await response.json();
        setHomeworkStats(data);
      }
    } catch (error) {
      console.error('Error loading stats:', error);
    }
  };

  const getHomeworkStatus = (homework) => {
    const now = new Date();
    const openDate = new Date(homework.openDate);
    const closeDate = new Date(homework.closeDate);

    if (now < openDate) return 'upcoming';
    if (now > closeDate) return 'expired';
    return 'active';
  };

  const getStatusLabel = (status) => {
    switch (status) {
      case 'upcoming': return '🕐 Скоро';
      case 'active': return '✅ Активна';
      case 'expired': return '⏰ Просрочена';
      default: return '';
    }
  };

  const getStatusClass = (status) => {
    switch (status) {
      case 'upcoming': return 'status-upcoming';
      case 'active': return 'status-active';
      case 'expired': return 'status-expired';
      default: return '';
    }
  };

  const filteredStudents = students.filter(student => {
    const searchLower = searchQuery.toLowerCase();
    const matchesSearch = 
      student.firstName?.toLowerCase().includes(searchLower) ||
      student.lastName?.toLowerCase().includes(searchLower) ||
      student.telegramUsername?.toLowerCase().includes(searchLower) ||
      student.telegramId?.toString().includes(searchLower);

    return matchesSearch;
  });

  const filteredStats = () => {
    if (!stats || selectedSubject === 'all') return stats;

    // Фильтр по предмету для практики
    return {
      ...stats,
      subjectStats: stats.subjectStats?.filter(s => s.subject?.id === selectedSubject),
      topicStats: stats.topicStats?.filter(t => t.topic?.subject?.id === selectedSubject),
      recentAttempts: stats.recentAttempts?.filter(a => a.subject?.id === selectedSubject)
    };
  };

  const filteredHomeworkStats = () => {
    if (!homeworkStats || selectedSubject === 'all') return homeworkStats;

    return {
      ...homeworkStats,
      homeworks: homeworkStats.homeworks?.filter(hw => hw.subject?.id === selectedSubject)
    };
  };

  if (loading) {
    return (
      <div className="admin-section">
        <h2>Статистика учеников</h2>
        <p className="loading-text">Загрузка...</p>
      </div>
    );
  }

  if (!selectedStudent) {
    return (
      <div className="admin-section">
        <h2>📊 Статистика учеников</h2>
        <p className="section-description">
          Выберите ученика, чтобы посмотреть его статистику по практике, домашкам и викторинам
        </p>

        {/* Поиск */}
        <div className="search-box">
          <input
            type="text"
            placeholder="🔍 Поиск по имени, username или Telegram ID"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="search-input"
          />
        </div>

        {/* Список учеников */}
        {filteredStudents.length === 0 ? (
          <div className="empty-state">
            <p>Ученики не найдены</p>
          </div>
        ) : (
          <div className="students-grid">
            {filteredStudents.map(student => (
              <button
                key={student.id}
                className="student-card"
                onClick={() => setSelectedStudent(student)}
              >
                <div className="student-avatar">
                  {student.firstName?.[0]}{student.lastName?.[0]}
                </div>
                <div className="student-info">
                  <div className="student-name">
                    {student.firstName} {student.lastName}
                  </div>
                  <div className="student-meta">
                    @{student.telegramUsername || 'нет username'}
                  </div>
                  {student.subjects && student.subjects.length > 0 && (
                    <div className="student-subjects">
                      {student.subjects.slice(0, 3).map(subj => (
                        <span key={subj.id} className="subject-tag">
                          {subj.icon} {subj.name}
                        </span>
                      ))}
                      {student.subjects.length > 3 && (
                        <span className="subject-tag">+{student.subjects.length - 3}</span>
                      )}
                    </div>
                  )}
                </div>
                <div className="student-arrow">→</div>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  const displayStats = filteredStats();
  const displayHomeworkStats = filteredHomeworkStats();

  return (
    <div className="admin-section">
      {/* Шапка с возвратом */}
      <div className="stats-header">
        <button className="back-btn" onClick={() => {
          setSelectedStudent(null);
          setStats(null);
          setHomeworkStats(null);
          setSelectedSubject('all');
        }}>
          ← Назад к списку
        </button>
        <div className="student-header-info">
          <div className="student-avatar-large">
            {selectedStudent.firstName?.[0]}{selectedStudent.lastName?.[0]}
          </div>
          <div>
            <h2>{selectedStudent.firstName} {selectedStudent.lastName}</h2>
            <p className="student-username">@{selectedStudent.telegramUsername || 'нет username'}</p>
          </div>
        </div>
      </div>

      {/* Вкладки */}
      <div className="stats-tabs">
        <button
          className={`stats-tab ${activeTab === 'practice' ? 'active' : ''}`}
          onClick={() => setActiveTab('practice')}
        >
          💪 Практика
        </button>
        <button
          className={`stats-tab ${activeTab === 'homework' ? 'active' : ''}`}
          onClick={() => setActiveTab('homework')}
        >
          📝 Домашка
        </button>
        <button
          className={`stats-tab ${activeTab === 'quiz' ? 'active' : ''}`}
          onClick={() => setActiveTab('quiz')}
        >
          🎯 Викторины
        </button>
      </div>

      {/* Фильтр по предметам */}
      {(activeTab === 'practice' || activeTab === 'homework') && (
        <div className="subject-filter">
          <label>Фильтр по предмету:</label>
          <select 
            value={selectedSubject} 
            onChange={(e) => setSelectedSubject(e.target.value === 'all' ? 'all' : parseInt(e.target.value))}
            className="subject-select"
          >
            <option value="all">Все предметы</option>
            {subjects.map(subject => (
              <option key={subject.id} value={subject.id}>
                {subject.icon} {subject.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* ПРАКТИКА */}
      {activeTab === 'practice' && displayStats && (
        <div className="stats-content">
          {displayStats.stats?.total === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">📚</div>
              <p>Ученик еще не решал задания.</p>
            </div>
          ) : (
            <>
              {/* Общие показатели */}
              <div className="stats-summary">
                <div className="stat-card">
                  <div className="stat-icon">📝</div>
                  <div className="stat-info">
                    <div className="stat-label">Решено</div>
                    <div className="stat-value">{displayStats.stats?.total || 0}</div>
                  </div>
                </div>

                <div className="stat-card success">
                  <div className="stat-icon">✅</div>
                  <div className="stat-info">
                    <div className="stat-label">Правильно</div>
                    <div className="stat-value">{displayStats.stats?.correct || 0}</div>
                  </div>
                </div>

                <div className="stat-card error">
                  <div className="stat-icon">❌</div>
                  <div className="stat-info">
                    <div className="stat-label">Ошибок</div>
                    <div className="stat-value">{displayStats.stats?.incorrect || 0}</div>
                  </div>
                </div>

                <div className="stat-card">
                  <div className="stat-icon">📈</div>
                  <div className="stat-info">
                    <div className="stat-label">Успешность</div>
                    <div className="stat-value">{displayStats.stats?.successRate || 0}%</div>
                  </div>
                </div>
              </div>

              {/* По предметам */}
              {displayStats.subjectStats && displayStats.subjectStats.length > 0 && (
                <div className="stats-block">
                  <h3>📚 По предметам</h3>
                  <div className="subjects-list">
                    {displayStats.subjectStats.map((subj, idx) => {
                      const total = subj.total || 0;
                      const correct = subj.correct || 0;
                      const percent = subj.successRate || 0;
                      return (
                        <div key={idx} className="subject-stat-row">
                          <div className="subject-info">
                            <span className="subject-icon">{subj.subject?.icon || '📖'}</span>
                            <span className="subject-name">{subj.subject?.name}</span>
                          </div>
                          <div className="subject-numbers">
                            <span className="count">{correct}/{total}</span>
                            <div className="progress-bar">
                              <div className="progress-fill" style={{ width: `${percent}%` }}></div>
                            </div>
                            <span className={`percent ${percent >= 70 ? 'good' : percent >= 50 ? 'medium' : 'low'}`}>
                              {percent}%
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* По подразделам */}
              {displayStats.topicStats && displayStats.topicStats.length > 0 && (
                <div className="stats-block">
                  <h3>📑 По подразделам</h3>
                  <div className="topics-list">
                    {displayStats.topicStats.map((topic, idx) => {
                      const total = topic.total || 0;
                      const correct = topic.correct || 0;
                      const percent = topic.successRate || 0;
                      return (
                        <div key={idx} className="topic-stat-row">
                          <div className="topic-info">
                            <span className="topic-icon">{topic.topic?.icon || '📝'}</span>
                            <div>
                              <div className="topic-name">{topic.topic?.name}</div>
                              <div className="topic-subject">{topic.topic?.subject?.name}</div>
                            </div>
                          </div>
                          <div className="topic-numbers">
                            <span className="count">{correct}/{total}</span>
                            <span className={`percent ${percent >= 70 ? 'good' : percent >= 50 ? 'medium' : 'low'}`}>
                              {percent}%
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Последние решения */}
              {displayStats.recentAttempts && displayStats.recentAttempts.length > 0 && (
                <div className="stats-block">
                  <h3>🕐 Последние решения</h3>
                  <div className="recent-list">
                    {displayStats.recentAttempts.map((att, idx) => (
                      <div key={idx} className={`recent-item ${att.isCorrect ? 'correct' : 'incorrect'}`}>
                        <div className="recent-icon">{att.isCorrect ? '✅' : '❌'}</div>
                        <div className="recent-info">
                          <div className="recent-question">
                            {att.question?.questionText?.substring(0, 70)}
                            {att.question?.questionText?.length > 70 ? '...' : ''}
                          </div>
                          <div className="recent-meta">
                            {att.subject?.icon} {att.subject?.name} • {att.topic?.name}
                          </div>
                        </div>
                        <div className="recent-date">
                          {new Date(att.createdAt).toLocaleDateString('ru-RU')}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ДОМАШКА */}
      {activeTab === 'homework' && displayHomeworkStats && (
        <div className="stats-content">
          {!displayHomeworkStats.homeworks || displayHomeworkStats.homeworks.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">📝</div>
              <p>У ученика пока нет домашних заданий.</p>
            </div>
          ) : (
            <>
              {/* Общая статистика */}
              <div className="stats-summary">
                <div className="stat-card">
                  <div className="stat-icon">📚</div>
                  <div className="stat-info">
                    <div className="stat-label">Всего</div>
                    <div className="stat-value">{displayHomeworkStats.total || 0}</div>
                  </div>
                </div>

                <div className="stat-card success">
                  <div className="stat-icon">✅</div>
                  <div className="stat-info">
                    <div className="stat-label">Выполнено</div>
                    <div className="stat-value">{displayHomeworkStats.completed || 0}</div>
                  </div>
                </div>

                <div className="stat-card">
                  <div className="stat-icon">⏳</div>
                  <div className="stat-info">
                    <div className="stat-label">Активных</div>
                    <div className="stat-value">{displayHomeworkStats.active || 0}</div>
                  </div>
                </div>

                <div className="stat-card">
                  <div className="stat-icon">📈</div>
                  <div className="stat-info">
                    <div className="stat-label">Ср. балл</div>
                    <div className="stat-value">{displayHomeworkStats.avgScore || 0}%</div>
                  </div>
                </div>
              </div>

              {/* Список домашек */}
              <div className="stats-block">
                <h3>📝 Домашние задания</h3>
                <div className="homework-stats-list">
                  {displayHomeworkStats.homeworks.map((hw) => {
                    const status = getHomeworkStatus(hw);
                    const submission = hw.bestSubmission;
                    const percentage = submission 
                      ? Math.round((submission.totalScore / submission.maxScore) * 100)
                      : 0;

                    return (
                      <div key={hw.id} className="homework-stat-card">
                        <div className="hw-stat-header">
                          <div className="hw-stat-title-block">
                            <span className="hw-stat-icon">{hw.subject?.icon || '📖'}</span>
                            <div>
                              <div className="hw-stat-title">{hw.title}</div>
                              <div className="hw-stat-subject">{hw.subject?.name}</div>
                            </div>
                          </div>
                          <span className={`hw-status-badge ${getStatusClass(status)}`}>
                            {getStatusLabel(status)}
                          </span>
                        </div>

                        {submission ? (
                          <div className="hw-stat-result">
                            <div className="hw-stat-score">
                              <span className="hw-score-label">Лучший результат:</span>
                              <span className="hw-score-value">
                                {submission.totalScore}/{submission.maxScore} ({percentage}%)
                              </span>
                            </div>
                            <div className="progress-bar">
                              <div 
                                className="progress-fill" 
                                style={{ 
                                  width: `${percentage}%`,
                                  background: percentage >= 70 
                                    ? 'linear-gradient(90deg, #10b981 0%, #34d399 100%)' 
                                    : percentage >= 50 
                                    ? 'linear-gradient(90deg, #f59e0b 0%, #fbbf24 100%)' 
                                    : 'linear-gradient(90deg, #ef4444 0%, #f87171 100%)'
                                }}
                              ></div>
                            </div>
                            <div className="hw-stat-attempts">
                              Попыток: {hw.submissionCount || 1}
                              {hw.maxAttempts && ` из ${hw.maxAttempts}`}
                            </div>
                          </div>
                        ) : (
                          <div className="hw-stat-not-completed">
                            <span className="not-completed-icon">📋</span>
                            <span>Не выполнено</span>
                          </div>
                        )}

                        <div className="hw-stat-dates">
                          <div className="hw-date-item">
                            <span className="hw-date-label">📅 Открыто:</span>
                            <span className="hw-date-value">
                              {new Date(hw.openDate).toLocaleString('ru-RU', {
                                day: '2-digit',
                                month: '2-digit',
                                year: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </span>
                          </div>
                          <div className="hw-date-item">
                            <span className="hw-date-label">⏰ Дедлайн:</span>
                            <span className={`hw-date-value ${status === 'expired' ? 'expired' : ''}`}>
                              {new Date(hw.closeDate).toLocaleString('ru-RU', {
                                day: '2-digit',
                                month: '2-digit',
                                year: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </span>
                          </div>
                          {submission && (
                            <div className="hw-date-item">
                              <span className="hw-date-label">✅ Выполнено:</span>
                              <span className="hw-date-value">
                                {new Date(submission.submittedAt).toLocaleString('ru-RU', {
                                  day: '2-digit',
                                  month: '2-digit',
                                  year: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ВИКТОРИНЫ */}
      {activeTab === 'quiz' && (
        <div className="stats-content">
          <div className="empty-state">
            <div className="empty-icon">🎯</div>
            <p>Раздел статистики по викторинам в разработке.</p>
          </div>
        </div>
      )}
    </div>
  );
}

export default AdminStatistics;