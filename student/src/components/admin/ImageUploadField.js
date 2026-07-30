import React, { useRef, useState } from 'react';
import { adminFetch } from './adminApi';
import { API_URL } from '../../config';

const ACCEPT = 'image/jpeg,image/png,image/webp';
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_BYTES = 10 * 1024 * 1024;
const SAFE_UPLOAD_BYTES = 800 * 1024;
const MAX_LONG_SIDE = 1600;

const canvasBlob = (canvas, quality) => new Promise((resolve, reject) => {
  canvas.toBlob(
    (blob) => blob ? resolve(blob) : reject(new Error('Не удалось обработать изображение')),
    'image/webp',
    quality
  );
});

async function decodeImage(file) {
  if (typeof createImageBitmap === 'function') return createImageBitmap(file);
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error('Не удалось прочитать изображение'));
      image.src = url;
    });
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function prepareImageForUpload(file) {
  if (file.size <= SAFE_UPLOAD_BYTES) return file;
  const image = await decodeImage(file);
  try {
    const sourceWidth = image.width;
    const sourceHeight = image.height;
    const initialScale = Math.min(1, MAX_LONG_SIDE / Math.max(sourceWidth, sourceHeight));
    let lastBlob = null;

    for (const sizeFactor of [1, 0.82, 0.68, 0.56]) {
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(sourceWidth * initialScale * sizeFactor));
      canvas.height = Math.max(1, Math.round(sourceHeight * initialScale * sizeFactor));
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Обработка изображений не поддерживается');
      context.drawImage(image, 0, 0, canvas.width, canvas.height);

      for (const quality of [0.88, 0.78, 0.68, 0.58]) {
        lastBlob = await canvasBlob(canvas, quality);
        if (lastBlob.size <= SAFE_UPLOAD_BYTES) {
          const baseName = file.name.replace(/\.[^.]+$/, '') || 'image';
          return new File([lastBlob], `${baseName}.webp`, { type: 'image/webp', lastModified: Date.now() });
        }
      }
    }

    throw new Error(`Не удалось уменьшить изображение до ${Math.round(SAFE_UPLOAD_BYTES / 1024)} КБ`);
  } finally {
    image.close?.();
  }
}

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
      const preparedFile = await prepareImageForUpload(file);
      const formData = new FormData();
      formData.append('image', preparedFile);
      const response = await adminFetch(`${API_URL}/practice/images`, {
        method: 'POST',
        body: formData,
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok) {
        onChange(data.image);
      } else if (response.status === 413) {
        setError('Сервер отклонил размер файла. Попробуйте изображение меньшего разрешения.');
      } else {
        setError(data.message || 'Не удалось загрузить изображение');
      }
    } catch (e) {
      setError(e.message || 'Ошибка сети при загрузке');
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
              <span className="image-upload-sub">JPG, PNG или WebP, до 10 МБ · большие файлы сжимаются автоматически</span>
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
