import React, { useState, useEffect } from 'react';
import './StudentApp.css';
import Practice from './Practice';
import Homework from './Homework';
import Quiz from './Quiz';
import Statistics from './Statistics';
import { DataProvider, useData } from './DataContext';
import { apiFetch } from './api';

const API_URL = 'https://educa-production-a98e.up.railway.app/api';

function StudentAppContent({ selectedStudent }) {
  const [activeTab, setActiveTab] = useState('practice');
  const { preloadAllData } = useData();

  // Грузим данные один раз при монтировании — без ожидания, сразу показываем UI
  useEffect(() => {
    preloadAllData();
  }, []); // eslint-disable-line

  const handleTabChange = (tabId) => {
    setActiveTab(tabId);
  };

  const tabs = [
    { id: 'practice', name: 'Практика', icon: '💪', component: Practice },
    { id: 'homework', name: 'Домашка', icon: '📝', component: Homework },
    { id: 'quiz', name: 'Викторина', icon: '🎯', component: Quiz },
    { id: 'stats', name: 'Статистика', icon: '📊', component: Statistics },
  ];

  const ActiveComponent = tabs.find(tab => tab.id === activeTab)?.component;

  return (
    <div className="student-app">
      <main className="content">
        {ActiveComponent && <ActiveComponent studentId={selectedStudent.id} />}
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

function StudentApp() {
  const [students, setStudents] = useState([]);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStudents = async () => {
      try {
        // Берём из prefetch кэша если уже загружено фоново в App.js
        const cached = sessionStorage.getItem('prefetchedStudents');
        let allStudents;
        if (cached) {
          allStudents = JSON.parse(cached);
          setStudents(allStudents);
          sessionStorage.removeItem('prefetchedStudents');
        } else {
          const response = await apiFetch(`${API_URL}/students`);
          const data = await response.json();
          allStudents = data.students || [];
          setStudents(allStudents);
        }

        const telegramId = window.Telegram?.WebApp?.initDataUnsafe?.user?.id;
        if (telegramId) {
          const now = new Date();
          const matched = allStudents.find(s =>
            s.telegramId && String(s.telegramId) === String(telegramId) &&
            s.isActive &&
            s.subjects?.some(sub => {
              const end = sub.UserSubject?.accessEndDate;
              return !end || new Date(end) > now;
            })
          );
          if (matched) {
            setSelectedStudent(matched);
          }
        }
      } catch (error) {
        console.error('Error fetching students:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchStudents();
  }, []);

  if (!selectedStudent) {
    return (
      <div className="student-selection">
        <div className="selection-container">
          <div className="selection-logo">
            <span className="logo-ed">ED</span>
            <span className="logo-me">me</span>
          </div>
          
          <h1 className="selection-title">Выберите ученика</h1>
          <p className="selection-subtitle"></p>

          {loading ? (
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