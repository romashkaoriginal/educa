import React, { useState, useEffect } from 'react';
import './AdminPanel.css';
import Students from '../components/admin/Students';
import Users from '../components/admin/Users';

const API_URL = 'https://educa-production-a98e.up.railway.app/api';

function AdminPanel() {
  const [activeSection, setActiveSection] = useState('students');
  const [subjects, setSubjects] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSubjects();
  }, []);

  const loadSubjects = async () => {
    try {
      const response = await fetch(`${API_URL}/subjects`);
      const data = await response.json();
      setSubjects(data.subjects || []);
      setLoading(false);
    } catch (error) {
      console.error('Error loading subjects:', error);
      setLoading(false);
    }
  };

  const sections = [
    { id: 'users', name: 'Пользователи', icon: '👨‍💼' },
    { id: 'students', name: 'Ученики', icon: '👥' },
    { id: 'practice', name: 'Практика', icon: '💪' },
    { id: 'quiz', name: 'Викторина', icon: '🎯' },
    { id: 'homework', name: 'Дом. задание', icon: '📝' }
  ];

  return (
    <div className="admin-panel">
      <header className="admin-header">
        <div className="logo">
          <span className="logo-ed">ED</span>
          <span className="logo-me">me</span>
        </div>
        <div className="admin-title">Админ-панель</div>
      </header>

      <nav className="admin-tabs">
        {sections.map(section => (
          <button
            key={section.id}
            className={`admin-tab ${activeSection === section.id ? 'active' : ''}`}
            onClick={() => setActiveSection(section.id)}
          >
            <span className="tab-icon">{section.icon}</span>
            <span className="tab-name">{section.name}</span>
          </button>
        ))}
      </nav>

      <main className="admin-content">
        {activeSection === 'users' && <Users />}
        {activeSection === 'students' && <Students subjects={subjects} />}
        
        {activeSection === 'practice' && (
          <div className="admin-section">
            <h2>Практика</h2>
            <p className="coming-soon">В разработке</p>
          </div>
        )}

        {activeSection === 'quiz' && (
          <div className="admin-section">
            <h2>Викторина</h2>
            <p className="coming-soon">В разработке</p>
          </div>
        )}

        {activeSection === 'homework' && (
          <div className="admin-section">
            <h2>Домашнее задание</h2>
            <p className="coming-soon">В разработке</p>
          </div>
        )}
      </main>
    </div>
  );
}

export default AdminPanel;