import React, { useState, useEffect } from 'react';

const API_URL = 'https://educa-production-a98e.up.railway.app/api';

function Homework({ studentId }) {
  const [homeworks, setHomeworks] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [selectedSubject, setSelectedSubject] = useState('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [homeworkRes, subjectsRes] = await Promise.all([
          fetch(`${API_URL}/homework/student/${studentId}`),
          fetch(`${API_URL}/subjects/student/${studentId}`)
        ]);

        const homeworkData = await homeworkRes.json();
        const subjectsData = await subjectsRes.json();

        setHomeworks(homeworkData.homeworks || []);
        setSubjects(subjectsData.subjects || []);
      } catch (error) {
        console.error('Error fetching homeworks:', error);
      } finally {
        setLoading(false);
      }
    };

    if (studentId) {
      fetchData();
    }
  }, [studentId]);

  // Фильтрация по предмету
  const filteredHomeworks = selectedSubject === 'all'
    ? homeworks
    : homeworks.filter(hw => hw.subjectId === selectedSubject);

  if (loading) {
    return (
      <div className="section">
        <h1 className="section-title">Домашние задания</h1>
        <p style={{ textAlign: 'center', color: '#6b7280', padding: '40px' }}>
          Загрузка домашних заданий...
        </p>
      </div>
    );
  }

  return (
    <div className="section">
      <h1 className="section-title">Домашние задания</h1>

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
      
      {filteredHomeworks.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📝</div>
          <p className="empty-text">
            {selectedSubject === 'all'
              ? 'Пока нет домашних заданий.'
              : 'Нет заданий по этому предмету.'
            }
          </p>
        </div>
      ) : (
        filteredHomeworks.map(hw => (
          <div key={hw.id} className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span style={{ fontSize: '32px' }}>{hw.subject.icon}</span>
                <div>
                  <h3 className="card-title">{hw.title}</h3>
                  <p style={{ fontSize: '12px', color: '#6b7280', margin: 0 }}>
                    {hw.subject.name}
                  </p>
                </div>
              </div>
              <span style={{
                background: '#F59E0B',
                color: '#ffffff',
                padding: '4px 12px',
                borderRadius: '20px',
                fontSize: '12px',
                fontWeight: '600'
              }}>
                Активно
              </span>
            </div>
            <p className="card-description">
              {hw.description || 'Выполните домашнее задание'}
            </p>
            <p style={{ fontSize: '13px', color: '#9ca3af', marginTop: '8px' }}>
              ⏰ Срок сдачи: {new Date(hw.deadline).toLocaleDateString('ru-RU')}
            </p>
            <p style={{ fontSize: '13px', color: '#9ca3af' }}>
              📚 Вопросов: {hw.questions.length}
            </p>
            <button className="primary-button">
              Приступить к выполнению
            </button>
          </div>
        ))
      )}
    </div>
  );
}

export default Homework;