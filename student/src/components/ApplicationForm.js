import React, { useState } from 'react';
import './ApplicationForm.css';
import { apiFetch } from '../pages/api';
import { API_URL } from '../config';

// Форма заявки внутри Mini App (ТЗ §12, §14).
// Открывается из модалки закрытого раздела, из блока домашки в статистике
// и с экрана окончания доступа.
//
// Props:
//   source          — источник заявки (ТЗ §13), напр. "TG Mini App — закрытый раздел"
//   context         — контекст: locked_homework / locked_quiz / locked_statistics_homework / guest_expired
//   selectedSubjects — массив имён предметов гостя
//   userStatus      — 'guest' | 'trial'
//   onSuccess       — колбэк после успешной отправки (помечаем applicationSent)
//   onClose         — закрыть форму

// Телефон вводится в формате +375 XX XXX-XX-XX. Префикс +375 фиксированный,
// пользователь набирает только 9 цифр после него.

// Достаём из ввода 9 «национальных» цифр (без кода страны 375).
function extractLocalDigits(raw) {
  let d = (raw || '').replace(/\D/g, '');
  if (d.startsWith('375')) d = d.slice(3);
  // на случай ведущего 80xx — отбрасываем тоже
  if (d.startsWith('80')) d = d.slice(2);
  return d.slice(0, 9);
}

// Форматируем для показа: +375 29 744-XX-XX (по мере ввода)
function formatPhone(local) {
  let out = '+375';
  if (local.length > 0) out += ' ' + local.slice(0, 2);
  if (local.length > 2) out += ' ' + local.slice(2, 5);
  if (local.length > 5) out += '-' + local.slice(5, 7);
  if (local.length > 7) out += '-' + local.slice(7, 9);
  return out;
}

function isValidPhone(local) {
  return /^\d{9}$/.test(local);
}

function ApplicationForm({
  source = 'TG Mini App — гостевой доступ',
  context = 'guest_access',
  selectedSubjects = [],
  userStatus = 'guest',
  onSuccess,
  onClose,
}) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState(''); // храним только 9 локальных цифр
  const [agree, setAgree] = useState(true);
  const [errors, setErrors] = useState({});
  const [status, setStatus] = useState('idle'); // idle | sending | success | error
  const [contactStatus, setContactStatus] = useState('idle'); // idle | waiting | error

  const tg = typeof window !== 'undefined' ? window.Telegram?.WebApp : null;
  // Кнопка «номер из Telegram» доступна только в TG-окружении с поддержкой requestContact.
  const canShareContact = !!(tg && typeof tg.requestContact === 'function');

  const handlePhoneChange = (e) => {
    setPhone(extractLocalDigits(e.target.value));
  };

  // Поллим бэк, пока бот не получит и не сохранит номер (или таймаут).
  const pollSharedPhone = async () => {
    const deadline = Date.now() + 6000;
    while (Date.now() < deadline) {
      try {
        const res = await apiFetch(`${API_URL}/applications/shared-phone`);
        if (res.ok) {
          const data = await res.json();
          if (data.phone) return data.phone;
        }
      } catch (_) { /* retry */ }
      await new Promise((r) => setTimeout(r, 1000));
    }
    return null;
  };

  const handleShareContact = () => {
    if (!canShareContact || contactStatus === 'waiting') return;
    setContactStatus('idle');
    setErrors((e) => ({ ...e, phone: undefined }));
    tg.requestContact(async (shared) => {
      // shared === true только если пользователь согласился поделиться.
      if (!shared) return;
      setContactStatus('waiting');
      const fullPhone = await pollSharedPhone();
      if (fullPhone) {
        setPhone(extractLocalDigits(fullPhone));
        setContactStatus('idle');
      } else {
        setContactStatus('error');
      }
    });
  };

  const validate = () => {
    const e = {};
    if (!name.trim() || name.trim().length < 2) e.name = 'Введите имя.';
    if (!isValidPhone(phone)) e.phone = 'Введите корректный номер телефона.';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async () => {
    if (status === 'sending') return;
    if (!validate()) return;

    setStatus('sending');
    try {
      const tgUser = window.Telegram?.WebApp?.initDataUnsafe?.user;
      const response = await apiFetch(`${API_URL}/applications`, {
        method: 'POST',
        body: JSON.stringify({
          fullName: name.trim(),
          phone: formatPhone(phone), // полный номер +375 XX XXX-XX-XX
          telegramId: tgUser?.id || null,
          telegramUsername: tgUser?.username || null,
          source,
          context,
          selectedSubjects,
          userStatus,
        }),
      });

      if (!response.ok) throw new Error('request failed');

      setStatus('success');
      onSuccess?.();
      // Автозакрытие через 1.5с (ТЗ §14.2)
      setTimeout(() => onClose?.(), 1500);
    } catch (err) {
      console.error('Application submit error:', err);
      setStatus('error');
    }
  };

  if (status === 'success') {
    return (
      <div className="app-form">
        <div className="app-form-success">
          <div className="app-form-success-icon">✅</div>
          <p>Заявка отправлена. Скоро свяжемся!</p>
        </div>
      </div>
    );
  }

  return (
    <div className="app-form">
      <h2 className="app-form-title">Хочешь учиться с нами?</h2>
      <p className="app-form-subtitle">Оставь заявку — менеджер свяжется с тобой.</p>

      <div className="app-form-field">
        <input
          className={`app-form-input ${errors.name ? 'app-form-input--error' : ''}`}
          type="text"
          placeholder="Как тебя зовут?"
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={status === 'sending'}
        />
        {errors.name && <span className="app-form-error">{errors.name}</span>}
      </div>

      <div className="app-form-field">
        <input
          className={`app-form-input ${errors.phone ? 'app-form-input--error' : ''}`}
          type="tel"
          inputMode="numeric"
          /* Всегда показываем +375 как префикс — каретка встаёт после него,
             а не в пустом поле слева. */
          value={formatPhone(phone)}
          onChange={handlePhoneChange}
          onFocus={(e) => {
            // курсор в конец (после +375 / введённых цифр)
            const len = e.target.value.length;
            requestAnimationFrame(() => { try { e.target.setSelectionRange(len, len); } catch {} });
          }}
          disabled={status === 'sending'}
        />
        {errors.phone && <span className="app-form-error">{errors.phone}</span>}

        {canShareContact && (
          <>
            <button
              type="button"
              className="app-form-tg-contact"
              onClick={handleShareContact}
              disabled={status === 'sending' || contactStatus === 'waiting'}
            >
              {contactStatus === 'waiting'
                ? 'Получаем номер…'
                : '📱 Подставить номер из Telegram'}
            </button>
            {contactStatus === 'error' && (
              <span className="app-form-error">
                Не удалось получить номер. Попробуйте ещё раз или введите вручную.
              </span>
            )}
          </>
        )}
      </div>

      <label className="app-form-checkbox">
        <input
          type="checkbox"
          checked={agree}
          onChange={(e) => setAgree(e.target.checked)}
          disabled={status === 'sending'}
        />
        <span>Я соглашаюсь на обработку персональных данных</span>
      </label>

      {status === 'error' && (
        <p className="app-form-submit-error">Ошибка отправки. Попробуйте ещё раз.</p>
      )}

      <button
        className="app-form-submit"
        onClick={handleSubmit}
        disabled={status === 'sending' || !agree}
      >
        {status === 'sending' ? 'Отправляем...' : 'Оставить заявку'}
      </button>
    </div>
  );
}

export default ApplicationForm;
