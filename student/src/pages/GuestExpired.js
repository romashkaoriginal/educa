import React, { useState } from 'react';
import './GuestExpired.css';
import kubikLogo from '../assets/kubik-logo-transparent.png';
import ApplicationForm from '../components/ApplicationForm';

// Экран окончания гостевого доступа (ТЗ §19).
function GuestExpired({ selectedSubjects = [] }) {
  const [showForm, setShowForm] = useState(false);
  const [sent, setSent] = useState(false);

  return (
    <div className="guest-expired">
      <div className="guest-expired-container">
        <img src={kubikLogo} alt="" className="guest-expired-logo" />

        {!showForm && (
          <>
            <div className="guest-expired-icon">⏳</div>
            <h1 className="guest-expired-title">Гостевой доступ закончился</h1>
            <p className="guest-expired-text">
              Ты посмотрел, как устроена платформа.<br />
              Хочешь учиться с нами и получить полный доступ?
            </p>
            <div className="guest-expired-actions">
              <button
                className="guest-expired-btn guest-expired-btn--primary"
                onClick={() => setShowForm(true)}
              >
                Оставить заявку
              </button>
            </div>
            {sent && (
              <p className="guest-expired-sent">Заявка отправлена. Скоро свяжемся!</p>
            )}
          </>
        )}

        {showForm && (
          <div className="guest-expired-form">
            <ApplicationForm
              source="TG Mini App — гостевой доступ"
              context="guest_expired"
              selectedSubjects={selectedSubjects}
              userStatus="guest"
              onSuccess={() => setSent(true)}
              onClose={() => setShowForm(false)}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export default GuestExpired;
