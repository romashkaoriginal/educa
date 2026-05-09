import React, { useState } from 'react';
import './StudentApp.css';
import Practice from '../components/student/Practice';
import Homework from '../components/student/Homework';
import Quiz from '../components/student/Quiz';

function StudentApp() {
  const [activeTab, setActiveTab] = useState('practice');

  const tabs = [
    { id: 'practice', name: 'Практика', icon: '💪', component: Practice },
    { id: 'homework', name: 'Домашка', icon: '📝', component: Homework },
    { id: 'quiz', name: 'Викторина', icon: '🎯', component: Quiz },
  ];

  const ActiveComponent = tabs.find(tab => tab.id === activeTab)?.component;

  return (
    <div className="student-app">
      {/* Header */}
      <header className="header">
        <div className="logo">
          <span className="logo-ed">ED</span>
          <span className="logo-me">me</span>
        </div>
        <div className="user-info">
          <div className="user-avatar">👤</div>
        </div>
      </header>

      {/* Content */}
      <main className="content">
        {ActiveComponent && <ActiveComponent />}
      </main>

      {/* Bottom Navigation */}
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