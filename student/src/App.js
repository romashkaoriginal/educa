import React, { useState, useEffect } from 'react';
import './App.css';
import kubikLogo from './assets/kubik-logo-transparent.png';
import StudentApp from './pages/StudentApp';
import GuestSubjectSelect from './pages/GuestSubjectSelect';
import GuestExpired from './pages/GuestExpired';
import AdminGuestPicker from './pages/AdminGuestPicker';

import AdminPanel from './pages/AdminPanel';

import { API_URL } from './config';
import { apiFetch } from './pages/api';

function App() {
  const [selectedRole, setSelectedRole] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [authUser, setAuthUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isTelegramWebApp, setIsTelegramWebApp] = useState(false);
  // Гостевой режим: null | 'select' (выбор предметов) | 'app' (Mini App гостя) | 'expired'
  const [guestMode, setGuestMode] = useState(null);
  const [guestState, setGuestState] = useState(null);

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
        Promise.resolve(tg.disableVerticalSwipes?.()).catch(() => {});

        // --app-height = реальная видимая высота Telegram-вьюпорта.
        // Ставим глобально и рано, чтобы все экраны (выбор предметов, окончание
        // доступа, StudentApp) не уезжали за нижний край и докручивались до конца.
        const applyAppHeight = () => {
          const h = tg.viewportStableHeight || tg.viewportHeight || window.innerHeight;
          if (h) document.documentElement.style.setProperty('--app-height', `${h}px`);
        };
        applyAppHeight();
        tg.onEvent?.('viewportChanged', applyAppHeight);

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

  // Определяем режим гостя по /api/guest/state (ТЗ §10).
  const resolveGuestMode = async () => {
    try {
      const res = await apiFetch(`${API_URL}/guest/state`);
      if (res.ok) {
        const state = await res.json();
        setGuestState(state);

        if (state.isStudent) {
          // На самом деле это ученик — обычный поток
          setUserRole('student');
          setSelectedRole('student');
          setLoading(false);
          return;
        }
        if (state.isGuest) {
          if (state.expired || state.status === 'guest_expired') {
            setGuestMode('expired');
          } else if (!state.subjectsChosen) {
            setGuestMode('select');
          } else {
            setGuestMode('app');
          }
          setUserRole('guest');
          setLoading(false);
          return;
        }
      }
    } catch (error) {
      console.error('Error resolving guest mode:', error);
    }
    // Фолбэк — старое поведение (на случай недоступности guest API)
    setUserRole('student');
    setSelectedRole('student');
    setLoading(false);
  };

  const checkUserRole = async (telegramId) => {
    try {
      // apiFetch добавляет x-telegram-init-data — роут /auth/telegram/:id защищён telegramAuth.
      const response = await apiFetch(`${API_URL}/auth/telegram/${telegramId}`);

      if (response.ok) {
        const data = await response.json();
        const role = data.user?.role;
        setAuthUser(data.user || null);

        if (role === 'admin' || role === 'teacher' || role === 'manager') {
          setUserRole(role);
          setLoading(false);
          apiFetch(`${API_URL}/students`)
            .then((r) => (r.ok ? r.json() : null))
            .then((payload) => {
              if (payload?.students) {
                sessionStorage.setItem('prefetchedStudents', JSON.stringify(payload.students));
              }
            })
            .catch(() => {});
        } else {
          // role === 'student' ИЛИ роль не определена.
          // ВАЖНО: гость — это тоже User с role='student' (isGuest=true), поэтому
          // /auth/telegram отдаёт его как ученика. Нельзя сразу пускать в StudentApp —
          // resolveGuestMode через /guest/state корректно различит гостя и ученика.
          await resolveGuestMode();
        }
      } else {
        // Нет строки User по telegramId — гость (или новый пользователь)
        await resolveGuestMode();
      }
    } catch (error) {
      console.error('Error checking user role:', error);
      await resolveGuestMode();
    }
  };

  if (loading) {
    return (
      <div className="loading-screen">
        <img src={kubikLogo} alt="" className="kubik-loading-logo" />
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
          <img src={kubikLogo} alt="" className="kubik-blocked-logo" />
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

  // ===== Гостевой режим (ТЗ §4, §5, §19) =====
  if (userRole === 'guest') {
    if (guestMode === 'expired') {
      return <GuestExpired />;
    }
    if (guestMode === 'select') {
      return (
        <GuestSubjectSelect
          onDone={() => {
            setGuestState((prev) => (prev ? { ...prev, subjectsChosen: true } : prev));
            setGuestMode('app');
          }}
        />
      );
    }
    if (guestMode === 'app' && guestState?.userId) {
      const guestUser = {
        id: guestState.userId,
        firstName: guestState.firstName || 'Гость',
        lastName: '',
        role: 'student',
        isActive: true,
      };
      return (
        <StudentApp
          initialUser={guestUser}
          isGuest
          applicationSent={guestState.applicationSent}
          onGuestExpired={() => setGuestMode('expired')}
        />
      );
    }
    // guestMode ещё не определён — показываем лоадер
    return (
      <div className="loading-screen">
        <img src={kubikLogo} alt="" className="kubik-loading-logo" />
        <div className="kubik-loader"><div className="kubik-loader-fill"></div></div>
      </div>
    );
  }

  // Если НЕ выбрана роль
  if (!selectedRole) {
    // Автоматически переходим в раздел ученика для студентов
    if (userRole === 'student') {
      return <StudentApp initialUser={authUser} />;
    }

    // Админ/учитель/менеджер - показываем выбор роли
    return (
      <div className="role-selection">
        <div className="role-container">
          <img src={kubikLogo} alt="" className="kubik-role-logo" />
          
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

            {userRole === 'admin' && (
              <button
                className="role-button role-student"
                onClick={() => setSelectedRole('guest-admin')}
              >
                <div className="role-icon">🔍</div>
                <div className="role-info">
                  <h2>Гостевой режим (проверка)</h2>
                  <p>Посмотреть приложение глазами гостя</p>
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
      {selectedRole === 'student' && <StudentApp initialUser={authUser?.role === 'student' ? authUser : null} />}
      {selectedRole === 'admin' && <AdminPanel />}
      {selectedRole === 'guest-admin' && <AdminGuestPicker />}
    </>
  );
}

export default App;