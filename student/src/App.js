import React, { useState, useEffect } from 'react';
import './App.css';
import kubikLogo from './assets/kubik-logo-transparent.png';
import kubikIcon from './assets/kubik-icon.png';
import StudentApp from './pages/StudentApp';

import AdminPanel from './pages/AdminPanel';

import { API_URL } from './config';

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
        
        // Скрываем кнопку "назад"
        tg.BackButton.hide();
        
        // ОТКЛЮЧАЕМ вертикальные свайпы чтобы не закрывалась
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
        // Дополнительная проверка для десктопного Telegram
        const isDesktopTelegram = /Telegram/i.test(navigator.userAgent);
        if (isDesktopTelegram) {
          setIsTelegramWebApp(true);
          // На десктопе user может прийти по-другому, пробуем URL
          const urlParams = new URLSearchParams(window.location.search);
          const userId = urlParams.get('user_id');
          if (userId) {
            checkUserRole(parseInt(userId));
          } else {
            setUserRole('student');
            setSelectedRole('student');
            setLoading(false);
          }
        } else {
          setIsTelegramWebApp(false);
          setLoading(false);
        }
      }
    };

    if (window.Telegram?.WebApp) {
      checkTelegramWebApp();
    } else {
      // Небольшая задержка на случай поздней инициализации
      setTimeout(checkTelegramWebApp, 500);
    }

    // dashboard загружается в AdminPanel
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
          // Prefetch студентов фоново пока показывается экран выбора роли
          fetch(`${API_URL}/students`).then(r => r.json()).then(data => {
            if (data.students) sessionStorage.setItem('prefetchedStudents', JSON.stringify(data.students));
          }).catch(() => {});
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
        <img src={kubikLogo} alt="KUBIK" className="kubik-loading-logo" />
        <div className="kubik-loader">
          <div className="kubik-loader-fill"></div>
        </div>
      </div>
    );
  }

  // ✅ ИСПОЛЬЗУЕМ СУЩЕСТВУЮЩИЙ СТЕЙТ, А НЕ СОЗДАЁМ НОВУЮ КОНСТАНТУ
  if (!isTelegramWebApp) {
    return (
      <div className="blocked-screen">
        <div className="blocked-container">
          <img src={kubikIcon} alt="KUBIK" className="kubik-blocked-logo" />
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
          <img src={kubikLogo} alt="KUBIK" className="kubik-role-logo" />
          
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