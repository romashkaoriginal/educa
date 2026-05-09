import React, { useState } from 'react';
import './App.css';
import Quiz from './components/Quiz';
import Homework from './components/Homework';
import Practice from './components/Practice';

function App() {
  const [activeTab, setActiveTab] = useState('quiz');

  const tabs = [
    { id: 'quiz', name: 'Викторина', icon: '🎯', component: Quiz },
    { id: 'homework', name: 'Домашка', icon: '📝', component: Homework },
    { id: 'practice', name: 'Практика', icon: '💪', component: Practice },
  ];

  const ActiveComponent = tabs.find(tab => tab.id === activeTab)?.component;

  return (
    <div className="app">
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

      {/* Navigation */}
      <nav className="navigation">
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

      {/* Content */}
      <main className="content">
        {ActiveComponent && <ActiveComponent />}
      </main>
    </div>
  );
}

export default App;