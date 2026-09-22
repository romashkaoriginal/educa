import React, { useEffect, useState } from 'react';
import '../../styles/Memes.css';
import { adminFetch } from './adminApi';
import { API_URL } from '../../config';
import { useSectionRefresh } from './useSectionRefresh';
import { useConfirmDelete } from './useConfirmDelete';
import { getDeleteConfirm } from './cascadeDeleteMessages';
import ImageUploadField, { imageUrl } from './ImageUploadField';

// Раздел "Мемы" (ТЗ Дмитрия 22.09.2026): мем дня показывается ученику
// поп-апом сразу после того, как засчитан стрик. Админ заранее распределяет
// картинки по датам — одна картинка на дату.

function todayStr() {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  return new Date(now.getTime() - offset * 60000).toISOString().slice(0, 10);
}

function Memes({ dataRefreshKey = 0, isActive = true }) {
  const { confirmDelete, ConfirmDeleteDialog } = useConfirmDelete();
  const [memes, setMemes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState(todayStr());
  const [image, setImage] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const loadMemes = async () => {
    try {
      const response = await adminFetch(`${API_URL}/daily-memes`);
      const data = await response.json();
      setMemes(data.memes || []);
    } catch (e) {
      console.error('Error loading memes:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isActive) return;
    loadMemes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive]);

  useSectionRefresh(dataRefreshKey, loadMemes);

  const save = async () => {
    if (!date || !image?.id) { setError('Выберите дату и загрузите картинку'); return; }
    setError('');
    setSaving(true);
    try {
      const response = await adminFetch(`${API_URL}/daily-memes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, imageId: image.id })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || 'Не удалось сохранить мем');
      setImage(null);
      await loadMemes();
    } catch (e) {
      setError(e.message || 'Не удалось сохранить мем');
    } finally {
      setSaving(false);
    }
  };

  const removeMeme = async (meme) => {
    const confirmed = await confirmDelete(getDeleteConfirm('meme', { name: meme.date }));
    if (!confirmed) return;
    try {
      const response = await adminFetch(`${API_URL}/daily-memes/${meme.id}`, { method: 'DELETE' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || 'Не удалось удалить мем');
      await loadMemes();
    } catch (e) {
      alert(e.message || 'Не удалось удалить мем');
    }
  };

  return (
    <div className="admin-section memes-section">
      <div className="section-header">
        <h2>😂 Мемы</h2>
      </div>

      <div className="meme-form">
        <label className="quiz-field-label" htmlFor="meme-date">Дата</label>
        <input id="meme-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="form-input" />
        <ImageUploadField label="Картинка" value={image} onChange={setImage} />
        {error && <div className="image-upload-error">{error}</div>}
        <button onClick={save} disabled={saving} className="save-btn">
          {saving ? 'Сохранение...' : '💾 Сохранить мем на эту дату'}
        </button>
      </div>

      <h3 className="meme-list-heading">Запланированные мемы ({memes.length})</h3>
      {loading ? <p>Загрузка...</p> : (
        <div className="meme-grid">
          {memes.length === 0 ? (
            <div className="empty-state"><p>Мемов ещё нет. Добавьте первый!</p></div>
          ) : memes.map((meme) => (
            <div key={meme.id} className="meme-card">
              <img src={imageUrl(meme.image?.storageKey)} alt={`Мем на ${meme.date}`} className="meme-card-image" />
              <div className="meme-card-date">{new Date(meme.date).toLocaleDateString('ru-RU', { day: '2-digit', month: 'long', year: 'numeric' })}</div>
              <button onClick={() => removeMeme(meme)} className="remove-btn">✕</button>
            </div>
          ))}
        </div>
      )}
      {ConfirmDeleteDialog}
    </div>
  );
}

export default Memes;
