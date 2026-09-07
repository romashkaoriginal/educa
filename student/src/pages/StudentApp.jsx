import React, { useState, useEffect } from 'react';
import './StudentApp.css';
import kubikLogo from '../assets/kubik-logo-transparent.png';
import Practice from './Practice';
import Homework from './Homework';
import Lesson from './Lesson';
import Statistics from './Statistics';
import LockedSectionModal from '../components/LockedSectionModal';
import { DataProvider, useData } from './DataContext';
import { apiFetch } from './api';

import { API_URL } from '../config';
import StudentPicker from './StudentPicker';

function getLinkedLessonId() {
  const value = new URLSearchParams(window.location.search).get('lessonId');
  const lessonId = Number(value);
  return Number.isInteger(lessonId) && lessonId > 0 ? lessonId : null;
}

export function StudentAppContent({ selectedStudent, isGuest = false, applicationSent = false, onChangeStudent }) {
  const [linkedLessonId] = useState(getLinkedLessonId);
  const [activeTab, setActiveTab] = useState(linkedLessonId && !isGuest ? 'lesson' : 'practice');
  const [lessonEntryRequest, setLessonEntryRequest] = useState(linkedLessonId && !isGuest
    ? { lessonId: linkedLessonId, nonce: 1 }
    : null);
  const [appSent, setAppSent] = useState(applicationSent);
  // Модалка закрытого раздела для гостя: { context, source } | null
  const [lockedModal, setLockedModal] = useState(null);
  const {
    subjects,
    preloadAllData, loadStreak, refreshDashboard,
    requestPracticeHome, requestHomeworkHome,
    lessonNotice, dismissLessonNotice,
  } = useData();

  // Грузим данные один раз при монтировании — без ожидания, сразу показываем UI
  useEffect(() => {
    preloadAllData();
  }, []); // eslint-disable-line

  // Таб практики переключается внутри самого компонента Practice после запуска теста,
  // чтобы список практики не мелькал перед оверлеем теста.

  // Глобально включаем подтверждение закрытия — всегда, для всех разделов
  useEffect(() => {
    const tg = window.Telegram?.WebApp;

    // Высота приложения = реальная видимая высота Telegram-вьюпорта.
    // В Telegram 100vh/100dvh бывает больше viewportStableHeight (своя шапка/жесты),
    // из-за чего низ приложения уходит за экран и последний ряд (напр. 3-я карточка
    // предмета) обрезается под нижней панелью. Привязываемся к реальной высоте.
    const applyViewportHeight = () => {
      const h = tg?.viewportStableHeight || tg?.viewportHeight || window.innerHeight;
      if (h) document.documentElement.style.setProperty('--app-height', `${h}px`);
    };
    applyViewportHeight();
    tg?.onEvent?.('viewportChanged', applyViewportHeight);
    window.addEventListener('resize', applyViewportHeight);

    if (tg) {
      Promise.resolve(tg.enableClosingConfirmation?.()).catch(() => {});
      Promise.resolve(tg.disableVerticalSwipes?.()).catch(() => {});
    }
    return () => {
      tg?.disableClosingConfirmation?.();
      tg?.offEvent?.('viewportChanged', applyViewportHeight);
      window.removeEventListener('resize', applyViewportHeight);
    };
  }, []);

  const [prevTab, setPrevTab] = useState(null);
  const [animating, setAnimating] = useState(false);

  // ТЗ §1: «Домашка» стоит перед «Занятием».
  const tabOrder = ['practice', 'homework', 'lesson', 'stats'];

  // Для гостя Домашка и Занятие закрыты.
  const LOCKED_FOR_GUEST = { homework: 'locked_homework', lesson: 'locked_lesson' };

  const handleTabChange = (tabId, { force = false } = {}) => {
    if (animating && !force) {
      return;
    }
    // Гость нажал на закрытый раздел — показываем модалку, таб не меняем
    if (isGuest && LOCKED_FOR_GUEST[tabId]) {
      setLockedModal({
        context: LOCKED_FOR_GUEST[tabId],
        source: 'TG Mini App — закрытый раздел',
      });
      return;
    }
    if (tabId === activeTab) {
      if (tabId === 'practice') {
        loadStreak();
        requestPracticeHome();
      } else if (tabId === 'homework') {
        requestHomeworkHome();
      }
      return;
    }
    if (tabId === 'practice') {
      loadStreak();
    }
    if (tabId === 'stats') {
      refreshDashboard();
    }
    setPrevTab(activeTab);
    setAnimating(true);
    setActiveTab(tabId);
    setTimeout(() => {
      setPrevTab(null);
      setAnimating(false);
    }, 320);
  };

  const getDirection = (from, to) => {
    return tabOrder.indexOf(to) > tabOrder.indexOf(from) ? 'forward' : 'backward';
  };

  const handlePracticeClose = ({ returnToStats } = {}) => {
    if (returnToStats) {
      handleTabChange('stats');
    }
  };

  const tabs = [
    { id: 'practice', name: 'Практика', icon: '💪' },
    { id: 'homework', name: 'Домашка', icon: '📝', locked: isGuest },
    { id: 'lesson', name: 'Занятие', icon: '🎓', locked: isGuest },
    { id: 'stats', name: 'Статистика', icon: '📊' },
  ];

  const guestSubjectNames = isGuest ? (subjects || []).map((s) => s.name) : [];

  return (
    <div className="student-app">
      {onChangeStudent && <div className="student-preview-bar"><button type="button" onClick={onChangeStudent}>← Все ученики</button><span>{selectedStudent.telegramUsername ? `@${selectedStudent.telegramUsername}` : selectedStudent.firstName}</span></div>}
      <main className="content">
        <div className="tab-viewport">
          {[
            { id: 'practice', el: <Practice studentId={selectedStudent.id} isTabActive={activeTab === 'practice'} onClose={handlePracticeClose} onActivate={() => setActiveTab('practice')} /> },
            { id: 'homework', el: isGuest ? null : <Homework studentId={selectedStudent.id} /> },
            { id: 'lesson', el: isGuest ? null : <Lesson studentId={selectedStudent.id} isTabActive={activeTab === 'lesson'} entryRequest={lessonEntryRequest} /> },
            { id: 'stats', el: <Statistics studentId={selectedStudent.id} isGuest={isGuest} onLockedClick={() => setLockedModal({ context: 'locked_statistics_homework', source: 'TG Mini App — закрытый раздел' })} /> },
          ].map(({ id, el }) => {
            const isActive = id === activeTab;
            const isPrev = id === prevTab;
            // Practice держим смонтированным всегда, чтобы активный тест не прерывался
            // при уходе на другой таб — он просто прячется через .tab-hidden.
            if (!el) return null;
            const keepMounted = id === 'practice' || (id === 'lesson' && !isGuest);
            if (!isActive && !isPrev && !keepMounted) return null;
            const dir = prevTab ? getDirection(prevTab, activeTab) : 'forward';
            let cls = 'tab-panel';
            if (isActive && animating) cls += ` tab-enter-${dir}`;
            else if (isActive) cls += ' tab-visible';
            else if (isPrev && animating) cls += ` tab-exit-${dir}`;
            else cls += ' tab-hidden';
            return (
              <div key={id} className={cls}>
                {el}
              </div>
            );
          })}
        </div>
      </main>

      {lessonNotice?.type === 'started' && activeTab !== 'lesson' && (
        <button
          type="button"
          className="lesson-global-notice"
          onClick={() => {
            setLessonEntryRequest((request) => ({
              lessonId: lessonNotice.lesson?.id,
              nonce: (request?.nonce || 0) + 1
            }));
            dismissLessonNotice();
            handleTabChange('lesson', { force: true });
          }}
        >
          <span className="lesson-global-notice__dot" aria-hidden="true" />
          <span><strong>Занятие началось</strong><small>Перейти в занятие</small></span>
          <span aria-hidden="true">→</span>
        </button>
      )}

      <nav className="bottom-navigation">
        {tabs.map(tab => (
          <button
            key={tab.id}
            className={`nav-button ${activeTab === tab.id ? 'active' : ''} ${tab.locked ? 'nav-button--locked' : ''}`}
            onClick={() => handleTabChange(tab.id)}
          >
            <span className="nav-icon">
              {tab.icon}
              {tab.locked && <span className="nav-lock">🔒</span>}
            </span>
            <span className="nav-text">{tab.name}</span>
          </button>
        ))}
      </nav>

      {isGuest && (
        <LockedSectionModal
          open={!!lockedModal}
          onClose={() => setLockedModal(null)}
          source={lockedModal?.source}
          context={lockedModal?.context}
          selectedSubjects={guestSubjectNames}
          applicationSent={appSent}
          onApplicationSent={() => setAppSent(true)}
        />
      )}
    </div>
  );
}

function StudentApp({ initialUser = null, isGuest = false, applicationSent = false }) {
  const initialStudent = initialUser?.role === 'student' && initialUser?.isActive !== false
    ? initialUser
    : null;
  const [selectedStudent, setSelectedStudent] = useState(initialStudent);
  const [viewerRole, setViewerRole] = useState(initialUser?.role || null);
  const [loading, setLoading] = useState(!initialUser);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const canChooseStudent = ['superadmin', 'admin', 'manager'].includes(viewerRole);

  useEffect(() => {
    if (initialUser || isGuest) return;
    const controller = new AbortController();
    setLoading(true);
    setError('');
    (async () => {
      try {
        const telegramId = window.Telegram?.WebApp?.initDataUnsafe?.user?.id;
        if (!telegramId) throw new Error('Откройте приложение через Telegram.');
        const response = await apiFetch(API_URL + '/auth/telegram/' + telegramId, { signal: controller.signal });
        if (!response.ok) throw new Error('Не удалось определить аккаунт. Попробуйте ещё раз.');
        const { user } = await response.json();
        if (!user) throw new Error('Аккаунт не найден. Обратитесь к преподавателю.');
        if (controller.signal.aborted) return;
        setViewerRole(user.role);
        if (user.role === 'student' && user.isActive !== false) setSelectedStudent(user);
      } catch (e) {
        if (!controller.signal.aborted) setError(e.message);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [initialUser, isGuest, revision]);

  if (!selectedStudent) {
    if (canChooseStudent) return <StudentPicker onSelect={setSelectedStudent} />;
    return <div className="student-picker"><div className="student-picker__shell"><div className="student-picker__empty" role={error ? 'alert' : 'status'}>
      {loading ? 'Загружаем аккаунт…' : error || 'Вход в раздел ученика недоступен для этого аккаунта.'}
      {error && <button type="button" onClick={() => setRevision(value => value + 1)}>Повторить</button>}
    </div></div></div>;
  }

  return (
    <DataProvider key={selectedStudent.id} studentId={selectedStudent.id} isGuest={isGuest}>
      <StudentAppContent
        selectedStudent={selectedStudent}
        isGuest={isGuest}
        applicationSent={applicationSent}
        onChangeStudent={canChooseStudent ? () => setSelectedStudent(null) : undefined}
      />
    </DataProvider>
  );
}

export default StudentApp;
