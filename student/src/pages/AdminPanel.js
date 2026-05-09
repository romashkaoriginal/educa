import React, { useState, useEffect } from 'react';
import './AdminPanel.css';

const API_URL = 'https://educa-production-a98e.up.railway.app/api';

function AdminPanel() {
  const [students, setStudents] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [showAddForm, setShowAddForm] = useState(false);
  
  const [formData, setFormData] = useState({
    telegramId: '',
    telegramUsername: '',
    firstName: '',
    lastName: '',
    subjectIds: []
  });

  // Загрузка данных
  useEffect(() => {
    fetchStudents();
    fetchSubjects();
  }, []);

  const fetchStudents = async () => {
    try {
      const response = await fetch(`${API_URL}/students`);
      const data = await response.json();
      setStudents(data.students);
    } catch (error) {
      console.error('Error fetching students:', error);
    }
  };

  const fetchSubjects = async () => {
    try {
      const response = await fetch(`${API_URL}/subjects`);
      const data = await response.json();
      setSubjects(data.subjects);
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
      }
    } catch (error) {
      console.error('Error deleting student:', error);
    }
  };

  return (
    <div className="admin-panel">
      <header className="admin-header">
        <div className="logo">
          <span className="logo-ed">ED</span>
          <span className="logo-me">me</span>
        </div>
        <div className="admin-title">Админ-панель</div>
      </header>
      
      <main className="admin-content">
        <div className="admin-section">
          <div className="section-header">
            <h2>Студенты</h2>
            <button 
              className="add-button"
              onClick={() => setShowAddForm(!showAddForm)}
            >
              {showAddForm ? '✕ Закрыть' : '+ Добавить студента'}
            </button>
          </div>

          {showAddForm && (
            <form className="add-form" onSubmit={handleSubmit}>
              <input
                type="number"
                placeholder="Telegram ID"
                value={formData.telegramId}
                onChange={(e) => setFormData({...formData, telegramId: e.target.value})}
                required
              />
              <input
                type="text"
                placeholder="Telegram Username (@username)"
                value={formData.telegramUsername}
                onChange={(e) => setFormData({...formData, telegramUsername: e.target.value})}
              />
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

              <div className="subjects-select">
                <p>Выберите предметы:</p>
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

              <button type="submit" className="submit-button">
                Создать студента
              </button>
            </form>
          )}

          <div className="students-list">
            {students.map(student => (
              <div key={student.id} className="student-card">
                <div className="student-info">
                  <h3>{student.firstName} {student.lastName}</h3>
                  <p>@{student.telegramUsername || 'no username'}</p>
                  <div className="student-subjects">
                    {student.subjects.map(subj => (
                      <span key={subj.id} className="subject-tag">
                        {subj.icon} {subj.name}
                      </span>
                    ))}
                  </div>
                </div>
                <button 
                  className="delete-button"
                  onClick={() => handleDeleteStudent(student.id)}
                >
                  🗑️
                </button>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}

export default AdminPanel;