import { apiFetch } from '../pages/api';
import { API_URL } from '../config';

export function createHomeworkDraftSync(studentId, homeworkId, revision, onStatus) {
  const key = `hw_draft_${studentId}_${homeworkId}`;
  let pending = null, running = null, stopped = false, timer;
  const persist = data => {
    try { localStorage.setItem(key, JSON.stringify({ ...data, serverRevision: revision })); } catch {}
  };
  const flush = () => {
    if (stopped || running || !pending) return running || Promise.resolve();
    clearTimeout(timer);
    running = (async () => {
      while (pending && !stopped) {
        const data = pending;
        pending = null;
        onStatus('Сохраняем прогресс…');
        try {
          const body = JSON.stringify({ revision, data });
          const res = await apiFetch(`${API_URL}/homework/${homeworkId}/draft`, {
            method: 'PUT', body, keepalive: new Blob([body]).size < 60000,
          });
          if (res.status === 409) {
            stopped = true;
            onStatus('Домашка изменена на другом устройстве. Открой её заново.');
            return;
          }
          if (!res.ok) throw new Error('Draft save failed');
          revision = (await res.json()).revision;
          persist(pending || data);
          onStatus(pending ? 'Сохраняем прогресс…' : 'Прогресс сохранён');
        } catch {
          pending = pending || data;
          onStatus('Не удалось сохранить на сервере. Повторяем отправку…');
          timer = setTimeout(flush, 3000);
          break;
        }
      }
    })().finally(() => { running = null; });
    return running;
  };
  return {
    update(data) { if (stopped) return; pending = data; persist(data); void flush(); },
    flush,
    stop() { stopped = true; pending = null; clearTimeout(timer); },
  };
}
