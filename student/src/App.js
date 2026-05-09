import React, { useState, useEffect } from 'react';
import './App.css';
import StudentApp from './pages/StudentApp';
import AdminPanel from './pages/AdminPanel';

function App() {
  const [selectedRole, setSelectedRole] = useState(null);

  useEffect(() => {
    fetch('https://educa-production-a98e.up.railway.app/api/admin/dashboard')
      .then(res => res.json())
      .then(data => {
        sessionStorage.setItem('adminData', JSON.stringify(data));
      })
      .catch(() => {});
  }, []);

  if (!selectedRole) {
    return (
      <div className="role-selection">
        <div className="role-container">
          <div className="role-logo">
            <span className="logo-ed">ED</span>
            <span className="logo-me">me</span>
          </div>
          
          <h1 className="role-title">Выберите роль</h1>
          <p className="role-subtitle">Как вы хотите войти в систему?</p>

          <div className="role-buttons">
            <button 
              className="role-button role-student"
              onClick={() => setSelectedRole('student')}
            >
              <div className="role-icon">👨‍🎓</div>
              <div className="role-info">
                <h2>Ученик</h2>
                <p>Проходи тесты, практикуйся и выполняй задания</p>
              </div>
            </button>

            <button 
              className="role-button role-admin"
              onClick={() => setSelectedRole('admin')}
            >
              <div className="role-icon">👨‍💼</div>
              <div className="role-info">
                <h2>Администратор</h2>
                <p>Создавай задания и управляй платформой</p>
              </div>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {selectedRole === 'student' && <StudentApp />}
      {selectedRole === 'admin' && <AdminPanel />}
    </>
  );
}

export default App;