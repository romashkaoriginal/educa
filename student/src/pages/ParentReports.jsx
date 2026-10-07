import React from 'react';
import './AccessExpired.css';
import kubikLogo from '../assets/kubik-logo-transparent.png';
import { MANAGER_CONTACT_URL } from './AccessExpired';

const BOT_URL = 'https://t.me/ct_kubik_bot';

function openTelegram(event, url) {
  const tg = window.Telegram?.WebApp;
  if (tg?.openTelegramLink) {
    try {
      tg.openTelegramLink(url);
      event.preventDefault();
    } catch (_) {
      // Ссылка остаётся доступной, если bridge клиента не поддерживает метод.
    }
  }
}

export default function ParentReports({ parent }) {
  const names = (parent?.students || [])
    .map((student) => [student.firstName, student.lastName].filter(Boolean).join(' ')).filter(Boolean);
  return (
    <main className="access-expired">
      <div className="access-expired-container">
        <img src={kubikLogo} alt="KUBIK" className="access-expired-logo" />
        <h1 className="access-expired-title">Вы подключены к отчётам</h1>
        {names.length > 0 && <p className="access-expired-text">Ученики: {names.join(', ')}</p>}
        <p className="access-expired-text">
          Отчёты об обучении приходят в чат с ботом.<br />
          Недельный — каждый понедельник в 18:00 по Минску.
          Месячный — в первый понедельник месяца.
        </p>
        <a className="access-expired-btn access-expired-btn--primary" href={BOT_URL}
          target="_blank" rel="noopener noreferrer" onClick={(event) => openTelegram(event, BOT_URL)}>
          Открыть чат с ботом
        </a>
        <a className="access-expired-btn access-expired-btn--secondary" href={MANAGER_CONTACT_URL}
          target="_blank" rel="noopener noreferrer" onClick={(event) => openTelegram(event, MANAGER_CONTACT_URL)}>
          Отчёт не пришёл — написать менеджеру
        </a>
      </div>
    </main>
  );
}
