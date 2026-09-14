import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { adminFetch } from './adminApi';
import { API_URL } from '../../config';
import MathText from '../MathText';
import QuizAnswerMark from '../QuizAnswerMark';
import '../../styles/StreamPresentation.css';

import { StreamLeaderboard } from '../QuizLeaderboard';
export { StreamLeaderboard } from '../QuizLeaderboard';

export function StreamScreen({ source, hostWindow, onClose }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [clock, setClock] = useState(Date.now());
  const offset = useRef(0);
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const action = async name => {
    if (busy) return;
    setBusy(true); setActionError('');
    try {
      const response = await adminFetch(`${API_URL}/lesson-admin/quizzes/${source.lessonQuizId}/${name}`, { method: 'POST' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'Не удалось выполнить действие');
      setRevision(value => value + 1);
    } catch (e) { setActionError(e.message); }
    finally { setBusy(false); }
  };
  useEffect(() => {
    let stopped = false;
    let timer;
    const controller = new AbortController();
    const refresh = async () => {
      try {
        const path = source.lessonQuizId ? `/lesson-admin/quizzes/${source.lessonQuizId}/stream`
          : `/lesson-admin/stream/weekly?subjectId=${source.subjectId}&periodDays=${source.periodDays || 7}`;
        const response = await adminFetch(`${API_URL}${path}`, { signal: controller.signal });
        if (!response.ok) throw new Error(response.status === 403 ? 'Нет доступа к трансляции' : 'Связь прервана. Восстанавливаем…');
        const next = await response.json();
        if (stopped) return;
        offset.current = (next.serverNow || Date.now()) - Date.now();
        setData(next);
        setError('');
      } catch (e) {
        if (!stopped) setError(e.message || 'Не удалось загрузить данные');
      } finally {
        if (!stopped) timer = hostWindow.setTimeout(refresh, source.lessonQuizId ? 1000 : 30000);
      }
    };
    refresh();
    return () => { stopped = true; controller.abort(); hostWindow.clearTimeout(timer); };
  }, [source, hostWindow, revision]);
  useEffect(() => {
    const timer = hostWindow.setInterval(() => setClock(Date.now() + offset.current), 200);
    return () => hostWindow.clearInterval(timer);
  }, [hostWindow]);
  const remaining = data?.deadline ? Math.max(0, Math.ceil((data.deadline - clock) / 1000)) : 0;
  const phase = data?.phase === 'question' && remaining === 0 ? 'leaderboard' : data?.phase;
  const progress = data?.question?.timeLimit ? Math.max(0, Math.min(1, remaining / data.question.timeLimit)) : 0;
  return <main className={`stream-screen stream-screen--${phase || 'loading'}`}>
    <header className="stream-header"><div className="stream-brand-group"><strong className="stream-brand">KUBIK</strong><span className="stream-live"><i />ПРЯМОЙ ЭФИР</span></div>
      <span className="stream-subject">{source.subjectName || (source.lessonQuizId ? 'Викторина занятия' : 'Все предметы')}</span>
      <button className="stream-fullscreen" onClick={() => hostWindow.document.documentElement.requestFullscreen?.().catch(() => {})}>На весь экран</button>
    </header>
    {error && <p className="stream-error" role="status">{error}</p>}
    {actionError && <p className="stream-error" role="alert">{actionError}</p>}
    {!data ? <div className="stream-empty" role="status">Загружаем трансляцию…</div> : <>
      <div className="stream-heading"><div>
        {['leaderboard', 'question'].includes(phase) && <p>{phase === 'leaderboard' ? (data.questionIndex >= 0 ? `Итоги вопроса ${data.questionIndex + 1}` : 'Текущий рейтинг') : `Вопрос ${data.questionIndex + 1} из ${data.totalQuestions}`}</p>}
        <h1>{phase === 'weekly' ? <>Лидеры <em>предмета</em></> : phase === 'finished' ? <>Итоги <em>викторины</em></> : phase === 'leaderboard' ? <>Рейтинг <em>викторины</em></> : data.title}</h1>
      </div>{phase === 'weekly' && <div className="stream-period"><strong>{data.periodDays || source.periodDays || 7}</strong><span>дней<br />в зачёте</span></div>}</div>
      {phase === 'question' && data.question ? <section className="stream-question" key={data.question.id || data.questionIndex}>
        <div className="stream-question-head"><h2><MathText text={data.question.questionText} /></h2>
          <div className={`stream-timer ${remaining <= 5 ? 'is-urgent' : ''}`} role="timer" aria-label={`Осталось ${remaining} секунд`}>
            <svg viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="54" /><circle cx="60" cy="60" r="54" pathLength="1" strokeDasharray="1" strokeDashoffset={1 - progress} /></svg>
            <strong>{remaining}</strong><small>секунд</small></div>
        </div>
        {data.question.questionImage?.storageKey && <img className="stream-question-image" src={`${API_URL}/practice-images/${data.question.questionImage.storageKey}`} width={data.question.questionImage.width} height={data.question.questionImage.height} alt="Иллюстрация к вопросу" />}
        <div className="stream-time-track"><span style={{ transform: `scaleX(${progress})` }} /></div>
        <div className="stream-options">{(data.question.options || []).map((option, index) => <div key={index}><QuizAnswerMark index={index} /><MathText text={option} /></div>)}</div>
      </section> : phase === 'lobby' ? <div className="stream-lobby"><div className="stream-lobby-count"><strong>{data.participantCount}</strong><p>участников</p></div><span>Ожидаем запуска</span></div>
        : <StreamLeaderboard key={`${phase}-${data.questionIndex ?? ''}`} entries={data.leaderboard} />}
    </>}
    {onClose && <nav className="stream-control-bar" aria-label="Управление трансляцией">
      <button onClick={onClose}>К управлению занятием</button>
      {source.lessonQuizId && data?.status === 'active' && <>
        {phase === 'lobby' && <button disabled={busy} onClick={() => action('show-question')}>Показать первый вопрос →</button>}
        {phase === 'question' && <button disabled={busy} onClick={() => action('show-answer')}>Закрыть ответы · показать рейтинг</button>}
        {phase === 'leaderboard' && data.questionIndex + 1 < data.totalQuestions && <button disabled={busy} onClick={() => action('next-question')}>Следующий вопрос →</button>}
        {phase === 'leaderboard' && data.questionIndex + 1 >= data.totalQuestions && <button disabled={busy} onClick={() => action('finish')}>Завершить · показать финал</button>}
      </>}
    </nav>}
  </main>;
}

export default function StreamPresentation({ source, hostWindow, onClose }) {
  const dialog = useRef(null);
  useLayoutEffect(() => {
    if (hostWindow) return undefined;
    const node = dialog.current;
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    if (node.showModal) node.showModal(); else node.setAttribute('open', '');
    return () => { node.close?.(); document.body.style.overflow = overflow; previous?.focus?.(); };
  }, [hostWindow]);
  useEffect(() => {
    if (!hostWindow) return undefined;
    const timer = setInterval(() => { if (hostWindow.closed) onClose(); }, 500);
    return () => { clearInterval(timer); if (!hostWindow.closed) hostWindow.close(); };
  }, [hostWindow, onClose]);
  if (!hostWindow) return createPortal(<dialog ref={dialog} className="stream-inline-dialog" aria-label="Экран трансляции" onCancel={event => { event.preventDefault(); onClose(); }}>
    <StreamScreen source={source} hostWindow={window} onClose={onClose} />
  </dialog>, document.body);
  return createPortal(<StreamScreen source={source} hostWindow={hostWindow} />, hostWindow.document.body);
}
