import React, { useEffect, useState, useCallback, useRef, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import './LeaderboardModal.css';
import '../styles/StreamPresentation.css';
import { apiFetch } from '../pages/api';
import { API_URL } from '../config';
import { StreamLeaderboard } from './QuizLeaderboard';

// Общий лидерборд домашка+практика по предмету — тот же расчёт, тот же вид
// пьедестала и тот же способ открытия (нативный <dialog>.showModal(), как
// «Открыть лидерборд» в админке — см. StreamPresentation.jsx), что видит
// администратор. Баллы считаются с последнего ручного сброса рейтинга
// (см. POST /lesson-admin/leaderboard-subjects/:id/reset). Клиент дат не
// передаёт, стрик в расчёт не входит и при сбросе не изменяется.
//
// Props:
//   open        — показывать ли модалку
//   onClose     — закрыть
//   subjectId   — предмет, по которому считать рейтинг
//   subjectName — для заголовка

function LeaderboardModal({ open, onClose, subjectId, subjectName }) {
  const [leaderboard, setLeaderboard] = useState(null);
  const [myScore, setMyScore] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const dialog = useRef(null);

  const load = useCallback(async () => {
    if (!subjectId) return;
    setLoading(true);
    setError(false);
    setLeaderboard(null);
    setMyScore(null);
    try {
      const res = await apiFetch(`${API_URL}/practice/leaderboard-combined/${subjectId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Не удалось загрузить таблицу лидеров');
      setLeaderboard(data.leaderboard || []);
      setMyScore(Number(data.myScore));
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

  // Тот же механизм, что в StreamPresentation.jsx: нативный <dialog>.showModal()
  // сам даёт top-layer поверх приложения, focus-trap и корректный скролл —
  // без этого приходится вручную бороться с overflow полноэкранных оверлеев.
  useLayoutEffect(() => {
    const node = dialog.current;
    if (!node) return undefined;
    if (!open) { node.close?.(); return undefined; }
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    if (node.showModal) node.showModal(); else node.setAttribute('open', '');
    return () => {
      node.close?.();
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <dialog
      ref={dialog}
      className="stream-inline-dialog lb-dialog"
      aria-label="Таблица лидеров"
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onClick={(event) => { if (event.target === dialog.current) onClose(); }}
    >
      <main className="stream-screen">
        <button type="button" className="lb-modal-close" onClick={onClose} aria-label="Закрыть">×</button>
        <header className="stream-header">
          <div className="stream-brand-group"><strong className="stream-brand">KUBIK</strong></div>
          <span className="stream-subject">{subjectName || 'Все предметы'}</span>
        </header>
        <div className="stream-heading"><div>
          <p>Текущий рейтинг</p>
          <h1>Лидеры</h1>
        </div></div>
        {loading ? (
          <div className="stream-empty" role="status">Загружаем…</div>
        ) : error ? (
          <div className="stream-empty" role="status">Не удалось загрузить таблицу лидеров</div>
        ) : (
          <>
            {myScore !== null && Number.isFinite(myScore) && (
              <section className="lb-my-score" aria-label="Твои баллы с последнего сброса">
                <span>Твои баллы с последнего сброса</span>
                <strong>{new Intl.NumberFormat('ru', { maximumFractionDigits: 1 }).format(myScore)} баллов</strong>
              </section>
            )}
            <StreamLeaderboard entries={leaderboard || []} />
          </>
        )}
      </main>
    </dialog>,
    document.body
  );
}

export default LeaderboardModal;
