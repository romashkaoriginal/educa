import React, { useCallback, useEffect, useState } from 'react';
import '../../styles/SuperAdmin.css';
import { adminFetch } from './adminApi';
import { API_URL } from '../../config';
import ErrorLogsPanel from './ErrorLogsPanel';

const REFRESH_INTERVAL_MS = 5000;

function formatBytes(value) {
  const bytes = Number(value) || 0;
  if (bytes < 1024 ** 2) return `${Math.round(bytes / 1024)} КБ`;
  if (bytes < 1024 ** 3) return `${Math.round(bytes / 1024 ** 2)} МБ`;
  return `${(bytes / 1024 ** 3).toFixed(1).replace('.', ',')} ГБ`;
}

function getMemoryStatus(percent) {
  if (percent >= 90) return { label: 'Критично', tone: 'critical' };
  if (percent >= 75) return { label: 'Высокая нагрузка', tone: 'warning' };
  return { label: 'Норма', tone: 'normal' };
}

function MemoryRing({ percent, tone = 'normal' }) {
  const safePercent = Math.min(100, Math.max(0, Number(percent) || 0));
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - safePercent / 100);

  return (
    <div className={`superadmin-memory-ring superadmin-memory-ring--${tone}`} role="img" aria-label={`Оперативная память занята на ${safePercent}%`}>
      <svg viewBox="0 0 128 128" aria-hidden="true">
        <circle className="superadmin-memory-ring__track" cx="64" cy="64" r={radius} />
        <circle
          className="superadmin-memory-ring__value"
          cx="64"
          cy="64"
          r={radius}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <strong>{safePercent.toLocaleString('ru-RU')}%</strong>
      <span>занято</span>
    </div>
  );
}

function SuperAdmin({ dataRefreshKey = 0 }) {
  const [diagnostics, setDiagnostics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadDiagnostics = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const response = await adminFetch(`${API_URL}/admin/diagnostics`, { cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || 'Не удалось получить диагностику');
      setDiagnostics(data);
      setError('');
    } catch (requestError) {
      setError(requestError.message || 'Не удалось получить диагностику');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDiagnostics();
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === 'visible') loadDiagnostics({ silent: true });
    }, REFRESH_INTERVAL_MS);
    return () => window.clearInterval(intervalId);
  }, [loadDiagnostics, dataRefreshKey]);

  const memory = diagnostics?.memory;
  const memoryStatus = getMemoryStatus(memory?.usagePercent);
  const measuredAt = diagnostics?.measuredAt
    ? new Date(diagnostics.measuredAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : '—';

  return (
    <section className="superadmin-page" aria-labelledby="superadmin-title">
      <header className="superadmin-header">
        <div>
          <h2 id="superadmin-title">Состояние приложения</h2>
          <p>Текущая нагрузка production-сервера и активные пользователи.</p>
        </div>
        <div className="superadmin-live" aria-label="Данные обновляются автоматически">
          <span aria-hidden="true" />
          Обновлено {measuredAt}
        </div>
      </header>

      {loading && !diagnostics && (
        <div className="superadmin-loading" role="status">Получаем данные сервера…</div>
      )}

      {error && (
        <div className="superadmin-error" role="alert">
          <span>{error}</span>
          <button type="button" onClick={() => loadDiagnostics()}>Повторить</button>
        </div>
      )}

      {diagnostics && memory && (
        <div className="superadmin-diagnostics">
          <article className="superadmin-memory" aria-labelledby="memory-title">
            <div className="superadmin-section-heading">
              <div>
                <h3 id="memory-title">Оперативная память</h3>
                <p>Фактическое использование RAM с учётом освобождаемого кеша Linux.</p>
              </div>
              <span className={`superadmin-status superadmin-status--${memoryStatus.tone}`}>{memoryStatus.label}</span>
            </div>

            <div className="superadmin-memory-body">
              <MemoryRing percent={memory.usagePercent} tone={memoryStatus.tone} />
              <dl className="superadmin-memory-values">
                <div>
                  <dt>Используется</dt>
                  <dd>{formatBytes(memory.usedBytes)}</dd>
                </div>
                <div>
                  <dt>Доступно</dt>
                  <dd>{formatBytes(memory.availableBytes)}</dd>
                </div>
                <div>
                  <dt>Всего</dt>
                  <dd>{formatBytes(memory.totalBytes)}</dd>
                </div>
                <div>
                  <dt>Backend</dt>
                  <dd>{formatBytes(memory.processBytes)}</dd>
                </div>
              </dl>
            </div>
          </article>

          <aside className="superadmin-online" aria-labelledby="online-title">
            <div className="superadmin-online__signal" aria-hidden="true">
              <span /><span /><span />
            </div>
            <div>
              <h3 id="online-title">Сейчас онлайн</h3>
              <strong>{Number(diagnostics.onlineUsers || 0).toLocaleString('ru-RU')}</strong>
              <p>уникальных пользователей в приложении</p>
            </div>
            <small>Несколько вкладок одного пользователя считаются как одно подключение.</small>
          </aside>
        </div>
      )}

      <ErrorLogsPanel dataRefreshKey={dataRefreshKey} />
    </section>
  );
}

export { formatBytes, getMemoryStatus, MemoryRing };
export default SuperAdmin;
