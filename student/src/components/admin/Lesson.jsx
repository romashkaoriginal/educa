import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { API_URL, SOCKET_URL } from '../../config';
import { adminFetch, getTelegramInitData } from './adminApi';
import StreamPresentation from './StreamPresentation';
import MathText, { LatexHelp } from '../MathText';
import '../../styles/Lesson.css';

// Всплеск ответов класса схлопывается в одно обновление экрана преподавателя.
const BURST_COALESCE_MS = 400;
// Страховочный опрос метрик: основное обновление приходит событиями сокета.
const METRICS_FALLBACK_MS = 20000;

const STATUS = { scheduled: 'Предстоит', live: 'Идёт сейчас', finished: 'Завершено', cancelled: 'Отменено' };
const POLL_STATUS = { draft: 'Готово к запуску', active: 'Идёт сейчас', closed: 'Завершено' };
const QUIZ_STATUS = { draft: 'Подготовка', active: 'Идёт сейчас', finished: 'Завершено' };
const POLL_PRESETS = {
  clear_unclear: 'Понятно / Непонятно', yes_no: 'Да / Нет', pace: 'Темп',
  repeat_or_continue: 'Повторить / Продолжить', keeping_up: 'Успеваю / Не успеваю', custom: 'Свой вопрос'
};

// ТЗ §3.1/§8.7: в расписании указываются только предмет (раздел), дата, время и тема.
const emptyLesson = { subjectId: '', scheduledAt: '', topic: '' };
// ТЗ §3.2/§7: ссылка на трансляцию задаётся в момент запуска занятия.
const emptyStart = { lessonId: null, subjectId: '', topic: '', streamUrl: '' };
const emptyPoll = { template: 'clear_unclear', question: '', optionsText: 'Понятно\nНепонятно', isAnonymous: true, showResultsToStudents: true, durationSec: '' };

async function request(path, options = {}) {
  const response = await adminFetch(`${API_URL}/lesson-admin${path}`, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || 'Не удалось выполнить действие');
  return data;
}

const fullName = (user) => [user?.firstName, user?.lastName].filter(Boolean).join(' ') || 'Не указан';
const formatDate = (value) => value ? new Date(value).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' }) : '—';
const formatTime = (value) => value ? new Date(value).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '—';
const toLocalInput = (value) => {
  if (!value) return '';
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

export const mergeStudentQuestionUpdate = (current, updated) => ({
  ...current,
  ...updated,
  student: updated.student || current.student
});

function useCountdown(targetDate) {
  const target = targetDate ? new Date(targetDate).getTime() : null;
  const [remainingMs, setRemainingMs] = useState(target ? target - Date.now() : null);
  useEffect(() => {
    if (!target) { setRemainingMs(null); return undefined; }
    setRemainingMs(target - Date.now());
    const timer = setInterval(() => setRemainingMs(target - Date.now()), 1000);
    return () => clearInterval(timer);
  }, [target]);
  return remainingMs;
}

function formatCountdown(ms) {
  const totalSec = Math.max(0, Math.round(ms / 1000));
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    : `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function CountdownBadge({ targetDate, expiredLabel = 'Время истекло', className = 'lesson-countdown' }) {
  const remainingMs = useCountdown(targetDate);
  if (!targetDate || remainingMs === null) return null;
  return (
    <span className={`${className} ${remainingMs <= 0 ? `${className}--expired` : ''}`}>
      {remainingMs > 0 ? formatCountdown(remainingMs) : expiredLabel}
    </span>
  );
}

export default function LessonAdmin({ subjects = [], currentUser, dataRefreshKey, entryRequest }) {
  const [lessons, setLessons] = useState([]);
  const [users, setUsers] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [lessonForm, setLessonForm] = useState(emptyLesson);
  const [startForm, setStartForm] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [teacherForm, setTeacherForm] = useState({ teacherId: '', subjectId: '' });
  const [pollForm, setPollForm] = useState(emptyPoll);
  const [polls, setPolls] = useState([]);
  const [quizzes, setQuizzes] = useState([]);
  const [selectedQuizId, setSelectedQuizId] = useState(null);
  const [studentQuestions, setStudentQuestions] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [pollResults, setPollResults] = useState(null);
  const [quizStats, setQuizStats] = useState(null);
  const [pollComposerOpen, setPollComposerOpen] = useState(false);
  const [materialForm, setMaterialForm] = useState({ type: 'link', title: '', url: '', homeworkId: '' });
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState('');
  const [currentNotice, setCurrentNotice] = useState(null);
  const [stream, setStream] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const deleteConfirmRef = useRef(null);
  const noticeQueueRef = useRef([]);
  const noticeTimersRef = useRef({});
  const processNoticeQueueRef = useRef(null);

  const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'superadmin' || !currentUser?.role;
  const selected = useMemo(() => lessons.find((lesson) => Number(lesson.id) === Number(selectedId)) || null, [lessons, selectedId]);
  const teachers = users.filter((user) => user.role === 'teacher' && user.isActive !== false);

  const loadBase = useCallback(async () => {
    try {
      const calls = [request('/lessons')];
      if (isAdmin) {
        calls.push(adminFetch(`${API_URL}/users`).then((response) => response.json()));
        calls.push(request('/teacher-subjects'));
      }
      const [lessonData, userData, assignmentData] = await Promise.all(calls);
      setLessons(lessonData.lessons || []);
      setUsers(userData?.users || []);
      setAssignments(assignmentData?.assignments || []);
    } catch (error) { setMessage(error.message); }
  }, [isAdmin]);

  useEffect(() => { loadBase(); }, [dataRefreshKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!entryRequest?.lessonId) return;
    setSelectedId(Number(entryRequest.lessonId));
    loadBase();
  }, [entryRequest?.lessonId, entryRequest?.nonce, loadBase]);

  const loadSession = useCallback(async (lesson) => {
    if (!lesson) return;
    try {
      const detail = await request(`/lessons?status=${lesson.status}`);
      const fresh = (detail.lessons || []).find((item) => Number(item.id) === Number(lesson.id));
      if (fresh) setLessons((items) => items.map((item) => item.id === fresh.id ? fresh : item));
      const state = await request(`/lessons/${lesson.id}/state`);
      setPolls(state.polls || []);
      const nextQuizzes = state.quizzes || [];
      setQuizzes(nextQuizzes);
      setSelectedQuizId((current) => {
        const active = nextQuizzes.find((quiz) => quiz.status === 'active');
        if (active) return active.id;
        if (nextQuizzes.some((quiz) => Number(quiz.id) === Number(current))) return current;
        return (nextQuizzes.find((quiz) => quiz.status === 'draft') || nextQuizzes[0])?.id || null;
      });
      setMaterials(state.materials || []);
      if (lesson.status === 'live') {
        const [questionsData, attendanceData] = await Promise.all([
          request(`/lessons/${lesson.id}/questions`),
          request(`/lessons/${lesson.id}/attendance`)
        ]);
        setStudentQuestions(questionsData.questions || []);
        setAttendance(attendanceData.attendance || []);
      }
      if (lesson.status === 'finished') {
        const materialResponse = await adminFetch(`${API_URL}/lesson/lessons/${lesson.id}/materials`);
        if (materialResponse.ok) setMaterials((await materialResponse.json()).materials || []);
      }
    } catch (error) { setMessage(error.message); }
  }, []);

  useEffect(() => { if (selected) loadSession(selected); }, [selected?.id, selected?.status]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!deleteTarget) return undefined;
    const previous = document.activeElement;
    const focusTimer = window.setTimeout(() => deleteConfirmRef.current?.focus(), 0);
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setDeleteTarget(null);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener('keydown', handleKeyDown);
      previous?.focus?.();
    };
  }, [deleteTarget]);

  const run = async (key, action, { reload = true, refreshSession = true } = {}) => {
    setBusy(key); setMessage('');
    try {
      const result = await action();
      if (reload) await loadBase();
      if (refreshSession && selected) await loadSession(selected);
      return result;
    } catch (error) { setMessage(error.message); return null; }
    finally { setBusy(''); }
  };

  const launchStream = (source) => {
    setStream({ hostWindow: null, source });
  };
  const closeStream = useCallback(() => setStream(null), []);

  const createLesson = () => run('create-lesson', async () => {
    if (!lessonForm.subjectId) throw new Error('Выберите предмет');
    if (!lessonForm.scheduledAt) throw new Error('Укажите дату и время');
    await request('/lessons', {
      method: 'POST',
      body: JSON.stringify({
        subjectId: lessonForm.subjectId,
        topic: lessonForm.topic,
        scheduledAt: new Date(lessonForm.scheduledAt).toISOString()
      })
    });
    setLessonForm((form) => ({ ...emptyLesson, subjectId: form.subjectId }));
    setMessage('Занятие добавлено в расписание');
  });

  // ТЗ §7: запуск из пункта расписания — тема подставляется, её можно изменить.
  const openStartFromSchedule = (lesson) => setStartForm({
    ...emptyStart, lessonId: lesson.id, subjectId: lesson.subjectId, topic: lesson.topic || ''
  });

  // ТЗ §7 «Отдельный быстрый запуск»: тема необязательна, ссылка обязательна.
  const openStartNow = () => setStartForm({
    ...emptyStart, subjectId: lessonForm.subjectId || subjects[0]?.id || ''
  });

  const submitStart = () => run('start-lesson', async () => {
    if (!startForm.streamUrl.trim()) throw new Error('Укажите ссылку на трансляцию');
    const body = JSON.stringify({ topic: startForm.topic, streamUrl: startForm.streamUrl.trim() });
    if (startForm.lessonId) {
      const data = await request(`/lessons/${startForm.lessonId}/start`, { method: 'POST', body });
      setSelectedId(startForm.lessonId);
      setMessage(data.alreadyLive ? 'Занятие уже идёт' : 'Занятие начато, ученики уведомлены');
    } else {
      if (!startForm.subjectId) throw new Error('Выберите предмет занятия');
      const data = await request('/lessons/start-now', {
        method: 'POST',
        body: JSON.stringify({
          subjectId: startForm.subjectId, topic: startForm.topic, streamUrl: startForm.streamUrl.trim()
        })
      });
      if (data.lesson?.id) setSelectedId(data.lesson.id);
      setMessage('Занятие начато, ученики уведомлены');
    }
    setStartForm(null);
  });

  const finishLesson = (lesson) => {
    if (!window.confirm('Завершить занятие? Новые ответы больше приниматься не будут.')) return;
    run(`finish-${lesson.id}`, async () => request(`/lessons/${lesson.id}/finish`, { method: 'POST' }));
  };

  const deleteLesson = (lesson) => setDeleteTarget(lesson);

  const confirmDeleteLesson = () => {
    const lesson = deleteTarget;
    if (!lesson) return;
    // Снимаем модальный слой до запроса: даже при ошибке API он не останется
    // поверх страницы и не заблокирует дальнейшие клики.
    setDeleteTarget(null);
    run(`delete-lesson-${lesson.id}`, async () => {
      await request(`/lessons/${lesson.id}`, { method: 'DELETE' });
      setLessons((items) => items.filter((item) => Number(item.id) !== Number(lesson.id)));
      if (Number(selectedId) === Number(lesson.id)) {
        setSelectedId(null);
        setPolls([]);
        setQuizzes([]);
        setSelectedQuizId(null);
        setStudentQuestions([]);
        setAttendance([]);
        setMaterials([]);
        setPollResults(null);
        setQuizStats(null);
        setStream(null);
        setStartForm(null);
        setEditForm(null);
      }
      setMessage('Занятие удалено');
    }, { reload: false, refreshSession: false });
  };

  // Редактирование темы/даты записи расписания — доступно для любого статуса кроме live.
  const editLesson = (lesson) => setEditForm({ lessonId: lesson.id, topic: lesson.topic || '', scheduledAt: toLocalInput(lesson.scheduledAt) });

  const submitEdit = () => run('edit-lesson', async () => {
    if (!editForm.scheduledAt) throw new Error('Укажите дату и время');
    const date = new Date(editForm.scheduledAt);
    if (Number.isNaN(date.getTime())) throw new Error('Некорректная дата');
    await request(`/lessons/${editForm.lessonId}`, {
      method: 'PATCH', body: JSON.stringify({ topic: editForm.topic, scheduledAt: date.toISOString() })
    });
    setEditForm(null);
    setMessage('Занятие обновлено');
  });

  const postponeLesson = (lesson) => {
    const value = window.prompt('Новая дата и время (ГГГГ-ММ-ДДTЧЧ:ММ)', toLocalInput(lesson.scheduledAt));
    if (!value) return;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) { setMessage('Некорректная дата'); return; }
    run(`postpone-${lesson.id}`, () => request(`/lessons/${lesson.id}/postpone`, { method: 'POST', body: JSON.stringify({ scheduledAt: date.toISOString() }) }));
  };

  // ТЗ §4.2: преподаватель может временно отключить вопросы от учеников.
  const toggleQuestions = (lesson) => run('toggle-questions', async () => {
    await request(`/lessons/${lesson.id}/questions-toggle`, {
      method: 'POST', body: JSON.stringify({ enabled: lesson.questionsEnabled === false })
    });
  });

  // Назначение преподавателя на предмет напрямую — групп больше нет.
  const assignTeacher = () => run('assign-teacher', async () => {
    await request('/teacher-subjects', {
      method: 'POST',
      body: JSON.stringify({ teacherId: teacherForm.teacherId, subjectId: teacherForm.subjectId })
    });
    setTeacherForm({ teacherId: '', subjectId: '' });
  });

  const createPoll = () => run('create-poll', async () => {
    const payload = {
      ...pollForm,
      options: pollForm.optionsText.split('\n').map((item) => item.trim()).filter(Boolean),
      durationSec: pollForm.durationSec ? Number(pollForm.durationSec) : null
    };
    delete payload.optionsText;
    const data = await request(`/lessons/${selected.id}/polls`, { method: 'POST', body: JSON.stringify(payload) });
    setPolls((items) => [data.poll, ...items]);
    setPollForm(emptyPoll);
    setPollComposerOpen(false);
  }, { reload: false });

  const pollAction = (poll, action) => run(`poll-${action}`, async () => {
    const data = await request(`/polls/${poll.id}/${action}`, { method: 'POST' });
    if (action === 'restart' && data.poll) setPolls((items) => [data.poll, ...items]);
    else await loadSession(selected);
  }, { reload: false });

  const quizAction = (quiz, action) => run(`quiz-${action}`, async () => {
    await request(`/quizzes/${quiz.id}/${action}`, { method: 'POST' });
    await loadSession(selected);
    if (action === 'start') launchStream({ lessonQuizId: quiz.id, subjectName: selected.subject?.name });
  }, { reload: false });

  const loadLiveMetrics = useCallback(async (poll, quiz) => {
    try {
      if (poll?.id) setPollResults((await request(`/polls/${poll.id}/results`)).results || null);
      else setPollResults(null);
      if (quiz?.id) setQuizStats(await request(`/quizzes/${quiz.id}/live-stats?withStudents=1`));
      else setQuizStats(null);
    } catch (error) { setMessage(error.message); }
  }, []);

  const updateQuestionStatus = (question, status) => run(`sq-${question.id}`, async () => {
    const data = await request(`/questions/${question.id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
    setStudentQuestions((items) => items.map((item) => item.id === question.id
      ? mergeStudentQuestionUpdate(item, data.question)
      : item));
  }, { reload: false });

  const createMaterial = () => run('material', async () => {
    const data = await request(`/lessons/${selected.id}/materials`, { method: 'POST', body: JSON.stringify(materialForm) });
    setMaterials((items) => [data.material, ...items]);
    setMaterialForm({ type: 'link', title: '', url: '', homeworkId: '' });
  }, { reload: false });

  // Активные занятия и расписание — разные сущности (ТЗ §3). Быстрый запуск
  // создаёт занятие вне расписания (fromSchedule === false), в таблице расписания
  // такие записи не показываются.
  const liveLessons = lessons.filter((lesson) => lesson.status === 'live');
  const scheduleLessons = lessons.filter((lesson) => lesson.fromSchedule !== false && lesson.status !== 'live');
  const preparedQuiz = quizzes.find((quiz) => quiz.status === 'active')
    || quizzes.find((quiz) => Number(quiz.id) === Number(selectedQuizId))
    || quizzes.find((quiz) => quiz.status === 'draft')
    || quizzes[0]
    || null;
  const activePoll = polls.find((poll) => poll.status === 'active')
    || polls.find((poll) => poll.status === 'draft')
    || polls[0]
    || null;

  useEffect(() => {
    setPollComposerOpen(false);
    setSelectedQuizId(null);
    setPollForm(emptyPoll);
  }, [selectedId]);

  useEffect(() => {
    if (selected?.status !== 'live') return undefined;
    loadLiveMetrics(activePoll, preparedQuiz);
    // Метрики приходят событиями сокета; интервал — только страховка на случай
    // потерянного события, поэтому редкий.
    const timer = setInterval(() => loadLiveMetrics(activePoll, preparedQuiz), METRICS_FALLBACK_MS);
    return () => clearInterval(timer);
  }, [selected?.status, activePoll?.id, preparedQuiz?.id, preparedQuiz?.status, loadLiveMetrics]); // eslint-disable-line react-hooks/exhaustive-deps

  const pushNotice = useCallback((notice) => {
    noticeQueueRef.current.push({ ...notice, id: `${Date.now()}-${Math.random()}` });
    processNoticeQueueRef.current?.();
  }, []);

  useEffect(() => {
    processNoticeQueueRef.current = () => {
      if (noticeTimersRef.current.busy) return;
      const next = noticeQueueRef.current.shift();
      if (!next) return;
      noticeTimersRef.current.busy = true;
      setCurrentNotice({ ...next, leaving: false });
      noticeTimersRef.current.leave = setTimeout(() => {
        setCurrentNotice((current) => current && current.id === next.id ? { ...current, leaving: true } : current);
        noticeTimersRef.current.remove = setTimeout(() => {
          setCurrentNotice((current) => current && current.id === next.id ? null : current);
          noticeTimersRef.current.busy = false;
          processNoticeQueueRef.current();
        }, 260);
      }, 1300);
    };
  });

  useEffect(() => () => {
    clearTimeout(noticeTimersRef.current.leave);
    clearTimeout(noticeTimersRef.current.remove);
    noticeTimersRef.current = {};
    noticeQueueRef.current = [];
  }, []);

  useEffect(() => {
    if (!selected?.id || selected.status !== 'live') return undefined;
    const socket = io(SOCKET_URL, {
      auth: { initData: getTelegramInitData() },
      transports: ['websocket', 'polling'],
      reconnection: true
    });
    // Ответы 50 учеников приходят почти одновременно, и каждое событие звало
    // перезагрузку: класс из 50 человек давал 50 полных загрузок занятия и
    // 50 запросов метрик за секунду — с этого и начинались 429 у преподавателя.
    // Схлопываем всплеск в одно обновление.
    const timers = {};
    const coalesce = (key, run) => {
      clearTimeout(timers[key]);
      timers[key] = setTimeout(run, BURST_COALESCE_MS);
    };
    const refresh = () => coalesce('session', () => loadSession(selected));
    const refreshMetrics = () => coalesce('metrics', () => loadLiveMetrics(activePoll, preparedQuiz));
    socket.on('connect', () => socket.emit('admin:join-lesson', { lessonId: selected.id }));
    socket.on('poll:results-updated', (results) => setPollResults(results));
    socket.on('quiz:answer-received', refreshMetrics);
    socket.on('quiz:delivery-received', refreshMetrics);
    socket.on('attendance:updated', refresh);
    socket.on('question:new', (payload) => {
      refresh();
      pushNotice({ kind: 'question', title: fullName(payload?.question?.student), text: payload?.question?.text || 'Поднял(а) руку' });
    });
    socket.on('lesson:finished', refresh);
    return () => {
      Object.values(timers).forEach(clearTimeout);
      socket.disconnect();
    };
  }, [selected?.id, selected?.status, activePoll?.id, preparedQuiz?.id, loadSession, loadLiveMetrics, pushNotice]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="lesson-admin">
      {currentNotice && (
        <div className="lesson-admin-notices" aria-live="polite">
          <div
            key={currentNotice.id}
            className={`lesson-admin-notice lesson-admin-notice--${currentNotice.kind} ${currentNotice.leaving ? 'lesson-admin-notice--leaving' : ''}`}
          >
            <span className="lesson-admin-notice-icon" aria-hidden="true">{currentNotice.kind === 'question' ? '✋' : '◉'}</span>
            <div>
              <strong>{currentNotice.title}</strong>
              <p>{currentNotice.text}</p>
            </div>
          </div>
        </div>
      )}
      {message && <button type="button" className="lesson-admin-message" onClick={() => setMessage('')}>{message}<span>×</span></button>}

      {!selected && <>
      {/* ТЗ §7 «Отдельный быстрый запуск»: занятие можно начать вне расписания. */}
      <section className="admin-section lesson-admin-section lesson-admin-quickstart">
        <div className="admin-section-header">
          <div><h3>Начать занятие</h3><p>Занятие можно начать в любой момент — независимо от расписания.</p></div>
          <button type="button" className="admin-btn admin-btn--primary" onClick={openStartNow}>Начать занятие сейчас</button>
        </div>
        {liveLessons.length > 0 && <div className="lesson-admin-live-list">
          {liveLessons.map((lesson) => <button type="button" key={lesson.id} className="lesson-admin-live-row" onClick={() => setSelectedId(lesson.id)}>
            <span className="lesson-admin-live-dot" aria-hidden="true" />
            <span><strong>{lesson.subject?.name}</strong><small>{lesson.topic || 'Без темы'} · началось в {formatTime(lesson.startedAt)}</small></span>
            {lesson.sessionEndsAt && <CountdownBadge targetDate={lesson.sessionEndsAt} expiredLabel="Завершается…" />}
            <span aria-hidden="true">→</span>
          </button>)}
        </div>}
      </section>

      {/* ТЗ §3.1/§7: расписание — только дата, время и тема. */}
      <section className="admin-section lesson-admin-section">
        <div className="admin-section-header"><div><h3>Расписание</h3><p>Расписание показывает ученикам, когда планируется следующее занятие. Занятие оно не запускает.</p></div></div>
        <div className="lesson-admin-create-grid">
          <label className="lesson-admin-field"><span>Предмет</span><select value={lessonForm.subjectId} onChange={(event) => setLessonForm((form) => ({ ...form, subjectId: event.target.value }))}>
            <option value="">Выберите предмет</option>{subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
          </select></label>
          <label className="lesson-admin-field"><span>Дата и время</span><input type="datetime-local" value={lessonForm.scheduledAt} onChange={(event) => setLessonForm((form) => ({ ...form, scheduledAt: event.target.value }))} /></label>
          <label className="lesson-admin-field"><span>Тема</span><input placeholder="Например, законы Ньютона" value={lessonForm.topic} onChange={(event) => setLessonForm((form) => ({ ...form, topic: event.target.value }))} /></label>
          <button type="button" className="admin-btn admin-btn--primary lesson-admin-wide" disabled={!lessonForm.subjectId || !lessonForm.scheduledAt || busy === 'create-lesson'} onClick={createLesson}>Добавить в расписание</button>
        </div>

        <div className="lesson-admin-table-wrap"><table className="lesson-admin-table"><thead><tr><th>Дата</th><th>Тема</th><th>Предмет</th><th>Статус</th><th /></tr></thead><tbody>
          {scheduleLessons.length === 0 && <tr className="lesson-admin-table-empty"><td colSpan="5">Записей в расписании пока нет. Заполните форму выше, чтобы добавить первую.</td></tr>}
          {scheduleLessons.map((lesson) => <tr key={lesson.id} className={Number(selectedId) === Number(lesson.id) ? 'selected' : ''} onClick={() => setSelectedId(lesson.id)}>
            <td>{formatDate(lesson.scheduledAt)}</td>
            <td><strong>{lesson.topic || 'Без темы'}</strong></td>
            <td>{lesson.subject?.name}</td>
            <td><span className={`lesson-admin-status ${lesson.status}`}>{lesson.originalScheduledAt ? 'Перенесено' : STATUS[lesson.status]}</span></td>
            <td><div className="lesson-admin-row-actions">
              <button type="button" onClick={(event) => { event.stopPropagation(); setSelectedId(lesson.id); }}>Открыть →</button>
              {lesson.status === 'scheduled' && <button type="button" className="primary" onClick={(event) => { event.stopPropagation(); openStartFromSchedule(lesson); }}>Начать занятие</button>}
              <button type="button" onClick={(event) => { event.stopPropagation(); editLesson(lesson); }}>Редактировать</button>
              <button type="button" className="danger" disabled={busy === `delete-lesson-${lesson.id}`} onClick={(event) => { event.stopPropagation(); deleteLesson(lesson); }}>Удалить</button>
            </div></td>
          </tr>)}
        </tbody></table></div>
      </section>

      {/* Группы как сущность убраны: ученик попадает на занятие по доступу к
          предмету. Преподаватель назначается напрямую на предмет. */}
      {isAdmin && <section className="admin-section lesson-admin-section">
        <div className="admin-section-header"><div><h3>Преподаватели</h3><p>Преподаватель ведёт занятия по назначенным ему предметам.</p></div></div>
        <div className="lesson-admin-inline-form">
          <select value={teacherForm.teacherId} onChange={(event) => setTeacherForm((form) => ({ ...form, teacherId: event.target.value }))}>
            <option value="">Преподаватель</option>
            {teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{fullName(teacher)}</option>)}
          </select>
          <select value={teacherForm.subjectId} onChange={(event) => setTeacherForm((form) => ({ ...form, subjectId: event.target.value }))}>
            <option value="">Предмет</option>
            {subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
          </select>
          <button type="button" className="admin-btn admin-btn--primary" disabled={!teacherForm.teacherId || !teacherForm.subjectId || busy === 'assign-teacher'} onClick={assignTeacher}>Назначить</button>
        </div>
        <div className="lesson-admin-groups">
          {subjects.length === 0 && <p className="lesson-admin-empty lesson-admin-empty--wide">Предметов пока нет.</p>}
          {subjects.map((subject) => {
            const subjectAssignments = assignments.filter((item) => Number(item.subjectId) === Number(subject.id));
            return (
              <article key={subject.id}>
                <div className="lesson-admin-card-title">
                  <div><h4>{subject.name}</h4><span>{subjectAssignments.length ? `${subjectAssignments.length} преп.` : 'преподаватель не назначен'}</span></div>
                </div>
                {subjectAssignments.length > 0 && <div className="lesson-admin-chips">
                  {subjectAssignments.map((assignment) => <span key={assignment.id}>{fullName(assignment.teacher)}
                    <button type="button" onClick={() => run(`unassign-${assignment.id}`, () => request(`/teacher-subjects/${assignment.id}`, { method: 'DELETE' }))}>×</button>
                  </span>)}
                </div>}
              </article>
            );
          })}
        </div>
      </section>}

      </>}

      {selected && (<>
        <div className="lesson-admin-detail-nav">
          <button type="button" className="admin-btn" onClick={() => setSelectedId(null)}>← К расписанию</button>
          {selected.status === 'live' && selected.sessionEndsAt && <CountdownBadge targetDate={selected.sessionEndsAt} expiredLabel="Завершается…" />}
          <span className={`lesson-admin-status ${selected.status}`}>{STATUS[selected.status]}</span>
        </div>
        <section className="admin-section lesson-admin-section lesson-admin-session">
          <div className="admin-section-header"><div><h3>{selected.status === 'live' ? 'Активная сессия' : selected.status === 'finished' ? 'Итоги занятия' : 'Подготовка занятия'}</h3><p>{selected.subject?.name} · {formatDate(selected.scheduledAt)} · {selected.topic || 'Без темы'}</p></div><div className="lesson-admin-detail-actions">{selected.status === 'scheduled' && <><button type="button" className="admin-btn" onClick={() => postponeLesson(selected)}>Перенести</button><button type="button" className="admin-btn admin-btn--danger" onClick={() => run(`cancel-${selected.id}`, () => request(`/lessons/${selected.id}/cancel`, { method: 'POST' }))}>Отменить</button><button type="button" className="admin-btn admin-btn--primary" onClick={() => openStartFromSchedule(selected)}>Начать занятие</button></>}{selected.status === 'live' && <><button type="button" className="admin-btn" disabled={busy === 'toggle-questions'} onClick={() => toggleQuestions(selected)}>{selected.questionsEnabled === false ? 'Включить вопросы' : 'Отключить вопросы'}</button><button type="button" className="admin-btn admin-btn--danger" onClick={() => finishLesson(selected)}>Завершить занятие</button></>}{selected.status !== 'live' && <button type="button" className="admin-btn" onClick={() => editLesson(selected)}>Редактировать</button>}{selected.status !== 'live' && <button type="button" className="admin-btn admin-btn--danger" disabled={busy === `delete-lesson-${selected.id}`} onClick={() => deleteLesson(selected)}>Удалить занятие</button>}</div></div>
          <div className="lesson-admin-session-grid">
            <article className="lesson-admin-tool"><div className="lesson-admin-tool-heading"><h4>Голосование</h4>{selected.status === 'live' && activePoll?.status === 'closed' && !pollComposerOpen && <button type="button" onClick={() => setPollComposerOpen(true)}>+ Новое голосование</button>}</div>
              {selected.status === 'live' && (!activePoll || pollComposerOpen) && <div className="lesson-admin-composer"><select value={pollForm.template} onChange={(event) => setPollForm((form) => ({ ...form, template: event.target.value, isAnonymous: event.target.value === 'clear_unclear' }))}>{Object.entries(POLL_PRESETS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>{pollForm.template === 'custom' && <><input placeholder="Вопрос" value={pollForm.question} onChange={(event) => setPollForm((form) => ({ ...form, question: event.target.value }))} /><textarea placeholder="Варианты — каждый с новой строки" value={pollForm.optionsText} onChange={(event) => setPollForm((form) => ({ ...form, optionsText: event.target.value }))} /><LatexHelp /></>}<div className="lesson-admin-checks"><label><input type="checkbox" checked={pollForm.isAnonymous} onChange={(event) => setPollForm((form) => ({ ...form, isAnonymous: event.target.checked }))} /> Анонимно</label><label><input type="checkbox" checked={pollForm.showResultsToStudents} onChange={(event) => setPollForm((form) => ({ ...form, showResultsToStudents: event.target.checked }))} /> Результаты ученикам</label></div><input type="number" min="10" placeholder="Длительность, сек. (пусто — вручную)" value={pollForm.durationSec} onChange={(event) => setPollForm((form) => ({ ...form, durationSec: event.target.value }))} /><div className="lesson-admin-composer-actions"><button type="button" className="admin-btn admin-btn--primary" disabled={busy === 'create-poll'} onClick={createPoll}>Создать голосование</button>{activePoll && <button type="button" onClick={() => setPollComposerOpen(false)}>Отмена</button>}</div></div>}
              {activePoll && <div className="lesson-admin-active">
                <strong><MathText text={activePoll.question} /></strong><span>{POLL_STATUS[activePoll.status] || activePoll.status}</span>
                {activePoll.status === 'active' && activePoll.autoCloseAt && <CountdownBadge targetDate={activePoll.autoCloseAt} expiredLabel="Завершается…" />}
                {pollResults && <div className="lesson-admin-poll-results">{pollResults.options?.map((option) => <span key={option.id}><i style={{ width: `${option.percent}%` }} /><b><MathText text={option.text} /></b><strong>{option.percent}%</strong><small>{option.count}</small></span>)}</div>}
                {pollResults && <small>Ответили: {pollResults.total} из {attendance.length}</small>}
                {!activePoll.isAnonymous && pollResults?.answers?.length > 0 && <div className="lesson-admin-answer-list">{pollResults.answers.map((answer) => <span key={answer.id}>{fullName(answer.user)} — <MathText text={answer.option?.text} /></span>)}</div>}
                <div>{activePoll.status === 'draft' && <button type="button" onClick={() => pollAction(activePoll, 'start')}>Запустить</button>}{activePoll.status === 'active' && <><button type="button" onClick={() => pollAction(activePoll, 'reveal-results')}>Показать результаты</button><button type="button" onClick={() => pollAction(activePoll, 'close')}>Закрыть</button></>}{activePoll.status === 'closed' && <button type="button" onClick={() => pollAction(activePoll, 'restart')}>Перезапустить</button>}</div>
              </div>}
              {selected.status !== 'live' && <p className="lesson-admin-empty">Голосование создаётся после начала занятия.</p>}
            </article>

            <article className="lesson-admin-tool"><div className="lesson-admin-tool-heading"><h4>Викторина занятия</h4></div>
              {!preparedQuiz && <p className="lesson-admin-empty">Викторина не привязана. Создайте её в разделе «Викторины» и выберите это занятие.</p>}
              {preparedQuiz && <div className="lesson-admin-active">
                <strong>{preparedQuiz.title}</strong><span>{QUIZ_STATUS[preparedQuiz.status] || preparedQuiz.status} · вопросов: {preparedQuiz.questions?.length || 0}</span>
                {quizStats && <div className="lesson-admin-answer-list"><strong>Участники ({quizStats.participants?.length || 0})</strong>{(quizStats.participants || []).map((member) => <span key={member.id}>{fullName(member.user)}</span>)}</div>}
                {preparedQuiz.status === 'draft' && selected.status === 'live' && <button type="button" className="primary" onClick={() => quizAction(preparedQuiz, 'start')}>Начать викторину</button>}
                <div className="lesson-admin-quiz-stream-row">
                  {preparedQuiz.mode === 'single_step' && preparedQuiz.status === 'active' && preparedQuiz.questionRevealState === 'question' && preparedQuiz.questionStartedAt && <CountdownBadge targetDate={new Date(new Date(preparedQuiz.questionStartedAt).getTime() + Number(preparedQuiz.questions?.find((question) => Number(question.order) === Number(preparedQuiz.currentQuestionIndex))?.timeLimit || 30) * 1000)} />}
                  <button type="button" className="lesson-admin-stream-button" onClick={() => launchStream({ lessonQuizId: preparedQuiz.id, subjectName: selected.subject?.name })}>{preparedQuiz.mode === 'single_step' ? 'Экран викторины ↗' : 'Экран рейтинга ↗'}</button>
                </div>
                {preparedQuiz.status === 'active' && <>
                  <div>{preparedQuiz.mode === 'single_step' ? <>
                    {preparedQuiz.questionRevealState === 'hidden' && <button type="button" onClick={() => quizAction(preparedQuiz, 'show-question')}>Показать вопрос</button>}
                    {preparedQuiz.questionRevealState === 'question' && <button type="button" onClick={() => quizAction(preparedQuiz, 'show-answer')}>Ответы приняты · рейтинг</button>}
                    {preparedQuiz.questionRevealState === 'answer' && <>
                      {preparedQuiz.currentQuestionIndex + 1 < (preparedQuiz.questions?.length || 0)
                        ? <button type="button" onClick={() => quizAction(preparedQuiz, 'next-question')}>Следующий вопрос</button>
                        : <button type="button" onClick={() => quizAction(preparedQuiz, 'finish')}>Завершить викторину</button>}
                    </>}
                  </> : <button type="button" onClick={() => quizAction(preparedQuiz, 'finish')}>Завершить викторину</button>}</div>
                  {quizStats && <div className="lesson-admin-quiz-stats"><strong>Получили хотя бы один вопрос: {quizStats.receivedStudents} из {quizStats.totalStudents}</strong>{quizStats.questions?.map((question, index) => <div key={question.questionId}><span>Вопрос {index + 1}: получили {question.received}, ответили {question.answered}, правильно {question.correctPercent}%</span><div>{question.distribution?.map((count, optionIndex) => <i key={optionIndex}>Вариант {optionIndex + 1}: {count}</i>)}</div>{question.answers?.length > 0 && <small>{question.answers.map((answer) => `${fullName(answer.user)} — ${answer.selectedAnswer.map((item) => item + 1).join(', ')}`).join('; ')}</small>}</div>)}</div>}
                </>}
              </div>}
            </article>

            {selected.status === 'live' && <>
              <article className="lesson-admin-tool"><div className="lesson-admin-card-title"><h4>Вопросы учеников</h4><span>{studentQuestions.filter((item) => item.status === 'pending').length} новых</span></div>{studentQuestions.length ? studentQuestions.map((question) => <div className="lesson-admin-student-question" key={question.id}><strong>{fullName(question.student)}</strong><p>{question.text || 'Поднял(а) руку'}</p><select value={question.status} onChange={(event) => updateQuestionStatus(question, event.target.value)}><option value="pending">Ожидает</option><option value="answering">Отвечаю сейчас</option><option value="answered">Отвечено</option><option value="deferred">После занятия</option></select></div>) : <p className="lesson-admin-empty">Вопросов пока нет.</p>}</article>
              <article className="lesson-admin-tool lesson-admin-attendance"><div className="lesson-admin-card-title"><h4>Посещаемость</h4><span>{attendance.filter((item) => item.present).length} / {attendance.length}</span></div>{attendance.map((item) => <div key={item.userId}><span className={item.present ? 'present' : 'absent'}>{item.present ? '●' : '○'}</span><strong>{fullName(item.student)}</strong><small>{item.record?.joinedAt ? `с ${formatDate(item.record.joinedAt)}` : 'не заходил'}</small></div>)}</article>
            </>}
          </div>

          {selected.status === 'finished' && <article className="lesson-admin-material-block"><h4>Материалы занятия</h4><div className="lesson-admin-inline-form"><select value={materialForm.type} onChange={(event) => setMaterialForm((form) => ({ ...form, type: event.target.value }))}><option value="note">Конспект</option><option value="presentation">Презентация</option><option value="recording">Запись</option><option value="link">Ссылка</option><option value="homework">Домашнее задание</option></select><input placeholder="Название" value={materialForm.title} onChange={(event) => setMaterialForm((form) => ({ ...form, title: event.target.value }))} /><input placeholder={materialForm.type === 'homework' ? 'ID домашнего задания' : 'Ссылка'} value={materialForm.type === 'homework' ? materialForm.homeworkId : materialForm.url} onChange={(event) => setMaterialForm((form) => ({ ...form, [form.type === 'homework' ? 'homeworkId' : 'url']: event.target.value }))} /><button type="button" className="admin-btn admin-btn--primary" onClick={createMaterial}>Прикрепить</button></div><div className="lesson-admin-materials">{materials.map((material) => <span key={material.id}><strong>{material.title}</strong><small>{material.type}</small><button type="button" onClick={() => run(`delete-material-${material.id}`, () => request(`/materials/${material.id}`, { method: 'DELETE' }), { reload: false })}>×</button></span>)}</div></article>}
        </section>
      </>)}

      {/* ТЗ §7: окно запуска — тема (необязательно) и ссылка на трансляцию (обязательно). */}
      {startForm && (
        <div className="lesson-admin-modal-backdrop" onClick={() => setStartForm(null)}>
          <div className="lesson-admin-modal" role="dialog" aria-modal="true" aria-labelledby="lesson-start-title" onClick={(event) => event.stopPropagation()}>
            <h3 id="lesson-start-title">Начать занятие</h3>
            {!startForm.lessonId && (
              <label className="lesson-admin-field"><span>Предмет</span>
                <select value={startForm.subjectId} onChange={(event) => setStartForm((form) => ({ ...form, subjectId: event.target.value }))}>
                  <option value="">Выберите предмет</option>
                  {subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
                </select>
              </label>
            )}
            <label className="lesson-admin-field"><span>Тема{startForm.lessonId ? '' : ' (необязательно)'}</span>
              <input value={startForm.topic} placeholder="Например, законы Ньютона" onChange={(event) => setStartForm((form) => ({ ...form, topic: event.target.value }))} />
            </label>
            <label className="lesson-admin-field"><span>Ссылка на трансляцию</span>
              <input value={startForm.streamUrl} placeholder="https://…" onChange={(event) => setStartForm((form) => ({ ...form, streamUrl: event.target.value }))} />
            </label>
            <div className="lesson-admin-modal-actions">
              <button type="button" className="admin-btn" onClick={() => setStartForm(null)}>Отмена</button>
              <button
                type="button"
                className="admin-btn admin-btn--primary"
                disabled={!startForm.streamUrl.trim() || (!startForm.lessonId && !startForm.subjectId) || busy === 'start-lesson'}
                onClick={submitStart}
              >Начать и уведомить учеников</button>
            </div>
          </div>
        </div>
      )}

      {editForm && (
        <div className="lesson-admin-modal-backdrop" onClick={() => setEditForm(null)}>
          <div className="lesson-admin-modal" role="dialog" aria-modal="true" aria-labelledby="lesson-edit-title" onClick={(event) => event.stopPropagation()}>
            <h3 id="lesson-edit-title">Редактировать занятие</h3>
            <label className="lesson-admin-field"><span>Тема</span>
              <input value={editForm.topic} placeholder="Например, законы Ньютона" onChange={(event) => setEditForm((form) => ({ ...form, topic: event.target.value }))} />
            </label>
            <label className="lesson-admin-field"><span>Дата и время</span>
              <input type="datetime-local" value={editForm.scheduledAt} onChange={(event) => setEditForm((form) => ({ ...form, scheduledAt: event.target.value }))} />
            </label>
            <div className="lesson-admin-modal-actions">
              <button type="button" className="admin-btn" onClick={() => setEditForm(null)}>Отмена</button>
              <button
                type="button"
                className="admin-btn admin-btn--primary"
                disabled={!editForm.scheduledAt || busy === 'edit-lesson'}
                onClick={submitEdit}
              >Сохранить</button>
            </div>
          </div>
        </div>
      )}
      {deleteTarget && (
        <div className="lesson-admin-modal-backdrop" onClick={() => setDeleteTarget(null)}>
          <div className="lesson-admin-modal" role="dialog" aria-modal="true" aria-labelledby="lesson-delete-title" aria-describedby="lesson-delete-description" onClick={(event) => event.stopPropagation()}>
            <h3 id="lesson-delete-title">Удалить занятие?</h3>
            <p id="lesson-delete-description">Занятие «{deleteTarget.subject?.name || deleteTarget.topic || 'Без темы'}» будет удалено вместе с опросами, викторинами, ответами, посещаемостью и материалами. Это действие нельзя отменить.</p>
            <div className="lesson-admin-modal-actions">
              <button type="button" className="admin-btn" onClick={() => setDeleteTarget(null)}>Отмена</button>
              <button ref={deleteConfirmRef} type="button" className="admin-btn admin-btn--danger" onClick={confirmDeleteLesson}>Удалить занятие</button>
            </div>
          </div>
        </div>
      )}
      {stream && <StreamPresentation
        source={stream.source}
        hostWindow={stream.hostWindow}
        onClose={closeStream}
      />}
    </div>
  );
}
