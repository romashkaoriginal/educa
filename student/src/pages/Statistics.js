import React, { useState, useEffect } from 'react';
import './Statistics.css';
import { useData } from './DataContext';

function Statistics({ studentId }) {
  const { practiceStats: stats, homeworkStats, loading: contextLoading, loadHomeworkStats, loadPracticeStats } = useData();
  const [activeTab, setActiveTab] = useState('practice');

  // Обновляем данные при открытии раздела
  useEffect(() => {
    loadPracticeStats(true);
    loadHomeworkStats(true);
  }, []);

  if ((contextLoading.practiceStats || contextLoading.homeworkStats) && !stats && !homeworkStats) {
    return (
      <div className="section">
        <h1 className="section-title">Статистика</h1>
        <p style={{ textAlign: 'center', padding: '40px' }}>Загрузка...</p>
      </div>
    );
  }

  // Группируем topicStats по предметам для практики
  const practiceBySubject = {};
  if (stats?.topicStats) {
    stats.topicStats.forEach(topic => {
      const subjectName = topic.topic?.subject?.name || 'Без предмета';
      const subjectIcon = topic.topic?.subject?.icon || '📖';
      if (!practiceBySubject[subjectName]) {
        practiceBySubject[subjectName] = { icon: subjectIcon, topics: [] };
      }
      practiceBySubject[subjectName].topics.push({
        name: topic.topic?.name || 'Без названия',
        icon: topic.topic?.icon || '📝',
        total: topic.total || 0,
        correct: topic.correct || 0,
        percent: topic.successRate || 0,
      });
    });
  }

  // Группируем домашки по предметам
  const homeworkBySubject = {};
  if (homeworkStats?.homeworks) {
    homeworkStats.homeworks.forEach(hw => {
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
      // Считаем все вопросы во всех ДЗ по предмету
      const questionsInHw = (hw.questions || []).length;
      homeworkBySubject[subjectName].totalQuestions += questionsInHw;
      
      if (hw.bestSubmission) {
        homeworkBySubject[subjectName].completed += 1;
        homeworkBySubject[subjectName].totalScore += hw.bestSubmission.totalScore || 0;
        homeworkBySubject[subjectName].maxScore += hw.bestSubmission.maxScore || 0;
        // Фоллбэк: если correctAnswers нет в ответе, считаем по проценту от вопросов
        const correct = hw.bestSubmission.correctAnswers !== undefined
          ? hw.bestSubmission.correctAnswers
          : Math.round((hw.bestSubmission.totalScore / hw.bestSubmission.maxScore) * questionsInHw);
        homeworkBySubject[subjectName].correctAnswers += correct;
      }
    });
  }

  return (
    <div className="section">
      <h1 className="section-title">📊 Моя статистика</h1>

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
      </div>

      {/* ===== ПРАКТИКА ===== */}
      {activeTab === 'practice' && (
        <div className="stats-content">
          {Object.keys(practiceBySubject).length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">📚</div>
              <p>Вы ещё не решали задания.</p>
              <p>Перейдите в раздел Практика!</p>
            </div>
          ) : (
            Object.entries(practiceBySubject).map(([subjectName, data]) => (
              <div key={subjectName} className="stats-block">
                <h3>{data.icon} {subjectName}</h3>
                <div className="topics-list">
                  {data.topics.map((topic, idx) => (
                    <div key={idx} className="topic-stat-row">
                      <div className="topic-info">
                        <span className="topic-icon">{topic.icon}</span>
                        <div>
                          <div className="topic-name">{topic.name}</div>
                        </div>
                      </div>
                      <div className="topic-numbers">
                        <span className="count">{topic.correct}/{topic.total}</span>
                        <span className={`percent ${topic.percent >= 70 ? 'good' : topic.percent >= 50 ? 'medium' : 'low'}`}>
                          {topic.percent}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ===== ДОМАШКА ===== */}
      {activeTab === 'homework' && (
        <div className="stats-content">
          {Object.keys(homeworkBySubject).length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">📝</div>
              <p>У вас пока нет домашних заданий.</p>
            </div>
          ) : (
            <div className="stats-block">
              <h3>📝 По предметам</h3>
              <div className="subjects-list">
                {Object.entries(homeworkBySubject).map(([subjectName, data]) => {
                  const scorePercent = data.maxScore > 0 
                    ? Math.round((data.totalScore / data.maxScore) * 100) 
                    : 0;
                  return (
                    <div key={subjectName} className="subject-stat-row">
                      <div className="subject-info">
                        <span className="subject-icon">{data.icon}</span>
                        <span className="subject-name">{subjectName}</span>
                      </div>
                      <div className="subject-numbers">
                        <span className="count">{data.correctAnswers}/{data.totalQuestions}</span>
                        <div className="progress-bar">
                          <div className="progress-fill" style={{ width: `${scorePercent}%` }}></div>
                        </div>
                        <span className={`percent ${scorePercent >= 70 ? 'good' : scorePercent >= 50 ? 'medium' : 'low'}`}>
                          {scorePercent}%
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default Statistics;