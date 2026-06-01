import React, { useState, useEffect, useCallback } from 'react';
import '../../styles/Notifications.css';

const API_URL = 'https://educa-production-a98e.up.railway.app/api';

const ACCESS_DAYS_OPTIONS = [
  { value: 'all', label: 'Любой срок' },
  { value: 'active', label: '✅ Активный доступ' },
  { value: 'expired', label: '❌ Уже истёк' },
  { value: 1, label: '⚡ Истекает через 1 день' },
  { value: 3, label: '🔔 Истекает через 3 дня' },
  { value: 7, label: '⏰ Истекает через 7 дней' },
];

const HOMEWORK_PERCENT_OPTIONS = [
  { value: 'all', label: 'Без фильтра (все ученики)' },
  { value: 'any', label: '📋 Хоть что-то сдавали' },
  { value: 'none', label: '🚫 Не начали домашку' },
  { value: 'lt30', label: '📉 Выполнили меньше 30%' },
  { value: 'lt50', label: '📊 Выполнили меньше 50%' },
  { value: 'gt80', label: '📈 Выполнили больше 80%' },
  { value: 'full', label: '✅ Выполнили на 100%' },
];

const ROLE_LABELS = {
  admin: '👨‍💼 Администратор',
  teacher: '👨‍🏫 Преподаватель',
  manager: '📊 Менеджер',
};

function Notifications({ subjects, currentUser }) {
  const [tab, setTab] = useState('send'); // 'send' | 'history'

  // ===== Фильтры =====
  const [selectedSubjectIds, setSelectedSubjectIds] = useState([]);
  const [accessDays, setAccessDays] = useState('all');
  const [homeworkPercent, setHomeworkPercent] = useState('all');

  // ===== Одиночная отправка =====
  const [allStudents, setAllStudents] = useState([]);
  const [studentSearch, setStudentSearch] = useState('');
  const [singleStudent, setSingleStudent] = useState(null); // выбранный ученик
  const [showStudentPicker, setShowStudentPicker] = useState(false);
  const [sendMode, setSendMode] = useState('filter'); // 'filter' | 'single'

  // ===== Превью получателей =====
  const [recipients, setRecipients] = useState([]);
  const [previewLoading, setPreviewLoading] = useState(false);

  // ===== Текст =====
  const [messageText, setMessageText] = useState('');

  // ===== Подтверждение =====
  const [showConfirm, setShowConfirm] = useState(false);

  // ===== Отправка =====
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState(null);

  // ===== История =====
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [expandedLog, setExpandedLog] = useState(null);

  // Загружаем превью при изменении фильтров
  const loadPreview = useCallback(async () => {
    setPreviewLoading(true);
    try {
      const res = await adminFetch(`${API_URL}/notify/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subjectIds: selectedSubjectIds.length > 0 ? selectedSubjectIds : undefined,
          accessDays: accessDays !== 'all' ? accessDays : undefined,
          homeworkPercent: homeworkPercent !== 'all' ? homeworkPercent : undefined
        })
      });
      const data = await res.json();
      setRecipients(data.students || []);
    } catch (e) {
      console.error(e);
    } finally {
      setPreviewLoading(false);
    }
  }, [selectedSubjectIds, accessDays, homeworkPercent]);

  useEffect(() => {
    loadPreview();
    loadAllStudents();
  }, []);

  useEffect(() => {
    if (sendMode === 'filter') loadPreview();
  }, [loadPreview, sendMode]);

  const loadAllStudents = async () => {
    try {
      const res = await adminFetch(`${API_URL}/students`);
      const data = await res.json();
      setAllStudents(data.students || []);
    } catch (e) { console.error(e); }
  };

  const loadHistory = async () => {
    setHistoryLoading(true);
    try {
      const res = await adminFetch(`${API_URL}/notify/history`);
      const data = await res.json();
      setHistory(data.logs || []);
    } catch (e) { console.error(e); }
    finally { setHistoryLoading(false); }
  };

  useEffect(() => {
    if (tab === 'history') loadHistory();
  }, [tab]);

  const toggleSubject = (id) => {
    setSelectedSubjectIds(prev =>
      prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]
    );
  };

  const handleSend = async () => {
    setSending(true);
    setShowConfirm(false);
    try {
      const body = {
        text: messageText,
        sentBy: currentUser?.id || 0,
        sentByName: currentUser ? `${currentUser.firstName} ${currentUser.lastName || ''}`.trim() : 'Администратор',
        sentByRole: currentUser?.role || 'admin',
      };

      if (sendMode === 'single' && singleStudent) {
        body.studentId = singleStudent.id;
      } else {
        body.filters = {
          subjectIds: selectedSubjectIds.length > 0 ? selectedSubjectIds : undefined,
          accessDays: accessDays !== 'all' ? accessDays : undefined,
          homeworkPercent: homeworkPercent !== 'all' ? homeworkPercent : undefined
        };
      }

      const res = await adminFetch(`${API_URL}/notify/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      setSendResult(data);
    } catch (e) {
      setSendResult({ message: 'Ошибка соединения', results: { sent: [], failed: [] } });
    } finally {
      setSending(false);
    }
  };

  const resetForm = () => {
    setMessageText('');
    setSendResult(null);
    loadPreview();
  };

  const filtersLabel = () => {
    if (sendMode === 'single') return singleStudent ? `${singleStudent.firstName} ${singleStudent.lastName || ''}` : 'Не выбран';
    const parts = [];
    if (selectedSubjectIds.length > 0) {
      const names = selectedSubjectIds.map(id => subjects.find(s => s.id === id)?.name).filter(Boolean);
      parts.push(names.join(', '));
    }
    if (accessDays !== 'all') parts.push(ACCESS_DAYS_OPTIONS.find(o => o.value === accessDays)?.label);
    if (homeworkPercent !== 'all') parts.push(HOMEWORK_PERCENT_OPTIONS.find(o => o.value === homeworkPercent)?.label);
    return parts.length > 0 ? parts.join(' · ') : 'Все ученики';
  };

  const canSend = sendMode === 'single'
    ? !!singleStudent && !!messageText.trim()
    : recipients.length > 0 && !!messageText.trim();

  const recipientCount = sendMode === 'single' ? (singleStudent ? 1 : 0) : recipients.length;

  const filteredStudentList = allStudents.filter(s => {
    const q = studentSearch.toLowerCase();
    return s.firstName?.toLowerCase().includes(q) ||
      s.lastName?.toLowerCase().includes(q) ||
      s.telegramUsername?.toLowerCase().includes(q);
  });

  return (
    <div className="notifications-section">
      {/* Вкладки */}
      <div className="notif-tabs">
        <button className={`notif-tab ${tab === 'send' ? 'active' : ''}`} onClick={() => setTab('send')}>
          ✉️ Отправить
        </button>
        <button className={`notif-tab ${tab === 'history' ? 'active' : ''}`} onClick={() => setTab('history')}>
          📋 История
        </button>
      </div>

      {/* ===== ВКЛАДКА ОТПРАВКИ ===== */}
      {tab === 'send' && !sendResult && (
        <div className="notif-layout">
          {/* Левая колонка: режим + фильтры */}
          <div className="notif-filters-panel">
            {/* Переключатель режима */}
            <div className="send-mode-switch">
              <button
                className={`mode-btn ${sendMode === 'filter' ? 'active' : ''}`}
                onClick={() => setSendMode('filter')}
              >🎯 По фильтрам</button>
              <button
                className={`mode-btn ${sendMode === 'single' ? 'active' : ''}`}
                onClick={() => setSendMode('single')}
              >👤 Одному ученику</button>
            </div>

            {/* Одиночная отправка */}
            {sendMode === 'single' && (
              <div className="single-student-picker">
                {singleStudent ? (
                  <div className="single-selected">
                    <div className="single-avatar">{singleStudent.firstName?.[0]}{singleStudent.lastName?.[0]}</div>
                    <div className="single-info">
                      <div className="single-name">{singleStudent.firstName} {singleStudent.lastName || ''}</div>
                      <div className="single-username">@{singleStudent.telegramUsername || 'нет username'}</div>
                    </div>
                    <button className="single-clear" onClick={() => setSingleStudent(null)}>✕</button>
                  </div>
                ) : (
                  <button className="pick-student-btn" onClick={() => setShowStudentPicker(true)}>
                    👤 Выбрать ученика
                  </button>
                )}
              </div>
            )}

            {/* Фильтры (только в режиме filter) */}
            {sendMode === 'filter' && (
              <>
                <h3 className="filters-title">🎯 Фильтры получателей</h3>

            {/* По предметам */}
            <div className="filter-section">
              <div className="filter-section-title">📚 По предметам</div>
              <div className="subjects-checkboxes">
                {subjects.map(s => (
                  <label key={s.id} className={`subject-check-item ${selectedSubjectIds.includes(s.id) ? 'checked' : ''}`}>
                    <input
                      type="checkbox"
                      checked={selectedSubjectIds.includes(s.id)}
                      onChange={() => toggleSubject(s.id)}
                    />
                    <span>{s.icon} {s.name}</span>
                  </label>
                ))}
                {selectedSubjectIds.length > 0 && (
                  <button className="clear-filter-btn" onClick={() => setSelectedSubjectIds([])}>
                    Сбросить
                  </button>
                )}
              </div>
            </div>

            {/* По дням доступа */}
            <div className="filter-section">
              <div className="filter-section-title">⏰ По сроку доступа</div>
              <select
                className="filter-select-full"
                value={accessDays}
                onChange={e => {
                  const v = e.target.value;
                  setAccessDays(v === 'all' ? 'all' : isNaN(v) ? v : parseInt(v));
                }}
              >
                {ACCESS_DAYS_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            {/* По домашке */}
            <div className="filter-section">
              <div className="filter-section-title">📝 По выполнению домашки</div>
              <select
                className="filter-select-full"
                value={homeworkPercent}
                onChange={e => setHomeworkPercent(e.target.value)}
              >
                {HOMEWORK_PERCENT_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            </>
            )}
          </div>

          {/* Правая колонка: получатели + текст */}
          <div className="notif-compose">
            {/* Превью получателей */}
            <div className="recipients-preview">
              <div className="recipients-header">
                <span className="recipients-title">👥 Получатели</span>
                <span className={`recipients-count ${recipientCount === 0 ? 'zero' : ''}`}>
                  {previewLoading && sendMode === 'filter' ? '...' : recipientCount}
                </span>
              </div>
              <div className="filters-applied">{filtersLabel()}</div>
              {sendMode === 'filter' && !previewLoading && recipients.length > 0 && (
                <div className="recipients-chips">
                  {recipients.slice(0, 6).map(r => (
                    <span key={r.id} className="recipient-chip">
                      {r.firstName} {r.lastName?.[0] ? r.lastName[0] + '.' : ''}
                      {!r.telegramId && ' ⚠️'}
                    </span>
                  ))}
                  {recipients.length > 6 && (
                    <span className="recipient-chip more">+{recipients.length - 6} ещё</span>
                  )}
                </div>
              )}
              {sendMode === 'filter' && !previewLoading && recipients.length === 0 && (
                <div className="no-recipients">Нет учеников по выбранным фильтрам</div>
              )}
              {sendMode === 'single' && !singleStudent && (
                <div className="no-recipients">Выберите ученика в левой панели</div>
              )}
            </div>

            {/* Текст сообщения */}
            <div className="compose-section">
              <label className="compose-label">📝 Текст уведомления *</label>
              <textarea
                className="compose-textarea"
                rows={7}
                placeholder="Введите текст сообщения..."
                value={messageText}
                onChange={e => setMessageText(e.target.value)}
                maxLength={4000}
              />
              <div className="char-count">{messageText.length}/4000</div>
            </div>

            {/* Превью в Telegram */}
            {messageText.trim() && (
              <div className="tg-preview">
                <div className="tg-preview-label">Как выглядит в Telegram:</div>
                <div className="tg-bubble">
                  <div className="tg-bubble-text">{messageText}</div>
                </div>
              </div>
            )}

            {/* Кнопка отправить */}
            <button
              className="send-btn"
              onClick={() => setShowConfirm(true)}
              disabled={!canSend || sending}
            >
              {sending ? '⏳ Отправка...' : `✉️ Отправить (${recipientCount} уч.)`}
            </button>
          </div>
        </div>
      )}

      {/* ===== РЕЗУЛЬТАТ ОТПРАВКИ ===== */}
      {tab === 'send' && sendResult && (
        <div className="send-result-screen">
          <div className={`result-banner ${sendResult.results?.failed?.length === 0 ? 'success' : 'partial'}`}>
            {sendResult.results?.failed?.length === 0
              ? '✅ Все сообщения отправлены!'
              : `⚠️ ${sendResult.message}`}
          </div>
          <div className="result-columns">
            {sendResult.results?.sent?.length > 0 && (
              <div className="result-col">
                <div className="result-col-title">✅ Успешно ({sendResult.results.sent.length})</div>
                {sendResult.results.sent.map((s, i) => (
                  <div key={i} className="result-row-item success">{s.name}</div>
                ))}
              </div>
            )}
            {sendResult.results?.failed?.length > 0 && (
              <div className="result-col">
                <div className="result-col-title">❌ Ошибки ({sendResult.results.failed.length})</div>
                {sendResult.results.failed.map((s, i) => (
                  <div key={i} className="result-row-item error">{s.name} — <span>{s.reason}</span></div>
                ))}
              </div>
            )}
          </div>
          <button className="send-btn" onClick={resetForm}>← Новое уведомление</button>
        </div>
      )}

      {/* ===== ИСТОРИЯ ===== */}
      {tab === 'history' && (
        <div className="history-section">
          {historyLoading ? (
            <p style={{textAlign:'center', color:'#6b7280', padding:40}}>Загрузка...</p>
          ) : history.length === 0 ? (
            <div className="empty-state"><div className="empty-icon">📋</div><p>История пуста</p></div>
          ) : (
            history.map(log => (
              <div key={log.id} className="history-card">
                <div className="history-header" onClick={() => setExpandedLog(expandedLog === log.id ? null : log.id)}>
                  <div className="history-left">
                    <span className="history-expand">{expandedLog === log.id ? '▼' : '▶'}</span>
                    <div>
                      <div className="history-meta">
                        <span className="history-sender">👤 {log.sentByName}</span>
                        <span className="history-role">{ROLE_LABELS[log.sentByRole] || log.sentByRole || '👨‍💼 Администратор'}</span>
                        <span className="history-date">{new Date(log.createdAt).toLocaleString('ru-RU', {day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'})}</span>
                      </div>
                      <div className="history-preview-text">
                        {log.text.length > 80 ? log.text.slice(0, 80) + '...' : log.text}
                      </div>
                    </div>
                  </div>
                  <div className="history-stats">
                    <span className="h-stat success">✅ {log.successCount}</span>
                    {log.failedCount > 0 && <span className="h-stat error">❌ {log.failedCount}</span>}
                    <span className="h-stat total">👥 {log.recipientCount}</span>
                  </div>
                </div>

                {expandedLog === log.id && (
                  <div className="history-body">
                    {/* Фильтры */}
                    {log.filters && Object.keys(log.filters).length > 0 && (
                      <div className="history-filters">
                        <strong>Фильтры:</strong>
                        {log.filters.subjectIds?.length > 0 && (
                        <span>📚 {log.filters.subjectIds.map(id => {
                          const subj = subjects.find(s => s.id === id || s.id === parseInt(id));
                          return subj ? `${subj.icon} ${subj.name}` : `#${id}`;
                        }).join(', ')}</span>
                      )}
                        {log.filters.accessDays && (
                          <span>⏰ {ACCESS_DAYS_OPTIONS.find(o => o.value == log.filters.accessDays)?.label}</span>
                        )}
                        {log.filters.homeworkPercent && (
                          <span>📝 {HOMEWORK_PERCENT_OPTIONS.find(o => o.value === log.filters.homeworkPercent)?.label}</span>
                        )}
                      </div>
                    )}
                    {/* Полный текст */}
                    <div className="history-full-text">{log.text}</div>
                    {/* Получатели */}
                    {log.recipients && (
                      <div className="history-recipients">
                        <strong>Получатели:</strong>
                        <div className="recipients-chips" style={{marginTop:8}}>
                          {log.recipients.filter(r => r.status === 'sent').map((r, i) => (
                            <span key={i} className="recipient-chip">✅ {r.name}</span>
                          ))}
                          {log.recipients.filter(r => r.status === 'failed').map((r, i) => (
                            <span key={i} className="recipient-chip error">❌ {r.name}</span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* ===== МОДАЛКА ПОДТВЕРЖДЕНИЯ ===== */}
      {showConfirm && (
        <div className="modal-overlay" onClick={() => setShowConfirm(false)}>
          <div className="confirm-modal" onClick={e => e.stopPropagation()}>
            <div className="confirm-icon">⚠️</div>
            <h3>Подтверждение отправки</h3>
            <p>Вы собираетесь отправить сообщение <strong>{recipients.length} ученикам</strong>.</p>
            <div className="confirm-preview">
              <div className="confirm-filters">Фильтры: {filtersLabel()}</div>
              <div className="confirm-text">"{messageText.length > 100 ? messageText.slice(0, 100) + '...' : messageText}"</div>
            </div>
            <p style={{color:'#6b7280', fontSize:13}}>Это действие нельзя отменить.</p>
            <div className="confirm-actions">
              <button className="btn-secondary" onClick={() => setShowConfirm(false)}>Отмена</button>
              <button className="btn-danger-confirm" onClick={handleSend}>
                ✉️ Да, отправить {recipients.length} сообщений
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ===== ПИКЕР УЧЕНИКА ===== */}
      {showStudentPicker && (
        <div className="modal-overlay" onClick={() => setShowStudentPicker(false)}>
          <div className="modal-content student-picker-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>👤 Выбрать ученика</h2>
              <button className="modal-close" onClick={() => setShowStudentPicker(false)}>✕</button>
            </div>
            <div style={{padding: '12px 20px'}}>
              <input
                type="text"
                className="compose-textarea"
                style={{minHeight:'unset', resize:'none', padding:'10px 14px'}}
                placeholder="🔍 Поиск по имени или username..."
                value={studentSearch}
                onChange={e => setStudentSearch(e.target.value)}
                autoFocus
              />
            </div>
            <div className="student-picker-list">
              {filteredStudentList.map(s => (
                <div
                  key={s.id}
                  className="picker-student-row"
                  onClick={() => { setSingleStudent(s); setShowStudentPicker(false); setStudentSearch(''); }}
                >
                  <div className="notify-avatar">{s.firstName?.[0]}{s.lastName?.[0]}</div>
                  <div className="notify-info">
                    <div className="notify-name">{s.firstName} {s.lastName || ''}</div>
                    <div className="notify-meta">@{s.telegramUsername || 'нет username'}{!s.telegramId && ' ⚠️ нет TG ID'}</div>
                  </div>
                </div>
              ))}
              {filteredStudentList.length === 0 && (
                <div className="no-recipients" style={{padding: 20}}>Ничего не найдено</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Notifications;