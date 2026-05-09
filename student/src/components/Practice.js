import React from 'react';

function Practice() {
  const topics = [
    { id: 1, title: 'Алгебра', difficulty: 'easy', questions: 20 },
    { id: 2, title: 'Геометрия', difficulty: 'medium', questions: 15 },
    { id: 3, title: 'Тригонометрия', difficulty: 'hard', questions: 10 },
  ];

  const difficultyColors = {
    easy: '#10B981',
    medium: '#F59E0B',
    hard: '#EF4444'
  };

  const difficultyText = {
    easy: 'Легко',
    medium: 'Средне',
    hard: 'Сложно'
  };

  return (
    <div className="section">
      <h1 className="section-title">Практика</h1>
      
      <p style={{ marginBottom: '20px', color: '#6b7280', fontSize: '14px' }}>
        💪 Тренируйся в свободное время и улучшай свои навыки!
      </p>

      {topics.map(topic => (
        <div key={topic.id} className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '12px' }}>
            <h3 className="card-title">{topic.title}</h3>
            <span style={{
              background: difficultyColors[topic.difficulty],
              color: '#ffffff',
              padding: '4px 12px',
              borderRadius: '20px',
              fontSize: '12px',
              fontWeight: '600'
            }}>
              {difficultyText[topic.difficulty]}
            </span>
          </div>
          <p className="card-description">
            📚 Вопросов: {topic.questions}
          </p>
          <button className="primary-button">
            Начать практику
          </button>
        </div>
      ))}
    </div>
  );
}

export default Practice;