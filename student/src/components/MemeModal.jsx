import React from 'react';
import './MemeModal.css';
import { API_URL } from '../config';

const imageUrl = (storageKey) => storageKey ? `${API_URL}/practice-images/${storageKey}` : null;

// Мем дня (ТЗ Дмитрия 22.09.2026): показывается сразу после того, как
// закрыт поп-ап "серия продлена". Закрывается по крестику или клику мимо.
//
// Props:
//   meme    — { storageKey } | null
//   onClose — закрыть

function MemeModal({ meme, onClose }) {
  if (!meme) return null;

  return (
    <div className="meme-modal-overlay" onClick={onClose}>
      <div className="meme-modal" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="meme-modal-close" onClick={onClose} aria-label="Закрыть">×</button>
        <p className="meme-modal-title">Держи мем дня</p>
        <img className="meme-modal-image" src={imageUrl(meme.storageKey)} alt="Мем дня" />
      </div>
    </div>
  );
}

export default MemeModal;
