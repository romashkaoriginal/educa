import React, { useState, useEffect } from 'react';
import './AdminPanel.css';
import Students from '../components/admin/Students';
import Users from '../components/admin/Users';
import Practice from '../components/admin/Practice';
import Homework from '../components/admin/Homework';
import Statistics from '../components/admin/Statistics';

const API_URL = 'https://educa-production-a98e.up.railway.app/api';

function AdminPanel() {
  const [activeSection, setActiveSection] = useState('students');
  const [subjects, setSubjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    loadSubjects();
    loadCurrentUser();
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

  const loadCurrentUser = async () => {
    try {
      // Попробуем получить ID из Telegram WebApp
      if (window.Telegram?.WebApp?.initDataUnsafe?.user) {
        const telegramUser = window.Telegram.WebApp.initDataUnsafe.user;
        const telegramId = telegramUser.id;
        
        // Получаем пользователя из базы по telegram ID
        const response = await fetch(`${API_URL}/auth/telegram/${telegramId}`);
        const data = await response.json();
        
        if (data.user) {
          setCurrentUser(data.user);
          localStorage.setItem('currentUserId', data.user.id);
        }
      } else {
        // Если нет Telegram WebApp, пробуем взять из localStorage
        const userId = localStorage.getItem('currentUserId');
        if (userId) {
          setCurrentUser({ id: parseInt(userId) });
        } else {
          // Дефолтное значение для разработки
          setCurrentUser({ id: 1 });
          localStorage.setItem('currentUserId', '1');
        }
      }
    } catch (error) {
      console.error('Error loading current user:', error);
      // Устанавливаем дефолтное значение
      setCurrentUser({ id: 1 });
      localStorage.setItem('currentUserId', '1');
    }
  };

  const sections = [
  { id: 'users', name: 'Пользователи', icon: '👨‍💼' },
  { id: 'students', name: 'Ученики', icon: '👥' },
  { id: 'practice', name: 'Практика', icon: '💪' },
  { id: 'quiz', name: 'Викторина', icon: '🎯' },
  { id: 'homework', name: 'Дом. задание', icon: '📝' },
  { id: 'statistics', name: 'Статистика', icon: '📊' } // ← ДОБАВИТЬ
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
        {activeSection === 'practice' && <Practice subjects={subjects} />}
        {activeSection === 'homework' && <Homework subjects={subjects} currentUserId={currentUser?.id} />}
        {activeSection === 'statistics' && <Statistics />} 
        
        {activeSection === 'quiz' && (
          <div className="admin-section">
            <h2>Викторина</h2>
            <p className="coming-soon">В разработке</p>
          </div>
        )}
      </main>
    </div>
  );
}

export default AdminPanel;