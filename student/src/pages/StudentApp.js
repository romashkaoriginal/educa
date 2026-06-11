import React, { useState, useEffect } from 'react';
import './StudentApp.css';
import kubikLogo from '../assets/kubik-logo-transparent.png';
import Practice from './Practice';
import Homework from './Homework';
import Quiz from './Quiz';
import Statistics from './Statistics';
import { DataProvider, useData } from './DataContext';
import { apiFetch } from './api';

import { API_URL } from '../config';

function StudentAppContent({ selectedStudent }) {
  const [activeTab, setActiveTab] = useState('practice');
  const { preloadAllData, loadStreak } = useData();

  // Грузим данные один раз при монтировании — без ожидания, сразу показываем UI
  useEffect(() => {
    preloadAllData();
  }, []); // eslint-disable-line

  // Глобально включаем подтверждение закрытия — всегда, для всех разделов
  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (tg) {
      Promise.resolve(tg.enableClosingConfirmation?.()).catch(() => {});
      Promise.resolve(tg.disableVerticalSwipes?.()).catch(() => {});
    }
    return () => {
      tg?.disableClosingConfirmation?.();
    };
  }, []);

  const [prevTab, setPrevTab] = useState(null);
  const [animating, setAnimating] = useState(false);

  const tabOrder = ['practice', 'homework', 'quiz', 'stats'];

  const handleTabChange = (tabId) => {
    if (tabId === activeTab || animating) return;
    if (tabId === 'practice') {
      loadStreak();
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

  const tabs = [
    { id: 'practice', name: 'Практика', icon: '💪' },
    { id: 'homework', name: 'Домашка', icon: '📝' },
    { id: 'quiz', name: 'Викторина', icon: '🎯' },
    { id: 'stats', name: 'Статистика', icon: '📊' },
  ];

  return (
    <div className="student-app">
      <main className="content">
        <div className="tab-viewport">
          {[
            { id: 'practice', el: <Practice studentId={selectedStudent.id} /> },
            { id: 'homework', el: <Homework studentId={selectedStudent.id} /> },
            { id: 'quiz', el: <Quiz studentId={selectedStudent.id} /> },
            { id: 'stats', el: <Statistics studentId={selectedStudent.id} /> },
          ].map(({ id, el }) => {
            const isActive = id === activeTab;
            const isPrev = id === prevTab;
            if (!isActive && !isPrev) return null;
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

      <nav className="bottom-navigation">
        {tabs.map(tab => (
          <button
            key={tab.id}
            className={`nav-button ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => handleTabChange(tab.id)}
          >
            <span className="nav-icon">{tab.icon}</span>
            <span className="nav-text">{tab.name}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}

function StudentApp({ initialUser = null }) {
  const initialStudent = initialUser?.role === 'student' && initialUser?.isActive !== false
    ? initialUser
    : null;
  const [students, setStudents] = useState([]);
  const [selectedStudent, setSelectedStudent] = useState(initialStudent);
  const [loading, setLoading] = useState(!initialStudent);

  useEffect(() => {
    if (initialStudent) return;

    const resolveStudent = async () => {
      try {
        const tgUser = window.Telegram?.WebApp?.initDataUnsafe?.user;
        if (tgUser?.id) {
          const tgResponse = await apiFetch(`${API_URL}/auth/telegram/${tgUser.id}`);
          if (tgResponse.ok) {
            const tgData = await tgResponse.json();
            if (tgData.user?.role === 'student' && tgData.user?.isActive !== false) {
              setSelectedStudent(tgData.user);
              return;
            }
          }
        }

        const cached = sessionStorage.getItem('prefetchedStudents');
        if (cached) {
          setStudents(JSON.parse(cached));
          sessionStorage.removeItem('prefetchedStudents');
        }
      } catch (error) {
        console.error('Error resolving student:', error);
      } finally {
        setLoading(false);
      }
    };

    resolveStudent();
  }, [initialStudent]);

  if (!selectedStudent) {
    // Пока грузим — не показываем ничего чтобы не было flash экрана выбора
    if (loading) return (
      <div className="loading-screen">
        <img src={kubikLogo} alt="" className="kubik-loading-logo" />
        <div className="kubik-loader">
          <div className="kubik-loader-fill"></div>
        </div>
      </div>
    );

    return (
      <div className="student-selection">
        <div className="selection-container">
          <img src={kubikLogo} alt="" className="kubik-selection-logo" />

          <h1 className="selection-title">Выберите ученика</h1>
          <p className="selection-subtitle"></p>

          {students.length === 0 && (
            <p className="selection-empty-hint">
              Аккаунт не найден. Откройте бота и пройдите регистрацию, либо обратитесь к преподавателю.
            </p>
          )}

          {false ? (
            <div className="students-loading">
              {[1, 2, 3].map(i => (
                <div key={i} className="student-select-card skeleton">
                  <div className="skeleton-avatar"></div>
                  <div className="skeleton-info">
                    <div className="skeleton-line"></div>
                    <div className="skeleton-line short"></div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="students-select-list">
              {students
                .filter(student => {
                  if (!student.isActive) return false;
                  const now = new Date();
                  return student.subjects?.some(s => {
                    const end = s.UserSubject?.accessEndDate;
                    return !end || new Date(end) > now;
                  });
                })
                .map(student => (
                  <button
                    key={student.id}
                    className="student-select-card"
                    onClick={() => setSelectedStudent(student)}
                  >
                    <div className="student-select-avatar">
                      {student.firstName?.[0]}{student.lastName?.[0]}
                    </div>
                    <div className="student-select-info">
                      <h3>{student.firstName} {student.lastName}</h3>
                      <p>@{student.telegramUsername || 'no username'}</p>
                    </div>
                    <div className="student-select-arrow">→</div>
                  </button>
                ))
              }
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <DataProvider studentId={selectedStudent.id}>
      <StudentAppContent selectedStudent={selectedStudent} />
    </DataProvider>
  );
}

export default StudentApp;