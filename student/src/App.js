import React, { useState, useEffect } from 'react';
import './App.css';
import StudentApp from './pages/StudentApp';
import AdminPanel from './pages/AdminPanel';

const API_URL = 'https://educa-production-a98e.up.railway.app/api';

function App() {
  const [selectedRole, setSelectedRole] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isTelegramWebApp, setIsTelegramWebApp] = useState(false);

  useEffect(() => {
    const checkTelegramWebApp = () => {
      const tg = window.Telegram?.WebApp;
      
      // Проверяем что действительно в Telegram (не просто наличие SDK)
      const isTelegram = !!(
        tg && 
        typeof tg.ready === 'function' &&
        (tg.initData || tg.platform === 'tdesktop' || tg.platform === 'android' || tg.platform === 'ios')
      );

    if (isTelegram) {
  setIsTelegramWebApp(true);
  tg.ready();
  tg.expand();
  
  tg.BackButton.hide();
  
  if (tg.disableVerticalSwipes) {
    tg.disableVerticalSwipes();
  }

        const user = tg.initDataUnsafe?.user;
        
        if (user && user.id) {
          checkUserRole(user.id);
        } else {
          // Нет user.id - пробуем получить из query параметров
          const urlParams = new URLSearchParams(window.location.search);
          const userId = urlParams.get('user_id');
          
          if (userId) {
            checkUserRole(parseInt(userId));
          } else {
            setUserRole('student');
            setSelectedRole('student');
            setLoading(false);
          }
        }
      } else {
        setIsTelegramWebApp(false);
        setLoading(false);
      }
    };

    if (window.Telegram?.WebApp) {
      checkTelegramWebApp();
    } else {
      setTimeout(checkTelegramWebApp, 500);
    }

    // Загрузка данных дашборда
    fetch(`${API_URL}/admin/dashboard`)
      .then(res => res.json())
      .then(data => {
        sessionStorage.setItem('adminData', JSON.stringify(data));
      })
      .catch(() => {});
  }, []);

  const checkUserRole = async (telegramId) => {
    try {
      const response = await fetch(`${API_URL}/auth/telegram/${telegramId}`);
      
      if (response.ok) {
        const data = await response.json();
        const role = data.user?.role;
        
        if (role === 'admin' || role === 'teacher' || role === 'manager') {
          setUserRole(role);
          setLoading(false);
        } else {
          setUserRole('student');
          setSelectedRole('student');
          setLoading(false);
        }
      } else {
        setUserRole('student');
        setSelectedRole('student');
        setLoading(false);
      }
    } catch (error) {
      console.error('Error checking user role:', error);
      setUserRole('student');
      setSelectedRole('student');
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="role-logo">
          <span className="logo-ed">ED</span>
          <span className="logo-me">me</span>
        </div>
        <div className="loading-spinner"></div>
        <p>Загрузка...</p>
      </div>
    );
  }

  // Если НЕ Telegram WebApp - показываем блокировку
  if (!isTelegramWebApp) {
    return (
      <div className="blocked-screen">
        <div className="blocked-container">
          <div className="role-logo">
            <span className="logo-ed">ED</span>
            <span className="logo-me">me</span>
          </div>
          
          <div className="blocked-icon">🔒</div>
          
          <h1 className="blocked-title">Доступ через Telegram</h1>
          <p className="blocked-description">
            Это приложение работает только внутри Telegram Mini App.<br/>
            Откройте наш бот в Telegram для доступа к платформе.
          </p>

          <a 
            href="https://t.me/educa1488_bot" 
            className="telegram-button"
            target="_blank"
            rel="noopener noreferrer"
          >
            <span className="telegram-icon">✈️</span>
            Открыть в Telegram
          </a>
        </div>
      </div>
    );
  }

  // Если НЕ выбрана роль
  if (!selectedRole) {
    // Автоматически переходим в раздел ученика для студентов
    if (userRole === 'student') {
      return <StudentApp />;
    }

    // Админ/учитель/менеджер - показываем выбор роли
    return (
      <div className="role-selection">
        <div className="role-container">
          <div className="role-logo">
            <span className="logo-ed">ED</span>
            <span className="logo-me">me</span>
          </div>
          
          <h1 className="role-title">Выберите раздел</h1>
          {userRole && userRole !== 'student' && (
            <p className="role-subtitle">Вы вошли как {
              userRole === 'admin' ? 'Администратор' : 
              userRole === 'teacher' ? 'Преподаватель' : 
              'Менеджер'
            }</p>
          )}

          <div className="role-buttons">
            <button 
              className="role-button role-student"
              onClick={() => setSelectedRole('student')}
            >
              <div className="role-icon">👨‍🎓</div>
              <div className="role-info">
                <h2>Раздел ученика</h2>
                <p>Практика, домашки, викторины</p>
              </div>
            </button>

            {userRole && userRole !== 'student' && (
              <button 
                className="role-button role-admin"
                onClick={() => setSelectedRole('admin')}
              >
                <div className="role-icon">👨‍💼</div>
                <div className="role-info">
                  <h2>Администрирование</h2>
                  <p>Управление учениками и контентом</p>
                </div>
              </button>
            )}
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