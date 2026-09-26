import React, { useLayoutEffect, useRef } from 'react';
import '../styles/StreamPresentation.css';
const score = value => new Intl.NumberFormat('ru', { maximumFractionDigits: 1 }).format(Number(value) || 0);

function Crown({ className = '' }) {
  return <svg className={className} viewBox="0 0 48 40" fill="none" aria-hidden="true"><path d="m5 12 10 8L24 5l9 15 10-8-5 21H10L5 12Z" fill="currentColor" /><path d="M12 38h24" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /></svg>;
}

function Initials({ name }) {
  return <>{name?.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('') || '•'}</>;
}

function LeaderboardWinner({ entry, index, onStudentClick }) {
  const content = <>
    <div className="stream-avatar-wrap">
      {index === 0 && <Crown className="stream-crown" />}
      <div className="stream-avatar" aria-hidden="true"><Initials name={entry.name} /></div>
      <span className="stream-medal">{entry.place || index + 1}</span>
    </div>
    <strong className="stream-name">{entry.name}</strong>
    {entry.telegramUsername && <span className="stream-username">@{entry.telegramUsername}</span>}
    <span className="stream-points">{score(entry.totalScore)} <small>баллов</small></span>
    <div className="stream-plinth"><span>{entry.place || index + 1}</span><small>{index === 0 ? 'ЛИДЕР' : 'МЕСТО'}</small><i aria-hidden="true" /></div>
  </>;
  const className = `stream-winner stream-place-${index + 1}`;
  return onStudentClick ? (
    <button type="button" data-rank-id={entry.id} className={`${className} is-clickable`} onClick={() => onStudentClick(entry)} aria-label={`Открыть профиль ${entry.name}`}>{content}</button>
  ) : <div data-rank-id={entry.id} className={className}>{content}</div>;
}

function LeaderboardRunner({ entry, index, onStudentClick }) {
  const content = <>
    <span className="stream-rank">{String(entry.place || index + 4).padStart(2, '0')}</span>
    <span className="stream-runner-avatar" aria-hidden="true"><Initials name={entry.name} /></span>
    <span className="stream-runner-name">
      <strong>{entry.name}</strong>
      {entry.telegramUsername && <span className="stream-runner-username">@{entry.telegramUsername}</span>}
    </span>
    <span className="stream-runner-score">{score(entry.totalScore)}<small>баллов</small></span>
  </>;
  return onStudentClick ? (
    <button type="button" className="stream-runner-button is-clickable" onClick={() => onStudentClick(entry)} aria-label={`Открыть профиль ${entry.name}`}>{content}</button>
  ) : content;
}

export function StreamLeaderboard({ entries = [], onStudentClick }) {
  const top = entries.slice(0, 10);
  const root = useRef(null);
  const positions = useRef(new Map());
  const order = top.map(entry => entry.id).join(',');
  useLayoutEffect(() => {
    if (!root.current) return;
    const nodes = [...root.current.querySelectorAll('[data-rank-id]')];
    const next = new Map(nodes.map(node => [node.dataset.rankId, node.getBoundingClientRect()]));
    if (!root.current.ownerDocument.defaultView.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      nodes.forEach(node => {
        const before = positions.current.get(node.dataset.rankId);
        const after = next.get(node.dataset.rankId);
        if (before && Math.abs(before.top - after.top) > 1) {
          node.animate?.([{ transform: `translate(${before.left - after.left}px, ${before.top - after.top}px)` }, { transform: 'translate(0, 0)' }],
            { duration: 250, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' });
        }
      });
    }
    positions.current = next;
  }, [order]);
  if (!top.length) return <div className="stream-empty"><Crown /><h2>Пока нет результатов</h2></div>;
  return <div ref={root} className={`stream-ranking${top.length <= 3 ? ' stream-ranking--podium-only' : ''}`}>
    <section className="stream-stage" aria-label="Пьедестал">
      <div className="stream-stage-orbit" aria-hidden="true" />
      <span className="stream-stage-spark stream-stage-spark--one" aria-hidden="true" />
      <span className="stream-stage-spark stream-stage-spark--two" aria-hidden="true" />
      <div className="stream-podium" aria-label="Тройка лидеров">
      {[1, 0, 2].map(index => top[index] && <LeaderboardWinner key={top[index].id} entry={top[index]} index={index} onStudentClick={onStudentClick} />)}
      </div>
      <div className="stream-stage-floor" aria-hidden="true" />
    </section>
    {top.length > 3 && <section className="stream-standings">
      <div className="stream-standings-heading"><h2>Места 4–10</h2><span>Баллы</span></div>
      <ol className="stream-runners" start={4} aria-label="Места с четвёртого по десятое">
        {top.slice(3).map((entry, index) => <li key={entry.id} data-rank-id={entry.id} className={onStudentClick ? 'is-clickable' : undefined}><LeaderboardRunner entry={entry} index={index} onStudentClick={onStudentClick} /></li>)}
      </ol>
    </section>}
  </div>;
}
