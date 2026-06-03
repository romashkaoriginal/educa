import React, { useState, useEffect } from 'react';
import '../../styles/Applications.css';
import { adminFetch } from './adminApi';
import { useAdminData } from './AdminDataContext';

const API_URL = 'https://educa-production-a98e.up.railway.app/api';

const STATUS_LABELS = {
  new: { label: 'Новая', color: '#3B82F6' },
  in_progress: { label: 'В работе', color: '#F59E0B' },
  completed: { label: 'Завершена', color: '#10B981' },
  rejected: { label: 'Отклонена', color: '#EF4444' },
};

const CRM_LABELS = {
  pending: { label: '⏳ Ожидает', color: '#6B7280' },
  sent: { label: '✓ Отправлена', color: '#10B981' },
  error: { label: '✗ Ошибка', color: '#EF4444' },
};

function Applications() {
  const { applications: ctxApps, loadApplications, refresh } = useAdminData();
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    loadApplications();
  }, []);

  useEffect(() => {
    if (ctxApps.length > 0) setApplications(ctxApps);
  }, [ctxApps]);

  const loadApplications = async () => {
    try {
      const response = await adminFetch(`${API_URL}/applications`);
      const data = await response.json();
      setApplications(data.applications || []);
    } catch (error) {
      console.error('Error loading applications:', error);
    } finally {
      setLoading(false);
    }
  };

  const changeStatus = async (id, status) => {
    try {
      const response = await adminFetch(`${API_URL}/applications/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status })
      });
      if (response.ok) {
        const data = await response.json();
        setApplications(prev => prev.map(a => a.id === id ? data.application : a));
      }
    } catch (error) {
      console.error('Error changing status:', error);
    }
  };

  const resendToCrm = async (id) => {
    try {
      const response = await adminFetch(`${API_URL}/applications/${id}/resend`, {
        method: 'POST'
      });
      const data = await response.json();
      if (response.ok) {
        setApplications(prev => prev.map(a => a.id === id ? data.application : a));
        alert('Заявка отправлена в CRM');
      } else {
        if (data.application) {
          setApplications(prev => prev.map(a => a.id === id ? data.application : a));
        }
        alert('Ошибка отправки: ' + (data.message || 'неизвестная ошибка'));
      }
    } catch (error) {
      console.error('Error resending:', error);
      alert('Ошибка отправки');
    }
  };

  const filtered = filter === 'all'
    ? applications
    : applications.filter(a => a.status === filter);

  if (loading) {
    return (
      <div className="admin-section">
        <h2>Заявки</h2>
        <p style={{ textAlign: 'center', padding: '40px', color: '#6b7280' }}>Загрузка...</p>
      </div>
    );
  }

  return (
    <div className="admin-section">
      <div className="section-header">
        <h2>📋 Заявки</h2>
        <span className="apps-count">{applications.length} всего</span>
      </div>

      <div className="apps-filters">
        <button className={`apps-filter ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>
          Все ({applications.length})
        </button>
        {Object.entries(STATUS_LABELS).map(([key, { label }]) => {
          const count = applications.filter(a => a.status === key).length;
          return (
            <button key={key} className={`apps-filter ${filter === key ? 'active' : ''}`} onClick={() => setFilter(key)}>
              {label} ({count})
            </button>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state"><p>Нет заявок</p></div>
      ) : (
        <div className="apps-list">
          {filtered.map(app => {
            const isExpanded = expandedId === app.id;
            const statusInfo = STATUS_LABELS[app.status] || STATUS_LABELS.new;
            const crmInfo = CRM_LABELS[app.crmStatus] || CRM_LABELS.pending;
            return (
              <div key={app.id} className="app-card">
                <div className="app-card-header" onClick={() => setExpandedId(isExpanded ? null : app.id)}>
                  <div className="app-main-info">
                    <span className="app-expand">{isExpanded ? '▼' : '▶'}</span>
                    <div>
                      <div className="app-name">{app.fullName}</div>
                      <div className="app-phone">{app.phone}</div>
                    </div>
                  </div>
                  <div className="app-badges">
                    <span className="app-badge" style={{ background: statusInfo.color + '20', color: statusInfo.color }}>
                      {statusInfo.label}
                    </span>
                    <span className="app-badge" style={{ background: crmInfo.color + '20', color: crmInfo.color }}>
                      {crmInfo.label}
                    </span>
                  </div>
                </div>

                {isExpanded && (
                  <div className="app-card-body">
                    <div className="app-detail-grid">
                      <div className="app-detail">
                        <span className="app-detail-label">Предмет</span>
                        <span>{app.subjectName || '—'}</span>
                      </div>
                      <div className="app-detail">
                        <span className="app-detail-label">Результат теста</span>
                        <span>{app.testCorrect}/{app.testTotal} ({app.testPercent}%)</span>
                      </div>
                      <div className="app-detail">
                        <span className="app-detail-label">Telegram</span>
                        <span>{app.telegramUsername ? `@${app.telegramUsername}` : '—'}</span>
                      </div>
                      <div className="app-detail">
                        <span className="app-detail-label">Дата</span>
                        <span>{new Date(app.createdAt).toLocaleString('ru-RU')}</span>
                      </div>
                    </div>

                    {app.crmStatus === 'error' && app.crmError && (
                      <div className="app-crm-error">
                        <strong>Ошибка CRM:</strong> {app.crmError}
                      </div>
                    )}
                    {app.crmLeadId && (
                      <div className="app-crm-lead">Lead ID в CRM: {app.crmLeadId}</div>
                    )}

                    <div className="app-actions">
                      <div className="app-status-select">
                        <label>Статус:</label>
                        <select value={app.status} onChange={(e) => changeStatus(app.id, e.target.value)}>
                          {Object.entries(STATUS_LABELS).map(([key, { label }]) => (
                            <option key={key} value={key}>{label}</option>
                          ))}
                        </select>
                      </div>
                      {app.crmStatus === 'error' && (
                        <button className="app-resend-btn" onClick={() => resendToCrm(app.id)}>
                          🔄 Повторить отправку в CRM
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default Applications;