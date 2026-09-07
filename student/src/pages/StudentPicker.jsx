import React, { useEffect, useState } from 'react';
import { API_URL } from '../config';
import { apiFetch } from './api';
import './StudentPicker.css';

const normalize = (value) => String(value || '').trim().replace(/^@/, '').toLocaleLowerCase('ru');

export default function StudentPicker({ onSelect }) {
  const [students, setStudents] = useState([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    (async () => {
      try {
        const response = await apiFetch(`${API_URL}/students`, { cache: 'no-store', signal: controller.signal });
        if (!response.ok) throw new Error(response.status === 403
          ? 'У вашей роли нет доступа к списку учеников.'
          : 'Не удалось загрузить учеников. Попробуйте ещё раз.');
        const data = await response.json();
        if (!Array.isArray(data.students)) throw new Error('Не удалось загрузить список учеников.');
        if (!controller.signal.aborted) setStudents(data.students);
      } catch (e) {
        if (!controller.signal.aborted) setError(e.message || 'Не удалось загрузить учеников.');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [revision]);

  const search = normalize(query);
  const filtered = students.filter(student => !search
    || normalize(student.telegramUsername).includes(search)
    || normalize(`${student.firstName || ''} ${student.lastName || ''}`).includes(search));

  return (
    <section className="student-picker" aria-labelledby="student-picker-title">
      <div className="student-picker__shell">
        <header className="student-picker__header">
          <h1 id="student-picker-title">Выберите ученика</h1>
          <p>Откройте его практику, домашние задания и статистику.</p>
          <label htmlFor="student-picker-search">Имя или username</label>
          <div className="student-picker__search">
            <span aria-hidden="true">@</span>
            <input id="student-picker-search" type="search" placeholder="Например, alex_ivanov"
              value={query} onChange={event => setQuery(event.target.value)} autoComplete="off" spellCheck={false} />
          </div>
          <div className="student-picker__toolbar">
            <span role="status">{loading ? 'Загружаем учеников…' : error ? 'Список недоступен' : `Показано ${filtered.length} из ${students.length}`}</span>
            <button type="button" disabled={loading} onClick={() => setRevision(value => value + 1)}>Обновить</button>
          </div>
        </header>
        <div className="student-picker__results" aria-busy={loading}>
          {error ? <div className="student-picker__empty" role="alert"><strong>{error}</strong><button type="button" onClick={() => setRevision(value => value + 1)}>Повторить загрузку</button></div>
            : loading ? <div className="student-picker__skeleton" aria-hidden="true">{[1, 2, 3, 4].map(id => <div key={id} />)}</div>
              : filtered.length === 0 ? <div className="student-picker__empty"><strong>{search ? 'Ученик не найден' : 'Ученики пока не добавлены'}</strong><p>{search ? 'Проверьте username или попробуйте найти по имени.' : 'Добавьте ученика в разделе администрирования.'}</p>{search && <button type="button" onClick={() => setQuery('')}>Сбросить поиск</button>}</div>
                : <ul>{filtered.map(student => (
                  <li key={student.id}>
                    <button type="button" className="student-picker__row" disabled={student.isActive === false}
                      onClick={() => onSelect(student)}>
                      <span className="student-picker__avatar" aria-hidden="true">{student.firstName?.[0]}{student.lastName?.[0]}</span>
                      <span className="student-picker__identity">
                        <strong>{[student.firstName, student.lastName].filter(Boolean).join(' ') || 'Без имени'}</strong>
                        <span>{student.telegramUsername ? `@${student.telegramUsername.replace(/^@/, '')}` : 'Username не указан'}</span>
                        <small>{student.isActive === false ? 'Аккаунт отключён — вход недоступен' : student.subjects?.length ? student.subjects.map(subject => subject.name).join(' · ') : 'Предметы не назначены'}</small>
                      </span>
                      {student.isActive !== false && <span className="student-picker__arrow" aria-hidden="true">→</span>}
                    </button>
                  </li>
                ))}</ul>}
        </div>
      </div>
    </section>
  );
}
