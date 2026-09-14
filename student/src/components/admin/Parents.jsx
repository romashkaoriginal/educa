import React, { useCallback, useEffect, useMemo, useState } from 'react';
import '../../styles/Parents.css';
import { API_URL } from '../../config';
import { adminFetch } from './adminApi';
import { useConfirmDelete } from './useConfirmDelete';
import { useSectionRefresh } from './useSectionRefresh';

const emptyForm = {
  studentId: '',
  telegramId: '',
  telegramUsername: '',
  firstName: '',
  lastName: ''
};

function studentName(student) {
  return [student?.firstName, student?.lastName].filter(Boolean).join(' ') || 'Ученик';
}

function telegramUsername(value) {
  return String(value || '').trim().replace(/^@+/, '');
}

function normalizedSearch(value) {
  return String(value || '').trim().toLowerCase().replace(/^@+/, '');
}

function activeSubjects(student) {
  const now = new Date();
  return (student?.subjects || []).filter((subject) => {
    const access = subject.UserSubject;
    if (!access || access.isActive === false) return false;
    if (access.accessStartDate && new Date(access.accessStartDate) > now) return false;
    if (access.accessEndDate && new Date(access.accessEndDate) <= now) return false;
    return true;
  });
}

const REPORT_LABELS = {
  sent: 'Отправлен',
  failed: 'Ошибка',
  processing: 'Отправляется',
  skipped_no_access: 'Нет доступа',
  skipped_no_telegram: 'Нет Telegram ID'
};

function Parents({ currentUser, dataRefreshKey = 0 }) {
  const [parents, setParents] = useState([]);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingParent, setEditingParent] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [studentSearch, setStudentSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [manualReportsEnabled, setManualReportsEnabled] = useState(false);
  const [reportSchedule, setReportSchedule] = useState(null);
  const [sendingReport, setSendingReport] = useState(null);
  const [reportResult, setReportResult] = useState('');
  const { confirmDelete, ConfirmDeleteDialog } = useConfirmDelete();

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [parentsResponse, studentsResponse] = await Promise.all([
        adminFetch(`${API_URL}/parents`),
        adminFetch(`${API_URL}/students`)
      ]);
      const [parentsData, studentsData] = await Promise.all([
        parentsResponse.json(),
        studentsResponse.json()
      ]);
      setParents(parentsData.parents || []);
      setManualReportsEnabled(parentsData.manualReportsEnabled === true);
      setReportSchedule(parentsData.reportSchedule || null);
      setStudents(studentsData.students || []);
    } catch (error) {
      console.error('Error loading parents:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);
  useSectionRefresh(dataRefreshKey, loadData);

  const availableStudents = useMemo(() => {
    const assigned = new Set(parents.filter((item) => item.id !== editingParent?.id).map((item) => Number(item.studentId)));
    return students.filter((student) => !assigned.has(Number(student.id)));
  }, [parents, students, editingParent]);

  const filteredParents = useMemo(() => {
    const query = normalizedSearch(search);
    if (!query) return parents;
    return parents.filter((parent) => [
      parent.firstName,
      parent.lastName,
      parent.telegramUsername,
      parent.telegramId,
      parent.student?.firstName,
      parent.student?.lastName
    ].some((value) => normalizedSearch(value).includes(query)));
  }, [parents, search]);

  const filteredAvailableStudents = useMemo(() => {
    const query = normalizedSearch(studentSearch);
    if (!query) return availableStudents;
    return availableStudents.filter((student) => [
      student.id,
      student.firstName,
      student.lastName,
      student.telegramId,
      student.telegramUsername
    ].some((value) => normalizedSearch(value).includes(query)));
  }, [availableStudents, studentSearch]);

  const openCreate = () => {
    setEditingParent(null);
    setStudentSearch('');
    setForm({ ...emptyForm, studentId: availableStudents[0]?.id || '' });
    setShowModal(true);
  };

  const openEdit = (parent) => {
    setEditingParent(parent);
    setStudentSearch('');
    setForm({
      studentId: parent.studentId,
      telegramId: parent.telegramId || '',
      telegramUsername: parent.telegramUsername || '',
      firstName: parent.firstName || '',
      lastName: parent.lastName || ''
    });
    setShowModal(true);
  };

  const saveParent = async (event) => {
    event.preventDefault();
    if (!form.studentId || (!String(form.telegramId).trim() && !form.telegramUsername.trim())) {
      alert('Выберите ученика и укажите Telegram ID или username родителя');
      return;
    }
    setSaving(true);
    try {
      const response = await adminFetch(
        editingParent ? `${API_URL}/parents/${editingParent.id}` : `${API_URL}/parents`,
        {
          method: editingParent ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...form, telegramId: form.telegramId || null })
        }
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Не удалось сохранить родителя');
      setShowModal(false);
      await loadData();
    } catch (error) {
      alert(error.message);
    } finally {
      setSaving(false);
    }
  };

  const deleteParent = async (parent) => {
    const confirmed = await confirmDelete({
      title: 'Удалить родителя?',
      message: `Родитель ученика «${studentName(parent.student)}» перестанет получать отчёты.`,
      confirmText: 'Удалить родителя'
    });
    if (!confirmed) return;
    const response = await adminFetch(`${API_URL}/parents/${parent.id}`, { method: 'DELETE' });
    if (!response.ok) {
      const data = await response.json();
      alert(data.message || 'Не удалось удалить родителя');
      return;
    }
    await loadData();
  };

  const sendReport = async (reportType) => {
    setSendingReport(reportType);
    setReportResult('');
    try {
      const response = await adminFetch(`${API_URL}/parents/reports/${reportType}/send`, { method: 'POST' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Не удалось отправить отчёты');
      const sent = Number(data.statuses?.sent || 0);
      const failed = Number(data.statuses?.failed || 0);
      const skipped = Number(data.processed || 0) - sent - failed;
      setReportResult(`Отправлено: ${sent}${skipped > 0 ? `, пропущено: ${skipped}` : ''}${failed > 0 ? `, ошибок: ${failed}` : ''}`);
      await loadData();
    } catch (error) {
      alert(error.message);
    } finally {
      setSendingReport(null);
    }
  };

  const canSendManualReports = manualReportsEnabled && ['superadmin', 'admin', 'manager'].includes(currentUser?.role);
  const formatScheduledAt = (value) => value ? new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Europe/Minsk', weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).format(new Date(value)) : '—';

  return (
    <section className="parents-section">
      <div className="section-header">
        <div>
          <h2>Родители ({filteredParents.length})</h2>
        </div>
        <div className="parents-header-actions">
          {canSendManualReports && (
            <div className="manual-report-actions" aria-label="Ручная отправка отчётов">
              <button
                type="button"
                className="btn-secondary manual-report-button"
                onClick={() => sendReport('weekly')}
                disabled={Boolean(sendingReport)}
              >
                {sendingReport === 'weekly' ? 'Отправляем…' : 'Отправить отчёт за неделю'}
              </button>
              <button
                type="button"
                className="btn-secondary manual-report-button"
                onClick={() => sendReport('monthly')}
                disabled={Boolean(sendingReport)}
              >
                {sendingReport === 'monthly' ? 'Отправляем…' : 'Отправить отчёт за месяц'}
              </button>
            </div>
          )}
          <button type="button" className="add-button" onClick={openCreate} disabled={!availableStudents.length}>
            + Добавить родителя
          </button>
        </div>
      </div>

      {reportResult && <p className="parent-report-result" role="status">{reportResult}</p>}

      <div className="parent-schedule-grid" aria-label="Ближайшие автоматические отчёты">
        <div className="parent-schedule-card">
          <span>Еженедельный отчёт</span>
          <strong>{formatScheduledAt(reportSchedule?.weekly)}</strong>
        </div>
        <div className="parent-schedule-card">
          <span>Ежемесячный отчёт</span>
          <strong>{formatScheduledAt(reportSchedule?.monthly)}</strong>
        </div>
      </div>

      <div className="filters-bar">
        <input
          className="search-input"
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Поиск по родителю или ученику"
          aria-label="Поиск родителей"
        />
      </div>

      {loading ? <div className="parents-empty">Загрузка…</div> : (
        <div className="parents-grid">
          {filteredParents.map((parent) => {
            const subjects = activeSubjects(parent.student);
            const report = parent.lastReport;
            const studentIsActive = parent.student?.isActive !== false;
            const hasStudentAccess = studentIsActive && subjects.length > 0;
            const accessLabel = !studentIsActive ? 'Ученик неактивен' : (hasStudentAccess ? 'Доступ активен' : 'Нет доступа у ученика');
            return (
              <article className="parent-card" key={parent.id}>
                <div className="parent-card-top">
                  <div className="parent-avatar" aria-hidden="true">{parent.firstName?.[0] || 'Р'}</div>
                  <div className="parent-card-title">
                    <h3>{[parent.firstName, parent.lastName].filter(Boolean).join(' ') || 'Родитель'}</h3>
                    <p>{parent.telegramUsername ? `@${telegramUsername(parent.telegramUsername)}` : `ID: ${parent.telegramId || 'не подтверждён'}`}</p>
                  </div>
                  <span className={`status-badge ${hasStudentAccess ? 'active' : 'inactive'}`}>
                    {accessLabel}
                  </span>
                </div>
                <div className="parent-student-link">
                  <span>Ученик</span>
                  <strong>{studentName(parent.student)}</strong>
                </div>
                <div className="parent-subjects">
                  {subjects.length
                    ? subjects.map((subject) => <span key={subject.id}>{subject.icon} {subject.name}</span>)
                    : <span className="parent-warning">Нет активного доступа — отчёт не отправится</span>}
                </div>
                <div className="parent-report-state">
                  <span>Последний отчёт</span>
                  <strong className={`report-${report?.status || 'none'}`}>
                    {report ? REPORT_LABELS[report.status] || report.status : 'Ещё не отправлялся'}
                  </strong>
                </div>
                <div className="parent-actions">
                  <button type="button" className="btn-secondary" onClick={() => openEdit(parent)}>Редактировать</button>
                  <button type="button" className="btn-danger" onClick={() => deleteParent(parent)}>Удалить</button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {!loading && !filteredParents.length && (
        <div className="parents-empty">Родители не найдены</div>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-content parent-modal" role="dialog" aria-modal="true" aria-labelledby="parent-modal-title" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h2 id="parent-modal-title">{editingParent ? 'Редактировать родителя' : 'Добавить родителя'}</h2>
              <button type="button" className="modal-close" onClick={() => setShowModal(false)} aria-label="Закрыть">✕</button>
            </div>
            <form className="parent-form" onSubmit={saveParent}>
              <div className="form-group">
                <label htmlFor="parent-student">Ученик *</label>
                <input
                  id="parent-student-search"
                  type="search"
                  value={studentSearch}
                  onChange={(event) => setStudentSearch(event.target.value)}
                  placeholder="Поиск по имени, username или ID"
                  aria-label="Поиск ученика"
                />
                <select id="parent-student" value={form.studentId} onChange={(event) => setForm({ ...form, studentId: event.target.value })} required>
                  <option value="">Выберите ученика</option>
                  {filteredAvailableStudents.map((student) => <option key={student.id} value={student.id}>{studentName(student)} · ID {student.id}</option>)}
                </select>
                {!filteredAvailableStudents.length && <span className="parent-search-empty">Ученики не найдены</span>}
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="parent-telegram-id">Telegram ID</label>
                  <input id="parent-telegram-id" type="text" inputMode="numeric" value={form.telegramId} onChange={(event) => setForm({ ...form, telegramId: event.target.value })} />
                </div>
                <div className="form-group">
                  <label htmlFor="parent-username">Username</label>
                  <input id="parent-username" type="text" placeholder="@username" value={form.telegramUsername} onChange={(event) => setForm({ ...form, telegramUsername: event.target.value })} />
                </div>
              </div>
              <p className="parent-form-note">Достаточно одного поля. Если указан только username, родитель должен запустить бота, чтобы подтвердить Telegram ID.</p>
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="parent-first-name">Имя</label>
                  <input id="parent-first-name" type="text" value={form.firstName} onChange={(event) => setForm({ ...form, firstName: event.target.value })} />
                </div>
                <div className="form-group">
                  <label htmlFor="parent-last-name">Фамилия</label>
                  <input id="parent-last-name" type="text" value={form.lastName} onChange={(event) => setForm({ ...form, lastName: event.target.value })} />
                </div>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn-secondary" onClick={() => setShowModal(false)}>Отмена</button>
                <button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Сохраняем…' : 'Сохранить'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {ConfirmDeleteDialog}
    </section>
  );
}

export default Parents;
