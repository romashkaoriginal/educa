import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { io } from 'socket.io-client';
import { API_URL, SOCKET_URL } from '../../config';
import { adminFetch, getTelegramInitData } from './adminApi';
import ImageUploadField from './ImageUploadField';
import '../../styles/Lesson.css';

const STATUS = { scheduled: 'Предстоит', live: 'Идёт сейчас', finished: 'Завершено', cancelled: 'Отменено' };
const POLL_PRESETS = {
  clear_unclear: 'Понятно / Непонятно', yes_no: 'Да / Нет', pace: 'Темп',
  repeat_or_continue: 'Повторить / Продолжить', keeping_up: 'Успеваю / Не успеваю', custom: 'Свой вопрос'
};

const emptyLesson = { subjectId: '', teacherId: '', groupIds: [], scheduledAt: '', topic: '', streamUrl: '' };
const emptyPoll = { template: 'clear_unclear', question: '', optionsText: 'Понятно\nНепонятно', isAnonymous: true, showResultsToStudents: true, durationSec: '' };
const emptyQuiz = { title: '', mode: 'single_step', isAnonymous: false, showExplanations: true };
const emptyQuestion = { questionText: '', questionImage: null, optionsText: '', correctText: '1', explanation: '', hintImage: null };

async function request(path, options = {}) {
  const response = await adminFetch(`${API_URL}/lesson-admin${path}`, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || 'Не удалось выполнить действие');
  return data;
}

const fullName = (user) => [user?.firstName, user?.lastName].filter(Boolean).join(' ') || 'Не указан';
const formatDate = (value) => value ? new Date(value).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' }) : '—';
const toLocalInput = (value) => {
  if (!value) return '';
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

export default function LessonAdmin({ subjects = [], currentUser, dataRefreshKey }) {
  const [lessons, setLessons] = useState([]);
  const [groups, setGroups] = useState([]);
  const [users, setUsers] = useState([]);
  const [students, setStudents] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [lessonForm, setLessonForm] = useState(emptyLesson);
  const [groupForm, setGroupForm] = useState({ name: '', subjectId: '' });
  const [pollForm, setPollForm] = useState(emptyPoll);
  const [quizForm, setQuizForm] = useState(emptyQuiz);
  const [questionForm, setQuestionForm] = useState(emptyQuestion);
  const [polls, setPolls] = useState([]);
  const [quizzes, setQuizzes] = useState([]);
  const [studentQuestions, setStudentQuestions] = useState([]);
  const [reactions, setReactions] = useState(null);
  const [attendance, setAttendance] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [practiceTopics, setPracticeTopics] = useState([]);
  const [importTopicId, setImportTopicId] = useState('');
  const [pollResults, setPollResults] = useState(null);
  const [quizStats, setQuizStats] = useState(null);
  const [materialForm, setMaterialForm] = useState({ type: 'link', title: '', url: '', homeworkId: '' });
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState('');

  const isAdmin = currentUser?.role === 'admin' || !currentUser?.role;
  const selected = useMemo(() => lessons.find((lesson) => Number(lesson.id) === Number(selectedId)) || null, [lessons, selectedId]);
  const teachers = users.filter((user) => user.role === 'teacher' && user.isActive !== false);

  const loadBase = useCallback(async () => {
    try {
      const calls = [request('/lessons'), request('/groups')];
      if (isAdmin) {
        calls.push(adminFetch(`${API_URL}/users`).then((response) => response.json()));
        calls.push(adminFetch(`${API_URL}/students`).then((response) => response.json()));
        calls.push(request('/teacher-subjects'));
      }
      const [lessonData, groupData, userData, studentData, assignmentData] = await Promise.all(calls);
      setLessons(lessonData.lessons || []);
      setGroups(groupData.groups || []);
      setUsers(userData?.users || []);
      setStudents(studentData?.students || []);
      setAssignments(assignmentData?.assignments || []);
      if (!selectedId) {
        const first = lessonData.lessons?.find((item) => item.status === 'live') || lessonData.lessons?.[0];
        if (first) setSelectedId(first.id);
      }
    } catch (error) { setMessage(error.message); }
  }, [isAdmin, selectedId]);

  useEffect(() => { loadBase(); }, [dataRefreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadSession = useCallback(async (lesson) => {
    if (!lesson) return;
    try {
      const detail = await request(`/lessons?status=${lesson.status}`);
      const fresh = (detail.lessons || []).find((item) => Number(item.id) === Number(lesson.id));
      if (fresh) setLessons((items) => items.map((item) => item.id === fresh.id ? fresh : item));
      const state = await request(`/lessons/${lesson.id}/state`);
      setPolls(state.polls || []);
      setQuizzes(state.quizzes || []);
      setMaterials(state.materials || []);
      if (lesson.status === 'live') {
        const [questionsData, reactionsData, attendanceData] = await Promise.all([
          request(`/lessons/${lesson.id}/questions`),
          request(`/lessons/${lesson.id}/reactions/summary`),
          request(`/lessons/${lesson.id}/attendance`)
        ]);
        setStudentQuestions(questionsData.questions || []);
        setReactions(reactionsData);
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
    if (!selected?.subjectId) { setPracticeTopics([]); return; }
    adminFetch(`${API_URL}/practice/topics/${selected.subjectId}`)
      .then((response) => response.ok ? response.json() : { topics: [] })
      .then((data) => setPracticeTopics(data.topics || []))
      .catch(() => setPracticeTopics([]));
  }, [selected?.subjectId]);

  const run = async (key, action, { reload = true } = {}) => {
    setBusy(key); setMessage('');
    try {
      const result = await action();
      if (reload) await loadBase();
      if (selected) await loadSession(selected);
      return result;
    } catch (error) { setMessage(error.message); return null; }
    finally { setBusy(''); }
  };

  const createLesson = () => run('create-lesson', async () => {
    if (!lessonForm.groupIds.length) throw new Error('Выберите хотя бы одну группу');
    await request('/lessons', { method: 'POST', body: JSON.stringify({ ...lessonForm, scheduledAt: new Date(lessonForm.scheduledAt).toISOString() }) });
    setLessonForm(emptyLesson);
    setMessage('Занятие добавлено в расписание');
  });

  const startLesson = (lesson) => {
    if (!window.confirm(`Начать занятие по ${lesson.subject?.name || 'предмету'} для выбранных учеников?`)) return;
    run(`start-${lesson.id}`, async () => {
      const data = await request(`/lessons/${lesson.id}/start`, { method: 'POST' });
      setSelectedId(lesson.id);
      setMessage(data.alreadyLive ? 'Занятие уже идёт' : 'Занятие начато, ученики уведомлены');
    });
  };

  const finishLesson = (lesson) => {
    if (!window.confirm('Завершить занятие? Новые ответы больше приниматься не будут.')) return;
    run(`finish-${lesson.id}`, async () => request(`/lessons/${lesson.id}/finish`, { method: 'POST' }));
  };

  const postponeLesson = (lesson) => {
    const value = window.prompt('Новая дата и время (ГГГГ-ММ-ДДTЧЧ:ММ)', toLocalInput(lesson.scheduledAt));
    if (!value) return;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) { setMessage('Некорректная дата'); return; }
    run(`postpone-${lesson.id}`, () => request(`/lessons/${lesson.id}/postpone`, { method: 'POST', body: JSON.stringify({ scheduledAt: date.toISOString() }) }));
  };

  const createGroup = () => run('create-group', async () => {
    await request('/groups', { method: 'POST', body: JSON.stringify(groupForm) });
    setGroupForm({ name: '', subjectId: '' });
  });

  const renameGroup = (group) => {
    const name = window.prompt('Новое название группы', group.name);
    if (!name?.trim()) return;
    run(`rename-group-${group.id}`, () => request(`/groups/${group.id}`, {
      method: 'PATCH', body: JSON.stringify({ name: name.trim() })
    }));
  };

  const toggleGroup = (group) => run(`toggle-group-${group.id}`, () => request(`/groups/${group.id}`, {
    method: 'PATCH', body: JSON.stringify({ isActive: !group.isActive })
  }));

  const deleteGroup = (group) => {
    if (!window.confirm(`Удалить группу «${group.name}»?`)) return;
    run(`delete-group-${group.id}`, () => request(`/groups/${group.id}`, { method: 'DELETE' }));
  };

  const addStudent = (group, userId) => run(`student-${group.id}`, () => request(`/groups/${group.id}/students`, {
    method: 'POST', body: JSON.stringify({ userId })
  }));

  const assignTeacher = (group, teacherId) => run(`teacher-${group.id}`, () => request('/teacher-subjects', {
    method: 'POST', body: JSON.stringify({ groupId: group.id, teacherId })
  }));

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
  }, { reload: false });

  const pollAction = (poll, action) => run(`poll-${action}`, async () => {
    const data = await request(`/polls/${poll.id}/${action}`, { method: 'POST' });
    if (action === 'restart' && data.poll) setPolls([data.poll]);
    else await loadSession(selected);
  }, { reload: false });

  const createQuiz = () => run('create-quiz', async () => {
    const data = await request(`/lessons/${selected.id}/quizzes`, { method: 'POST', body: JSON.stringify(quizForm) });
    setQuizzes((items) => [data.quiz, ...items]);
    setQuizForm(emptyQuiz);
  }, { reload: false });

  const addQuizQuestion = (quiz) => run('add-question', async () => {
    const options = questionForm.optionsText.split('\n').map((item) => item.trim()).filter(Boolean);
    const correctAnswer = questionForm.correctText.split(',').map((item) => Number(item.trim()) - 1).filter((item) => Number.isInteger(item) && item >= 0);
    await request(`/quizzes/${quiz.id}/questions`, {
      method: 'POST',
      body: JSON.stringify({
        questionText: questionForm.questionText,
        questionImageId: questionForm.questionImage?.id || null,
        options,
        correctAnswer,
        explanation: questionForm.explanation,
        hintImageId: questionForm.hintImage?.id || null
      })
    });
    setQuestionForm(emptyQuestion);
    setMessage('Вопрос добавлен');
  }, { reload: false });

  const quizAction = (quiz, action) => run(`quiz-${action}`, async () => {
    await request(`/quizzes/${quiz.id}/${action}`, { method: 'POST' });
    await loadSession(selected);
  }, { reload: false });

  const importPracticeQuestions = (quiz) => run('import-practice', async () => {
    if (!importTopicId) throw new Error('Выберите раздел практики');
    const data = await request('/quiz-questions/import-from-practice', {
      method: 'POST', body: JSON.stringify({ quizId: quiz.id, topicId: Number(importTopicId) })
    });
    setMessage(`Импортировано вопросов: ${data.imported}`);
    setImportTopicId('');
    await loadSession(selected);
  }, { reload: false });

  const loadLiveMetrics = useCallback(async (poll, quiz) => {
    try {
      if (poll?.id) setPollResults((await request(`/polls/${poll.id}/results`)).results || null);
      else setPollResults(null);
      if (quiz?.id && quiz.status === 'active') setQuizStats(await request(`/quizzes/${quiz.id}/live-stats?withStudents=1`));
      else setQuizStats(null);
    } catch (error) { setMessage(error.message); }
  }, []);

  const updateQuestionStatus = (question, status) => run(`sq-${question.id}`, async () => {
    const data = await request(`/questions/${question.id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
    setStudentQuestions((items) => items.map((item) => item.id === question.id ? data.question : item));
  }, { reload: false });

  const createMaterial = () => run('material', async () => {
    const data = await request(`/lessons/${selected.id}/materials`, { method: 'POST', body: JSON.stringify(materialForm) });
    setMaterials((items) => [data.material, ...items]);
    setMaterialForm({ type: 'link', title: '', url: '', homeworkId: '' });
  }, { reload: false });

  const subjectGroups = groups.filter((group) => Number(group.subjectId) === Number(lessonForm.subjectId) && group.isActive);
  const preparedQuiz = quizzes[0] || null;
  const activePoll = polls[0] || null;

  useEffect(() => {
    if (selected?.status !== 'live') return undefined;
    loadLiveMetrics(activePoll, preparedQuiz);
    const timer = setInterval(() => loadLiveMetrics(activePoll, preparedQuiz), 5000);
    return () => clearInterval(timer);
  }, [selected?.status, activePoll?.id, preparedQuiz?.id, preparedQuiz?.status, loadLiveMetrics]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!selected?.id || selected.status !== 'live') return undefined;
    const socket = io(SOCKET_URL, {
      auth: { initData: getTelegramInitData() },
      transports: ['websocket', 'polling'],
      reconnection: true
    });
    const refresh = () => loadSession(selected);
    socket.on('connect', () => socket.emit('admin:join-lesson', { lessonId: selected.id }));
    socket.on('poll:results-updated', (results) => setPollResults(results));
    socket.on('quiz:answer-received', () => loadLiveMetrics(activePoll, preparedQuiz));
    socket.on('attendance:updated', refresh);
    socket.on('question:new', refresh);
    socket.on('reaction:new', refresh);
    socket.on('lesson:finished', refresh);
    return () => socket.disconnect();
  }, [selected?.id, selected?.status, activePoll?.id, preparedQuiz?.id, loadSession, loadLiveMetrics]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="lesson-admin">
      <div className="lesson-admin-head">
        <div><h2>Занятия</h2><p>Расписание и управление взаимодействием в прямом эфире</p></div>
        <button type="button" className="admin-btn admin-btn--secondary" onClick={loadBase}>Обновить</button>
      </div>
      {message && <button type="button" className="lesson-admin-message" onClick={() => setMessage('')}>{message}<span>×</span></button>}

      <section className="admin-section lesson-admin-section">
        <div className="admin-section-header"><div><h3>Расписание</h3><p>Создайте занятие, назначьте группы и запустите его в нужный момент.</p></div></div>
        <div className="lesson-admin-create-grid">
          <select value={lessonForm.subjectId} onChange={(event) => setLessonForm((form) => ({ ...form, subjectId: event.target.value, groupIds: [] }))}>
            <option value="">Предмет</option>{subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}
          </select>
          {isAdmin && <select value={lessonForm.teacherId} onChange={(event) => setLessonForm((form) => ({ ...form, teacherId: event.target.value }))}>
            <option value="">Преподаватель</option>{teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{fullName(teacher)}</option>)}
          </select>}
          <input type="datetime-local" value={lessonForm.scheduledAt} onChange={(event) => setLessonForm((form) => ({ ...form, scheduledAt: event.target.value }))} />
          <input placeholder="Тема занятия" value={lessonForm.topic} onChange={(event) => setLessonForm((form) => ({ ...form, topic: event.target.value }))} />
          <input className="lesson-admin-wide" placeholder="Ссылка на трансляцию" value={lessonForm.streamUrl} onChange={(event) => setLessonForm((form) => ({ ...form, streamUrl: event.target.value }))} />
          <div className="lesson-admin-group-picker lesson-admin-wide">
            {subjectGroups.length ? subjectGroups.map((group) => <label key={group.id}><input type="checkbox" checked={lessonForm.groupIds.includes(group.id)} onChange={(event) => setLessonForm((form) => ({ ...form, groupIds: event.target.checked ? [...form.groupIds, group.id] : form.groupIds.filter((id) => id !== group.id) }))} /> {group.name}</label>) : <span>Сначала выберите предмет</span>}
          </div>
          <button type="button" className="admin-btn admin-btn--primary lesson-admin-wide" disabled={!lessonForm.subjectId || !lessonForm.scheduledAt || busy === 'create-lesson'} onClick={createLesson}>Создать занятие</button>
        </div>

        <div className="lesson-admin-table-wrap"><table className="lesson-admin-table"><thead><tr><th>Дата</th><th>Занятие</th><th>Группы</th><th>Статус</th><th /></tr></thead><tbody>
          {lessons.map((lesson) => <tr key={lesson.id} className={Number(selectedId) === Number(lesson.id) ? 'selected' : ''} onClick={() => setSelectedId(lesson.id)}>
            <td>{formatDate(lesson.scheduledAt)}</td><td><strong>{lesson.subject?.name}</strong><small>{lesson.topic || fullName(lesson.teacher)}</small></td><td>{lesson.groups?.map((group) => group.name).join(', ')}</td><td><span className={`lesson-admin-status ${lesson.status}`}>{lesson.originalScheduledAt ? 'Перенесено' : STATUS[lesson.status]}</span></td>
            <td><div className="lesson-admin-row-actions">
              {lesson.status === 'scheduled' && <><button type="button" onClick={(event) => { event.stopPropagation(); startLesson(lesson); }}>Начать</button><button type="button" onClick={(event) => { event.stopPropagation(); postponeLesson(lesson); }}>Перенести</button><button type="button" onClick={(event) => { event.stopPropagation(); run(`cancel-${lesson.id}`, () => request(`/lessons/${lesson.id}/cancel`, { method: 'POST' })); }}>Отменить</button></>}
              {lesson.status === 'live' && <button type="button" className="danger" onClick={(event) => { event.stopPropagation(); finishLesson(lesson); }}>Завершить</button>}
            </div></td>
          </tr>)}
        </tbody></table></div>
      </section>

      <section className="admin-section lesson-admin-section">
        <div className="admin-section-header"><div><h3>Группы</h3><p>Ученик допускается только при действующем доступе к предмету группы.</p></div></div>
        {isAdmin && <div className="lesson-admin-inline-form"><input placeholder="Название группы" value={groupForm.name} onChange={(event) => setGroupForm((form) => ({ ...form, name: event.target.value }))} /><select value={groupForm.subjectId} onChange={(event) => setGroupForm((form) => ({ ...form, subjectId: event.target.value }))}><option value="">Предмет</option>{subjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select><button type="button" className="admin-btn admin-btn--primary" onClick={createGroup}>Добавить</button></div>}
        <div className="lesson-admin-groups">
          {groups.map((group) => <article key={group.id}><div className="lesson-admin-card-title"><div><h4>{group.name}</h4><span>{group.subject?.name}{!group.isActive ? ' · неактивна' : ''}</span></div><span>{group.students?.length || 0} учеников</span></div>
            <p>Преподаватели: {group.teachers?.map(fullName).join(', ') || 'не назначены'}</p>
            {isAdmin && <div className="lesson-admin-card-actions">
              <select defaultValue="" onChange={(event) => { if (event.target.value) addStudent(group, event.target.value); event.target.value = ''; }}><option value="">Добавить ученика…</option>{students.filter((student) => student.subjects?.some((subject) => Number(subject.id) === Number(group.subjectId) && subject.UserSubject?.isActive !== false)).map((student) => <option key={student.id} value={student.id}>{fullName(student)}</option>)}</select>
              <select defaultValue="" onChange={(event) => { if (event.target.value) assignTeacher(group, event.target.value); event.target.value = ''; }}><option value="">Назначить преподавателя…</option>{teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{fullName(teacher)}</option>)}</select>
            </div>}
            {!!group.students?.length && <div className="lesson-admin-chips">{group.students.map((student) => <span key={student.id}>{fullName(student)}{isAdmin && <button type="button" onClick={() => run(`remove-${student.id}`, () => request(`/groups/${group.id}/students/${student.id}`, { method: 'DELETE' }))}>×</button>}</span>)}</div>}
            {isAdmin && <div className="lesson-admin-chips">{assignments.filter((assignment) => Number(assignment.groupId) === Number(group.id)).map((assignment) => <span key={assignment.id}>{fullName(assignment.teacher)}<button type="button" onClick={() => run(`unassign-${assignment.id}`, () => request(`/teacher-subjects/${assignment.id}`, { method: 'DELETE' }))}>×</button></span>)}</div>}
            {isAdmin && <div className="lesson-admin-mini-actions"><button type="button" onClick={() => renameGroup(group)}>Переименовать</button><button type="button" onClick={() => toggleGroup(group)}>{group.isActive ? 'Деактивировать' : 'Активировать'}</button><button type="button" className="danger" onClick={() => deleteGroup(group)}>Удалить</button></div>}
          </article>)}
        </div>
      </section>

      {selected && (
        <section className="admin-section lesson-admin-section lesson-admin-session">
          <div className="admin-section-header"><div><h3>{selected.status === 'live' ? 'Активная сессия' : 'Подготовка занятия'}</h3><p>{selected.subject?.name} · {formatDate(selected.scheduledAt)} · {selected.topic || 'Без темы'}</p></div>{selected.status === 'live' && <button type="button" className="admin-btn admin-btn--danger" onClick={() => finishLesson(selected)}>Завершить занятие</button>}</div>
          <div className="lesson-admin-session-grid">
            <article className="lesson-admin-tool"><h4>Голосование</h4>
              {selected.status === 'live' && !activePoll && <><select value={pollForm.template} onChange={(event) => setPollForm((form) => ({ ...form, template: event.target.value, isAnonymous: event.target.value === 'clear_unclear' }))}>{Object.entries(POLL_PRESETS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>{pollForm.template === 'custom' && <><input placeholder="Вопрос" value={pollForm.question} onChange={(event) => setPollForm((form) => ({ ...form, question: event.target.value }))} /><textarea placeholder="Варианты — каждый с новой строки" value={pollForm.optionsText} onChange={(event) => setPollForm((form) => ({ ...form, optionsText: event.target.value }))} /></>}<div className="lesson-admin-checks"><label><input type="checkbox" checked={pollForm.isAnonymous} onChange={(event) => setPollForm((form) => ({ ...form, isAnonymous: event.target.checked }))} /> Анонимно</label><label><input type="checkbox" checked={pollForm.showResultsToStudents} onChange={(event) => setPollForm((form) => ({ ...form, showResultsToStudents: event.target.checked }))} /> Результаты ученикам</label></div><input type="number" min="10" placeholder="Длительность, сек. (пусто — вручную)" value={pollForm.durationSec} onChange={(event) => setPollForm((form) => ({ ...form, durationSec: event.target.value }))} /><button type="button" className="admin-btn admin-btn--primary" onClick={createPoll}>Создать</button></>}
              {activePoll && <div className="lesson-admin-active">
                <strong>{activePoll.question}</strong><span>{activePoll.status}</span>
                {pollResults && <div className="lesson-admin-poll-results">{pollResults.options?.map((option) => <span key={option.id}><i style={{ width: `${option.percent}%` }} /><b>{option.text}</b><strong>{option.percent}%</strong><small>{option.count}</small></span>)}</div>}
                {pollResults && <small>Ответили: {pollResults.total} из {attendance.length}</small>}
                {!activePoll.isAnonymous && pollResults?.answers?.length > 0 && <div className="lesson-admin-answer-list">{pollResults.answers.map((answer) => <span key={answer.id}>{fullName(answer.user)} — {answer.option?.text}</span>)}</div>}
                <div>{activePoll.status === 'draft' && <button type="button" onClick={() => pollAction(activePoll, 'start')}>Запустить</button>}{activePoll.status === 'active' && <><button type="button" onClick={() => pollAction(activePoll, 'reveal-results')}>Показать результаты</button><button type="button" onClick={() => pollAction(activePoll, 'close')}>Закрыть</button></>}{activePoll.status === 'closed' && <button type="button" onClick={() => pollAction(activePoll, 'restart')}>Перезапустить</button>}</div>
              </div>}
              {selected.status !== 'live' && <p className="lesson-admin-empty">Голосование создаётся после начала занятия.</p>}
            </article>

            <article className="lesson-admin-tool"><h4>Викторина занятия</h4>
              {!preparedQuiz && selected.status !== 'finished' && <><input placeholder="Название викторины" value={quizForm.title} onChange={(event) => setQuizForm((form) => ({ ...form, title: event.target.value }))} /><select value={quizForm.mode} onChange={(event) => setQuizForm((form) => ({ ...form, mode: event.target.value }))}><option value="single_step">Один вопрос — управляет преподаватель</option><option value="self_paced">Несколько вопросов — самостоятельно</option></select><button type="button" className="admin-btn admin-btn--primary" onClick={createQuiz}>Создать викторину</button></>}
              {preparedQuiz && <div className="lesson-admin-active">
                <strong>{preparedQuiz.title}</strong><span>{preparedQuiz.status} · {preparedQuiz.mode === 'single_step' ? 'ручной режим' : 'самостоятельно'} · вопросов: {preparedQuiz.questions?.length || 0}</span>
                {preparedQuiz.status === 'draft' && <div className="lesson-admin-question-form">
                  <div className="lesson-admin-import"><select value={importTopicId} onChange={(event) => setImportTopicId(event.target.value)}><option value="">Раздел практики для импорта…</option>{practiceTopics.map((topic) => <option key={topic.id} value={topic.id}>{topic.name} ({topic.questionCount})</option>)}</select><button type="button" onClick={() => importPracticeQuestions(preparedQuiz)}>Импортировать</button></div>
                  <textarea placeholder="Текст вопроса" value={questionForm.questionText} onChange={(event) => setQuestionForm((form) => ({ ...form, questionText: event.target.value }))} />
                  <ImageUploadField label="Изображение вопроса" value={questionForm.questionImage} onChange={(image) => setQuestionForm((form) => ({ ...form, questionImage: image }))} />
                  <textarea placeholder="Варианты — каждый с новой строки" value={questionForm.optionsText} onChange={(event) => setQuestionForm((form) => ({ ...form, optionsText: event.target.value }))} />
                  <input placeholder="Номера правильных ответов: 1 или 1,3" value={questionForm.correctText} onChange={(event) => setQuestionForm((form) => ({ ...form, correctText: event.target.value }))} />
                  <textarea placeholder="Объяснение" value={questionForm.explanation} onChange={(event) => setQuestionForm((form) => ({ ...form, explanation: event.target.value }))} />
                  <ImageUploadField label="Изображение подсказки" value={questionForm.hintImage} onChange={(image) => setQuestionForm((form) => ({ ...form, hintImage: image }))} />
                  <button type="button" onClick={() => addQuizQuestion(preparedQuiz)}>Добавить вопрос</button>{selected.status === 'live' && <button type="button" className="primary" onClick={() => quizAction(preparedQuiz, 'start')}>Запустить викторину</button>}
                </div>}
                {preparedQuiz.status === 'active' && <>
                  <div>{preparedQuiz.mode === 'single_step' ? <><button type="button" onClick={() => quizAction(preparedQuiz, 'show-question')}>Показать вопрос</button><button type="button" onClick={() => quizAction(preparedQuiz, 'show-answer')}>Правильный ответ</button><button type="button" onClick={() => quizAction(preparedQuiz, 'show-explanation')}>Объяснение</button><button type="button" onClick={() => quizAction(preparedQuiz, 'next-question')}>Следующий</button></> : <><button type="button" onClick={() => quizAction(preparedQuiz, 'show-answer')}>Показать правильные ответы</button><button type="button" onClick={() => quizAction(preparedQuiz, 'show-explanation')}>Показать объяснения</button></>}<button type="button" onClick={() => quizAction(preparedQuiz, 'finish')}>Завершить</button></div>
                  {quizStats && <div className="lesson-admin-quiz-stats"><strong>Получили вопрос: {quizStats.receivedStudents} из {quizStats.totalStudents}</strong>{quizStats.questions?.map((question, index) => <div key={question.questionId}><span>Вопрос {index + 1}: ответили {question.answered}, правильно {question.correctPercent}%</span><div>{question.distribution?.map((count, optionIndex) => <i key={optionIndex}>Вариант {optionIndex + 1}: {count}</i>)}</div>{question.answers?.length > 0 && <small>{question.answers.map((answer) => `${fullName(answer.user)} — ${answer.selectedAnswer.map((item) => item + 1).join(', ')}`).join('; ')}</small>}</div>)}</div>}
                </>}
              </div>}
            </article>

            {selected.status === 'live' && <>
              <article className="lesson-admin-tool"><div className="lesson-admin-card-title"><h4>Вопросы учеников</h4><span>{studentQuestions.filter((item) => item.status === 'pending').length} новых</span></div>{studentQuestions.length ? studentQuestions.map((question) => <div className="lesson-admin-student-question" key={question.id}><strong>{fullName(question.student)}</strong><p>{question.text || 'Поднял(а) руку'}</p><select value={question.status} onChange={(event) => updateQuestionStatus(question, event.target.value)}><option value="pending">Ожидает</option><option value="answering">Отвечаю сейчас</option><option value="answered">Отвечено</option><option value="deferred">После занятия</option></select></div>) : <p className="lesson-admin-empty">Вопросов пока нет.</p>}</article>
              <article className="lesson-admin-tool"><h4>Быстрые реакции</h4><div className="lesson-admin-reaction-grid"><span><strong>{reactions?.summary?.clear || 0}</strong>Понятно</span><span><strong>{reactions?.summary?.need_repeat || 0}</strong>Повторить</span><span><strong>{reactions?.summary?.too_fast || 0}</strong>Быстро</span><span><strong>{reactions?.summary?.has_question || 0}</strong>Вопрос</span></div><button type="button" onClick={() => loadSession(selected)}>Обновить</button></article>
              <article className="lesson-admin-tool lesson-admin-attendance"><div className="lesson-admin-card-title"><h4>Посещаемость</h4><span>{attendance.filter((item) => item.present).length} / {attendance.length}</span></div>{attendance.map((item) => <div key={item.userId}><span className={item.present ? 'present' : 'absent'}>{item.present ? '●' : '○'}</span><strong>{fullName(item.student)}</strong><small>{item.record?.joinedAt ? `с ${formatDate(item.record.joinedAt)}` : 'не заходил'}</small></div>)}</article>
            </>}
          </div>

          {selected.status === 'finished' && <article className="lesson-admin-material-block"><h4>Материалы занятия</h4><div className="lesson-admin-inline-form"><select value={materialForm.type} onChange={(event) => setMaterialForm((form) => ({ ...form, type: event.target.value }))}><option value="note">Конспект</option><option value="presentation">Презентация</option><option value="recording">Запись</option><option value="link">Ссылка</option><option value="homework">Домашнее задание</option></select><input placeholder="Название" value={materialForm.title} onChange={(event) => setMaterialForm((form) => ({ ...form, title: event.target.value }))} /><input placeholder={materialForm.type === 'homework' ? 'ID домашнего задания' : 'Ссылка'} value={materialForm.type === 'homework' ? materialForm.homeworkId : materialForm.url} onChange={(event) => setMaterialForm((form) => ({ ...form, [form.type === 'homework' ? 'homeworkId' : 'url']: event.target.value }))} /><button type="button" className="admin-btn admin-btn--primary" onClick={createMaterial}>Прикрепить</button></div><div className="lesson-admin-materials">{materials.map((material) => <span key={material.id}><strong>{material.title}</strong><small>{material.type}</small><button type="button" onClick={() => run(`delete-material-${material.id}`, () => request(`/materials/${material.id}`, { method: 'DELETE' }), { reload: false })}>×</button></span>)}</div></article>}
        </section>
      )}
    </div>
  );
}
