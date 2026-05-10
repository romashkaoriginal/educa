import React, { useState, useEffect } from 'react';
import '../../styles/Students.css';

const API_URL = 'https://educa-production-a98e.up.railway.app/api';

function Students({ subjects }) {
  const [students, setStudents] = useState([]);
  const [botUsers, setBotUsers] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [botUsersSearchQuery, setBotUsersSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingBotUsers, setLoadingBotUsers] = useState(false);
  
  // Модалки
  const [showAddModal, setShowAddModal] = useState(false);
  const [addMode, setAddMode] = useState('bot'); // 'bot' или 'manual'
  
  // Выбранный студент для детального просмотра
  const [selectedStudent, setSelectedStudent] = useState(null);
  
  // Сортировка и фильтры для пользователей бота
  const [botUsersSortBy, setBotUsersSortBy] = useState('firstInteractionAt');
  const [botUsersSortOrder, setBotUsersSortOrder] = useState('DESC');
  const [botUsersFilter, setBotUsersFilter] = useState('unassigned'); // all | assigned | unassigned
  
  // Выбранный пользователь бота для назначения студентом
  const [selectedBotUser, setSelectedBotUser] = useState(null);
  
  // Форма добавления студента
  const [formData, setFormData] = useState({
    telegramId: '',
    telegramUsername: '',
    firstName: '',
    lastName: '',
    subjectIds: [],
    accessStartDate: new Date().toISOString().split('T')[0],
    accessEndDate: '',
    subjectAccessDates: {}
  });

  useEffect(() => {
    loadStudents();
  }, []);

  const loadStudents = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/students`);
      const data = await response.json();
      setStudents(data.students || []);
    } catch (error) {
      console.error('Error loading students:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadBotUsers = async () => {
    setLoadingBotUsers(true);
    try {
      const response = await fetch(
        `${API_URL}/bot-users?sortBy=${botUsersSortBy}&order=${botUsersSortOrder}&filter=${botUsersFilter}`
      );
      const data = await response.json();
      setBotUsers(data.botUsers || []);
    } catch (error) {
      console.error('Error loading bot users:', error);
    } finally {
      setLoadingBotUsers(false);
    }
  };

  // Загрузка пользователей бота при открытии модалки
  useEffect(() => {
    if (showAddModal && addMode === 'bot') {
      loadBotUsers();
    }
  }, [showAddModal, addMode, botUsersSortBy, botUsersSortOrder, botUsersFilter]);

  const handleOpenAddModal = () => {
    setShowAddModal(true);
    setAddMode('bot');
    setSelectedBotUser(null);
    resetForm();
  };

  const resetForm = () => {
    setFormData({
      telegramId: '',
      telegramUsername: '',
      firstName: '',
      lastName: '',
      subjectIds: [],
      accessStartDate: new Date().toISOString().split('T')[0],
      accessEndDate: '',
      subjectAccessDates: {}
    });
  };

  const handleSelectBotUser = (botUser) => {
    setSelectedBotUser(botUser);
    setFormData({
      ...formData,
      telegramId: botUser.telegramId.toString(),
      telegramUsername: botUser.telegramUsername || '',
      firstName: botUser.firstName || '',
      lastName: botUser.lastName || ''
    });
  };

  const handleSubjectToggle = (subjectId) => {
    setFormData(prev => ({
      ...prev,
      subjectIds: prev.subjectIds.includes(subjectId)
        ? prev.subjectIds.filter(id => id !== subjectId)
        : [...prev.subjectIds, subjectId]
    }));
  };

  const handleCreateStudent = async (e) => {
    e.preventDefault();
    
    try {
      const response = await fetch(`${API_URL}/students`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      if (response.ok) {
        setShowAddModal(false);
        resetForm();
        setSelectedBotUser(null);
        await loadStudents();
        
        // Обновляем список пользователей бота если был режим выбора
        if (addMode === 'bot') {
          await loadBotUsers();
        }
      } else {
        const error = await response.json();
        alert(`Ошибка: ${error.message}`);
      }
    } catch (error) {
      console.error('Error creating student:', error);
      alert('Ошибка при создании студента');
    }
  };

  const handleDeleteStudent = async (studentId) => {
    if (!window.confirm('Вы уверены, что хотите удалить этого студента?')) {
      return;
    }

    try {
      const response = await fetch(`${API_URL}/students/${studentId}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        setSelectedStudent(null);
        await loadStudents();
      }
    } catch (error) {
      console.error('Error deleting student:', error);
    }
  };

  const filteredStudents = students.filter(student => {
    const query = searchQuery.toLowerCase();
    return (
      student.firstName?.toLowerCase().includes(query) ||
      student.lastName?.toLowerCase().includes(query) ||
      student.telegramUsername?.toLowerCase().includes(query) ||
      student.telegramId?.toString().includes(query)
    );
  });

  const filteredBotUsers = botUsers.filter(user => {
    const query = botUsersSearchQuery.toLowerCase();
    return (
      user.firstName?.toLowerCase().includes(query) ||
      user.lastName?.toLowerCase().includes(query) ||
      user.telegramUsername?.toLowerCase().includes(query) ||
      user.telegramId?.toString().includes(query)
    );
  });

  if (selectedStudent) {
    return (
      <StudentDetail 
        student={selectedStudent}
        subjects={subjects}
        onClose={() => setSelectedStudent(null)}
        onUpdate={loadStudents}
        onDelete={handleDeleteStudent}
      />
    );
  }

  return (
    <div className="students-section">
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
          <button className="add-button" onClick={handleOpenAddModal}>
            + Добавить студента
          </button>
        </div>
      </div>

      {loading ? (
        <div className="students-grid">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="student-card skeleton">
              <div className="skeleton-avatar"></div>
              <div className="skeleton-info">
                <div className="skeleton-line"></div>
                <div className="skeleton-line short"></div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="students-grid">
          {filteredStudents.map(student => (
            <div 
              key={student.id} 
              className="student-card"
              onClick={() => setSelectedStudent(student)}
            >
              <div className="student-avatar">
                {student.firstName?.[0]}{student.lastName?.[0]}
              </div>
              <div className="student-info">
                <h3>{student.firstName} {student.lastName}</h3>
                <p className="student-username">@{student.telegramUsername || 'no username'}</p>
                <div className="student-meta">
                  <span className={`status-badge ${student.isActive ? 'active' : 'inactive'}`}>
                    {student.isActive ? '✓ Активен' : '✕ Неактивен'}
                  </span>
                  {student.accessEndDate && (
                    <span className="access-date">
                      До {new Date(student.accessEndDate).toLocaleDateString('ru-RU')}
                    </span>
                  )}
                </div>
                <div className="student-subjects-mini">
                  {student.subjects?.slice(0, 3).map(subj => (
                    <span key={subj.id} className="subject-badge">
                      {subj.icon}
                    </span>
                  ))}
                  {student.subjects?.length > 3 && (
                    <span className="subject-badge">+{student.subjects.length - 3}</span>
                  )}
                </div>
              </div>
              <div className="student-arrow">→</div>
            </div>
          ))}
        </div>
      )}

      {/* Модалка добавления студента */}
      {showAddModal && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Добавить студента</h2>
              <button className="modal-close" onClick={() => setShowAddModal(false)}>✕</button>
            </div>

            <div className="add-mode-tabs">
              <button 
                className={`mode-tab ${addMode === 'bot' ? 'active' : ''}`}
                onClick={() => setAddMode('bot')}
              >
                🤖 Выбрать из пользователей бота
              </button>
              <button 
                className={`mode-tab ${addMode === 'manual' ? 'active' : ''}`}
                onClick={() => setAddMode('manual')}
              >
                ✏️ Добавить вручную
              </button>
            </div>

            {addMode === 'bot' ? (
              <div className="bot-users-container">
                <div className="bot-users-controls">
                  <input
                    type="text"
                    className="search-input"
                    placeholder="🔍 Поиск..."
                    value={botUsersSearchQuery}
                    onChange={(e) => setBotUsersSearchQuery(e.target.value)}
                  />
                  
                  <div className="filter-controls">
                    <select 
                      value={botUsersFilter} 
                      onChange={(e) => setBotUsersFilter(e.target.value)}
                      className="filter-select"
                    >
                      <option value="all">Все пользователи</option>
                      <option value="unassigned">Не назначены</option>
                      <option value="assigned">Уже назначены</option>
                    </select>

                    <select 
                      value={botUsersSortBy} 
                      onChange={(e) => setBotUsersSortBy(e.target.value)}
                      className="filter-select"
                    >
                      <option value="firstInteractionAt">По дате первого контакта</option>
                      <option value="lastInteractionAt">По последней активности</option>
                      <option value="messageCount">По кол-ву сообщений</option>
                    </select>

                    <button 
                      className="sort-order-btn"
                      onClick={() => setBotUsersSortOrder(prev => prev === 'DESC' ? 'ASC' : 'DESC')}
                    >
                      {botUsersSortOrder === 'DESC' ? '↓' : '↑'}
                    </button>
                  </div>
                </div>

                {loadingBotUsers ? (
                  <div className="loading-state">Загрузка...</div>
                ) : (
                  <div className="bot-users-table">
                    {filteredBotUsers.map(user => (
                      <div 
                        key={user.id}
                        className={`bot-user-row ${selectedBotUser?.id === user.id ? 'selected' : ''} ${user.isAssigned ? 'assigned' : ''}`}
                        onClick={() => !user.isAssigned && handleSelectBotUser(user)}
                      >
                        <div className="bot-user-avatar">
                          {user.firstName?.[0]}{user.lastName?.[0]}
                        </div>
                        <div className="bot-user-info">
                          <h4>{user.firstName} {user.lastName}</h4>
                          <p>@{user.telegramUsername || 'no username'} • ID: {user.telegramId}</p>
                          <div className="bot-user-meta">
                            <span>📅 {new Date(user.firstInteractionAt).toLocaleDateString('ru-RU')}</span>
                            <span>💬 {user.messageCount} сообщ.</span>
                            {user.isAssigned && <span className="assigned-badge">✓ Уже назначен</span>}
                          </div>
                        </div>
                        {selectedBotUser?.id === user.id && (
                          <div className="selected-checkmark">✓</div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {selectedBotUser && (
                  <div className="selected-user-notice">
                    ✓ Выбран: <strong>{selectedBotUser.firstName} {selectedBotUser.lastName}</strong>
                  </div>
                )}
              </div>
            ) : (
              <div className="manual-form">
                <div className="form-row">
                  <input
                    type="number"
                    placeholder="Telegram ID *"
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
                    placeholder="Имя *"
                    value={formData.firstName}
                    onChange={(e) => setFormData({...formData, firstName: e.target.value})}
                    required
                  />
                  <input
                    type="text"
                    placeholder="Фамилия *"
                    value={formData.lastName}
                    onChange={(e) => setFormData({...formData, lastName: e.target.value})}
                    required
                  />
                </div>
              </div>
            )}

            {/* Форма назначения предметов и дат (общая для обоих режимов) */}
            {(selectedBotUser || addMode === 'manual') && (
              <form onSubmit={handleCreateStudent} className="assignment-form">
                <div className="form-section">
                  <h3>📅 Доступ к приложению</h3>
                  <div className="form-row">
                    <div className="form-group">
                      <label>Начало доступа</label>
                      <input
                        type="date"
                        value={formData.accessStartDate}
                        onChange={(e) => setFormData({...formData, accessStartDate: e.target.value})}
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label>Окончание доступа (опционально)</label>
                      <input
                        type="date"
                        value={formData.accessEndDate}
                        onChange={(e) => setFormData({...formData, accessEndDate: e.target.value})}
                      />
                      <small>Оставьте пустым для бессрочного доступа</small>
                    </div>
                  </div>
                </div>

                <div className="form-section">
                  <h3>📚 Предметы</h3>
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

                <div className="modal-actions">
                  <button type="button" className="btn-secondary" onClick={() => setShowAddModal(false)}>
                    Отмена
                  </button>
                  <button 
                    type="submit" 
                    className="btn-primary"
                    disabled={!formData.firstName || !formData.lastName || !formData.telegramId}
                  >
                    Создать студента
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Компонент детального просмотра студента
function StudentDetail({ student, subjects, onClose, onUpdate, onDelete }) {
  const [isEditingSubjects, setIsEditingSubjects] = useState(false);
  const [isEditingAccess, setIsEditingAccess] = useState(false);
  const [selectedSubjects, setSelectedSubjects] = useState(student.subjects?.map(s => s.id) || []);
  const [accessData, setAccessData] = useState({
    accessStartDate: student.accessStartDate ? new Date(student.accessStartDate).toISOString().split('T')[0] : '',
    accessEndDate: student.accessEndDate ? new Date(student.accessEndDate).toISOString().split('T')[0] : '',
    isActive: student.isActive
  });
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadStats();
  }, [student.id]);

  const loadStats = async () => {
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

  const handleSaveSubjects = async () => {
    setSaving(true);
    try {
      const response = await fetch(`${API_URL}/students/${student.id}/subjects`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subjectIds: selectedSubjects })
      });

      if (response.ok) {
        setIsEditingSubjects(false);
        await onUpdate();
      }
    } catch (error) {
      console.error('Error updating subjects:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAccess = async () => {
    setSaving(true);
    try {
      const response = await fetch(`${API_URL}/students/${student.id}/access`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(accessData)
      });

      if (response.ok) {
        setIsEditingAccess(false);
        await onUpdate();
      }
    } catch (error) {
      console.error('Error updating access:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleExtendAccess = async (days) => {
    if (!window.confirm(`Продлить доступ на ${days} дней?`)) return;

    try {
      const response = await fetch(`${API_URL}/students/${student.id}/extend-access`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ days })
      });

      if (response.ok) {
        await onUpdate();
      }
    } catch (error) {
      console.error('Error extending access:', error);
    }
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
          ← Назад к списку
        </button>
        <button className="delete-button" onClick={() => onDelete(student.id)}>
          🗑️ Удалить студента
        </button>
      </div>

      <div className="detail-content">
        <div className="detail-card">
          <div className="student-avatar-large">
            {student.firstName?.[0]}{student.lastName?.[0]}
          </div>
          <h2>{student.firstName} {student.lastName}</h2>
          <p className="student-username-large">@{student.telegramUsername || 'no username'}</p>
          <p className="student-id">ID: {student.telegramId}</p>
          <span className={`status-badge-large ${student.isActive ? 'active' : 'inactive'}`}>
            {student.isActive ? '✓ Активен' : '✕ Неактивен'}
          </span>
        </div>

        {/* Доступ к приложению */}
        <div className="detail-card">
          <div className="card-header">
            <h3>📅 Доступ к приложению</h3>
            <button 
              className="edit-button"
              onClick={() => setIsEditingAccess(!isEditingAccess)}
            >
              {isEditingAccess ? '✕ Отмена' : '✏️ Изменить'}
            </button>
          </div>

          {isEditingAccess ? (
            <div className="edit-access-form">
              <div className="form-group">
                <label>Начало доступа</label>
                <input
                  type="date"
                  value={accessData.accessStartDate}
                  onChange={(e) => setAccessData({...accessData, accessStartDate: e.target.value})}
                />
              </div>
              <div className="form-group">
                <label>Окончание доступа</label>
                <input
                  type="date"
                  value={accessData.accessEndDate}
                  onChange={(e) => setAccessData({...accessData, accessEndDate: e.target.value})}
                />
              </div>
              <div className="form-group">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={accessData.isActive}
                    onChange={(e) => setAccessData({...accessData, isActive: e.target.checked})}
                  />
                  <span>Активный студент</span>
                </label>
              </div>
              <button 
                className="save-button" 
                onClick={handleSaveAccess}
                disabled={saving}
              >
                {saving ? '💾 Сохранение...' : '💾 Сохранить'}
              </button>
            </div>
          ) : (
            <div className="access-info">
              <p><strong>Начало:</strong> {student.accessStartDate ? new Date(student.accessStartDate).toLocaleDateString('ru-RU') : 'Не указано'}</p>
              <p><strong>Окончание:</strong> {student.accessEndDate ? new Date(student.accessEndDate).toLocaleDateString('ru-RU') : 'Бессрочно'}</p>
              
              <div className="extend-buttons">
                <button className="extend-btn" onClick={() => handleExtendAccess(7)}>+7 дней</button>
                <button className="extend-btn" onClick={() => handleExtendAccess(30)}>+30 дней</button>
                <button className="extend-btn" onClick={() => handleExtendAccess(90)}>+90 дней</button>
              </div>
            </div>
          )}
        </div>

        {/* Предметы */}
        <div className="detail-card">
          <div className="card-header">
            <h3>📚 Предметы</h3>
            <button 
              className="edit-button"
              onClick={() => setIsEditingSubjects(!isEditingSubjects)}
            >
              {isEditingSubjects ? '✕ Отмена' : '✏️ Изменить'}
            </button>
          </div>

          {isEditingSubjects ? (
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
              <button 
                className="save-button" 
                onClick={handleSaveSubjects}
                disabled={saving}
              >
                {saving ? '💾 Сохранение...' : '💾 Сохранить'}
              </button>
            </div>
          ) : (
            <div className="subjects-list">
              {student.subjects?.map(subj => (
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
      </div>
    </div>
  );
}

export default Students;