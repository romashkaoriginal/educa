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
  
  // ФИЛЬТРЫ ДЛЯ СТУДЕНТОВ
  const [sortBy, setSortBy] = useState('createdAt'); // createdAt | name | expiresAt
  const [filterExpiring, setFilterExpiring] = useState('all'); // all | week | month | expired
  
  // Модалки
  const [showAddModal, setShowAddModal] = useState(false);
  const [addMode, setAddMode] = useState('bot'); // 'bot' или 'manual'
  
  // Выбранный студент для детального просмотра
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  
  // Сортировка и фильтры для пользователей бота
  const [botUsersSortBy, setBotUsersSortBy] = useState('firstInteractionAt');
  const [botUsersSortOrder, setBotUsersSortOrder] = useState('DESC');
  const [botUsersFilter, setBotUsersFilter] = useState('unassigned');
  
  // Выбранный пользователь бота
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
    subjectAccessDates: {} // { subjectId: { startDate, endDate } }
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
    setSelectedBotUser(null);
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
    setFormData(prev => {
      const isSelected = prev.subjectIds.includes(subjectId);
      
      if (isSelected) {
        // Удаляем предмет и его даты
        const newSubjectAccessDates = { ...prev.subjectAccessDates };
        delete newSubjectAccessDates[subjectId];
        
        return {
          ...prev,
          subjectIds: prev.subjectIds.filter(id => id !== subjectId),
          subjectAccessDates: newSubjectAccessDates
        };
      } else {
        // Добавляем предмет с пустыми датами (пользователь укажет вручную)
        return {
          ...prev,
          subjectIds: [...prev.subjectIds, subjectId],
          subjectAccessDates: {
            ...prev.subjectAccessDates,
            [subjectId]: {
              startDate: '',
              endDate: ''
            }
          }
        };
      }
    });
  };

  // Обновление индивидуальных дат для предмета
  const handleSubjectDateChange = (subjectId, field, value) => {
    setFormData(prev => ({
      ...prev,
      subjectAccessDates: {
        ...prev.subjectAccessDates,
        [subjectId]: {
          ...prev.subjectAccessDates[subjectId],
          [field]: value
        }
      }
    }));
  };

  // Конвертация даты из ДД.ММ.ГГГГ в YYYY-MM-DD
  const convertDateFormat = (dateStr) => {
    if (!dateStr || dateStr.trim() === '') return null; // Пустая строка = null
    
    // Если уже в формате YYYY-MM-DD
    if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) return dateStr;
    
    // Конвертируем ДД.ММ.ГГГГ -> YYYY-MM-DD
    const parts = dateStr.split('.');
    if (parts.length === 3) {
      const [day, month, year] = parts;
      const converted = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
      
      // Проверяем что дата валидная
      const testDate = new Date(converted);
      if (isNaN(testDate.getTime())) {
        return null; // Невалидная дата
      }
      
      return converted;
    }
    
    return null; // Неправильный формат
  };

  const handleCreateStudent = async (e) => {
    e.preventDefault();

    try {
      // Конвертируем даты в формат БД
      const convertedData = {
        ...formData,
        subjectAccessDates: {}
      };

      // Конвертируем даты для каждого предмета
      Object.entries(formData.subjectAccessDates).forEach(([subjectId, dates]) => {
        const startDate = convertDateFormat(dates.startDate);
        const endDate = convertDateFormat(dates.endDate);
        
        // Проверка: оба поля должны быть заполнены
        if (!startDate || !endDate) {
          alert(`Заполните даты начала и окончания для всех выбранных предметов!`);
          throw new Error('Invalid dates');
        }
        
        convertedData.subjectAccessDates[subjectId] = {
          startDate,
          endDate
        };
      });

      const response = await fetch(`${API_URL}/students`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(convertedData)
      });

      if (response.ok) {
        setShowAddModal(false);
        resetForm();
        await loadStudents();
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
        setShowDetailModal(false);
        await loadStudents();
      }
    } catch (error) {
      console.error('Error deleting student:', error);
    }
  };

  const handleExtendAccess = async (studentId, days) => {
    try {
      const response = await fetch(`${API_URL}/students/${studentId}/extend-access`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ days })
      });

      if (response.ok) {
        await loadStudents();
        if (selectedStudent?.id === studentId) {
          const updated = students.find(s => s.id === studentId);
          setSelectedStudent(updated);
        }
      }
    } catch (error) {
      console.error('Error extending access:', error);
    }
  };

  // ФИЛЬТРАЦИЯ И СОРТИРОВКА СТУДЕНТОВ
  const getFilteredAndSortedStudents = () => {
    let filtered = students.filter(student => {
      const query = searchQuery.toLowerCase();
      const matchesSearch = 
        student.firstName?.toLowerCase().includes(query) ||
        student.lastName?.toLowerCase().includes(query) ||
        student.telegramUsername?.toLowerCase().includes(query) ||
        student.telegramId?.toString().includes(query);

      if (!matchesSearch) return false;

      // Фильтр по истечению срока
      if (filterExpiring !== 'all') {
        if (!student.accessEndDate) return false;
        
        const endDate = new Date(student.accessEndDate);
        const now = new Date();
        const daysUntilExpiry = Math.ceil((endDate - now) / (1000 * 60 * 60 * 24));

        if (filterExpiring === 'expired' && daysUntilExpiry >= 0) return false;
        if (filterExpiring === 'week' && (daysUntilExpiry < 0 || daysUntilExpiry > 7)) return false;
        if (filterExpiring === 'month' && (daysUntilExpiry < 0 || daysUntilExpiry > 30)) return false;
      }

      return true;
    });

    // Сортировка
    filtered.sort((a, b) => {
      if (sortBy === 'name') {
        return `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`);
      }
      if (sortBy === 'expiresAt') {
        if (!a.accessEndDate) return 1;
        if (!b.accessEndDate) return -1;
        return new Date(a.accessEndDate) - new Date(b.accessEndDate);
      }
      // По умолчанию createdAt (новые сначала)
      return new Date(b.createdAt) - new Date(a.createdAt);
    });

    return filtered;
  };

  const filteredStudents = getFilteredAndSortedStudents();

  const filteredBotUsers = botUsers.filter(user => {
    const query = botUsersSearchQuery.toLowerCase();
    return (
      user.firstName?.toLowerCase().includes(query) ||
      user.lastName?.toLowerCase().includes(query) ||
      user.telegramUsername?.toLowerCase().includes(query) ||
      user.telegramId?.toString().includes(query)
    );
  });

  // Подсчёт истекающих скоро
  const getExpiringCounts = () => {
    const now = new Date();
    let week = 0, month = 0, expired = 0;

    students.forEach(s => {
      if (!s.accessEndDate) return;
      const endDate = new Date(s.accessEndDate);
      const days = Math.ceil((endDate - now) / (1000 * 60 * 60 * 24));
      
      if (days < 0) expired++;
      else if (days <= 7) week++;
      else if (days <= 30) month++;
    });

    return { week, month, expired };
  };

  const expiringCounts = getExpiringCounts();

  const handleViewStudent = (student) => {
    setSelectedStudent(student);
    setShowDetailModal(true);
  };

  const handleCloseDetail = () => {
    setSelectedStudent(null);
    setShowDetailModal(false);
  };

  return (
    <div className="students-section">
      <div className="section-header">
        <div className="header-left">
          <h2>Студенты ({filteredStudents.length})</h2>
          <div className="expiring-badges">
            <span className="expiring-badge expired" title="Истёк">
              ⚠️ {expiringCounts.expired}
            </span>
            <span className="expiring-badge week" title="Истекает в течение недели">
              🔔 {expiringCounts.week}
            </span>
            <span className="expiring-badge month" title="Истекает в течение месяца">
              ⏰ {expiringCounts.month}
            </span>
          </div>
        </div>
        <button className="add-button" onClick={handleOpenAddModal}>
          + Добавить студента
        </button>
      </div>

      {/* ФИЛЬТРЫ */}
      <div className="filters-bar">
        <input
          type="text"
          className="search-input"
          placeholder="🔍 Поиск по имени, username или ID..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        
        <select 
          className="filter-select"
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
        >
          <option value="createdAt">📅 По дате добавления</option>
          <option value="name">🔤 По имени (А-Я)</option>
          <option value="expiresAt">⏰ По истечению срока</option>
        </select>

        <select 
          className="filter-select"
          value={filterExpiring}
          onChange={(e) => setFilterExpiring(e.target.value)}
        >
          <option value="all">Все студенты</option>
          <option value="week">⚡ Истекает до 7 дней</option>
          <option value="month">⏰ Истекает до 30 дней</option>
          <option value="expired">❌ Истёкшие</option>
        </select>
      </div>

      {/* СПИСОК СТУДЕНТОВ */}
      {loading ? (
        <div className="students-grid">
          {[1, 2, 3].map(i => (
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
          {filteredStudents.map(student => {
            const daysLeft = student.accessEndDate 
              ? Math.ceil((new Date(student.accessEndDate) - new Date()) / (1000 * 60 * 60 * 24))
              : null;
            
            const isExpired = daysLeft !== null && daysLeft < 0;
            const isExpiringSoon = daysLeft !== null && daysLeft >= 0 && daysLeft <= 7;

            return (
              <div 
                key={student.id} 
                className={`student-card ${!student.isActive ? 'inactive' : ''} ${isExpired ? 'expired' : ''}`}
                onClick={() => handleViewStudent(student)}
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
                      <span className={`expiry-badge ${isExpired ? 'expired' : isExpiringSoon ? 'soon' : ''}`}>
                        {isExpired ? `❌ Истёк ${Math.abs(daysLeft)} дн. назад` : 
                         isExpiringSoon ? `⚡ Осталось ${daysLeft} дн.` :
                         `⏰ Осталось ${daysLeft} дн.`}
                      </span>
                    )}
                    {!student.accessEndDate && (
                      <span className="expiry-badge permanent">∞ Бессрочно</span>
                    )}
                  </div>

                  <div className="student-subjects">
                    {student.subjects?.slice(0, 3).map(subject => (
                      <span key={subject.id} className="subject-tag">
                        {subject.icon} {subject.name}
                      </span>
                    ))}
                    {student.subjects?.length > 3 && (
                      <span className="subject-tag more">+{student.subjects.length - 3}</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {filteredStudents.length === 0 && !loading && (
        <div className="empty-state">
          <p>Студенты не найдены</p>
        </div>
      )}

      {/* МОДАЛКА ДОБАВЛЕНИЯ */}
      {showAddModal && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="modal-content large" onClick={(e) => e.stopPropagation()}>
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

            {/* ВЫБОР ИЗ БОТА */}
            {addMode === 'bot' && !selectedBotUser ? (
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
                        className={`bot-user-row ${user.isAssigned ? 'assigned' : ''}`}
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
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : null}

            {/* ФОРМА НАЗНАЧЕНИЯ */}
            {(selectedBotUser || addMode === 'manual') && (
              <form onSubmit={handleCreateStudent} className="assignment-form">
                {/* Данные студента (редактируемые) */}
                <div className="form-section">
                  <h3>👤 Данные студента</h3>
                  <div className="form-row">
                    <div className="form-group">
                      <label>Telegram ID</label>
                      <input
                        type="number"
                        value={formData.telegramId}
                        onChange={(e) => setFormData({...formData, telegramId: e.target.value})}
                      />
                    </div>
                    <div className="form-group">
                      <label>Username</label>
                      <input
                        type="text"
                        placeholder="@username"
                        value={formData.telegramUsername}
                        onChange={(e) => setFormData({...formData, telegramUsername: e.target.value})}
                      />
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label>Имя</label>
                      <input
                        type="text"
                        value={formData.firstName}
                        onChange={(e) => setFormData({...formData, firstName: e.target.value})}
                      />
                    </div>
                    <div className="form-group">
                      <label>Фамилия</label>
                      <input
                        type="text"
                        value={formData.lastName}
                        onChange={(e) => setFormData({...formData, lastName: e.target.value})}
                      />
                    </div>
                  </div>
                </div>

                {/* Предметы с индивидуальными сроками */}
                <div className="form-section">
                  <h3>📚 Предметы с индивидуальными сроками доступа</h3>
                  <p className="section-description">
                    Выберите предметы и укажите срок доступа для каждого (формат: ДД.ММ.ГГГГ). Оба поля обязательны.
                  </p>
                  
                  <div className="subjects-with-dates">
                    {subjects.map(subject => {
                      const isSelected = formData.subjectIds.includes(subject.id);
                      const subjectDates = formData.subjectAccessDates[subject.id] || {};
                      
                      return (
                        <div key={subject.id} className={`subject-item ${isSelected ? 'selected' : ''}`}>
                          <label className="subject-checkbox-label">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => handleSubjectToggle(subject.id)}
                            />
                            <span className="subject-name">
                              {subject.icon} {subject.name}
                            </span>
                          </label>

                          {isSelected && (
                            <div className="subject-dates">
                              <div className="date-input-group">
                                <label>Начало доступа *</label>
                                <input
                                  type="text"
                                  placeholder="01.01.2025"
                                  value={subjectDates.startDate || ''}
                                  onChange={(e) => handleSubjectDateChange(subject.id, 'startDate', e.target.value)}
                                  className="date-text-input"
                                  required
                                />
                              </div>
                              <div className="date-input-group">
                                <label>Окончание доступа *</label>
                                <input
                                  type="text"
                                  placeholder="31.12.2025"
                                  value={subjectDates.endDate || ''}
                                  onChange={(e) => handleSubjectDateChange(subject.id, 'endDate', e.target.value)}
                                  className="date-text-input"
                                  required
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="modal-actions">
                  <button type="button" className="btn-secondary" onClick={() => setShowAddModal(false)}>
                    Отмена
                  </button>
                  <button type="submit" className="btn-primary">
                    Создать студента
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* МОДАЛКА ДЕТАЛЬНОГО ПРОСМОТРА СТУДЕНТА */}
      {showDetailModal && selectedStudent && (
        <div className="modal-overlay" onClick={handleCloseDetail}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>👨‍🎓 {selectedStudent.firstName} {selectedStudent.lastName}</h2>
              <button className="modal-close" onClick={handleCloseDetail}>✕</button>
            </div>

            <div className="student-detail-content">
              <div className="detail-section">
                <h3>📱 Контактные данные</h3>
                <p><strong>Telegram ID:</strong> {selectedStudent.telegramId}</p>
                <p><strong>Username:</strong> @{selectedStudent.telegramUsername || 'не указан'}</p>
                <p><strong>Статус:</strong> 
                  <span className={`status-badge ${selectedStudent.isActive ? 'active' : 'inactive'}`}>
                    {selectedStudent.isActive ? '✓ Активен' : '✕ Неактивен'}
                  </span>
                </p>
              </div>

              <div className="detail-section">
                <h3>📅 Доступ к приложению</h3>
                <p><strong>Начало:</strong> {selectedStudent.accessStartDate ? new Date(selectedStudent.accessStartDate).toLocaleDateString('ru-RU') : 'Не указано'}</p>
                <p><strong>Окончание:</strong> {selectedStudent.accessEndDate ? new Date(selectedStudent.accessEndDate).toLocaleDateString('ru-RU') : '∞ Бессрочно'}</p>
                
                {selectedStudent.accessEndDate && (
                  <div className="extend-access-buttons">
                    <button 
                      className="extend-btn"
                      onClick={() => handleExtendAccess(selectedStudent.id, 7)}
                    >
                      +7 дней
                    </button>
                    <button 
                      className="extend-btn"
                      onClick={() => handleExtendAccess(selectedStudent.id, 30)}
                    >
                      +30 дней
                    </button>
                    <button 
                      className="extend-btn"
                      onClick={() => handleExtendAccess(selectedStudent.id, 90)}
                    >
                      +90 дней
                    </button>
                  </div>
                )}
              </div>

              <div className="detail-section">
                <h3>📚 Предметы ({selectedStudent.subjects?.length || 0})</h3>
                <div className="subjects-list">
                  {selectedStudent.subjects?.map(subject => (
                    <div key={subject.id} className="subject-detail-item">
                      <span className="subject-name">{subject.icon} {subject.name}</span>
                      {subject.UserSubject?.accessEndDate && (
                        <span className="subject-expiry">
                          До {new Date(subject.UserSubject.accessEndDate).toLocaleDateString('ru-RU')}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="detail-actions">
                <button 
                  className="btn-danger"
                  onClick={() => {
                    handleDeleteStudent(selectedStudent.id);
                    handleCloseDetail();
                  }}
                >
                  🗑️ Удалить студента
                </button>
                <button className="btn-secondary" onClick={handleCloseDetail}>
                  Закрыть
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Students;