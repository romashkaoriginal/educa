import React, { useState, useEffect } from 'react';
import './LockedSectionModal.css';
import ApplicationForm from './ApplicationForm';

// Модальное окно закрытого раздела (ТЗ §11) + форма заявки (ТЗ §12)
// + поведение «заявка уже отправлена» (ТЗ §15).
//
// Props:
//   open             — показывать ли модалку
//   onClose          — закрыть
//   source           — источник заявки для CRM
//   context          — контекст: locked_homework / locked_quiz / locked_statistics_homework
//   selectedSubjects — имена предметов гостя
//   applicationSent  — уже оставлял заявку?
//   onApplicationSent — колбэк после успешной отправки (поднять флаг наверх)

function LockedSectionModal({
  open,
  onClose,
  source = 'TG Mini App — закрытый раздел',
  context = 'locked_homework',
  selectedSubjects = [],
  applicationSent = false,
  onApplicationSent,
}) {
  // 'prompt' — «Хочешь учиться?», 'form' — форма заявки, 'sent' — уже отправлена
  const [view, setView] = useState('prompt');

  useEffect(() => {
    if (open) setView(applicationSent ? 'sent' : 'prompt');
  }, [open, applicationSent]);

  if (!open) return null;

  return (
    <div className="locked-modal-overlay" onClick={onClose}>
      <div className="locked-modal" onClick={(e) => e.stopPropagation()}>
        {view === 'prompt' && (
          <>
            <div className="locked-modal-icon">🔒</div>
            <p className="locked-modal-text">
              Этот раздел доступен только нашим ученикам.
            </p>
            <p className="locked-modal-question">Хочешь учиться с нами?</p>
            <div className="locked-modal-actions">
              <button className="locked-modal-btn locked-modal-btn--primary" onClick={() => setView('form')}>
                Хочу
              </button>
              <button className="locked-modal-btn locked-modal-btn--ghost" onClick={onClose}>
                Позже
              </button>
            </div>
          </>
        )}

        {view === 'form' && (
          <ApplicationForm
            source={source}
            context={context}
            selectedSubjects={selectedSubjects}
            userStatus="guest"
            onSuccess={() => onApplicationSent?.()}
            onClose={onClose}
          />
        )}

        {view === 'sent' && (
          <>
            <div className="locked-modal-icon">✅</div>
            <p className="locked-modal-text">
              Заявка уже отправлена. Скоро с вами свяжемся.
            </p>
            <div className="locked-modal-actions">
              <button className="locked-modal-btn locked-modal-btn--primary" onClick={onClose}>
                Понятно
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default LockedSectionModal;
