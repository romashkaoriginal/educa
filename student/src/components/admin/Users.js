import React, { useState, useEffect } from 'react';
import '../../styles/Users.css';
import { adminFetch } from './adminApi';

const API_URL = 'https://educa-production-a98e.up.railway.app/api';

function Users() {
  const [users, setUsers] = useState([]);
  const [botUsers, setBotUsers] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [botUsersSearchQuery, setBotUsersSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [loadingBotUsers, setLoadingBotUsers] = useState(false);
  
  // Модалки
  const [showAddModal, setShowAddModal] = useState(false);
  const [addMode, setAddMode] = useState('bot'); // 'bot' или 'manual'
  const [selectedUser, setSelectedUser] = useState(null);
  const [selectedBotUser, setSelectedBotUser] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  
  // Сортировка для пользователей бота
  const [botUsersSortBy, setBotUsersSortBy] = useState('firstInteractionAt');
  const [botUsersSortOrder, setBotUsersSortOrder] = useState('DESC');
  const [botUsersFilter, setBotUsersFilter] = useState('unassigned');
  
  // Форма
  const [formData, setFormData] = useState({
    telegramId: '',
    telegramUsername: '',
    firstName: '',
    lastName: '',
    role: 'teacher'
  });

  useEffect(() => {
    loadUsers();
  }, []);

  useEffect(() => {
    if (showAddModal && addMode === 'bot') {
      loadBotUsers();
    }
  }, [showAddModal, addMode, botUsersSortBy, botUsersSortOrder, botUsersFilter]);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const response = await adminFetch(`${API_URL}/users`);
      const data = await response.json();
      setUsers(data.users || []);
    } catch (error) {
      console.error('Error loading users:', error);
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

  const handleOpenAddModal = () => {
    setShowAddModal(true);
    setIsEditing(false);
    setAddMode('bot');
    setSelectedBotUser(null);
    resetForm();
  };

  const handleOpenEditModal = (user) => {
    setSelectedUser(user);
    setIsEditing(true);
    setShowAddModal(true);
    setAddMode('manual');
    setFormData({
      telegramId: user.telegramId?.toString() || '',
      telegramUsername: user.telegramUsername || '',
      firstName: user.firstName || '',
      lastName: user.lastName || '',
      role: user.role
    });
  };

  const resetForm = () => {
    setFormData({
      telegramId: '',
      telegramUsername: '',
      firstName: '',
      lastName: '',
      role: 'teacher'
    });
    setSelectedUser(null);
    setSelectedBotUser(null);
  };

  const handleSelectBotUser = (botUser) => {
    setSelectedBotUser(botUser);
    setFormData({
      telegramId: botUser.telegramId.toString(),
      telegramUsername: botUser.telegramUsername || '',
      firstName: botUser.firstName || '',
      lastName: botUser.lastName || '',
      role: 'teacher'
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    try {
      const url = isEditing 
        ? `${API_URL}/users/${selectedUser.id}`
        : `${API_URL}/users`;
      
      const method = isEditing ? 'PUT' : 'POST';

      const response = await adminFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      if (response.ok) {
        setShowAddModal(false);
        resetForm();
        await loadUsers();
        if (addMode === 'bot') {
          await loadBotUsers();
        }
      } else {
        const error = await response.json();
        alert(`Ошибка: ${error.message}`);
      }
    } catch (error) {
      console.error('Error saving user:', error);
      alert('Ошибка при сохранении пользователя');
    }
  };

  const handleToggleStatus = async (userId) => {
    try {
      const response = await adminFetch(`${API_URL}/users/${userId}/toggle-status`, {
        method: 'PATCH'
      });

      if (response.ok) {
        await loadUsers();
      }
    } catch (error) {
      console.error('Error toggling status:', error);
    }
  };

  const handleDeleteUser = async (userId, userName) => {
    if (!window.confirm(`Вы уверены, что хотите удалить пользователя ${userName}?`)) {
      return;
    }

    try {
      const response = await adminFetch(`${API_URL}/users/${userId}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        await loadUsers();
      }
    } catch (error) {
      console.error('Error deleting user:', error);
    }
  };

  const filteredUsers = users.filter(user => {
    const query = searchQuery.toLowerCase();
    const matchesSearch = 
      user.firstName?.toLowerCase().includes(query) ||
      user.lastName?.toLowerCase().includes(query) ||
      user.telegramUsername?.toLowerCase().includes(query) ||
      user.telegramId?.toString().includes(query);
    
    const matchesRole = roleFilter === 'all' || user.role === roleFilter;
    
    return matchesSearch && matchesRole;
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

  const roleInfo = {
    admin: {
      name: 'Администратор',
      icon: '👨‍💼',
      color: '#DC2626',
      description: 'Полный доступ ко всем функциям системы'
    },
    teacher: {
      name: 'Преподаватель',
      icon: '👨‍🏫',
      color: '#2563EB',
      description: 'Управление учебным контентом: практика, домашки, викторины'
    },
    manager: {
      name: 'Менеджер',
      icon: '📊',
      color: '#059669',
      description: 'Управление учениками, предметами и доступами'
    }
  };

  const getUsersByRole = (role) => users.filter(u => u.role === role).length;

  return (
    <div className="users-section">
      <div className="section-header">
        <div className="header-left">
          <h2>Пользователи системы ({filteredUsers.length})</h2>
          <div className="role-stats">
            <span className="role-stat admin">
              👨‍💼 Админов: {getUsersByRole('admin')}
            </span>
            <span className="role-stat teacher">
              👨‍🏫 Преподавателей: {getUsersByRole('teacher')}
            </span>
            <span className="role-stat manager">
              📊 Менеджеров: {getUsersByRole('manager')}
            </span>
          </div>
        </div>
        <button className="add-button" onClick={handleOpenAddModal}>
          + Добавить пользователя
        </button>
      </div>

      <div className="filters-bar">
        <input
          type="text"
          className="search-input"
          placeholder="🔍 Поиск по имени, username или ID..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        
        <select 
          className="role-filter"
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
        >
          <option value="all">Все роли</option>
          <option value="admin">👨‍💼 Администраторы</option>
          <option value="teacher">👨‍🏫 Преподаватели</option>
          <option value="manager">📊 Менеджеры</option>
        </select>
      </div>

      {loading ? (
        <div className="users-grid">
          {[1, 2, 3].map(i => (
            <div key={i} className="user-card skeleton">
              <div className="skeleton-avatar"></div>
              <div className="skeleton-info">
                <div className="skeleton-line"></div>
                <div className="skeleton-line short"></div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="users-grid">
          {filteredUsers.map(user => {
            const role = roleInfo[user.role];
            return (
              <div key={user.id} className={`user-card ${user.role}`}>
                <div className="user-card-header">
                  <div className="user-avatar" style={{ background: role.color }}>
                    {role.icon}
                  </div>
                  <div className="user-main-info">
                    <h3>{user.firstName} {user.lastName}</h3>
                    <p className="user-username">@{user.telegramUsername || 'no username'}</p>
                    <p className="user-id">ID: {user.telegramId}</p>
                  </div>
                </div>

                <div className="user-card-body">
                  <div className="role-badge" style={{ borderColor: role.color, color: role.color }}>
                    {role.icon} {role.name}
                  </div>
                  <p className="role-description">{role.description}</p>
                  
                  <div className="user-meta">
                    <span className={`status-badge ${user.isActive ? 'active' : 'inactive'}`}>
                      {user.isActive ? '✓ Активен' : '✕ Неактивен'}
                    </span>
                    <span className="created-date">
                      📅 {new Date(user.createdAt).toLocaleDateString('ru-RU')}
                    </span>
                  </div>
                </div>

                <div className="user-card-actions">
                  <button 
                    className="action-btn edit"
                    onClick={() => handleOpenEditModal(user)}
                    title="Редактировать"
                  >
                    ✏️
                  </button>
                  <button 
                    className={`action-btn toggle ${user.isActive ? 'active' : 'inactive'}`}
                    onClick={() => handleToggleStatus(user.id)}
                    title={user.isActive ? 'Деактивировать' : 'Активировать'}
                  >
                    {user.isActive ? '🔓' : '🔒'}
                  </button>
                  <button 
                    className="action-btn delete"
                    onClick={() => handleDeleteUser(user.id, `${user.firstName} ${user.lastName}`)}
                    title="Удалить"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {filteredUsers.length === 0 && !loading && (
        <div className="empty-state">
          <p>Пользователи не найдены</p>
        </div>
      )}

      {/* Модалка добавления/редактирования */}
      {showAddModal && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{isEditing ? 'Редактировать пользователя' : 'Добавить пользователя'}</h2>
              <button className="modal-close" onClick={() => setShowAddModal(false)}>✕</button>
            </div>

            {!isEditing && (
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
            )}

            {addMode === 'bot' && !isEditing ? (
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
            ) : null}

            {(selectedBotUser || addMode === 'manual' || isEditing) && (
              <form onSubmit={handleSubmit} className="user-form">
                <div className="form-section">
                  <h3>📱 Telegram данные</h3>
                  <div className="form-row">
                    <div className="form-group">
                      <label>Telegram ID</label>
                      <input
                        type="number"
                        placeholder="123456789"
                        value={formData.telegramId}
                        onChange={(e) => setFormData({...formData, telegramId: e.target.value})}
                        disabled={isEditing}
                      />
                      {isEditing && <small>Telegram ID нельзя изменить</small>}
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
                </div>

                <div className="form-section">
                  <h3>👤 Личные данные</h3>
                  <div className="form-row">
                    <div className="form-group">
                      <label>Имя</label>
                      <input
                        type="text"
                        placeholder="Иван"
                        value={formData.firstName}
                        onChange={(e) => setFormData({...formData, firstName: e.target.value})}
                      />
                    </div>
                    <div className="form-group">
                      <label>Фамилия</label>
                      <input
                        type="text"
                        placeholder="Иванов"
                        value={formData.lastName}
                        onChange={(e) => setFormData({...formData, lastName: e.target.value})}
                      />
                    </div>
                  </div>
                </div>

                <div className="form-section">
                  <h3>🎭 Роль в системе</h3>
                  <div className="role-selector">
                    {Object.entries(roleInfo).map(([roleKey, role]) => (
                      <label 
                        key={roleKey}
                        className={`role-option ${formData.role === roleKey ? 'selected' : ''}`}
                      >
                        <input
                          type="radio"
                          name="role"
                          value={roleKey}
                          checked={formData.role === roleKey}
                          onChange={(e) => setFormData({...formData, role: e.target.value})}
                        />
                        <div className="role-option-content">
                          <div className="role-option-icon" style={{ color: role.color }}>
                            {role.icon}
                          </div>
                          <div className="role-option-info">
                            <h4>{role.name}</h4>
                            <p>{role.description}</p>
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="modal-actions">
                  <button type="button" className="btn-secondary" onClick={() => setShowAddModal(false)}>
                    Отмена
                  </button>
                  <button type="submit" className="btn-primary">
                    {isEditing ? 'Сохранить изменения' : 'Создать пользователя'}
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

export default Users;