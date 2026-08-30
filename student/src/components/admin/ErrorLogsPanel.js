import React, { useCallback, useEffect, useRef, useState } from 'react';
import { API_URL } from '../../config';
import { adminFetch } from './adminApi';

const REFRESH_INTERVAL_MS = 5000;
const ROLE_LABELS = { admin: 'Администратор', teacher: 'Преподаватель', manager: 'Менеджер', student: 'Ученик' };
const AREA_LABELS = {
  application: 'Приложение', auth: 'Авторизация', homework: 'Домашка', practice: 'Практика',
  lesson: 'Занятие', quiz: 'Викторина', statistics: 'Статистика', students: 'Ученики',
  users: 'Сотрудники', notifications: 'Уведомления', applications: 'Заявки', subjects: 'Предметы',
  guest: 'Гостевой режим', superadmin: 'Суперадмин'
};
const ACTION_LABELS = {
  load: 'загрузка', create: 'создание', update: 'изменение', delete: 'удаление', submit: 'отправка ответа',
  start: 'запуск', import: 'импорт', upload: 'загрузка файла', send: 'отправка',
  change_status: 'изменение статуса', render: 'отрисовка', async_operation: 'асинхронная операция',
  execute: 'выполнение', socket_event: 'realtime-событие'
};
const CONTEXT_LABELS = {
  homeworkId: 'ID домашки', homeworkName: 'Домашка', submissionId: 'ID попытки', subjectId: 'ID предмета',
  subjectName: 'Предмет', topicId: 'ID темы', practiceTopicName: 'Тема практики', questionId: 'ID вопроса',
  lessonId: 'ID занятия', lessonName: 'Занятие', quizId: 'ID викторины', quizName: 'Викторина',
  pollId: 'ID опроса', studentId: 'ID ученика', studentName: 'Ученик', teacherId: 'ID преподавателя',
  teacherName: 'Преподаватель', userId: 'ID пользователя', applicationId: 'ID заявки', groupId: 'ID группы',
  online: 'Интернет', viewport: 'Экран', componentStack: 'React-компонент', event: 'Событие'
};

function toDateTimeLocal(date) {
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60 * 1000);
  return shifted.toISOString().slice(0, 16);
}

function formatDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString('ru-RU', {
    day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit'
  });
}

function formatValue(value) {
  if (value === true) return 'да';
  if (value === false) return 'нет';
  if (value == null || value === '') return '—';
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

function describeLocation(log) {
  const area = AREA_LABELS[log.area] || log.area || 'Приложение';
  const action = ACTION_LABELS[log.action] || log.action || 'действие';
  return `${area} · ${action}`;
}

function LogDetails({ log, onCopy, copied }) {
  const contextEntries = Object.entries(log.context || {}).filter(([, value]) => value != null && value !== '' && value !== '[СКРЫТО]');
  return (
    <div className="error-log-details">
      <dl>
        <div><dt>Кто</dt><dd>{log.userName || 'Пользователь не определён'}{log.userRole ? ` · ${ROLE_LABELS[log.userRole] || log.userRole}` : ''}{log.userId ? ` · ID ${log.userId}` : ''}</dd></div>
        <div><dt>Где</dt><dd>{describeLocation(log)}</dd></div>
        {log.entityName && <div><dt>Объект</dt><dd>{log.entityName}{log.entityId ? ` · ID ${log.entityId}` : ''}</dd></div>}
        <div><dt>Запрос</dt><dd>{[log.method, log.path].filter(Boolean).join(' ') || '—'}</dd></div>
        <div><dt>Код</dt><dd>{[log.statusCode, log.code].filter(Boolean).join(' · ') || '—'}</dd></div>
        <div><dt>Первый раз</dt><dd>{formatDate(log.firstSeenAt)}</dd></div>
      </dl>
      {contextEntries.length > 0 && (
        <div className="error-log-context">
          <h5>Контекст</h5>
          <dl>
            {contextEntries.map(([key, value]) => (
              <div key={key}><dt>{CONTEXT_LABELS[key] || key}</dt><dd>{formatValue(value)}</dd></div>
            ))}
          </dl>
        </div>
      )}
      {log.stack && <pre className="error-log-stack">{log.stack}</pre>}
      <button type="button" className="error-log-copy" onClick={() => onCopy(log)}>{copied ? 'Скопировано' : 'Копировать детали'}</button>
    </div>
  );
}

function ErrorLogsPanel({ dataRefreshKey = 0 }) {
  const [preset, setPreset] = useState('24h');
  const [source, setSource] = useState('');
  const [area, setArea] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [logs, setLogs] = useState([]);
  const [summary, setSummary] = useState({ lastHour: 0, last24Hours: 0 });
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [copiedId, setCopiedId] = useState(null);
  const requestIdRef = useRef(0);
  const pageRef = useRef(1);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => setSearch(searchInput.trim()), 350);
    return () => window.clearTimeout(timeoutId);
  }, [searchInput]);

  const loadLogs = useCallback(async ({ silent = false, requestedPage = pageRef.current } = {}) => {
    if (preset === 'custom' && !customFrom) return;
    const requestId = ++requestIdRef.current;
    if (!silent) setLoading(true);
    try {
      const params = new URLSearchParams({ preset, page: String(requestedPage), limit: '50' });
      if (source) params.set('source', source);
      if (area) params.set('area', area);
      if (search) params.set('search', search);
      if (preset === 'custom') {
        params.set('from', new Date(customFrom).toISOString());
        if (customTo) params.set('to', new Date(customTo).toISOString());
      }
      const response = await adminFetch(`${API_URL}/admin/error-logs?${params}`, { cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || 'Не удалось получить логи');
      if (requestId !== requestIdRef.current) return;
      setLogs(data.logs || []);
      setTotal(Number(data.total || 0));
      setSummary(data.summary || { lastHour: 0, last24Hours: 0 });
      setError('');
    } catch (requestError) {
      if (requestId === requestIdRef.current) setError(requestError.message || 'Не удалось получить логи');
    } finally {
      if (!silent && requestId === requestIdRef.current) setLoading(false);
    }
  }, [area, customFrom, customTo, preset, search, source]);

  useEffect(() => {
    pageRef.current = 1;
    setPage(1);
    loadLogs({ requestedPage: 1 });
  }, [area, customFrom, customTo, dataRefreshKey, loadLogs, preset, search, source]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === 'visible') loadLogs({ silent: true });
    }, REFRESH_INTERVAL_MS);
    return () => window.clearInterval(intervalId);
  }, [loadLogs]);

  const changePreset = (event) => {
    const value = event.target.value;
    setPreset(value);
    if (value === 'custom' && !customFrom) {
      const now = new Date();
      setCustomTo(toDateTimeLocal(now));
      setCustomFrom(toDateTimeLocal(new Date(now.getTime() - 24 * 60 * 60 * 1000)));
    }
  };

  const changePage = (nextPage) => {
    pageRef.current = nextPage;
    setPage(nextPage);
    loadLogs({ requestedPage: nextPage });
  };

  const copyLog = async (log) => {
    const text = [
      `${formatDate(log.lastSeenAt)} · ${describeLocation(log)}`,
      log.message,
      `Пользователь: ${log.userName || 'не определён'} (${log.userRole || 'роль неизвестна'}, ID ${log.userId || '—'})`,
      `Запрос: ${[log.method, log.path].filter(Boolean).join(' ') || '—'}`,
      `Код: ${[log.statusCode, log.code].filter(Boolean).join(' · ') || '—'}`,
      `Контекст: ${JSON.stringify(log.context || {}, null, 2)}`,
      log.stack || ''
    ].filter(Boolean).join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(log.id);
      window.setTimeout(() => setCopiedId(null), 1600);
    } catch (_) { /* Clipboard may be unavailable in an old Telegram client. */ }
  };

  const totalPages = Math.max(1, Math.ceil(total / 50));

  return (
    <section className="error-logs" aria-labelledby="error-logs-title">
      <header className="error-logs__header">
        <div>
          <div className="error-logs__eyebrow"><span aria-hidden="true" /> Живой журнал</div>
          <h3 id="error-logs-title">Ошибки приложения</h3>
          <p>События обновляются каждые 5 секунд и хранятся 30 дней.</p>
        </div>
        <div className="error-logs__summary" aria-label="Сводка ошибок">
          <span><strong>{Number(summary.lastHour || 0).toLocaleString('ru-RU')}</strong> за час</span>
          <span><strong>{Number(summary.last24Hours || 0).toLocaleString('ru-RU')}</strong> за сутки</span>
        </div>
      </header>

      <div className="error-log-filters">
        <label className="error-log-search">
          <span>Поиск</span>
          <input type="search" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Ошибка, пользователь, раздел…" />
        </label>
        <label><span>Период</span><select value={preset} onChange={changePreset}><option value="1h">Последний час</option><option value="3h">Последние 3 часа</option><option value="24h">Последние 24 часа</option><option value="7d">Последняя неделя</option><option value="30d">Последние 30 дней</option><option value="custom">Свой период</option></select></label>
        <label><span>Источник</span><select value={source} onChange={(event) => setSource(event.target.value)}><option value="">Все</option><option value="backend">Сервер</option><option value="frontend">Интерфейс</option></select></label>
        <label><span>Раздел</span><select value={area} onChange={(event) => setArea(event.target.value)}><option value="">Все разделы</option>{Object.entries(AREA_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      </div>

      {preset === 'custom' && (
        <div className="error-log-custom-range">
          <label><span>С</span><input type="datetime-local" value={customFrom} onChange={(event) => setCustomFrom(event.target.value)} /></label>
          <label><span>По</span><input type="datetime-local" value={customTo} onChange={(event) => setCustomTo(event.target.value)} /></label>
        </div>
      )}

      {error && <div className="error-logs__error" role="alert"><span>{error}</span><button type="button" onClick={() => loadLogs()}>Повторить</button></div>}
      {loading && logs.length === 0 ? (
        <div className="error-logs__empty" role="status">Загружаем журнал…</div>
      ) : logs.length === 0 ? (
        <div className="error-logs__empty"><strong>За этот период ошибок нет</strong><span>Можно изменить период или поисковый запрос.</span></div>
      ) : (
        <div className="error-log-feed" role="log" aria-live="polite">
          {logs.map((log) => {
            const isExpanded = String(expandedId) === String(log.id);
            return (
              <article className={`error-log-item error-log-item--${log.severity || 'error'}`} key={log.id}>
                <button type="button" className="error-log-item__main" onClick={() => setExpandedId(isExpanded ? null : log.id)} aria-expanded={isExpanded}>
                  <span className="error-log-item__marker" aria-hidden="true">!</span>
                  <span className="error-log-item__content">
                    <span className="error-log-item__meta"><time dateTime={log.lastSeenAt}>{formatDate(log.lastSeenAt)}</time><span className={`error-log-source error-log-source--${log.source}`}>{log.source === 'frontend' ? 'Интерфейс' : 'Сервер'}</span>{Number(log.occurrences) > 1 && <span className="error-log-count">×{log.occurrences}</span>}</span>
                    <strong>{log.message}</strong>
                    <span className="error-log-item__where">{describeLocation(log)}{log.entityName ? ` · ${log.entityName}` : ''}</span>
                    <span className="error-log-item__user">{log.userName || 'Пользователь не определён'}{log.userRole ? ` · ${ROLE_LABELS[log.userRole] || log.userRole}` : ''}</span>
                  </span>
                  <span className="error-log-item__chevron" aria-hidden="true">⌄</span>
                </button>
                {isExpanded && <LogDetails log={log} onCopy={copyLog} copied={String(copiedId) === String(log.id)} />}
              </article>
            );
          })}
        </div>
      )}

      {total > 50 && (
        <nav className="error-log-pagination" aria-label="Страницы журнала">
          <button type="button" disabled={page <= 1} onClick={() => changePage(page - 1)}>Назад</button>
          <span>{page} из {totalPages} · найдено {total.toLocaleString('ru-RU')}</span>
          <button type="button" disabled={page >= totalPages} onClick={() => changePage(page + 1)}>Дальше</button>
        </nav>
      )}
    </section>
  );
}

export { describeLocation, formatDate };
export default ErrorLogsPanel;
