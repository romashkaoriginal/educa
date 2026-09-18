import React, { useEffect, useState, useCallback } from 'react';
import './LeaderboardModal.css';
import '../styles/StreamPresentation.css';
import { apiFetch } from '../pages/api';
import { API_URL } from '../config';
import { StreamLeaderboard } from './QuizLeaderboard';

// Общий лидерборд домашка+практика по предмету — тот же расчёт и тот же вид
// пьедестала (.stream-screen/.stream-ranking), что видит администратор через
// «Открыть лидерборд». Период жёстко фиксирован на текущую календарную
// неделю (пн–вс) — без фильтров и переключателей.
//
// Props:
//   open        — показывать ли модалку
//   onClose     — закрыть
//   subjectId   — предмет, по которому считать рейтинг
//   subjectName — для заголовка

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

function LeaderboardModal({ open, onClose, subjectId, subjectName }) {
  const [leaderboard, setLeaderboard] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    if (!subjectId) return;
    setLoading(true);
    setError(false);
    try {
      const query = new URLSearchParams(currentWeekRange());
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
  }, [subjectId]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  if (!open) return null;

  return (
    <div className="lb-modal-portal" onClick={onClose}>
      <div className="stream-screen lb-stream-screen" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="lb-modal-close" onClick={onClose} aria-label="Закрыть">×</button>
        <header className="stream-header">
          <div className="stream-brand-group"><strong className="stream-brand">KUBIK</strong></div>
          <span className="stream-subject">{subjectName || 'Все предметы'}</span>
        </header>
        <div className="stream-heading"><div>
          <p>Текущий рейтинг</p>
          <h1>Лидеры <em>недели</em></h1>
        </div></div>
        {loading ? (
          <div className="stream-empty" role="status">Загружаем…</div>
        ) : error ? (
          <div className="stream-empty" role="status">Не удалось загрузить таблицу лидеров</div>
        ) : (
          <StreamLeaderboard entries={leaderboard || []} />
        )}
      </div>
    </div>
  );
}

export default LeaderboardModal;
