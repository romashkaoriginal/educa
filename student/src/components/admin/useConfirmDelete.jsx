import { useState, useCallback } from 'react';
import ConfirmDeleteModal from './ConfirmDeleteModal';

export function useConfirmDelete() {
  const [config, setConfig] = useState(null);

  const confirmDelete = useCallback((options) => {
    return new Promise((resolve) => {
      setConfig({ ...options, resolve });
    });
  }, []);

  const handleConfirm = () => {
    config?.resolve(true);
    setConfig(null);
  };

  const handleCancel = () => {
    config?.resolve(false);
    setConfig(null);
  };

  const ConfirmDeleteDialog = config ? (
    <ConfirmDeleteModal
      title={config.title}
      message={config.message}
      items={config.items}
      entityName={config.entityName}
      onConfirm={handleConfirm}
      onCancel={handleCancel}
    />
  ) : null;

  return { confirmDelete, ConfirmDeleteDialog };
}
