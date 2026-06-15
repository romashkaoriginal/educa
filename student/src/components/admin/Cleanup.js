import React, { useState, useEffect } from 'react';
import '../../styles/Cleanup.css';
import { adminFetch } from './adminApi';
import { API_URL } from '../../config';

function Cleanup({ subjects = [] }) {
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [studentId, setStudentId] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [streakSubjectId, setStreakSubjectId] = useState('');
  const [busy, setBusy] = useState(null);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const response = await adminFetch(`${API_URL}/students`);
        const data = await response.json();
        setStudents(data.students || []);
      } catch (e) {
        console.error('Cleanup load students:', e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const selectedStudent = students.find((s) => String(s.id) === String(studentId));

  const runAction = async (action) => {
    if (!studentId && action !== 'migrate' && action !== 'rebuild') {
      setMessage({ type: 'error', text: 'Выберите ученика' });
      return;
    }

    if (action === 'answers' && !subjectId) {
      setMessage({ type: 'error', text: 'Выберите предмет для очистки ответов' });
      return;
    }

    const studentName = selectedStudent
      ? `${selectedStudent.firstName || ''} ${selectedStudent.lastName || ''}`.trim()
      : 'всех учеников';
    const subjectName = subjects.find((s) => String(s.id) === String(subjectId))?.name;

    const confirmText = action === 'answers'
      ? `Удалить все ответы, прогноз, лучшие результаты и дневные логи по предмету «${subjectName}» у ученика ${studentName}?`
      : action === 'migrate'
        ? studentId && subjectId
          ? `Удалить старые попытки из базы для ${studentName} по предмету «${subjectName}»? Сводки не изменятся.`
          : studentId
            ? `Удалить старые попытки из базы для ${studentName} по всем предметам? Сводки не изменятся.`
            : 'Удалить все старые попытки из базы? Сводки не изменятся.'
        : action === 'rebuild'
          ? studentId && subjectId
            ? `Восстановить сводки для ${studentName} по предмету «${subjectName}» из результатов по заданиям?`
            : studentId
              ? `Восстановить сводки для ${studentName} по всем предметам из результатов по заданиям?`
              : 'Восстановить сводки для всех учеников из результатов по заданиям?'
          : streakSubjectId
        ? `Сбросить стрик по предмету «${subjects.find((s) => String(s.id) === String(streakSubjectId))?.name}» у ${studentName}?`
        : `Сбросить стрик по всем предметам у ${studentName}?`;

    if (!window.confirm(confirmText)) return;

    setBusy(action);
    setMessage(null);

    try {
      const url = action === 'answers'
        ? `${API_URL}/admin/cleanup/answers`
        : action === 'migrate'
          ? `${API_URL}/admin/cleanup/migrate-stats`
          : action === 'rebuild'
            ? `${API_URL}/admin/cleanup/rebuild-stats`
            : `${API_URL}/admin/cleanup/streak`;

      const body = action === 'answers'
        ? { studentId: parseInt(studentId, 10), subjectId: parseInt(subjectId, 10) }
        : action === 'migrate' || action === 'rebuild'
          ? {
            ...(studentId ? { studentId: parseInt(studentId, 10) } : {}),
            ...(subjectId ? { subjectId: parseInt(subjectId, 10) } : {})
          }
          : {
            studentId: parseInt(studentId, 10),
            ...(streakSubjectId ? { subjectId: parseInt(streakSubjectId, 10) } : {})
          };

      const response = await adminFetch(url, {
        method: 'POST',
        body: JSON.stringify(body)
      });
      const data = await response.json();

      if (!response.ok) {
        setMessage({
          type: 'error',
          text: data.details ? `${data.error || 'Ошибка'}: ${data.details}` : (data.error || data.message || 'Ошибка')
        });
        return;
      }

      if (action === 'migrate') {
        const v = data.verification || {};
        const rows = v.aggregateRows || {};
        if (data.skipped) {
          setMessage({
            type: 'success',
            text: data.message || 'Сводки актуальны, старых попыток нет.'
          });
        } else {
          const deleted = data.migrated?.attemptsDeleted ?? data.attemptCount ?? 0;
          setMessage({
            type: v.ok ? 'success' : 'error',
            text: v.ok
              ? `Очищено попыток: ${deleted}, осталось: ${v.attemptsRemaining ?? 0}. Сводки: ${rows.studentTotals || 0} предмет(ов).`
              : `Очистка под вопросом: сводки пустые (${rows.studentTotals || 0} записей), попыток: ${v.attemptsRemaining ?? '?'}.`
          });
        }
      } else if (action === 'rebuild') {
        const v = data.verification || {};
        const rows = v.aggregateRows || {};
        const sample = v.samples?.[0];
        setMessage({
          type: v.ok ? 'success' : 'error',
          text: v.ok
            ? `Восстановлено: ${rows.studentTotals || 0} предмет(ов), ${rows.dailyStats || 0} дней, ${rows.topicTotals || 0} тем.` +
              (sample ? ` Пример: ${sample.totalAttempts} попыток, ${sample.totalCorrect} верных.` : '')
            : `Не удалось восстановить сводки (${rows.studentTotals || 0} записей).`
        });
      } else if (action === 'answers') {
        const d = data.deleted || {};
        setMessage({
          type: 'success',
          text: `Очищено: ${d.attempts || 0} попыток, ${d.questionResults || 0} результатов, ${d.bests || 0} лучших, ${d.scoreHistory || 0} записей прогноза`
        });
      } else {
        setMessage({
          type: 'success',
          text: `Стрик сброшен (удалено ${data.deletedDailyLogs || 0} дневных записей)`
        });
      }
    } catch (e) {
      console.error('Cleanup action error:', e);
      setMessage({ type: 'error', text: 'Не удалось выполнить операцию' });
    } finally {
      setBusy(null);
    }
  };

  if (loading) {
    return <div className="cleanup-page"><p className="cleanup-muted">Загрузка…</p></div>;
  }

  return (
    <div className="cleanup-page">
      <div className="cleanup-header">
        <h2>🧹 Очистка данных</h2>
        <p>Только для главного администратора. Действия необратимы.</p>
      </div>

      <div className="cleanup-card">
        <label className="cleanup-label">Ученик</label>
        <select
          className="cleanup-select"
          value={studentId}
          onChange={(e) => setStudentId(e.target.value)}
        >
          <option value="">— выберите ученика —</option>
          {students.map((s) => (
            <option key={s.id} value={s.id}>
              {s.firstName} {s.lastName} {s.telegramUsername ? `@${s.telegramUsername}` : ''}
            </option>
          ))}
        </select>
      </div>

      <div className="cleanup-card">
        <h3>Ответы на практику по предмету</h3>
        <p className="cleanup-hint">
          Удаляет попытки, результаты по вопросам, лучшие результаты, историю прогноза и дневные логи по выбранному предмету.
        </p>
        <label className="cleanup-label">Предмет</label>
        <select
          className="cleanup-select"
          value={subjectId}
          onChange={(e) => setSubjectId(e.target.value)}
        >
          <option value="">— выберите предмет —</option>
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>{s.icon} {s.name}</option>
          ))}
        </select>
        <button
          type="button"
          className="cleanup-btn cleanup-btn--danger"
          disabled={busy != null}
          onClick={() => runAction('answers')}
        >
          {busy === 'answers' ? 'Очищаем…' : 'Очистить ответы по предмету'}
        </button>
      </div>

      <div className="cleanup-card">
        <h3>Сводная статистика</h3>
        <p className="cleanup-hint">
          Статистика обновляется автоматически при каждом ответе — перенос вручную не нужен.
          Кнопка ниже только удаляет старые попытки из базы (если они ещё остались).
          «Восстановить сводки» — если цифры сбились, пересобирает из результатов по заданиям.
        </p>
        <label className="cleanup-label">Предмет (необязательно)</label>
        <select
          className="cleanup-select"
          value={subjectId}
          onChange={(e) => setSubjectId(e.target.value)}
        >
          <option value="">Все предметы</option>
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>{s.icon} {s.name}</option>
          ))}
        </select>
        <button
          type="button"
          className="cleanup-btn cleanup-btn--primary"
          disabled={busy != null}
          onClick={() => runAction('migrate')}
        >
          {busy === 'migrate' ? 'Очищаем…' : 'Удалить старые попытки (освободить место)'}
        </button>
        <button
          type="button"
          className="cleanup-btn cleanup-btn--warn"
          disabled={busy != null}
          onClick={() => runAction('rebuild')}
          style={{ marginTop: '0.75rem' }}
        >
          {busy === 'rebuild' ? 'Восстанавливаем…' : 'Восстановить сводки из результатов'}
        </button>
      </div>

      <div className="cleanup-card">
        <h3>Стрик</h3>
        <p className="cleanup-hint">
          Сбрасывает серию дней (удаляет записи о выполненной дневной цели). Ответы на задания не трогаются.
        </p>
        <label className="cleanup-label">Предмет (необязательно)</label>
        <select
          className="cleanup-select"
          value={streakSubjectId}
          onChange={(e) => setStreakSubjectId(e.target.value)}
        >
          <option value="">Все предметы</option>
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>{s.icon} {s.name}</option>
          ))}
        </select>
        <button
          type="button"
          className="cleanup-btn cleanup-btn--warn"
          disabled={busy != null}
          onClick={() => runAction('streak')}
        >
          {busy === 'streak' ? 'Сбрасываем…' : 'Сбросить стрик'}
        </button>
      </div>

      {message && (
        <div className={`cleanup-message cleanup-message--${message.type}`}>
          {message.text}
        </div>
      )}
    </div>
  );
}

export default Cleanup;
