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

// Валидация белорусского номера: +375 XX XXX-XX-XX (допускаем разные разделители)
function isValidPhone(raw) {
  const digits = (raw || '').replace(/\D/g, '');
  // 375 + 9 цифр = 12, либо локальный ввод от 9 цифр
  if (digits.startsWith('375')) return digits.length === 12;
  return digits.length >= 9 && digits.length <= 12;
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
  const [phone, setPhone] = useState('+375 ');
  const [agree, setAgree] = useState(true);
  const [errors, setErrors] = useState({});
  const [status, setStatus] = useState('idle'); // idle | sending | success | error

  const validate = () => {
    const e = {};
    if (!name.trim() || name.trim().length < 2) e.name = 'Введите имя.';
    if (!phone.trim() || !isValidPhone(phone)) e.phone = 'Введите корректный номер телефона.';
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
          phone: phone.trim(),
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
          placeholder="+375 ..."
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          disabled={status === 'sending'}
        />
        {errors.phone && <span className="app-form-error">{errors.phone}</span>}
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
