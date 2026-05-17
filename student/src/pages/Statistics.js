import React, { useState, useEffect } from 'react';
import './Statistics.css'; 

const API_URL = 'https://educa-production-a98e.up.railway.app/api';

function Statistics({ studentId }) {
  const [activeTab, setActiveTab] = useState('practice');
  const [stats, setStats] = useState(null);
  const [homeworkStats, setHomeworkStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
    loadHomeworkStats();
  }, [studentId]);

  const loadStats = async () => {
    try {
      const response = await fetch(`${API_URL}/practice/stats/${studentId}`);
      const data = await response.json();
      setStats(data);
    } catch (error) {
      console.error('Error loading stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadHomeworkStats = async () => {
    try {
      const response = await fetch(`${API_URL}/homework/student/${studentId}/stats`);
      const data = await response.json();
      setHomeworkStats(data);
    } catch (error) {
      console.error('Error loading homework stats:', error);
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

  if (loading) {
    return (
      <div className="section">
        <h1 className="section-title">Статистика</h1>
        <p style={{ textAlign: 'center', padding: '40px' }}>Загрузка...</p>
      </div>
    );
  }

  return (
    <div className="section">
      <h1 className="section-title">📊 Моя статистика</h1>

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

      {/* ПРАКТИКА */}
      {activeTab === 'practice' && stats && (
        <div className="stats-content">
          {stats.stats.total === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">📚</div>
              <p>Вы ещё не решали задания.</p>
              <p>Перейдите в раздел Практика!</p>
            </div>
          ) : (
            <>
              {/* Общие показатели */}
              <div className="stats-summary">
                <div className="stat-card">
                  <div className="stat-icon">📝</div>
                  <div className="stat-info">
                    <div className="stat-label">Решено</div>
                    <div className="stat-value">{stats.stats.total}</div>
                  </div>
                </div>

                <div className="stat-card success">
                  <div className="stat-icon">✅</div>
                  <div className="stat-info">
                    <div className="stat-label">Правильно</div>
                    <div className="stat-value">{stats.stats.correct}</div>
                  </div>
                </div>

                <div className="stat-card error">
                  <div className="stat-icon">❌</div>
                  <div className="stat-info">
                    <div className="stat-label">Ошибок</div>
                    <div className="stat-value">{stats.stats.incorrect}</div>
                  </div>
                </div>

                <div className="stat-card">
                  <div className="stat-icon">📈</div>
                  <div className="stat-info">
                    <div className="stat-label">Успешность</div>
                    <div className="stat-value">{stats.stats.successRate}%</div>
                  </div>
                </div>
              </div>

              {/* По предметам */}
              {stats.subjectStats && stats.subjectStats.length > 0 && (
                <div className="stats-block">
                  <h3>📚 По предметам</h3>
                  <div className="subjects-list">
                    {stats.subjectStats.map((subj, idx) => {
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
              {stats.topicStats && stats.topicStats.length > 0 && (
                <div className="stats-block">
                  <h3>📑 По подразделам</h3>
                  <div className="topics-list">
                    {stats.topicStats.map((topic, idx) => {
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
              {stats.recentAttempts && stats.recentAttempts.length > 0 && (
                <div className="stats-block">
                  <h3>🕐 Последние решения</h3>
                  <div className="recent-list">
                    {stats.recentAttempts.map((att, idx) => (
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
      {activeTab === 'homework' && (
        <div className="stats-content">
          {!homeworkStats || homeworkStats.homeworks?.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">📝</div>
              <p>У вас пока нет домашних заданий.</p>
              <p>Они появятся, когда преподаватель их создаст!</p>
            </div>
          ) : (
            <>
              {/* Общая статистика по домашкам */}
              <div className="stats-summary">
                <div className="stat-card">
                  <div className="stat-icon">📚</div>
                  <div className="stat-info">
                    <div className="stat-label">Всего</div>
                    <div className="stat-value">{homeworkStats.total || 0}</div>
                  </div>
                </div>

                <div className="stat-card success">
                  <div className="stat-icon">✅</div>
                  <div className="stat-info">
                    <div className="stat-label">Выполнено</div>
                    <div className="stat-value">{homeworkStats.completed || 0}</div>
                  </div>
                </div>

                <div className="stat-card">
                  <div className="stat-icon">⏳</div>
                  <div className="stat-info">
                    <div className="stat-label">Активных</div>
                    <div className="stat-value">{homeworkStats.active || 0}</div>
                  </div>
                </div>

                <div className="stat-card">
                  <div className="stat-icon">📈</div>
                  <div className="stat-info">
                    <div className="stat-label">Ср. балл</div>
                    <div className="stat-value">{homeworkStats.avgScore || 0}%</div>
                  </div>
                </div>
              </div>

              {/* Список домашек */}
              <div className="stats-block">
                <h3>📝 Домашние задания</h3>
                <div className="homework-stats-list">
                  {homeworkStats.homeworks.map((hw) => {
                    const status = getHomeworkStatus(hw);
                    const submission = hw.bestSubmission;
                    const percentage = submission 
                      ? Math.round((submission.totalScore / submission.maxScore) * 100)
                      : 0;

                    return (
                      <div key={hw.id} className="homework-stat-card">
                        {/* Заголовок */}
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

                        {/* Результат */}
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

                        {/* Даты */}
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
            <p>Скоро здесь появятся ваши результаты и место в лидерборде!</p>
          </div>
        </div>
      )}
    </div>
  );
}

export default Statistics;