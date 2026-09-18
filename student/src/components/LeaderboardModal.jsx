import React, { useEffect, useState, useCallback } from 'react';
import './LeaderboardModal.css';
import { apiFetch } from '../pages/api';
import { API_URL } from '../config';

// Общий лидерборд домашка+практика по предмету (тот же расчёт, что видит
// администратор в статистике). Период — пресет или произвольный диапазон дат.
//
// Props:
//   open        — показывать ли модалку
//   onClose     — закрыть
//   subjectId   — предмет, по которому считать рейтинг
//   subjectName — для заголовка
//   studentId   — текущий ученик, чтобы подсветить свою строку

const PRESETS = [
  { value: 'today', label: 'Сегодня' },
  { value: 'week', label: 'Эта неделя' },
  { value: '30d', label: '30 дней' },
  { value: 'all', label: 'Всё время' },
  { value: 'custom', label: 'Даты' },
];

// Текущая календарная неделя, понедельник — воскресенье включительно.
function currentWeekRange() {
  const now = new Date();
  const dayIndex = (now.getDay() + 6) % 7; // 0 = понедельник ... 6 = воскресенье
  const monday = new Date(now);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - dayIndex);
  const sunday = new Date(monday);
  sunday.setDate(sunday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  return { dateFrom: monday.toISOString(), dateTo: sunday.toISOString() };
}

function presetToRange(preset) {
  if (preset === 'all') return {};
  if (preset === 'week') return currentWeekRange();
  const dateTo = new Date();
  dateTo.setHours(23, 59, 59, 999);
  const dateFrom = new Date(dateTo);
  dateFrom.setHours(0, 0, 0, 0);
  if (preset === '30d') dateFrom.setDate(dateFrom.getDate() - 29);
  return { dateFrom: dateFrom.toISOString(), dateTo: dateTo.toISOString() };
}

function toInputDate(d) {
  return d.toISOString().slice(0, 10);
}

function LeaderboardModal({ open, onClose, subjectId, subjectName, studentId }) {
  const [preset, setPreset] = useState('week');
  const [customFrom, setCustomFrom] = useState(() => toInputDate(new Date(Date.now() - 6 * 86400000)));
  const [customTo, setCustomTo] = useState(() => toInputDate(new Date()));
  const [leaderboard, setLeaderboard] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    if (!subjectId) return;
    setLoading(true);
    setError(false);
    try {
      const range = preset === 'custom'
        ? { dateFrom: `${customFrom}T00:00:00.000Z`, dateTo: `${customTo}T23:59:59.999Z` }
        : presetToRange(preset);
      const query = new URLSearchParams(range);
      const res = await apiFetch(`${API_URL}/practice/leaderboard-combined/${subjectId}?${query}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Не удалось загрузить таблицу лидеров');
      setLeaderboard(data.leaderboard || []);
    } catch (e) {
      console.error(e);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [subjectId, preset, customFrom, customTo]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  if (!open) return null;

  return (
    <div className="lb-modal-overlay" onClick={onClose}>
      <div className="lb-modal" onClick={(e) => e.stopPropagation()}>
        <div className="lb-modal-header">
          <h3>🏆 Таблица лидеров</h3>
          {subjectName && <span className="lb-modal-subject">{subjectName}</span>}
          <button type="button" className="lb-modal-close" onClick={onClose} aria-label="Закрыть">×</button>
        </div>

        <div className="lb-modal-periods">
          {PRESETS.map((p) => (
            <button
              key={p.value}
              type="button"
              className={`lb-period-btn ${preset === p.value ? 'active' : ''}`}
              onClick={() => setPreset(p.value)}
            >
              {p.label}
            </button>
          ))}
        </div>

        {preset === 'custom' && (
          <div className="lb-modal-custom-range">
            <label>
              <span>С</span>
              <input type="date" value={customFrom} max={customTo} onChange={(e) => setCustomFrom(e.target.value)} />
            </label>
            <label>
              <span>По</span>
              <input type="date" value={customTo} min={customFrom} onChange={(e) => setCustomTo(e.target.value)} />
            </label>
          </div>
        )}

        <div className="lb-modal-body">
          {loading ? (
            <p className="lb-modal-status">Загружаем…</p>
          ) : error ? (
            <p className="lb-modal-status">Не удалось загрузить таблицу лидеров</p>
          ) : !leaderboard || leaderboard.length === 0 ? (
            <p className="lb-modal-status">Пока нет данных за этот период</p>
          ) : (
            <div className="lb-modal-list">
              {leaderboard.map((entry) => {
                const isMe = Number(entry.id) === Number(studentId);
                const medal = entry.place === 1 ? '🥇' : entry.place === 2 ? '🥈' : entry.place === 3 ? '🥉' : null;
                return (
                  <div key={entry.id} className={`lb-modal-row ${isMe ? 'me' : ''} ${entry.place <= 3 ? 'top3' : ''}`}>
                    <span className="lb-modal-rank">{medal || entry.place}</span>
                    <span className="lb-modal-name">{entry.name}</span>
                    <span className="lb-modal-score">{entry.totalScore}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default LeaderboardModal;
