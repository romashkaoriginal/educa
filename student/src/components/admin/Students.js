import React, { useState, useEffect } from 'react';
import '../../styles/Students.css';
import { adminFetch } from './adminApi';
import { useAdminData } from './AdminDataContext';

const API_URL = 'https://educa-production-a98e.up.railway.app/api';

function Students({ subjects }) {
  const { refresh } = useAdminData();
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
  const [isEditingStudent, setIsEditingStudent] = useState(false);
const [editFormData, setEditFormData] = useState({
  telegramId: '',
  telegramUsername: '',
  firstName: '',
  lastName: '',
  subjectIds: [],
  subjectAccessDates: {}
});
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
      const response = await adminFetch(`${API_URL}/students`);
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
      const response = await adminFetch(
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

  // datetime-local возвращает локальное время без timezone
  // конвертируем в ISO UTC чтобы сервер сохранил правильно
  const toISOLocal = (localDateStr) => {
    if (!localDateStr) return null;
    return new Date(localDateStr).toISOString();
  };

  const handleCreateStudent = async (e) => {
    e.preventDefault();

    try {
      const convertedData = {
        ...formData,
        subjectAccessDates: {}
      };

      Object.entries(formData.subjectAccessDates).forEach(([subjectId, dates]) => {
        const startDate = toISOLocal(dates.startDate);
        const endDate = toISOLocal(dates.endDate);
        
        if (!startDate || !endDate) {
          alert(`Заполните даты начала и окончания для всех выбранных предметов!`);
          throw new Error('Invalid dates');
        }
        
        convertedData.subjectAccessDates[subjectId] = {
          startDate,
          endDate
        };
      });

      const response = await adminFetch(`${API_URL}/students`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(convertedData)
      });

      if (response.ok) {
        setShowAddModal(false);
        resetForm();
        await loadStudents();
      refresh('students');
        refresh('students');
        if (addMode === 'bot') {
          await loadBotUsers();
        }
      } else {
        const error = await response.json();
        alert(`Ошибка: ${error.message}`);
      }
    } catch (error) {
      console.error('Error creating student:', error);
      alert('Ошибка при создании ученика');
    }
  };

  const handleDeleteStudent = async (studentId) => {
    if (!window.confirm('Вы уверены, что хотите удалить этого ученика?')) {
      return;
    }

    try {
      const response = await adminFetch(`${API_URL}/students/${studentId}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        setSelectedStudent(null);
        setShowDetailModal(false);
        await loadStudents();
      refresh('students');
        refresh('students');
      }
    } catch (error) {
      console.error('Error deleting student:', error);
    }
  };

  const handleExtendAccess = async (studentId, days) => {
    try {
      const response = await adminFetch(`${API_URL}/students/${studentId}/extend-access`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ days })
      });

      if (response.ok) {
        await loadStudents();
      refresh('students');
        refresh('students');
        if (selectedStudent?.id === studentId) {
          const updated = students.find(s => s.id === studentId);
          setSelectedStudent(updated);
        }
      }
    } catch (error) {
      console.error('Error extending access:', error);
    }
  };

  // Получить минимальную (ближайшую) дату окончания доступа из предметов студента
  // null = есть бессрочный предмет или нет предметов
  const getStudentAccessEnd = (student) => {
    if (!student.subjects || student.subjects.length === 0) return null;
    let minEnd = null;
    for (const subj of student.subjects) {
      const end = subj.UserSubject?.accessEndDate;
      if (!end) return null; // хотя бы один бессрочный → считаем бессрочным
      const d = new Date(end);
      if (!minEnd || d < minEnd) minEnd = d;
    }
    return minEnd;
  };

  // Детальная информация по доступу: истекшие предметы и все ли истекли
  const getAccessInfo = (student) => {
    const now = new Date();
    const subjects = student.subjects || [];
    if (subjects.length === 0) {
      return { expiredSubjects: [], allExpired: false, hasAnyExpired: false, soonSubjects: [] };
    }
    const expiredSubjects = [];
    const soonSubjects = [];
    let activeCount = 0;
    for (const subj of subjects) {
      const end = subj.UserSubject?.accessEndDate;
      if (!end) { activeCount++; continue; } // бессрочный = активен
      const d = new Date(end);
      const days = Math.ceil((d - now) / (1000 * 60 * 60 * 24));
      if (days < 0) {
        expiredSubjects.push({ name: subj.name, icon: subj.icon, days: Math.abs(days) });
      } else {
        activeCount++;
        if (days <= 7) soonSubjects.push({ name: subj.name, icon: subj.icon, days });
      }
    }
    return {
      expiredSubjects,
      soonSubjects,
      hasAnyExpired: expiredSubjects.length > 0,
      allExpired: activeCount === 0 && expiredSubjects.length > 0
    };
  };

  // ФИЛЬТРАЦИЯ И СОРТИРОВКА СТУДЕНТОВ
  const getFilteredAndSortedStudents = () => {
    const now = new Date();
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
        const access = getAccessInfo(student);
        // "Истёкшие" = ВСЕ предметы истекли
        if (filterExpiring === 'expired') {
          if (!access.allExpired) return false;
        } else {
          // week/month — по ближайшей дате окончания среди активных предметов
          const endDate = getStudentAccessEnd(student);
          if (!endDate) return false;
          const daysUntilExpiry = Math.ceil((endDate - now) / (1000 * 60 * 60 * 24));
          if (filterExpiring === 'week' && (daysUntilExpiry < 0 || daysUntilExpiry > 7)) return false;
          if (filterExpiring === 'month' && (daysUntilExpiry < 0 || daysUntilExpiry > 30)) return false;
        }
      }

      return true;
    });

    // Сортировка
    filtered.sort((a, b) => {
      if (sortBy === 'name') {
        return `${a.firstName} ${a.lastName || ''}`.localeCompare(`${b.firstName} ${b.lastName || ''}`);
      }
      if (sortBy === 'expiresAt') {
        const aEnd = getStudentAccessEnd(a);
        const bEnd = getStudentAccessEnd(b);
        if (!aEnd) return 1;
        if (!bEnd) return -1;
        return aEnd - bEnd;
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
      const access = getAccessInfo(s);
      // Полностью истёкшие
      if (access.allExpired) { expired++; return; }
      // Скоро истекает — по ближайшей дате
      const endDate = getStudentAccessEnd(s);
      if (!endDate) return;
      const days = Math.ceil((endDate - now) / (1000 * 60 * 60 * 24));
      if (days < 0) return; // частично истёкший, но не все — не считаем нигде
      else if (days <= 7) week++;
      else if (days <= 30) month++;
    });

    return { week, month, expired };
  };

  const expiringCounts = getExpiringCounts();

  const handleViewStudent = (student) => {
  setSelectedStudent(student);
  setShowDetailModal(true);
  setIsEditingStudent(false);
  
  const subjectIds = student.subjects?.map(s => s.id) || [];
  const subjectAccessDates = {};
  
  student.subjects?.forEach(subject => {
    subjectAccessDates[subject.id] = {
      startDate: subject.UserSubject?.accessStartDate?.slice(0, 16) || '',
      endDate: subject.UserSubject?.accessEndDate?.slice(0, 16) || ''
    };
  });
  
  setEditFormData({
    telegramId: student.telegramId?.toString() || '',
    telegramUsername: student.telegramUsername || '',
    firstName: student.firstName || '',
    lastName: student.lastName || '',
    subjectIds,
    subjectAccessDates
  });
};

const handleStartEdit = () => {
  setIsEditingStudent(true);
};

const handleCancelEdit = () => {
  setIsEditingStudent(false);
};

const handleEditSubjectToggle = (subjectId) => {
  setEditFormData(prev => {
    const isSelected = prev.subjectIds.includes(subjectId);
    
    if (isSelected) {
      const newSubjectAccessDates = { ...prev.subjectAccessDates };
      delete newSubjectAccessDates[subjectId];
      
      return {
        ...prev,
        subjectIds: prev.subjectIds.filter(id => id !== subjectId),
        subjectAccessDates: newSubjectAccessDates
      };
    } else {
      return {
        ...prev,
        subjectIds: [...prev.subjectIds, subjectId],
        subjectAccessDates: {
          ...prev.subjectAccessDates,
          [subjectId]: { startDate: '', endDate: '' }
        }
      };
    }
  });
};

const handleEditSubjectDateChange = (subjectId, field, value) => {
  setEditFormData(prev => ({
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

const formatDateToDisplay = (dateStr) => {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}.${month}.${year}`;
};

const handleSaveEdit = async () => {
  try {
    const convertedData = {
      telegramId: editFormData.telegramId || null,
      telegramUsername: editFormData.telegramUsername,
      firstName: editFormData.firstName,
      lastName: editFormData.lastName,
      subjectIds: editFormData.subjectIds,
      subjectAccessDates: {}
    };

    Object.entries(editFormData.subjectAccessDates).forEach(([subjectId, dates]) => {
      const startDate = toISOLocal(dates.startDate);
      const endDate = toISOLocal(dates.endDate);
      
      if (!startDate || !endDate) {
        alert(`Заполните даты для всех предметов!`);
        throw new Error('Invalid dates');
      }
      
      convertedData.subjectAccessDates[subjectId] = { startDate, endDate };
    });

    const response = await adminFetch(`${API_URL}/students/${selectedStudent.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(convertedData)
    });

    if (response.ok) {
      await loadStudents();
      refresh('students');
      const updated = students.find(s => s.id === selectedStudent.id);
      setSelectedStudent(updated);
      setIsEditingStudent(false);
    }
  } catch (error) {
    if (error.message !== 'Invalid dates') {
      console.error('Error updating student:', error);
    }
  }
};

  const handleCloseDetail = () => {
    setSelectedStudent(null);
    setShowDetailModal(false);
  };

  return (
    <div className="students-section">
      <div className="section-header">
        <div className="header-left">
          <h2>Ученики ({filteredStudents.length})</h2>
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
          + Добавить ученика
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
          <option value="all">Все Ученики</option>
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
            const access = getAccessInfo(student);
            const accessEnd = getStudentAccessEnd(student);
            const daysLeft = accessEnd 
              ? Math.ceil((accessEnd - new Date()) / (1000 * 60 * 60 * 24))
              : null;
            const isExpiringSoon = access.soonSubjects.length > 0;

            return (
              <div 
                key={student.id} 
                className={`student-card ${!student.isActive ? 'inactive' : ''} ${access.allExpired ? 'expired' : ''}`}
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
                    {access.allExpired ? (
                      <span className="expiry-badge expired">❌ Все доступы истекли</span>
                    ) : access.hasAnyExpired ? (
                      <span className="expiry-badge expired">
                        ❌ Истёк: {access.expiredSubjects.map(s => s.icon || s.name).join(' ')}
                      </span>
                    ) : isExpiringSoon ? (
                      <span className="expiry-badge soon">
                        ⚡ Скоро истекает: {access.soonSubjects.map(s => `${s.icon || s.name} (${s.days}д)`).join(', ')}
                      </span>
                    ) : accessEnd ? (
                      <span className="expiry-badge">⏰ Осталось {daysLeft} дн.</span>
                    ) : (
                      <span className="expiry-badge permanent"></span>
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
          <p>Ученики не найдены</p>
        </div>
      )}

      {/* МОДАЛКА ДОБАВЛЕНИЯ */}
      {showAddModal && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="modal-content large" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Добавить ученика</h2>
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
                  <h3>👤 Данные ученика</h3>
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
                    Выберите предметы и укажите срок доступа для каждого. Оба поля обязательны.
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
                                  type="datetime-local"
                                  value={subjectDates.startDate || ''}
                                  onChange={(e) => handleSubjectDateChange(subject.id, 'startDate', e.target.value)}
                                  className="date-text-input"
                                  required
                                />
                              </div>
                              <div className="date-input-group">
                                <label>Окончание доступа *</label>
                                <input
                                  type="datetime-local"
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
                    Создать ученика
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
     {/* МОДАЛКА ДЕТАЛЬНОГО ПРОСМОТРА/РЕДАКТИРОВАНИЯ СТУДЕНТА */}
{showDetailModal && selectedStudent && (
  <div className="modal-overlay" onClick={handleCloseDetail}>
    <div className="modal-content large" onClick={(e) => e.stopPropagation()}>
      <div className="modal-header">
        <h2>👨‍🎓 {selectedStudent.firstName} {selectedStudent.lastName}</h2>
        <button className="modal-close" onClick={handleCloseDetail}>✕</button>
      </div>

      {!isEditingStudent ? (
        /* РЕЖИМ ПРОСМОТРА */
        <div className="student-detail-content">
          <div className="detail-section">
            <h3>📱 Контактные данные</h3>
            <p><strong>Telegram ID:</strong> {selectedStudent.telegramId || 'Не указан'}</p>
            <p><strong>Username:</strong> @{selectedStudent.telegramUsername || 'не указан'}</p>
            <p><strong>Имя:</strong> {selectedStudent.firstName}</p>
            <p><strong>Фамилия:</strong> {selectedStudent.lastName}</p>
            <p><strong>Статус:</strong> 
              <span className={`status-badge ${selectedStudent.isActive ? 'active' : 'inactive'}`}>
                {selectedStudent.isActive ? '✓ Активен' : '✕ Неактивен'}
              </span>
            </p>
          </div>

          <div className="detail-section">
            <h3>📚 Предметы ({selectedStudent.subjects?.length || 0})</h3>
            {selectedStudent.subjects?.length > 0 ? (
              <div className="subjects-list">
                {selectedStudent.subjects.map(subject => (
                  <div key={subject.id} className="subject-detail-item">
                    <div className="subject-info">
                      <span className="subject-name">{subject.icon} {subject.name}</span>
                      <div className="subject-dates-info">
                        <span>📅 С: {subject.UserSubject?.accessStartDate ? new Date(subject.UserSubject.accessStartDate).toLocaleString('ru-RU', {day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}) : '—'}</span>
                        <span>⏰ До: {subject.UserSubject?.accessEndDate ? new Date(subject.UserSubject.accessEndDate).toLocaleString('ru-RU', {day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}) : '—'}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="empty-message">Предметы не назначены</p>
            )}
          </div>

          <div className="detail-actions">
            <button className="btn-primary" onClick={handleStartEdit}>
              ✏️ Редактировать
            </button>
            <button 
              className="btn-danger"
              onClick={() => {
                handleDeleteStudent(selectedStudent.id);
                handleCloseDetail();
              }}
            >
              🗑️ Удалить ученика
            </button>
            <button className="btn-secondary" onClick={handleCloseDetail}>
              Закрыть
            </button>
          </div>
        </div>
      ) : (
        /* РЕЖИМ РЕДАКТИРОВАНИЯ */
        <div className="student-edit-content">
          <div className="form-section">
            <h3>👤 Личные данные</h3>
            <div className="form-row">
              <div className="form-group">
                <label>Имя</label>
                <input
                  type="text"
                  value={editFormData.firstName}
                  onChange={(e) => setEditFormData({...editFormData, firstName: e.target.value})}
                />
              </div>
              <div className="form-group">
                <label>Фамилия</label>
                <input
                  type="text"
                  value={editFormData.lastName}
                  onChange={(e) => setEditFormData({...editFormData, lastName: e.target.value})}
                />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>Telegram ID</label>
                <input
                  type="number"
                  value={editFormData.telegramId || ''}
                  onChange={(e) => setEditFormData({...editFormData, telegramId: e.target.value})}
                />
              </div>
              <div className="form-group">
                <label>Username</label>
                <input
                  type="text"
                  placeholder="@username"
                  value={editFormData.telegramUsername}
                  onChange={(e) => setEditFormData({...editFormData, telegramUsername: e.target.value})}
                />
              </div>
            </div>
          </div>

          <div className="form-section">
            <h3>📚 Предметы с индивидуальными сроками</h3>
            <div className="subjects-with-dates">
              {subjects.map(subject => {
                const isSelected = editFormData.subjectIds.includes(subject.id);
                const subjectDates = editFormData.subjectAccessDates[subject.id] || {};
                
                return (
                  <div key={subject.id} className={`subject-item ${isSelected ? 'selected' : ''}`}>
                    <label className="subject-checkbox-label">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleEditSubjectToggle(subject.id)}
                      />
                      <span className="subject-name">{subject.icon} {subject.name}</span>
                    </label>

                    {isSelected && (
                      <div className="subject-dates">
                        <div className="date-input-group">
                          <label>Начало доступа *</label>
                          <input
                            type="datetime-local"
                            value={subjectDates.startDate || ''}
                            onChange={(e) => handleEditSubjectDateChange(subject.id, 'startDate', e.target.value)}
                            className="date-text-input"
                          />
                        </div>
                        <div className="date-input-group">
                          <label>Окончание доступа *</label>
                          <input
                            type="datetime-local"
                            value={subjectDates.endDate || ''}
                            onChange={(e) => handleEditSubjectDateChange(subject.id, 'endDate', e.target.value)}
                            className="date-text-input"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="detail-actions">
            <button className="btn-primary" onClick={handleSaveEdit}>
              💾 Сохранить
            </button>
            <button className="btn-secondary" onClick={handleCancelEdit}>
              Отмена
            </button>
          </div>
        </div>
      )}
    </div>
  </div>
)}
      
    </div>
  );
}

export default Students;