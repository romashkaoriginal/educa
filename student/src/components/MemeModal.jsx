import React, { useEffect, useRef, useState } from 'react';
import './MemeModal.css';
import { API_URL } from '../config';
import { apiFetch } from '../pages/api';

const imageUrl = (storageKey) => storageKey ? `${API_URL}/practice-images/${storageKey}` : null;

// Мем дня (ТЗ Дмитрия 22.09.2026): показывается сразу после того, как
// закрыт поп-ап "серия продлена". Закрывается по крестику или клику мимо.
//
// Props:
//   meme    — { storageKey } | null
//   onClose — закрыть

const reactions = [
  { id: 'like', emoji: '👍', label: 'Нравится' },
  { id: 'dislike', emoji: '👎', label: 'Не нравится' },
  { id: 'stone', emoji: '🗿', label: 'Каменное лицо' }
];

function MemeModal({ meme, onClose }) {
  const [selectedReaction, setSelectedReaction] = useState(null);
  const [error, setError] = useState('');
  const closeTimer = useRef(null);

  useEffect(() => () => window.clearTimeout(closeTimer.current), []);
  if (!meme) return null;

  const react = async (reaction) => {
    if (selectedReaction) return;
    setError('');
    setSelectedReaction(reaction);
    window.Telegram?.WebApp?.HapticFeedback?.impactOccurred?.('light');
    try {
      const response = await apiFetch(`${API_URL}/practice/daily-memes/${meme.id}/reaction`, {
        method: 'POST',
        body: JSON.stringify({ reaction }),
        timeoutMs: 7000
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || 'Не удалось сохранить реакцию');
      closeTimer.current = window.setTimeout(onClose, 460);
    } catch (requestError) {
      setSelectedReaction(null);
      setError(requestError.message || 'Не удалось сохранить реакцию. Попробуйте ещё раз.');
    }
  };

  return (
    <div className={`meme-modal-overlay${selectedReaction ? ' is-reacting' : ''}`} onClick={selectedReaction ? undefined : onClose}>
      <div className={`meme-modal${selectedReaction ? ' is-reacting' : ''}`} onClick={(e) => e.stopPropagation()}>
        <button type="button" className="meme-modal-close" onClick={onClose} aria-label="Закрыть" disabled={Boolean(selectedReaction)}>×</button>
        <p className="meme-modal-title">Держи мем дня</p>
        <img className="meme-modal-image" src={imageUrl(meme.storageKey)} alt="Мем дня" />
        <div className="meme-reactions" aria-label="Выберите реакцию на мем">
          {reactions.map((reaction) => (
            <button
              type="button"
              key={reaction.id}
              className={`meme-reaction-button${selectedReaction === reaction.id ? ' is-selected' : ''}`}
              onClick={() => react(reaction.id)}
              disabled={Boolean(selectedReaction)}
              aria-label={reaction.label}
            >
              <span aria-hidden="true">{reaction.emoji}</span>
            </button>
          ))}
        </div>
        {error && <p className="meme-reaction-error" role="alert">{error}</p>}
      </div>
    </div>
  );
}

export default MemeModal;
