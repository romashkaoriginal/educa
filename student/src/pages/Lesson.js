import React, { useCallback, useEffect, useRef, useState } from 'react';
import Quiz from './Quiz';
import { API_URL } from '../config';
import { apiFetch } from './api';
import { useData } from './DataContext';
import './Lesson.css';

const POLL_LABELS = {
  clear_unclear: 'Понятно / Непонятно',
  yes_no: 'Да / Нет',
  pace: 'Темп занятия',
  repeat_or_continue: 'Повторить или продолжить',
  keeping_up: 'Успеваю / Не успеваю',
  custom: 'Голосование'
};

const REACTIONS = [
  ['clear', '👍', 'Всё понятно'],
  ['need_repeat', '🔁', 'Повторить'],
  ['too_fast', '⏩', 'Слишком быстро'],
  ['has_question', '✋', 'Есть вопрос']
];

const STATUS_LABELS = {
  scheduled: 'Предстоит',
  live: 'Идёт сейчас',
  finished: 'Завершено',
  cancelled: 'Отменено'
};

const formatDate = (value, options = {}) => value
  ? new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeStyle: 'short', ...options }).format(new Date(value))
  : '—';

const teacherName = (teacher) => [teacher?.firstName, teacher?.lastName].filter(Boolean).join(' ') || 'Не указан';

async function jsonRequest(path, options = {}) {
  const response = await apiFetch(`${API_URL}/lesson${path}`, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || 'Не удалось выполнить действие');
  return data;
}

function StatusHeader({ lesson, upcoming, onStream }) {
  if (lesson?.status === 'live') {
    return (
      <section className="lesson-status lesson-status--live" aria-live="polite">
        <div className="lesson-live-label"><span /> Занятие идёт</div>
        <h1>{lesson.subject?.name || 'Занятие'}</h1>
        {lesson.topic && <p className="lesson-topic">{lesson.topic}</p>}
        <dl className="lesson-facts">
          <div><dt>Преподаватель</dt><dd>{teacherName(lesson.teacher)}</dd></div>
          <div><dt>Началось</dt><dd>{formatDate(lesson.startedAt, { dateStyle: undefined, timeStyle: 'short' })}</dd></div>
        </dl>
        {lesson.streamUrl && <button type="button" className="lesson-primary" onClick={onStream}>Перейти к занятию <span>↗</span></button>}
      </section>
    );
  }
  return (
    <section className="lesson-status lesson-status--idle">
      <span className="lesson-status-icon" aria-hidden="true">🎓</span>
      <div>
        <h1>Сейчас занятия нет</h1>
        {upcoming ? (
          <p>Следующее: <strong>{upcoming.subject?.name}</strong>, {formatDate(upcoming.scheduledAt)}</p>
        ) : <p>Новые занятия появятся здесь после добавления в расписание.</p>}
      </div>
    </section>
  );
}

function PollCard({ live, poll, onAnswer, pending }) {
  const [selected, setSelected] = useState(null);
  useEffect(() => setSelected(poll?.myOptionId || null), [poll?.id, poll?.myOptionId]);
  const resultsById = new Map((poll?.results?.options || []).map((option) => [Number(option.id), option]));
  const canAnswer = poll?.status === 'active' && !poll?.hasAnswered;
  return (
    <section className={`lesson-panel ${poll && !poll.hasAnswered ? 'lesson-panel--attention' : ''}`}>
      <div className="lesson-panel-heading">
        <div><span className="lesson-panel-icon">◉</span><h2>Голосование</h2></div>
        {poll && <span className="lesson-badge">{POLL_LABELS[poll.template] || 'Активно'}</span>}
      </div>
      {!live && <p className="lesson-muted">Будет доступно во время занятия</p>}
      {live && !poll && <p className="lesson-muted">Сейчас нет активного вопроса</p>}
      {poll && (
        <>
          <p className="lesson-question-text">{poll.question}</p>
          <div className="lesson-options" role="radiogroup" aria-label={poll.question}>
            {poll.options.map((option) => {
              const result = resultsById.get(Number(option.id));
              return (
                <button
                  type="button"
                  key={option.id}
                  className={`lesson-option ${Number(selected) === Number(option.id) ? 'selected' : ''}`}
                  onClick={() => canAnswer && setSelected(option.id)}
                  disabled={!canAnswer || pending}
                  role="radio"
                  aria-checked={Number(selected) === Number(option.id)}
                >
                  <span>{option.text}</span>
                  {result && <strong>{result.percent}%</strong>}
                  {result && <i style={{ width: `${result.percent}%` }} />}
                </button>
              );
            })}
          </div>
          {canAnswer ? (
            <button type="button" className="lesson-primary" disabled={!selected || pending} onClick={() => onAnswer(selected)}>
              {pending ? 'Отправляем…' : 'Ответить'}
            </button>
          ) : <p className="lesson-accepted">{poll.hasAnswered ? '✓ Ответ принят' : 'Голосование завершено'}</p>}
        </>
      )}
    </section>
  );
}

function QuizQuestion({ question, myAnswer, disabled, onSubmit, resultVisible, explanationVisible }) {
  const [selected, setSelected] = useState([]);
  const multiple = Boolean(question?.multiple || (Array.isArray(question?.correctAnswer) && question.correctAnswer.length > 1));
  useEffect(() => setSelected(myAnswer?.selectedAnswer || []), [question?.id, myAnswer]);
  if (!question) return null;
  const choose = (index) => {
    if (disabled || myAnswer) return;
    setSelected((current) => multiple
      ? current.includes(index) ? current.filter((item) => item !== index) : [...current, index]
      : [index]);
  };
  return (
    <div className="lesson-quiz-question">
      {question.questionImage?.storageKey && <img src={`${API_URL}/practice-images/${question.questionImage.storageKey}`} alt="Иллюстрация к вопросу" />}
      {question.questionText && <p className="lesson-question-text">{question.questionText}</p>}
      <div className="lesson-options">
        {(question.options || []).map((option, index) => {
          const isCorrect = resultVisible && (question.correctAnswer || []).includes(index);
          const isWrong = resultVisible && selected.includes(index) && !isCorrect;
          return (
            <button
              type="button"
              key={`${question.id}-${index}`}
              className={`lesson-option ${selected.includes(index) ? 'selected' : ''} ${isCorrect ? 'correct' : ''} ${isWrong ? 'wrong' : ''}`}
              onClick={() => choose(index)}
              disabled={disabled || Boolean(myAnswer)}
            >{option}</button>
          );
        })}
      </div>
      {!myAnswer ? (
        <button type="button" className="lesson-primary" disabled={!selected.length || disabled} onClick={() => onSubmit(selected)}>Ответить</button>
      ) : <p className={`lesson-accepted ${resultVisible && !myAnswer.isCorrect ? 'lesson-accepted--wrong' : ''}`}>
        {resultVisible ? (myAnswer.isCorrect ? '✓ Правильно' : 'Ответ неверный') : '✓ Ответ принят — ждём преподавателя'}
      </p>}
      {explanationVisible && (question.explanation || question.hintImage?.storageKey) && <div className="lesson-explanation"><strong>Объяснение</strong>{question.explanation && <p>{question.explanation}</p>}{question.hintImage?.storageKey && <img src={`${API_URL}/practice-images/${question.hintImage.storageKey}`} alt="Подсказка" />}</div>}
    </div>
  );
}

function QuizCard({ live, quiz, onAnswer, pendingQuestionId }) {
  const [selfPacedIndex, setSelfPacedIndex] = useState(0);
  useEffect(() => setSelfPacedIndex(0), [quiz?.id]);
  let content = <p className="lesson-muted">Ожидайте запуска преподавателем</p>;
  if (!live) content = <p className="lesson-muted">Будет доступна во время занятия</p>;
  else if (quiz?.mode === 'single_step') {
    content = quiz.currentQuestion
      ? <QuizQuestion
          question={quiz.currentQuestion}
          myAnswer={quiz.myAnswer}
          disabled={pendingQuestionId === quiz.currentQuestion.id || quiz.questionRevealState !== 'question'}
          onSubmit={(selected) => onAnswer(quiz.currentQuestion.id, selected)}
          resultVisible={quiz.questionRevealState === 'answer'}
          explanationVisible={quiz.explanationRevealed}
        />
      : <p className="lesson-muted">Викторина началась. Преподаватель скоро покажет вопрос.</p>;
  } else if (quiz?.mode === 'self_paced') {
    const questions = quiz.questions || [];
    const current = questions[selfPacedIndex];
    const answered = questions.filter((question) => question.myAnswer).length;
    content = (
      <>
        <div className="lesson-progress"><span style={{ width: `${questions.length ? answered / questions.length * 100 : 0}%` }} /></div>
        <p className="lesson-progress-label">Отвечено {answered} из {questions.length}</p>
        {current && <QuizQuestion
          question={current}
          myAnswer={current.myAnswer}
          disabled={pendingQuestionId === current.id}
          onSubmit={(selected) => onAnswer(current.id, selected)}
          resultVisible={quiz.questionRevealState === 'answer'}
          explanationVisible={quiz.explanationRevealed}
        />}
        <div className="lesson-quiz-nav">
          <button type="button" onClick={() => setSelfPacedIndex((i) => Math.max(0, i - 1))} disabled={selfPacedIndex === 0}>←</button>
          <span>{selfPacedIndex + 1} / {questions.length}</span>
          <button type="button" onClick={() => setSelfPacedIndex((i) => Math.min(questions.length - 1, i + 1))} disabled={selfPacedIndex >= questions.length - 1}>→</button>
        </div>
      </>
    );
  }
  return (
    <section className={`lesson-panel ${quiz ? 'lesson-panel--attention' : ''}`}>
      <div className="lesson-panel-heading"><div><span className="lesson-panel-icon">?</span><h2>Викторина</h2></div>{quiz && <span className="lesson-badge">Активна</span>}</div>
      {content}
    </section>
  );
}

function Schedule({ upcoming, lessons, onOpen }) {
  return (
    <section className="lesson-schedule">
      <div className="lesson-section-title"><div><span>▦</span><h2>Расписание</h2></div><small>Текущая неделя</small></div>
      {upcoming && (
        <button type="button" className="lesson-next" onClick={() => onOpen(upcoming)}>
          <span>Ближайшее занятие</span>
          <strong>{upcoming.subject?.name} · {formatDate(upcoming.scheduledAt)}</strong>
          <small>{upcoming.topic || `Преподаватель: ${teacherName(upcoming.teacher)}`}</small>
        </button>
      )}
      <div className="lesson-schedule-list">
        {lessons.length === 0 && <p className="lesson-muted">На этой неделе занятий нет.</p>}
        {lessons.map((item) => (
          <button type="button" className="lesson-schedule-row" key={item.id} onClick={() => onOpen(item)}>
            <time><strong>{new Date(item.scheduledAt).toLocaleDateString('ru-RU', { weekday: 'short' })}</strong><span>{new Date(item.scheduledAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</span></time>
            <span className="lesson-schedule-main"><strong>{item.subject?.name}</strong><small>{item.topic || teacherName(item.teacher)}</small></span>
            <span className={`lesson-status-badge ${item.status}`}>{item.originalScheduledAt ? 'Перенесено' : STATUS_LABELS[item.status]}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function Materials({ materials }) {
  if (!materials?.length) return <p className="lesson-muted">Материалы ещё не добавлены.</p>;
  const typeIcon = { note: '📄', presentation: '📊', recording: '▶', link: '🔗', homework: '📝' };
  return <div className="lesson-materials">{materials.map((item) => (
    <a key={item.id} href={item.url || `#homework-${item.homeworkId}`} target={item.url ? '_blank' : undefined} rel="noreferrer">
      <span>{typeIcon[item.type] || '📎'}</span><strong>{item.title}</strong><span>→</span>
    </a>
  ))}</div>;
}

export default function Lesson({ studentId, studentName, isTabActive }) {
  const {
    currentLesson, setCurrentLesson, lessonSocket,
    lessonConnected, lessonReconnecting, dismissLessonNotice
  } = useData();
  const [upcoming, setUpcoming] = useState(null);
  const [week, setWeek] = useState([]);
  const [activePoll, setActivePoll] = useState(null);
  const [activeQuiz, setActiveQuiz] = useState(null);
  const [myQuestions, setMyQuestions] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [selectedLesson, setSelectedLesson] = useState(null);
  const [legacyQuiz, setLegacyQuiz] = useState(false);
  const [questionText, setQuestionText] = useState('');
  const [questionOpen, setQuestionOpen] = useState(false);
  const [pending, setPending] = useState('');
  const [message, setMessage] = useState('');
  const joinedLessonRef = useRef(null);

  const loadSchedule = useCallback(async () => {
    try {
      const [currentData, upcomingData, weekData] = await Promise.all([
        jsonRequest('/current'), jsonRequest('/schedule/upcoming'), jsonRequest('/schedule/week')
      ]);
      setCurrentLesson(currentData.lesson || null);
      setUpcoming(upcomingData.lesson || null);
      setWeek(weekData.lessons || []);
    } catch (error) { setMessage(error.message); }
  }, [setCurrentLesson]);

  const applyState = useCallback((state) => {
    if (!state) return;
    if (state.lesson) setCurrentLesson(state.lesson);
    setActivePoll(state.activePoll || null);
    setActiveQuiz(state.activeQuiz || null);
    setMyQuestions(state.myQuestions || []);
    setMaterials(state.materials || []);
  }, [setCurrentLesson]);

  const refreshState = useCallback(async (lessonId = currentLesson?.id) => {
    if (!lessonId) return;
    try { applyState(await jsonRequest(`/lessons/${lessonId}/state`)); }
    catch (error) { setMessage(error.message); }
  }, [currentLesson?.id, applyState]);

  useEffect(() => { loadSchedule(); }, [loadSchedule]);

  useEffect(() => {
    if (!lessonSocket) return undefined;
    const onState = (state) => applyState(state);
    const reload = () => refreshState();
    const onFinished = () => {
      setActivePoll(null); setActiveQuiz(null); loadSchedule();
    };
    const onQuestionStatus = ({ question }) => setMyQuestions((items) => items.map((item) => item.id === question.id ? question : item));
    const onError = (error) => setMessage(error?.message || 'Ошибка соединения');
    lessonSocket.on('lesson:state', onState);
    ['poll:started', 'poll:closed', 'poll:results-revealed', 'quiz:started', 'quiz:question-shown', 'quiz:answer-revealed', 'quiz:explanation-shown', 'quiz:next-question', 'quiz:finished'].forEach((event) => lessonSocket.on(event, reload));
    lessonSocket.on('lesson:finished', onFinished);
    lessonSocket.on('question:status-changed', onQuestionStatus);
    lessonSocket.on('error', onError);
    return () => {
      lessonSocket.off('lesson:state', onState);
      ['poll:started', 'poll:closed', 'poll:results-revealed', 'quiz:started', 'quiz:question-shown', 'quiz:answer-revealed', 'quiz:explanation-shown', 'quiz:next-question', 'quiz:finished'].forEach((event) => lessonSocket.off(event, reload));
      lessonSocket.off('lesson:finished', onFinished);
      lessonSocket.off('question:status-changed', onQuestionStatus);
      lessonSocket.off('error', onError);
    };
  }, [lessonSocket, applyState, refreshState, loadSchedule]);

  useEffect(() => {
    if (!lessonSocket || !currentLesson?.id || currentLesson.status !== 'live') return;
    if (joinedLessonRef.current !== currentLesson.id || lessonConnected) {
      lessonSocket.emit('student:join-lesson', { lessonId: currentLesson.id, forceReconnect: true });
      joinedLessonRef.current = currentLesson.id;
    }
  }, [lessonSocket, lessonConnected, currentLesson?.id, currentLesson?.status]);

  useEffect(() => {
    if (!isTabActive || currentLesson?.status !== 'live') return;
    dismissLessonNotice();
    jsonRequest(`/lessons/${currentLesson.id}/attendance/ping`, { method: 'POST' }).catch(() => {});
  }, [isTabActive, currentLesson?.id, currentLesson?.status, dismissLessonNotice]);

  const act = async (key, callback) => {
    setPending(key); setMessage('');
    try { await callback(); } catch (error) { setMessage(error.message); }
    finally { setPending(''); }
  };

  const answerPoll = (optionId) => act('poll', async () => {
    await jsonRequest(`/polls/${activePoll.id}/answer`, { method: 'POST', body: JSON.stringify({ optionId }) });
    await refreshState();
  });

  const answerQuiz = (questionId, selectedAnswer) => act(`quiz-${questionId}`, async () => {
    await jsonRequest(`/lesson-quiz/${activeQuiz.id}/questions/${questionId}/answer`, {
      method: 'POST', body: JSON.stringify({ selectedAnswer })
    });
    await refreshState();
  });

  const sendQuestion = () => act('question', async () => {
    const data = await jsonRequest(`/lessons/${currentLesson.id}/questions`, {
      method: 'POST', body: JSON.stringify({ text: questionText })
    });
    setMyQuestions((items) => [data.question, ...items]);
    setQuestionText(''); setQuestionOpen(false);
  });

  const sendReaction = (type) => act(`reaction-${type}`, async () => {
    await jsonRequest(`/lessons/${currentLesson.id}/reactions`, { method: 'POST', body: JSON.stringify({ type }) });
    setMessage('Реакция отправлена преподавателю');
  });

  const openStream = async () => {
    if (!currentLesson?.streamUrl) return;
    jsonRequest(`/lessons/${currentLesson.id}/attendance/stream-click`, { method: 'POST' }).catch(() => {});
    const tg = window.Telegram?.WebApp;
    if (tg?.openLink) tg.openLink(currentLesson.streamUrl);
    else window.open(currentLesson.streamUrl, '_blank', 'noopener,noreferrer');
  };

  const openScheduleLesson = async (lesson) => {
    setSelectedLesson(lesson);
    if (lesson.status === 'finished') {
      try { setMaterials((await jsonRequest(`/lessons/${lesson.id}/materials`)).materials || []); }
      catch (error) { setMessage(error.message); }
    }
  };

  const live = currentLesson?.status === 'live';
  const latestQuestion = myQuestions[0];

  if (legacyQuiz) return (
    <div className="lesson-legacy">
      <button type="button" className="lesson-back" onClick={() => setLegacyQuiz(false)}>← Вернуться к занятию</button>
      <Quiz studentId={studentId} studentName={studentName} />
    </div>
  );

  return (
    <div className="lesson-page">
      {(lessonReconnecting || (!lessonConnected && live)) && <div className="lesson-reconnecting" role="status"><span /> Восстанавливаем соединение…</div>}
      {message && <button type="button" className="lesson-toast" onClick={() => setMessage('')}>{message}<span>×</span></button>}
      <StatusHeader lesson={currentLesson} upcoming={upcoming} onStream={openStream} />

      <div className="lesson-live-grid">
        <QuizCard live={live} quiz={activeQuiz} onAnswer={answerQuiz} pendingQuestionId={pending.startsWith('quiz-') ? Number(pending.slice(5)) : null} />
        <PollCard live={live} poll={activePoll} onAnswer={answerPoll} pending={pending === 'poll'} />
      </div>

      {live && (
        <section className="lesson-interactions">
          <div className="lesson-section-title"><div><span>⌁</span><h2>Связь с преподавателем</h2></div></div>
          <div className="lesson-reactions" aria-label="Быстрые реакции">
            {REACTIONS.map(([type, icon, label]) => (
              <button type="button" key={type} disabled={pending === `reaction-${type}`} onClick={() => sendReaction(type)}><span>{icon}</span>{label}</button>
            ))}
          </div>
          <button type="button" className="lesson-question-button" onClick={() => setQuestionOpen(true)}>
            <span>✋</span><span><strong>{latestQuestion ? 'Вопрос отправлен' : 'Поднять руку'}</strong><small>{latestQuestion ? ({ pending: 'Ожидает ответа', answering: 'Преподаватель отвечает', answered: 'Отвечено', deferred: 'Ответит после занятия' }[latestQuestion.status]) : 'Задать короткий вопрос преподавателю'}</small></span><span>→</span>
          </button>
        </section>
      )}

      <Schedule upcoming={upcoming} lessons={week} onOpen={openScheduleLesson} />

      {selectedLesson && (
        <section className="lesson-panel lesson-details">
          <button type="button" className="lesson-details-close" onClick={() => setSelectedLesson(null)} aria-label="Закрыть">×</button>
          <h2>{selectedLesson.subject?.name}</h2>
          <p>{formatDate(selectedLesson.scheduledAt)} · {teacherName(selectedLesson.teacher)}</p>
          {selectedLesson.topic && <p>{selectedLesson.topic}</p>}
          {selectedLesson.status === 'finished' && <><h3>Материалы занятия</h3><Materials materials={materials} /></>}
        </section>
      )}

      <button type="button" className="lesson-legacy-link" onClick={() => setLegacyQuiz(true)}>
        Есть код викторины от преподавателя? <strong>Войти по коду →</strong>
      </button>

      {questionOpen && (
        <div className="lesson-modal-backdrop" onClick={() => setQuestionOpen(false)}>
          <div className="lesson-modal" role="dialog" aria-modal="true" aria-labelledby="lesson-question-title" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="lesson-details-close" onClick={() => setQuestionOpen(false)}>×</button>
            <h2 id="lesson-question-title">Задать вопрос</h2>
            <p>Можно просто поднять руку или добавить короткий текст.</p>
            <textarea value={questionText} onChange={(event) => setQuestionText(event.target.value.slice(0, 500))} placeholder="Что осталось непонятным?" rows="4" />
            <button type="button" className="lesson-primary" disabled={pending === 'question'} onClick={sendQuestion}>{questionText.trim() ? 'Отправить вопрос' : 'Поднять руку'}</button>
          </div>
        </div>
      )}
    </div>
  );
}
