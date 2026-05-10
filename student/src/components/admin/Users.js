import React, { useState, useEffect } from 'react';
import '../../styles/Users.css';

const API_URL = 'https://educa-production-a98e.up.railway.app/api';

function Users() {
  const [users, setUsers] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('all'); // all | admin | teacher | manager
  const [loading, setLoading] = useState(true);
  
  // Модалки
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  
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

  const loadUsers = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/users`);
      const data = await response.json();
      setUsers(data.users || []);
    } catch (error) {
      console.error('Error loading users:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenAddModal = () => {
    setShowAddModal(true);
    setIsEditing(false);
    resetForm();
  };

  const handleOpenEditModal = (user) => {
    setSelectedUser(user);
    setIsEditing(true);
    setShowAddModal(true);
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
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    try {
      const url = isEditing 
        ? `${API_URL}/users/${selectedUser.id}`
        : `${API_URL}/users`;
      
      const method = isEditing ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      if (response.ok) {
        setShowAddModal(false);
        resetForm();
        await loadUsers();
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
      const response = await fetch(`${API_URL}/users/${userId}/toggle-status`, {
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
      const response = await fetch(`${API_URL}/users/${userId}`, {
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

            <form onSubmit={handleSubmit} className="user-form">
              <div className="form-section">
                <h3>📱 Telegram данные</h3>
                <div className="form-row">
                  <div className="form-group">
                    <label>Telegram ID *</label>
                    <input
                      type="number"
                      placeholder="123456789"
                      value={formData.telegramId}
                      onChange={(e) => setFormData({...formData, telegramId: e.target.value})}
                      required
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
                    <label>Имя *</label>
                    <input
                      type="text"
                      placeholder="Иван"
                      value={formData.firstName}
                      onChange={(e) => setFormData({...formData, firstName: e.target.value})}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Фамилия *</label>
                    <input
                      type="text"
                      placeholder="Иванов"
                      value={formData.lastName}
                      onChange={(e) => setFormData({...formData, lastName: e.target.value})}
                      required
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
          </div>
        </div>
      )}
    </div>
  );
}

export default Users;