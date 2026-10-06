import React, { useState, useEffect, useCallback } from 'react';
import '../../styles/Notifications.css';
import { adminFetch } from './adminApi';

import { API_URL } from '../../config';
import { useSectionRefresh } from './useSectionRefresh';

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
  scheduled: '🕒 По расписанию',
  catchup: '🔁 Догоняющая отправка',
  manual_unknown: 'Ручная отправка · автор не сохранён',
  superadmin: '🛡️ Суперадмин',
  admin: '👨‍💼 Администратор',
  teacher: '👨‍🏫 Преподаватель',
  manager: '📊 Менеджер',
};

// Ручные отправки всегда пишут автора и свой deliveryKind (manual_*), поэтому
// запись без автора с deliveryKind 'scheduled' — автоматическая. Календарные
// эвристики не годятся: месячный отчёт идёт скользящим окном в 30 дней.
function hasParentReportSender(report) {
  return !!(report.manualTriggeredByName || report.manualTriggeredBy || report.triggeredByName || report.triggeredBy);
}

// Догоняющая отправка после подключения Telegram: новые записи помечены
// deliveryKind 'catchup'; у старых плановая неделя всегда начинается с понедельника.
function isCatchupParentReport(report) {
  if (hasParentReportSender(report)) return false;
  if (report.deliveryKind === 'catchup') return true;
  if (report.deliveryKind !== 'scheduled' || report.reportType !== 'weekly' || !report.periodStart) return false;
  return new Date(`${report.periodStart}T00:00:00Z`).getUTCDay() !== 1;
}

function isScheduledParentReport(report) {
  return report.deliveryKind === 'scheduled' && !isCatchupParentReport(report)
    && !(report.manualTriggeredByName || report.manualTriggeredBy || report.triggeredByName || report.triggeredBy);
}

function NotificationHistoryRecipients({ recipients }) {
  const delivery = Array.isArray(recipients) ? recipients : [];
  const delivered = delivery.filter((recipient) => recipient.status === 'sent');
  const failed = delivery.filter((recipient) => recipient.status === 'failed');

  if (delivery.length === 0) {
    return <p className="history-delivery-empty">Для этой старой рассылки детальный список не сохранён.</p>;
  }

  return (
    <section className="history-delivery" aria-label="Результаты доставки уведомлений">
      <strong>Результаты доставки</strong>
      <div className="history-delivery-columns">
        <div>
          <div className="history-delivery-title success">✅ Отправлено ({delivered.length})</div>
          <div className="history-delivery-list">
            {delivered.map((recipient) => (
              <div key={recipient.id} className="history-delivery-row success">{recipient.name}</div>
            ))}
            {delivered.length === 0 && <p>Нет доставленных сообщений</p>}
          </div>
        </div>
        <div>
          <div className="history-delivery-title error">❌ Не отправлено ({failed.length})</div>
          <div className="history-delivery-list">
            {failed.map((recipient) => (
              <div key={recipient.id} className="history-delivery-row error">
                {recipient.name}{recipient.reason ? ` — ${recipient.reason}` : ''}
              </div>
            ))}
            {failed.length === 0 && <p>Все сообщения доставлены</p>}
          </div>
        </div>
      </div>
    </section>
  );
}

function Notifications({ subjects, currentUser, dataRefreshKey = 0 }) {
  const [tab, setTab] = useState('send'); // 'send' | 'history'

  // ===== Фильтры =====
  const [recipientAudience, setRecipientAudience] = useState('students');
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
  const [historyAudience, setHistoryAudience] = useState('students');
  const studentHistory = history.filter((log) => !log.isParentReport);
  const parentHistory = history.filter((log) => log.isParentReport);
  const visibleHistory = historyAudience === 'parents' ? parentHistory : studentHistory;

  // Загружаем превью при изменении фильтров
  const loadPreview = useCallback(async () => {
    setPreviewLoading(true);
    try {
      const res = await adminFetch(`${API_URL}/notify/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audience: recipientAudience,
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
  }, [recipientAudience, selectedSubjectIds, accessDays, homeworkPercent]);

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
      const [notificationsResponse, parentReportsResponse] = await Promise.all([
        adminFetch(`${API_URL}/notify/history`),
        adminFetch(`${API_URL}/parents/report-logs`)
      ]);
      const [notificationsData, parentReportsData] = await Promise.all([
        notificationsResponse.json(),
        parentReportsResponse.json()
      ]);
      const parentReportHistory = (parentReportsData.logs || []).map((report) => {
        const parent = report.parent;
        const parentName = [parent?.firstName, parent?.lastName].filter(Boolean).join(' ').trim()
          || (parent?.telegramUsername ? `@${parent.telegramUsername.replace(/^@/, '')}` : null)
          || (parent?.telegramId ? `Telegram ID ${parent.telegramId}` : null)
          || 'Родитель удалён';
        const sent = report.status === 'sent';
        const reportType = report.reportType === 'monthly' ? 'Месячный' : 'Еженедельный';
        const period = report.periodStart && report.periodEnd
          ? ` за ${new Date(`${report.periodStart}T00:00:00`).toLocaleDateString('ru-RU')}–${new Date(`${report.periodEnd}T00:00:00`).toLocaleDateString('ru-RU')}`
          : '';
        const statusReasons = {
          skipped_no_telegram: 'Родитель ещё не подключил Telegram',
          skipped_no_access: 'Нет ученика с активным доступом',
          processing: 'Отправка ещё выполняется'
        };
        const isCatchup = isCatchupParentReport(report);
        const isScheduled = isScheduledParentReport(report);
        const hasManualSender = report.triggeredByName || report.manualTriggeredByName
          || report.triggeredBy || report.manualTriggeredBy;
        const sender = report.triggeredByName
          || report.manualTriggeredByName
          || [report.triggeredBy?.firstName, report.triggeredBy?.lastName].filter(Boolean).join(' ')
          || [report.manualTriggeredBy?.firstName, report.manualTriggeredBy?.lastName].filter(Boolean).join(' ')
          || (isCatchup ? 'Автоматически, после подключения Telegram' : isScheduled ? 'Автоматическая рассылка' : 'Отправитель не сохранён');
        return {
          id: `parent-report-${report.id}`,
          isParentReport: true,
          parentReportBatchId: report.batchId || null,
          parentReportGroupKey: report.batchId && report.triggerScope === 'bulk'
            ? `batch-${report.batchId}`
            : (isScheduled
              ? `scheduled-${report.reportType}-${report.periodStart}`
              : (report.triggerScope === 'bulk' && (report.triggeredByName || report.manualTriggeredByName)
                ? `bulk-${report.reportType}-${report.periodStart}-${report.triggeredByName || report.manualTriggeredByName}-${String(report.createdAt).slice(0, 16)}`
                : null)),
          isScheduledReport: isScheduled,
          isManualReport: !isScheduled && !isCatchup,
          sentByName: sender,
          sentByRole: report.triggeredBy?.role || report.manualTriggeredBy?.role
            || (isCatchup ? 'catchup' : isScheduled ? 'scheduled' : (!hasManualSender ? 'manual_unknown' : '')),
          createdAt: report.sentAt || report.createdAt,
          text: `${reportType.toLowerCase()} отчёт${period}`,
          successCount: sent ? 1 : 0,
          failedCount: sent ? 0 : 1,
          recipientCount: 1,
          filters: { parentReport: true, reportType, periodStart: report.periodStart, periodEnd: report.periodEnd, triggerScope: report.triggerScope, isScheduled },
          recipients: [{
            id: `parent-${report.parentId || report.id}`,
            name: parentName,
            status: sent ? 'sent' : 'failed',
            ...(!sent ? { reason: report.error || statusReasons[report.status] || 'Не удалось отправить отчёт' } : {})
          }]
        };
      });
      const groupedParentReports = new Map();
      const individualParentReports = [];
      parentReportHistory.forEach((report) => {
        const key = report.parentReportGroupKey;
        if (!key) {
          individualParentReports.push(report);
          return;
        }
        if (!groupedParentReports.has(key)) {
          groupedParentReports.set(key, {
            ...report,
            id: `parent-report-group-${key}`,
            text: report.text.replace(' отчёт за ', ' отчёт всем родителям за '),
            filters: { ...report.filters, triggerScope: 'bulk' },
            successCount: 0,
            failedCount: 0,
            recipientCount: 0,
            recipients: []
          });
        }
        const batch = groupedParentReports.get(key);
        batch.successCount += report.successCount;
        batch.failedCount += report.failedCount;
        batch.recipientCount += report.recipientCount;
        batch.recipients.push(...report.recipients);
        if (new Date(report.createdAt) < new Date(batch.createdAt)) batch.createdAt = report.createdAt;
      });
      groupedParentReports.forEach((group) => {
        group.recipients.sort((a, b) => (a.status === 'failed' ? 0 : 1) - (b.status === 'failed' ? 0 : 1));
      });
      setHistory([...(notificationsData.logs || []), ...individualParentReports, ...groupedParentReports.values()]
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
    } catch (e) { console.error(e); }
    finally { setHistoryLoading(false); }
  };

  useEffect(() => {
    if (tab === 'history') loadHistory();
  }, [tab]);

  useSectionRefresh(dataRefreshKey, () => {
    loadAllStudents();
    loadPreview();
    if (tab === 'history') loadHistory();
  });

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
        mode: sendMode === 'single' ? 'single' : 'filter',
        text: messageText,
      };

      if (sendMode === 'single' && singleStudent) {
        body.studentId = singleStudent.id;
      } else {
        body.filters = {
          audience: recipientAudience,
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
      const results = {
        sent: Array.isArray(data?.results?.sent) ? data.results.sent : [],
        failed: Array.isArray(data?.results?.failed) ? data.results.failed : [],
      };
      if (!res.ok) {
        results.failed.push({
          id: 'request-error',
          name: 'Рассылка не выполнена',
          reason: data?.message || 'Не удалось отправить уведомление',
        });
      }
      setSendResult({
        message: data?.message || `Доставлено: ${results.sent.length}, не доставлено: ${results.failed.length}`,
        results,
      });
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
    const parts = [recipientAudience === 'guests' ? 'Гости с доступом' : 'Ученики'];
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

  const filteredStudentList = allStudents.filter(s => s.isActive !== false).filter(s => {
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

            <div className="filter-section">
              <div className="filter-section-title">👥 Получатели</div>
              <div className="audience-switch" role="group" aria-label="Тип получателей">
                <button
                  type="button"
                  className={`audience-btn ${recipientAudience === 'students' ? 'active' : ''}`}
                  onClick={() => setRecipientAudience('students')}
                >🎓 Ученики</button>
                <button
                  type="button"
                  className={`audience-btn ${recipientAudience === 'guests' ? 'active' : ''}`}
                  onClick={() => setRecipientAudience('guests')}
                >🎟️ Гости</button>
              </div>
              <div className="audience-hint">
                {recipientAudience === 'guests'
                  ? 'Только пользователи с гостевым доступом, в том числе истёкшим.'
                  : 'Гости исключены из этой рассылки.'}
              </div>
            </div>

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
                <div className="no-recipients">
                  {recipientAudience === 'guests'
                    ? 'Нет гостей по выбранным фильтрам'
                    : 'Нет учеников по выбранным фильтрам'}
                </div>
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
              {sending ? '⏳ Отправка...' : `✉️ Отправить (${recipientCount} получ.)`}
            </button>
          </div>
        </div>
      )}

      {/* ===== РЕЗУЛЬТАТ ОТПРАВКИ ===== */}
      {tab === 'send' && sendResult && (
        <div className="send-result-screen">
          <div className={`result-banner ${sendResult.results?.failed?.length === 0 ? 'success' : 'partial'}`}>
            {sendResult.results?.failed?.length === 0
              ? '✅ Сообщения доставлены всем получателям'
              : `⚠️ ${sendResult.message}`}
          </div>
          <div className="result-columns">
            <div className="result-col">
              <div className="result-col-title">✅ Доставлено ({sendResult.results.sent.length})</div>
              <div className="result-list" aria-label="Уведомления доставлены">
                {sendResult.results.sent.length > 0
                  ? sendResult.results.sent.map((student) => (
                    <div key={student.id} className="result-row-item success">{student.name}</div>
                  ))
                  : <p className="result-list-empty">Нет доставленных сообщений</p>}
              </div>
            </div>
            <div className="result-col">
              <div className="result-col-title">❌ Не доставлено ({sendResult.results.failed.length})</div>
              <div className="result-list" aria-label="Уведомления не доставлены">
                {sendResult.results.failed.length > 0
                  ? sendResult.results.failed.map((student) => (
                    <div key={student.id} className="result-row-item error">{student.name} — <span>{student.reason}</span></div>
                  ))
                  : <p className="result-list-empty">Все сообщения доставлены</p>}
              </div>
            </div>
          </div>
          <button className="send-btn" onClick={resetForm}>← Новое уведомление</button>
        </div>
      )}

      {/* ===== ИСТОРИЯ ===== */}
      {tab === 'history' && (
        <div className="history-section">
          <div className="history-audience-switch" role="group" aria-label="Тип рассылок в истории">
            <button
              type="button"
              className={historyAudience === 'students' ? 'active' : ''}
              aria-pressed={historyAudience === 'students'}
              onClick={() => setHistoryAudience('students')}
            >
              Ученики <span>{studentHistory.length}</span>
            </button>
            <button
              type="button"
              className={historyAudience === 'parents' ? 'active' : ''}
              aria-pressed={historyAudience === 'parents'}
              onClick={() => setHistoryAudience('parents')}
            >
              Родители <span>{parentHistory.length}</span>
            </button>
          </div>
          {historyLoading ? (
            <p style={{textAlign:'center', color:'#6b7280', padding:40}}>Загрузка...</p>
          ) : visibleHistory.length === 0 ? (
            <div className="empty-state"><div className="empty-icon">📋</div><p>{historyAudience === 'parents' ? 'Истории рассылок родителям пока нет' : 'История уведомлений ученикам пуста'}</p></div>
          ) : (
            visibleHistory.map(log => (
              <div key={log.id} className="history-card">
                <div className="history-header" onClick={() => setExpandedLog(expandedLog === log.id ? null : log.id)}>
                  <div className="history-left">
                    <span className="history-expand">{expandedLog === log.id ? '▼' : '▶'}</span>
                    <div>
                      <div className="history-meta">
                        {log.isParentReport && log.isManualReport && (
                          <span className="history-role">✋ Ручная отправка{log.filters.triggerScope === 'bulk' ? ' · всем родителям' : ' · одному родителю'}</span>
                        )}
                        <span className="history-sender">👤 {log.sentByName}</span>
                        {(log.isParentReport ? log.sentByRole : (log.sentByRole || 'admin')) && (
                          <span className="history-role">{ROLE_LABELS[log.sentByRole] || log.sentByRole || (log.isParentReport ? '' : '👨‍💼 Администратор')}</span>
                        )}
                        <span className="history-date">{new Date(log.createdAt).toLocaleString('ru-RU', {day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'})}</span>
                      </div>
                      <div className="history-preview-text">
                        {(log.text || '').length > 80 ? log.text.slice(0, 80) + '...' : log.text}
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
                        <strong>{log.isParentReport ? 'Отчёт:' : 'Фильтры:'}</strong>
                        {log.isParentReport && <span>{log.filters.reportType}{log.filters.triggerScope === 'bulk' ? (log.filters.isScheduled ? ' · Всем родителям (по расписанию)' : ' · Всем родителям (принудительно)') : ''}</span>}
                        {log.isParentReport && log.filters.periodStart && log.filters.periodEnd && (
                          <span>📅 {new Date(`${log.filters.periodStart}T00:00:00`).toLocaleDateString('ru-RU')}–{new Date(`${log.filters.periodEnd}T00:00:00`).toLocaleDateString('ru-RU')}</span>
                        )}
                        {log.filters.mode && (
                          <span>🎯 {log.filters.mode === 'single' ? 'Одному ученику' : 'По фильтрам'}</span>
                        )}
                        {log.filters.subjectIds?.length > 0 && (
                        <span>📚 {log.filters.subjectIds.map(id => {
                          const subj = subjects.find(s => s.id === id || s.id === parseInt(id));
                          return subj ? `${subj.icon} ${subj.name}` : `#${id}`;
                        }).join(', ')}</span>
                      )}
                        {log.filters.audience === 'guests' && <span>🎟️ Гостевой доступ</span>}
                        {log.filters.accessDays && (
                          <span>⏰ {ACCESS_DAYS_OPTIONS.find(o => o.value == log.filters.accessDays)?.label}</span>
                        )}
                        {log.filters.homeworkPercent && (
                          <span>📝 {HOMEWORK_PERCENT_OPTIONS.find(o => o.value === log.filters.homeworkPercent)?.label}</span>
                        )}
                        {log.filters.kind && (
                          <span>🔔 Событие: {log.filters.kind === 'lesson_start' ? 'начало занятия' : log.filters.kind === 'lesson_reminder' ? 'напоминание о занятии' : log.filters.kind}</span>
                        )}
                        {log.filters.lessonId && <span>📚 Занятие №{log.filters.lessonId}</span>}
                      </div>
                    )}
                    {/* Полный текст */}
                    <div className="history-field-label">{log.isParentReport ? 'Рассылка' : 'Сообщение'}</div>
                    <div className="history-full-text">{log.isParentReport ? `Отчёт родителю: ${log.text}` : log.text}</div>
                    <NotificationHistoryRecipients recipients={log.recipients} />
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
            <p>Вы собираетесь отправить сообщение <strong>{recipientCount} получателям</strong>.</p>
            <div className="confirm-preview">
              <div className="confirm-filters">Фильтры: {filtersLabel()}</div>
              <div className="confirm-text">"{messageText.length > 100 ? messageText.slice(0, 100) + '...' : messageText}"</div>
            </div>
            <p style={{color:'#6b7280', fontSize:13}}>Это действие нельзя отменить.</p>
            <div className="confirm-actions">
              <button className="btn-secondary" onClick={() => setShowConfirm(false)}>Отмена</button>
              <button className="btn-danger-confirm" onClick={handleSend}>
                ✉️ Да, отправить {recipientCount} сообщений
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
