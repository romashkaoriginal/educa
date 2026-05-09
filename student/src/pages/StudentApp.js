import React, { useState, useEffect } from 'react';
import './StudentApp.css';
import Practice from './Practice';
import Homework from './Homework';
import Quiz from './Quiz';

const API_URL = 'https://educa-production-a98e.up.railway.app/api';

function StudentApp() {
  const [activeTab, setActiveTab] = useState('practice');
  const [students, setStudents] = useState([]);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [loading, setLoading] = useState(true);

  const tabs = [
    { id: 'practice', name: 'Практика', icon: '💪', component: Practice },
    { id: 'homework', name: 'Домашка', icon: '📝', component: Homework },
    { id: 'quiz', name: 'Викторина', icon: '🎯', component: Quiz },
  ];

  // Загрузка списка студентов
  useEffect(() => {
    const fetchStudents = async () => {
      try {
        const response = await fetch(`${API_URL}/students`);
        const data = await response.json();
        setStudents(data.students || []);
      } catch (error) {
        console.error('Error fetching students:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchStudents();
  }, []);

  const ActiveComponent = tabs.find(tab => tab.id === activeTab)?.component;

  // Если студент не выбран - показываем список выбора
  if (!selectedStudent) {
    return (
      <div className="student-selection">
        <div className="selection-container">
          <div className="selection-logo">
            <span className="logo-ed">ED</span>
            <span className="logo-me">me</span>
          </div>
          
          <h1 className="selection-title">Выберите ученика</h1>
          <p className="selection-subtitle">Войдите под своим аккаунтом</p>

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
              {students.map(student => (
                <button
                  key={student.id}
                  className="student-select-card"
                  onClick={() => setSelectedStudent(student)}
                >
                  <div className="student-select-avatar">
                    {student.firstName[0]}{student.lastName[0]}
                  </div>
                  <div className="student-select-info">
                    <h3>{student.firstName} {student.lastName}</h3>
                    <p>@{student.telegramUsername || 'no username'}</p>
                  </div>
                  <div className="student-select-arrow">→</div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Если студент выбран - показываем приложение
  return (
    <div className="student-app">
      <header className="header">
        <div className="logo">
          <span className="logo-ed">ED</span>
          <span className="logo-me">me</span>
        </div>
        <div className="user-info">
          <div className="user-avatar" onClick={() => setSelectedStudent(null)}>
            {selectedStudent.firstName[0]}{selectedStudent.lastName[0]}
          </div>
        </div>
      </header>

      <main className="content">
        {ActiveComponent && <ActiveComponent studentId={selectedStudent.id} />}
      </main>

      <nav className="bottom-navigation">
        {tabs.map(tab => (
          <button
            key={tab.id}
            className={`nav-button ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <span className="nav-icon">{tab.icon}</span>
            <span className="nav-text">{tab.name}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}

export default StudentApp;