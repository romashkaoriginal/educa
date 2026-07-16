import React, { useRef, useState } from 'react';
import { adminFetch } from './adminApi';
import { API_URL } from '../../config';

const ACCEPT = 'image/jpeg,image/png,image/webp';
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_BYTES = 10 * 1024 * 1024;

export const imageUrl = (storageKey) =>
  storageKey ? `${API_URL}/practice-images/${storageKey}` : null;

/**
 * Поле загрузки изображения с превью, drag-and-drop, заменой и удалением.
 * value: { id, storageKey, width, height } | null
 * onChange: (image | null) => void
 * Используется и для изображения вопроса, и для изображения подсказки (ТЗ §2.1, §2.2).
 */
function ImageUploadField({ value, onChange, label }) {
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState('');

  const upload = async (file) => {
    if (!file) return;
    setError('');
    if (!ALLOWED.includes(file.type)) {
      setError('Поддерживаются только JPG, PNG и WebP.');
      return;
    }
    if (file.size > MAX_BYTES) {
      setError('Файл больше 10 МБ.');
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('image', file);
      const response = await adminFetch(`${API_URL}/practice/images`, {
        method: 'POST',
        body: formData,
      });
      const data = await response.json();
      if (response.ok) {
        onChange(data.image);
      } else {
        setError(data.message || 'Не удалось загрузить изображение');
      }
    } catch (e) {
      setError('Ошибка сети при загрузке');
    } finally {
      setUploading(false);
    }
  };

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    upload(file);
    e.target.value = '';
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    upload(file);
  };

  return (
    <div className="image-upload-field">
      <label>{label}</label>

      {value?.storageKey ? (
        <div className="image-upload-preview">
          <img src={imageUrl(value.storageKey)} alt="Превью" />
          <div className="image-upload-preview-actions">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? 'Загрузка…' : 'Заменить изображение'}
            </button>
            <button
              type="button"
              className="btn-secondary danger"
              onClick={() => { onChange(null); setError(''); }}
              disabled={uploading}
            >
              Удалить изображение
            </button>
          </div>
        </div>
      ) : (
        <div
          className={`image-upload-dropzone ${dragOver ? 'is-dragover' : ''}`}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          role="button"
          tabIndex={0}
        >
          {uploading ? (
            <span className="image-upload-hint">Загрузка…</span>
          ) : (
            <>
              <span className="image-upload-icon">🖼️</span>
              <span className="image-upload-hint">
                Нажмите или перетащите файл сюда
              </span>
              <span className="image-upload-sub">JPG, PNG или WebP, до 10 МБ</span>
            </>
          )}
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        style={{ display: 'none' }}
        onChange={handleFile}
      />

      {error && <div className="image-upload-error">{error}</div>}
    </div>
  );
}

export default ImageUploadField;
