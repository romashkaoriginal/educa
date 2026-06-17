import React, { useState, useEffect } from 'react';
import './GuestSubjectSelect.css';
import kubikLogo from '../assets/kubik-logo-transparent.png';
import { apiFetch } from './api';
import { API_URL } from '../config';

// Экран выбора предметов для гостя (ТЗ §4).
// Можно выбрать от 1 до 3 предметов. После «Продолжить» гость попадает в Mini App.
function GuestSubjectSelect({ onDone }) {
  const [subjects, setSubjects] = useState([]);
  const [selected, setSelected] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await apiFetch(`${API_URL}/guest/subjects/available`);
        const data = await res.json();
        setSubjects(data.subjects || []);
      } catch (e) {
        console.error('Error loading guest subjects:', e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const toggle = (id) => {
    setError('');
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 3) {
        setError('Можно выбрать максимум 3 предмета.');
        return prev;
      }
      return [...prev, id];
    });
  };

  const handleContinue = async () => {
    if (saving) return;
    if (selected.length < 1) {
      setError('Выбери хотя бы один предмет.');
      return;
    }
    setSaving(true);
    try {
      const res = await apiFetch(`${API_URL}/guest/subjects`, {
        method: 'POST',
        body: JSON.stringify({ subjectIds: selected }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.message || 'Не удалось сохранить выбор. Попробуйте ещё раз.');
        setSaving(false);
        return;
      }
      onDone?.();
    } catch (e) {
      console.error('Error saving guest subjects:', e);
      setError('Не удалось сохранить выбор. Попробуйте ещё раз.');
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="guest-select-loading">
        <img src={kubikLogo} alt="" className="kubik-loading-logo" />
        <div className="kubik-loader"><div className="kubik-loader-fill"></div></div>
      </div>
    );
  }

  return (
    <div className="guest-select">
      <div className="guest-select-container">
        <img src={kubikLogo} alt="" className="guest-select-logo" />
        <h1 className="guest-select-title">Выбери предметы</h1>
        <p className="guest-select-subtitle">
          Можно выбрать до 3 предметов, чтобы посмотреть, как работает практика.
        </p>

        {subjects.length === 0 && (
          <p className="guest-select-empty">
            Пока нет доступных предметов. Загляни позже.
          </p>
        )}

        <div className="guest-select-grid">
          {subjects.map((s) => {
            const isActive = selected.includes(s.id);
            return (
              <button
                key={s.id}
                className={`guest-subject-card ${isActive ? 'active' : ''}`}
                onClick={() => toggle(s.id)}
              >
                <span className="guest-subject-icon">{s.icon || '📘'}</span>
                <span className="guest-subject-name">{s.name}</span>
                <span className="guest-subject-check">{isActive ? '✓' : ''}</span>
              </button>
            );
          })}
        </div>

        {error && <p className="guest-select-error">{error}</p>}

        <button
          className="guest-select-continue"
          onClick={handleContinue}
          disabled={saving || subjects.length === 0}
        >
          {saving ? 'Сохраняем...' : 'Продолжить'}
        </button>
      </div>
    </div>
  );
}

export default GuestSubjectSelect;
