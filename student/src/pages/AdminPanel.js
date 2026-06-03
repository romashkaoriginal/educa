import React, { useState, useEffect } from 'react';
import './AdminPanel.css';
import Students from '../components/admin/Students';
import Users from '../components/admin/Users';
import Practice from '../components/admin/Practice';
import Homework from '../components/admin/Homework';
import Statistics from '../components/admin/Statistics';
import Quiz from '../components/admin/Quiz';
import Notifications from '../components/admin/Notifications';
import BotTestEditor from '../components/admin/BotTestEditor';
import Applications from '../components/admin/Applications';
import { adminFetch } from '../components/admin/adminApi';
import { AdminDataProvider, useAdminData } from '../components/admin/AdminDataContext';

const API_URL = 'https://educa-production-a98e.up.railway.app/api';

// Доступные разделы по ролям
const ROLE_SECTIONS = {
  admin: ['users', 'students', 'applications', 'practice', 'quiz', 'homework', 'statistics', 'notifications', 'bottest'],
  manager: ['users', 'students', 'applications', 'statistics', 'notifications', 'bottest'],
  teacher: ['practice', 'quiz', 'homework', 'statistics', 'notifications', 'bottest'],
};

const ALL_SECTIONS = [
  { id: 'users', name: 'Пользователи', icon: '👨‍💼' },
  { id: 'students', name: 'Ученики', icon: '👥' },
  { id: 'applications', name: 'Заявки', icon: '📋' },
  { id: 'practice', name: 'Практика', icon: '💪' },
  { id: 'quiz', name: 'Викторина', icon: '🎯' },
  { id: 'homework', name: 'Дом. задание', icon: '📝' },
  { id: 'statistics', name: 'Статистика', icon: '📊' },
  { id: 'notifications', name: 'Уведомления', icon: '📣' },
  { id: 'bottest', name: 'Тест бота', icon: '🤖' },
];

function AdminPanelContent() {
  const [subjects, setSubjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState(null);
  const [userRole, setUserRole] = useState('admin');
  const [activeSection, setActiveSection] = useState(null);

  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (tg) {
      tg.ready();
      setTimeout(() => {
        loadSubjects();
        loadCurrentUser();
      }, 100);
    } else {
      loadSubjects();
      loadCurrentUser();
    }
  }, []);

  const loadSubjects = async () => {
    try {
      const response = await adminFetch(`${API_URL}/subjects`);
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
      if (window.Telegram?.WebApp?.initDataUnsafe?.user) {
        const telegramUser = window.Telegram.WebApp.initDataUnsafe.user;
        const response = await adminFetch(`${API_URL}/auth/telegram/${telegramUser.id}`);
        const data = await response.json();
        if (data.user) {
          setCurrentUser(data.user);
          const role = data.user.role || 'admin';
          setUserRole(role);
          // Устанавливаем первый доступный раздел
          const available = ROLE_SECTIONS[role] || ROLE_SECTIONS.admin;
          setActiveSection(available[0]);
        }
      } else {
        setCurrentUser({ id: 1 });
        setActiveSection('students');
      }
    } catch (error) {
      console.error('Error loading current user:', error);
      setCurrentUser({ id: 1 });
      setActiveSection('students');
    }
  };

  const { refresh } = useAdminData();
  const refreshableSections = ['students', 'users', 'applications', 'statistics'];

  // Фильтруем разделы по роли
  const availableSections = ALL_SECTIONS.filter(s =>
    (ROLE_SECTIONS[userRole] || ROLE_SECTIONS.admin).includes(s.id)
  );

  if (loading || !activeSection) return null;

  return (
    <div className="admin-panel">
      <header className="admin-header">
        <div className="logo">
          <span className="logo-ed">ED</span>
          <span className="logo-me">me</span>
        </div>
        <div className="admin-title">Админ-панель</div>
        {refreshableSections.includes(activeSection) && (
          <button className="admin-refresh-btn" onClick={() => refresh(activeSection)} title="Обновить">
            🔄
          </button>
        )}
      </header>

      <nav className="admin-tabs">
        {availableSections.map(section => (
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
        <div style={{ display: activeSection === 'users' ? 'block' : 'none' }}><Users /></div>
        <div style={{ display: activeSection === 'students' ? 'block' : 'none' }}><Students subjects={subjects} /></div>
        <div style={{ display: activeSection === 'practice' ? 'block' : 'none' }}><Practice subjects={subjects} /></div>
        <div style={{ display: activeSection === 'homework' ? 'block' : 'none' }}><Homework subjects={subjects} currentUserId={currentUser?.id} /></div>
        <div style={{ display: activeSection === 'statistics' ? 'block' : 'none' }}><Statistics /></div>
        <div style={{ display: activeSection === 'quiz' ? 'block' : 'none' }}><Quiz subjects={subjects} currentUserId={currentUser?.id} /></div>
        <div style={{ display: activeSection === 'notifications' ? 'block' : 'none' }}><Notifications subjects={subjects} currentUser={currentUser} /></div>
        <div style={{ display: activeSection === 'bottest' ? 'block' : 'none' }}><BotTestEditor subjects={subjects} /></div>
        <div style={{ display: activeSection === 'applications' ? 'block' : 'none' }}><Applications /></div>
      </main>
    </div>
  );
}

function AdminPanel() {
  return (
    <AdminDataProvider>
      <AdminPanelContent />
    </AdminDataProvider>
  );
}

export default AdminPanel;