import React, { useState, useEffect } from 'react';
import './App.css';
import StudentApp from './pages/StudentApp';
import AdminPanel from './pages/AdminPanel';

const API_URL = 'https://educa-production-a98e.up.railway.app/api';

function App() {
  const [selectedRole, setSelectedRole] = useState(null);
  const [userRole, setUserRole] = useState(null); // Роль из БД
  const [loading, setLoading] = useState(true);
  const [isTelegramWebApp, setIsTelegramWebApp] = useState(false);

  useEffect(() => {
    // Ждём инициализации Telegram WebApp SDK
    const checkTelegramWebApp = () => {
      const tg = window.Telegram?.WebApp;
      
      // Проверяем несколько признаков Telegram WebApp
      const isTelegram = !!(
        tg && 
        tg.initData && 
        tg.initDataUnsafe && 
        typeof tg.ready === 'function'
      );

      if (isTelegram) {
        setIsTelegramWebApp(true);
        tg.ready();
        tg.expand();

        const user = tg.initDataUnsafe?.user;
        
        if (user) {
          // Проверяем роль пользователя в БД
          checkUserRole(user.id);
        } else {
          // Нет данных пользователя - доступ только к разделу ученика
          setUserRole('student');
          setSelectedRole('student');
          setLoading(false);
        }
      } else {
        // НЕ в Telegram - блокируем доступ
        setIsTelegramWebApp(false);
        setLoading(false);
      }
    };

    // Проверяем с небольшой задержкой на случай если SDK ещё не загрузился
    if (window.Telegram?.WebApp) {
      checkTelegramWebApp();
    } else {
      // Даём SDK 500ms на загрузку
      setTimeout(() => {
        checkTelegramWebApp();
      }, 500);
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
        
        // Проверяем роль пользователя
        if (role === 'admin' || role === 'teacher' || role === 'manager') {
          // Админ/учитель/менеджер - может выбирать раздел
          setUserRole(role);
          setLoading(false);
        } else {
          // Студент или не найден - только раздел ученика
          setUserRole('student');
          setSelectedRole('student');
          setLoading(false);
        }
      } else {
        // Пользователь не найден в БД - только раздел ученика
        setUserRole('student');
        setSelectedRole('student');
        setLoading(false);
      }
    } catch (error) {
      console.error('Error checking user role:', error);
      // Ошибка - по умолчанию только раздел ученика
      setUserRole('student');
      setSelectedRole('student');
      setLoading(false);
    }
  };

  // Показываем лоадер пока проверяем роль
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
            href="https://t.me/your_bot_username" 
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

            {/* Показываем кнопку админки только для admin/teacher/manager */}
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

  // Отрисовка выбранного раздела
  return (
    <>
      {selectedRole === 'student' && <StudentApp />}
      {selectedRole === 'admin' && <AdminPanel />}
    </>
  );
}

export default App;