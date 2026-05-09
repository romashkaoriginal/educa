import React from 'react';

function Homework() {
  const homeworks = [
    {
      id: 1,
      title: 'Математика: Уравнения',
      deadline: '25 мая 2026',
      status: 'active'
    },
    {
      id: 2,
      title: 'Физика: Механика',
      deadline: '28 мая 2026',
      status: 'active'
    }
  ];

  return (
    <div className="section">
      <h1 className="section-title">Домашние задания</h1>
      
      {homeworks.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📝</div>
          <p className="empty-text">
            Пока нет домашних заданий.<br />
            Они появятся здесь, как только преподаватель их создаст.
          </p>
        </div>
      ) : (
        homeworks.map(hw => (
          <div key={hw.id} className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '12px' }}>
              <h3 className="card-title">{hw.title}</h3>
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
              ⏰ Срок сдачи: {hw.deadline}
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