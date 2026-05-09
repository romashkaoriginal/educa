import React, { useState } from 'react';

function Quiz() {
  const [code, setCode] = useState('');

  const handleJoin = () => {
    if (code.trim()) {
      alert(`Вход по коду: ${code}`);
      // Здесь будет логика подключения к викторине
    }
  };

  return (
    <div className="section">
      <h1 className="section-title">Викторина</h1>
      
      <div className="card">
        <div style={{ textAlign: 'center', marginBottom: '20px' }}>
          <div style={{ fontSize: '60px', marginBottom: '16px' }}>🎯</div>
          <h2 className="card-title">Присоединиться к викторине</h2>
          <p className="card-description">
            Введите код доступа, который озвучил преподаватель на стриме
          </p>
        </div>
        
        <input
          type="text"
          placeholder="Введите код"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          style={{
            width: '100%',
            padding: '16px',
            fontSize: '24px',
            textAlign: 'center',
            border: '2px solid #e5e7eb',
            borderRadius: '12px',
            fontWeight: '700',
            letterSpacing: '4px',
            marginBottom: '16px',
            transition: 'all 0.3s ease'
          }}
          onFocus={(e) => e.target.style.borderColor = '#1E40AF'}
          onBlur={(e) => e.target.style.borderColor = '#e5e7eb'}
        />
        
        <button className="primary-button" onClick={handleJoin}>
          Войти в викторину 🚀
        </button>
      </div>

      <div className="card">
        <h3 className="card-title">📊 Таблица лидеров</h3>
        <p className="card-description">
          Соревнуйтесь с другими учениками и зарабатывайте баллы за правильные ответы и скорость!
        </p>
      </div>
    </div>
  );
}

export default Quiz;