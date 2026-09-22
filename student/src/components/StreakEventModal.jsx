import React from 'react';
import './StreakEventModal.css';

// Всплывающий экран серии (ТЗ Дмитрия 22.09.2026):
// "extended" — серия продлена, показываем день серии, очки и предмет, куда
// они пошли; "broken" — серия прервалась, показываем при следующем входе.
// events идут по одному — модалка показывает первый непоказанный, следующий
// появится после закрытия (markShown убирает текущий из очереди в DataContext).
//
// Props:
//   event   — { id, type, streakDay, points, subject } | null
//   onClose — закрыть и пометить показанным

function StreakEventModal({ event, onClose }) {
  if (!event) return null;
  const isExtended = event.type === 'extended';

  return (
    <div className="streak-modal-overlay" onClick={onClose}>
      <div className={`streak-modal ${isExtended ? 'streak-modal--extended' : 'streak-modal--broken'}`} onClick={(e) => e.stopPropagation()}>
        <div className="streak-modal-icon">{isExtended ? '🔥' : '💨'}</div>
        {isExtended ? (
          <>
            <p className="streak-modal-title">Серия продлена!</p>
            <p className="streak-modal-days">{event.streakDay} {dayLabel(event.streakDay)} подряд</p>
            <div className="streak-modal-points">
              <span className="streak-modal-points-value">+{event.points}</span>
              <span className="streak-modal-points-label">
                очков{event.subject ? <> на «{event.subject.name}»</> : ''}
              </span>
            </div>
          </>
        ) : (
          <>
            <p className="streak-modal-title">Серия прервалась</p>
            <p className="streak-modal-days">
              {event.streakDay ? `Было ${event.streakDay} ${dayLabel(event.streakDay)} подряд. ` : ''}
              Начни новую серию сегодня!
            </p>
          </>
        )}
        <button className="streak-modal-btn" onClick={onClose}>Понятно</button>
      </div>
    </div>
  );
}

function dayLabel(n) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return 'дней';
  if (mod10 === 1) return 'день';
  if (mod10 >= 2 && mod10 <= 4) return 'дня';
  return 'дней';
}

export default StreakEventModal;
