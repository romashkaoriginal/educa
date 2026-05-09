import React, { useState, useEffect } from 'react';

const API_URL = 'https://educa-production-a98e.up.railway.app/api';

function Practice({ studentId }) {
  const [practiceTopics, setPracticeTopics] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [selectedSubject, setSelectedSubject] = useState('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [practiceRes, subjectsRes] = await Promise.all([
          fetch(`${API_URL}/practice/student/${studentId}`),
          fetch(`${API_URL}/subjects/student/${studentId}`)
        ]);

        const practiceData = await practiceRes.json();
        const subjectsData = await subjectsRes.json();

        setPracticeTopics(practiceData.practiceTopics || []);
        setSubjects(subjectsData.subjects || []);
      } catch (error) {
        console.error('Error fetching practice:', error);
      } finally {
        setLoading(false);
      }
    };

    if (studentId) {
      fetchData();
    }
  }, [studentId]);

  // Фильтрация по предмету
  const filteredTopics = selectedSubject === 'all'
    ? practiceTopics
    : practiceTopics.filter(topic => topic.subjectId === selectedSubject);

  if (loading) {
    return (
      <div className="section">
        <h1 className="section-title">Практика</h1>
        <p style={{ textAlign: 'center', color: '#6b7280', padding: '40px' }}>
          Загрузка практики...
        </p>
      </div>
    );
  }

  return (
    <div className="section">
      <h1 className="section-title">Практика</h1>
      
      <p style={{ marginBottom: '20px', color: '#6b7280', fontSize: '14px' }}>
        💪 Тренируйся в свободное время и улучшай свои навыки!
      </p>

      {/* Фильтр по предметам */}
      {subjects.length > 1 && (
        <div className="subject-filters">
          <button
            className={`filter-button ${selectedSubject === 'all' ? 'active' : ''}`}
            onClick={() => setSelectedSubject('all')}
          >
            Все предметы
          </button>
          {subjects.map(subject => (
            <button
              key={subject.id}
              className={`filter-button ${selectedSubject === subject.id ? 'active' : ''}`}
              onClick={() => setSelectedSubject(subject.id)}
            >
              <span className="filter-icon">{subject.icon}</span>
              <span>{subject.name}</span>
            </button>
          ))}
        </div>
      )}

      {filteredTopics.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📚</div>
          <p className="empty-text">
            {selectedSubject === 'all'
              ? 'Пока нет доступных заданий для практики.'
              : 'Нет заданий по этому предмету.'
            }
          </p>
        </div>
      ) : (
        filteredTopics.map(topic => (
          <div key={topic.id} className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ fontSize: '32px' }}>{topic.subject.icon}</span>
                <div>
                  <h3 className="card-title">{topic.title}</h3>
                  <p style={{ fontSize: '12px', color: '#6b7280', margin: 0 }}>
                    {topic.subject.name}
                  </p>
                </div>
              </div>
              <span style={{
                background: topic.difficulty === 'easy' ? '#10B981' : topic.difficulty === 'medium' ? '#F59E0B' : '#EF4444',
                color: '#ffffff',
                padding: '4px 12px',
                borderRadius: '20px',
                fontSize: '12px',
                fontWeight: '600'
              }}>
                {topic.difficulty === 'easy' ? 'Легко' : topic.difficulty === 'medium' ? 'Средне' : 'Сложно'}
              </span>
            </div>
            <p className="card-description">
              {topic.description || 'Попрактикуйся в этой теме'}
            </p>
            <p style={{ fontSize: '13px', color: '#9ca3af', marginTop: '8px' }}>
              📚 Вопросов: {topic.questions.length}
            </p>
            <button className="primary-button">
              Начать практику
            </button>
          </div>
        ))
      )}
    </div>
  );
}

export default Practice;