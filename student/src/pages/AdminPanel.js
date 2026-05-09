import React, { useState, useEffect } from 'react';
import './AdminPanel.css';

const API_URL = 'https://educa-production-a98e.up.railway.app/api';

function AdminPanel() {
  const [activeSection, setActiveSection] = useState('students');
  const [students, setStudents] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState(null);
  
  const [formData, setFormData] = useState({
    telegramId: '',
    telegramUsername: '',
    firstName: '',
    lastName: '',
    subjectIds: []
  });

  // Загрузка данных
  useEffect(() => {
    if (activeSection === 'students') {
      fetchStudents();
      fetchSubjects();
    }
  }, [activeSection]);

  const fetchStudents = async () => {
    try {
      const response = await fetch(`${API_URL}/students`);
      const data = await response.json();
      setStudents(data.students || []);
    } catch (error) {
      console.error('Error fetching students:', error);
    }
  };

  const fetchSubjects = async () => {
    try {
      const response = await fetch(`${API_URL}/subjects`);
      const data = await response.json();
      setSubjects(data.subjects || []);
    } catch (error) {
      console.error('Error fetching subjects:', error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    try {
      const response = await fetch(`${API_URL}/students`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      if (response.ok) {
        alert('Студент успешно добавлен!');
        setFormData({
          telegramId: '',
          telegramUsername: '',
          firstName: '',
          lastName: '',
          subjectIds: []
        });
        setShowAddForm(false);
        fetchStudents();
      } else {
        const error = await response.json();
        alert(`Ошибка: ${error.message}`);
      }
    } catch (error) {
      console.error('Error creating student:', error);
      alert('Ошибка при создании студента');
    }
  };

  const handleUpdateStudent = async (studentId, updatedData) => {
    try {
      const response = await fetch(`${API_URL}/students/${studentId}/subjects`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subjectIds: updatedData.subjectIds })
      });

      if (response.ok) {
        alert('Данные студента обновлены!');
        fetchStudents();
        setSelectedStudent(null);
      }
    } catch (error) {
      console.error('Error updating student:', error);
    }
  };

  const handleSubjectToggle = (subjectId) => {
    setFormData(prev => ({
      ...prev,
      subjectIds: prev.subjectIds.includes(subjectId)
        ? prev.subjectIds.filter(id => id !== subjectId)
        : [...prev.subjectIds, subjectId]
    }));
  };

  const handleDeleteStudent = async (studentId) => {
    if (!window.confirm('Удалить студента?')) return;

    try {
      const response = await fetch(`${API_URL}/students/${studentId}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        alert('Студент удалён');
        fetchStudents();
        setSelectedStudent(null);
      }
    } catch (error) {
      console.error('Error deleting student:', error);
    }
  };

  // Фильтрация студентов по поиску
  const filteredStudents = students.filter(student => {
    const query = searchQuery.toLowerCase();
    return (
      student.firstName.toLowerCase().includes(query) ||
      student.lastName.toLowerCase().includes(query) ||
      (student.telegramUsername && student.telegramUsername.toLowerCase().includes(query))
    );
  });

  const sections = [
    { id: 'students', name: 'Студенты', icon: '👥' },
    { id: 'practice', name: 'Практика', icon: '💪' },
    { id: 'quiz', name: 'Викторина', icon: '🎯' },
    { id: 'homework', name: 'Дом. задание', icon: '📝' }
  ];

  return (
    <div className="admin-panel">
      {/* Header */}
      <header className="admin-header">
        <div className="logo">
          <span className="logo-ed">ED</span>
          <span className="logo-me">me</span>
        </div>
        <div className="admin-title">Админ-панель</div>
      </header>

      {/* Tabs Navigation */}
      <nav className="admin-tabs">
        {sections.map(section => (
          <button
            key={section.id}
            className={`admin-tab ${activeSection === section.id ? 'active' : ''}`}
            onClick={() => setActiveSection(section.id)}
          >
            <span className="tab-icon">{section.icon}</span>
            <span className="tab-name">{section.name}</span>
          </button>
        ))}
      </nav>
      
      <main className="admin-content">
        {/* РАЗДЕЛ СТУДЕНТЫ */}
        {activeSection === 'students' && (
          <div className="admin-section">
            {!selectedStudent ? (
              <>
                {/* Header с поиском и кнопкой добавления */}
                <div className="section-header">
                  <h2>Студенты ({filteredStudents.length})</h2>
                  <div className="header-actions">
                    <input
                      type="text"
                      className="search-input"
                      placeholder="🔍 Поиск студента..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                    <button 
                      className="add-button"
                      onClick={() => setShowAddForm(!showAddForm)}
                    >
                      {showAddForm ? '✕ Закрыть' : '+ Добавить'}
                    </button>
                  </div>
                </div>

                {/* Форма добавления */}
                {showAddForm && (
                  <form className="add-form" onSubmit={handleSubmit}>
                    <div className="form-row">
                      <input
                        type="number"
                        placeholder="Telegram ID"
                        value={formData.telegramId}
                        onChange={(e) => setFormData({...formData, telegramId: e.target.value})}
                        required
                      />
                      <input
                        type="text"
                        placeholder="@username"
                        value={formData.telegramUsername}
                        onChange={(e) => setFormData({...formData, telegramUsername: e.target.value})}
                      />
                    </div>
                    <div className="form-row">
                      <input
                        type="text"
                        placeholder="Имя"
                        value={formData.firstName}
                        onChange={(e) => setFormData({...formData, firstName: e.target.value})}
                        required
                      />
                      <input
                        type="text"
                        placeholder="Фамилия"
                        value={formData.lastName}
                        onChange={(e) => setFormData({...formData, lastName: e.target.value})}
                        required
                      />
                    </div>

                    <div className="subjects-select">
                      <p>Выберите предметы:</p>
                      <div className="subjects-grid">
                        {subjects.map(subject => (
                          <label key={subject.id} className="subject-checkbox">
                            <input
                              type="checkbox"
                              checked={formData.subjectIds.includes(subject.id)}
                              onChange={() => handleSubjectToggle(subject.id)}
                            />
                            <span>{subject.icon} {subject.name}</span>
                          </label>
                        ))}
                      </div>
                    </div>

                    <button type="submit" className="submit-button">
                      Создать студента
                    </button>
                  </form>
                )}

                {/* Список студентов */}
                <div className="students-grid">
                  {filteredStudents.map(student => (
                    <div 
                      key={student.id} 
                      className="student-card"
                      onClick={() => setSelectedStudent(student)}
                    >
                      <div className="student-avatar">
                        {student.firstName[0]}{student.lastName[0]}
                      </div>
                      <div className="student-info">
                        <h3>{student.firstName} {student.lastName}</h3>
                        <p className="student-username">@{student.telegramUsername || 'no username'}</p>
                        <div className="student-subjects-mini">
                          {student.subjects.slice(0, 3).map(subj => (
                            <span key={subj.id} className="subject-badge">
                              {subj.icon}
                            </span>
                          ))}
                          {student.subjects.length > 3 && (
                            <span className="subject-badge">+{student.subjects.length - 3}</span>
                          )}
                        </div>
                      </div>
                      <div className="student-arrow">→</div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              /* Детальная карточка студента */
              <StudentDetailCard
                student={selectedStudent}
                subjects={subjects}
                onClose={() => setSelectedStudent(null)}
                onUpdate={handleUpdateStudent}
                onDelete={handleDeleteStudent}
              />
            )}
          </div>
        )}

        {/* ДРУГИЕ РАЗДЕЛЫ (заглушки) */}
        {activeSection === 'practice' && (
          <div className="admin-section">
            <h2>Практика</h2>
            <p className="coming-soon">Скоро здесь будет управление практикой</p>
          </div>
        )}

        {activeSection === 'quiz' && (
          <div className="admin-section">
            <h2>Викторина</h2>
            <p className="coming-soon">Скоро здесь будет управление викторинами</p>
          </div>
        )}

        {activeSection === 'homework' && (
          <div className="admin-section">
            <h2>Домашнее задание</h2>
            <p className="coming-soon">Скоро здесь будет управление домашними заданиями</p>
          </div>
        )}
      </main>
    </div>
  );
}

// Компонент детальной карточки студента
function StudentDetailCard({ student, subjects, onClose, onUpdate, onDelete }) {
  const [isEditing, setIsEditing] = useState(false);
  const [selectedSubjects, setSelectedSubjects] = useState(
    student.subjects.map(s => s.id)
  );
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  // Загрузка статистики при открытии карточки
  useEffect(() => {
    const fetchStats = async () => {
      try {
        const response = await fetch(`${API_URL}/stats/students/${student.id}`);
        const data = await response.json();
        setStats(data.stats);
      } catch (error) {
        console.error('Error fetching stats:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, [student.id]);

  const handleSave = () => {
    onUpdate(student.id, { subjectIds: selectedSubjects });
    setIsEditing(false);
  };

  const toggleSubject = (subjectId) => {
    setSelectedSubjects(prev =>
      prev.includes(subjectId)
        ? prev.filter(id => id !== subjectId)
        : [...prev, subjectId]
    );
  };

  return (
    <div className="student-detail">
      <div className="detail-header">
        <button className="back-button" onClick={onClose}>
          ← Назад
        </button>
        <button className="delete-button-small" onClick={() => onDelete(student.id)}>
          🗑️ Удалить
        </button>
      </div>

      <div className="detail-content">
        {/* Основная информация */}
        <div className="detail-card">
          <div className="student-avatar-large">
            {student.firstName[0]}{student.lastName[0]}
          </div>
          <h2>{student.firstName} {student.lastName}</h2>
          <p className="student-username-large">@{student.telegramUsername || 'no username'}</p>
          <p className="student-id">ID: {student.telegramId}</p>
        </div>

        {/* Предметы */}
        <div className="detail-card">
          <div className="card-header">
            <h3>📚 Предметы</h3>
            <button 
              className="edit-button"
              onClick={() => setIsEditing(!isEditing)}
            >
              {isEditing ? '✕ Отмена' : '✏️ Изменить'}
            </button>
          </div>

          {isEditing ? (
            <div className="subjects-edit">
              {subjects.map(subject => (
                <label key={subject.id} className="subject-checkbox">
                  <input
                    type="checkbox"
                    checked={selectedSubjects.includes(subject.id)}
                    onChange={() => toggleSubject(subject.id)}
                  />
                  <span>{subject.icon} {subject.name}</span>
                </label>
              ))}
              <button className="save-button" onClick={handleSave}>
                Сохранить
              </button>
            </div>
          ) : (
            <div className="subjects-list">
              {student.subjects.map(subj => (
                <div key={subj.id} className="subject-item">
                  <span className="subject-icon">{subj.icon}</span>
                  <span>{subj.name}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Статистика */}
        {loading ? (
          <p style={{ textAlign: 'center', color: '#6b7280', padding: '40px' }}>
            Загрузка статистики...
          </p>
        ) : stats ? (
          <div className="stats-grid">
            <div className="stat-card">
              <div className="stat-icon">💪</div>
              <div className="stat-info">
                <h4>Практика</h4>
                <p className="stat-value">{stats.practice.completed} / {stats.practice.total}</p>
                <p className="stat-label">Средний балл: {stats.practice.averageScore}%</p>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon">📝</div>
              <div className="stat-info">
                <h4>Домашка</h4>
                <p className="stat-value">{stats.homework.completed} / {stats.homework.total}</p>
                <p className="stat-label">Средний балл: {stats.homework.averageScore}%</p>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-icon">🎯</div>
              <div className="stat-info">
                <h4>Викторины</h4>
                <p className="stat-value">{stats.quizzes.completed}</p>
                <p className="stat-label">Средний ранг: #{stats.quizzes.averageRank || 'N/A'}</p>
              </div>
            </div>
          </div>
        ) : (
          <p style={{ textAlign: 'center', color: '#ef4444', padding: '40px' }}>
            Ошибка загрузки статистики
          </p>
        )}

        {/* История активности */}
        <div className="detail-card">
          <h3>📊 История активности</h3>
          <p className="coming-soon">Скоро здесь будет детальная история</p>
        </div>
      </div>
    </div>
  );
}

export default AdminPanel;