import React, { useState, useEffect } from 'react';
import './AdminGuestPicker.css';
import kubikLogo from '../assets/kubik-logo-transparent.png';
import StudentApp from './StudentApp';
import { apiFetch } from './api';
import { API_URL } from '../config';

// Вход админа «под гостем» для проверки гостевого UI.
// Показывает список реальных активных гостей (кто прислал /start и чей доступ
// не истёк), выбор → рендерим обычный гостевой StudentApp под его User.id.
function AdminGuestPicker() {
  const [guests, setGuests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await apiFetch(`${API_URL}/guest/admin/list`);
        if (!res.ok) {
          setError(res.status === 403 ? 'Доступ только для администратора.' : 'Не удалось загрузить список гостей.');
          setLoading(false);
          return;
        }
        const data = await res.json();
        setGuests(data.guests || []);
      } catch (e) {
        console.error('Error loading guests:', e);
        setError('Не удалось загрузить список гостей.');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const timeLeft = (expiresAt) => {
    const ms = new Date(expiresAt).getTime() - Date.now();
    if (ms <= 0) return 'истёк';
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    return h > 0 ? `${h} ч ${m} мин` : `${m} мин`;
  };

  // Выбран гость — рендерим гостевой StudentApp под ним
  if (selected) {
    const guestUser = {
      id: selected.id,
      firstName: selected.firstName || 'Гость',
      lastName: '',
      role: 'student',
      isActive: true,
    };
    return (
      <div className="admin-guest-wrap">
        <div className="admin-guest-banner">
          🔍 Режим проверки — гость {selected.firstName || ''}{selected.telegramUsername ? ` (@${selected.telegramUsername})` : ''}
          <button className="admin-guest-banner-back" onClick={() => setSelected(null)}>← к списку</button>
        </div>
        <StudentApp
          initialUser={guestUser}
          isGuest
          applicationSent={selected.guestApplicationSent}
        />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="admin-guest-loading">
        <img src={kubikLogo} alt="" className="kubik-loading-logo" />
        <div className="kubik-loader"><div className="kubik-loader-fill"></div></div>
      </div>
    );
  }

  return (
    <div className="admin-guest">
      <div className="admin-guest-container">
        <img src={kubikLogo} alt="" className="admin-guest-logo" />
        <h1 className="admin-guest-title">Гостевой режим (проверка)</h1>
        <p className="admin-guest-subtitle">
          Выберите активного гостя, чтобы посмотреть приложение его глазами.
        </p>

        {error && <p className="admin-guest-error">{error}</p>}

        {!error && guests.length === 0 && (
          <p className="admin-guest-empty">
            Нет активных гостей. Гость появится после команды /start и выбора предметов.
          </p>
        )}

        <div className="admin-guest-list">
          {guests.map((g) => (
            <button key={g.id} className="admin-guest-card" onClick={() => setSelected(g)}>
              <div className="admin-guest-avatar">{(g.firstName || 'Г')[0]}</div>
              <div className="admin-guest-info">
                <h3>{g.firstName || 'Гость'}</h3>
                <p>@{g.telegramUsername || 'no username'} · {(g.subjects || []).length} предм.</p>
              </div>
              <div className="admin-guest-time">{timeLeft(g.guestExpiresAt)}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default AdminGuestPicker;
