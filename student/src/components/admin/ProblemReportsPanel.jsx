import React, { useCallback, useEffect, useRef, useState } from 'react';
import { API_URL } from '../../config';
import { adminFetch } from './adminApi';
import { useConfirmDelete } from './useConfirmDelete';

const REFRESH_INTERVAL_MS = 10000;

const ROLE_LABELS = {
  superadmin: 'Суперадмин', admin: 'Администратор', teacher: 'Преподаватель',
  manager: 'Менеджер', student: 'Ученик', parent: 'Родитель', guest: 'Гость'
};

const STATUS_LABELS = {
  new: 'Новая', in_progress: 'В работе', resolved: 'Решено', rejected: 'Отклонено'
};
const STATUS_OPTIONS = ['new', 'in_progress', 'resolved', 'rejected'];

function formatDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit'
  });
}

// Загружает скриншот жалобы как blob — эндпоинт закрыт requireSuperAdmin,
// поэтому обычный <img src> не подходит (не может послать initData-заголовок).
function Screenshot({ storageKey }) {
  const [src, setSrc] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let revoke = null;
    let cancelled = false;
    (async () => {
      try {
        const response = await adminFetch(`${API_URL}/problem-reports/screenshots/${storageKey}`);
        if (!response.ok) throw new Error('load failed');
        const blob = await response.blob();
        if (cancelled) return;
        const url = URL.createObjectURL(blob);
        revoke = url;
        setSrc(url);
      } catch {
        if (!cancelled) setError(true);
      }
    })();
    return () => {
      cancelled = true;
      if (revoke) URL.revokeObjectURL(revoke);
    };
  }, [storageKey]);

  if (error) return <div className="problem-report-screenshot problem-report-screenshot--error">Не удалось загрузить</div>;
  if (!src) return <div className="problem-report-screenshot problem-report-screenshot--loading" />;
  return (
    <a href={src} target="_blank" rel="noreferrer" className="problem-report-screenshot">
      <img src={src} alt="Скриншот жалобы" loading="lazy" />
    </a>
  );
}

function ReportDetails({ report, onChangeStatus, onDelete, updatingStatus }) {
  return (
    <div className="problem-report-details">
      <p className="problem-report-text">{report.text}</p>

      {report.screenshots?.length > 0 && (
        <div className="problem-report-screenshots">
          {report.screenshots.map((key) => <Screenshot key={key} storageKey={key} />)}
        </div>
      )}

      <dl className="problem-report-meta">
        <div><dt>Кто</dt><dd>{report.reporterName || 'Не определён'}{report.reporterRole ? ` · ${ROLE_LABELS[report.reporterRole] || report.reporterRole}` : ''}</dd></div>
        <div><dt>Telegram ID</dt><dd>{report.reporterTelegramId || '—'}</dd></div>
        <div><dt>Дата</dt><dd>{formatDate(report.createdAt)}</dd></div>
        <div><dt>Статус</dt><dd>{STATUS_LABELS[report.status] || report.status}</dd></div>
      </dl>

      <div className="problem-report-actions">
        {STATUS_OPTIONS.filter((s) => s !== report.status).map((s) => (
          <button
            key={s}
            type="button"
            className={`problem-report-status-btn problem-report-status-btn--${s}`}
            disabled={updatingStatus}
            onClick={() => onChangeStatus(report.id, s)}
          >
            {STATUS_LABELS[s]}
          </button>
        ))}
        <button type="button" className="problem-report-delete-btn" onClick={() => onDelete(report)}>
          Удалить
        </button>
      </div>
    </div>
  );
}

function ProblemReportsPanel({ dataRefreshKey = 0 }) {
  const [reports, setReports] = useState([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [updatingId, setUpdatingId] = useState(null);
  const requestIdRef = useRef(0);
  const { confirmDelete, ConfirmDeleteDialog } = useConfirmDelete();

  const loadReports = useCallback(async ({ silent = false } = {}) => {
    const requestId = ++requestIdRef.current;
    if (!silent) setLoading(true);
    try {
      const response = await adminFetch(`${API_URL}/problem-reports`, { cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || 'Не удалось получить жалобы');
      if (requestId !== requestIdRef.current) return;
      setReports(data.reports || []);
      setError('');
    } catch (requestError) {
      if (requestId === requestIdRef.current) setError(requestError.message || 'Не удалось получить жалобы');
    } finally {
      if (!silent && requestId === requestIdRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadReports();
  }, [loadReports, dataRefreshKey]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === 'visible') loadReports({ silent: true });
    }, REFRESH_INTERVAL_MS);
    return () => window.clearInterval(intervalId);
  }, [loadReports]);

  const changeStatus = async (id, status) => {
    setUpdatingId(id);
    try {
      const response = await adminFetch(`${API_URL}/problem-reports/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || 'Не удалось изменить статус');
      setReports((prev) => prev.map((r) => (r.id === id ? data.report : r)));
    } catch (requestError) {
      setError(requestError.message || 'Не удалось изменить статус');
    } finally {
      setUpdatingId(null);
    }
  };

  const deleteReport = async (report) => {
    const confirmed = await confirmDelete({
      title: 'Удалить жалобу?',
      message: 'Жалоба и её скриншоты будут удалены без возможности восстановления.',
      entityName: report.text?.slice(0, 80)
    });
    if (!confirmed) return;
    try {
      const response = await adminFetch(`${API_URL}/problem-reports/${report.id}`, { method: 'DELETE' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || 'Не удалось удалить жалобу');
      setReports((prev) => prev.filter((r) => r.id !== report.id));
      if (expandedId === report.id) setExpandedId(null);
    } catch (requestError) {
      setError(requestError.message || 'Не удалось удалить жалобу');
    }
  };

  const filteredReports = statusFilter ? reports.filter((r) => r.status === statusFilter) : reports;
  const newCount = reports.filter((r) => r.status === 'new').length;

  return (
    <section className="problem-reports" aria-labelledby="problem-reports-title">
      {ConfirmDeleteDialog}
      <header className="problem-reports__header">
        <div>
          <h3 id="problem-reports-title">Жалобы «Сообщить о проблеме»</h3>
          <p>Заявки, собранные ботом: текст проблемы и скриншоты от пользователей всех ролей.</p>
        </div>
        <div className="problem-reports__summary">
          <span><strong>{newCount}</strong> новых</span>
          <span><strong>{reports.length}</strong> всего</span>
        </div>
      </header>

      <div className="problem-report-filters">
        <label>
          <span>Статус</span>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="">Все статусы</option>
            {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
          </select>
        </label>
      </div>

      {error && <div className="problem-reports__error" role="alert"><span>{error}</span><button type="button" onClick={() => loadReports()}>Повторить</button></div>}

      {loading && filteredReports.length === 0 ? (
        <div className="problem-reports__empty" role="status">Загружаем жалобы…</div>
      ) : filteredReports.length === 0 ? (
        <div className="problem-reports__empty"><strong>Жалоб нет</strong><span>Можно изменить фильтр по статусу.</span></div>
      ) : (
        <div className="problem-report-feed" role="log" aria-live="polite">
          {filteredReports.map((report) => {
            const isExpanded = expandedId === report.id;
            return (
              <article className={`problem-report-item problem-report-item--${report.status}`} key={report.id}>
                <button type="button" className="problem-report-item__main" onClick={() => setExpandedId(isExpanded ? null : report.id)} aria-expanded={isExpanded}>
                  <span className={`problem-report-status-badge problem-report-status-badge--${report.status}`}>{STATUS_LABELS[report.status]}</span>
                  <span className="problem-report-item__content">
                    <span className="problem-report-item__meta">
                      <time dateTime={report.createdAt}>{formatDate(report.createdAt)}</time>
                      {report.screenshots?.length > 0 && <span className="problem-report-attach-count">📎 {report.screenshots.length}</span>}
                    </span>
                    <strong>{report.text}</strong>
                    <span className="problem-report-item__user">{report.reporterName || 'Не определён'}{report.reporterRole ? ` · ${ROLE_LABELS[report.reporterRole] || report.reporterRole}` : ''}</span>
                  </span>
                  <span className="problem-report-item__chevron" aria-hidden="true">⌄</span>
                </button>
                {isExpanded && (
                  <ReportDetails
                    report={report}
                    onChangeStatus={changeStatus}
                    onDelete={deleteReport}
                    updatingStatus={updatingId === report.id}
                  />
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

export default ProblemReportsPanel;
