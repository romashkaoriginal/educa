import React from 'react';
import './AccessExpired.css';
import kubikLogo from '../assets/kubik-logo-transparent.png';

export const MANAGER_CONTACT_URL = 'https://t.me/kubik_ct';

// Полноэкранная блокировка для ученика, у которого закончился доступ ко всем
// предметам. Закрыть экран нельзя: пользоваться платформой без продления нельзя.
function AccessExpired({ startsAt = null }) {
  const startLabel = startsAt ? new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Europe/Minsk', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit'
  }).format(new Date(startsAt)) : null;
  const openManager = (event) => {
    const tg = window.Telegram?.WebApp;
    if (tg?.openTelegramLink) {
      event.preventDefault();
      tg.openTelegramLink(MANAGER_CONTACT_URL);
    }
  };

  return (
    <div className="access-expired" role="alert">
      <div className="access-expired-container">
        <img src={kubikLogo} alt="" className="access-expired-logo" />
        <div className="access-expired-icon" aria-hidden="true">{startsAt ? '📅' : '🔒'}</div>
        <h1 className="access-expired-title">{startsAt ? 'Доступ ещё не начался' : 'Доступ закончился'}</h1>
        <p className="access-expired-text">
          {startsAt ? <>Занятия будут доступны {startLabel} по минскому времени.<br />Если дата неверная, свяжитесь с менеджером.</>
            : <>Необходимо продлить доступ на следующий месяц.<br />Свяжитесь с нашим менеджером.</>}
        </p>
        <a
          className="access-expired-btn access-expired-btn--primary"
          href={MANAGER_CONTACT_URL}
          target="_blank"
          rel="noopener noreferrer"
          onClick={openManager}
        >
          Написать менеджеру
        </a>
        <button
          type="button"
          className="access-expired-btn access-expired-btn--secondary"
          onClick={() => window.location.reload()}
        >
          {startsAt ? 'Проверить доступ' : 'Я уже продлил — проверить'}
        </button>
      </div>
    </div>
  );
}

export default AccessExpired;
