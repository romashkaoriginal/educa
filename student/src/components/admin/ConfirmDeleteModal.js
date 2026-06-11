import React from 'react';
import '../../styles/ConfirmDelete.css';

function ConfirmDeleteModal({
  title,
  message,
  items = [],
  entityName,
  onConfirm,
  onCancel,
}) {
  return (
    <div className="modal-overlay confirm-delete-overlay" onClick={onCancel}>
      <div className="confirm-delete-modal" onClick={(e) => e.stopPropagation()}>
        <div className="confirm-delete-icon">⚠️</div>
        <h3>{title}</h3>
        <p className="confirm-delete-message">{message}</p>
        {items.length > 0 && (
          <ul className="confirm-delete-list">
            {items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        )}
        {entityName && (
          <p className="confirm-delete-entity">
            <strong>{entityName}</strong>
          </p>
        )}
        <p className="confirm-delete-warning">Это действие нельзя отменить.</p>
        <div className="confirm-delete-actions">
          <button type="button" className="btn-secondary" onClick={onCancel}>
            Отмена
          </button>
          <button type="button" className="btn-danger-confirm" onClick={onConfirm}>
            Удалить
          </button>
        </div>
      </div>
    </div>
  );
}

export default ConfirmDeleteModal;
