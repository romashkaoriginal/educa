import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { API_URL } from '../config';
import { apiFetch } from './api';
import { useData } from './DataContext';
import StudentBrandMark from '../components/StudentBrandMark';
import MathText from '../components/MathText';
import './Lesson.css';

const formatTime = (value) => value
  ? new Date(value).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
  : '—';

const formatDayTime = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  const day = date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
  return `${day}, ${formatTime(value)}`;
};

const startOfDay = (value) => {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
};

// Расписание читается как календарь: занятия сгруппированы по дням, а внутри дня
// отсортированы по времени. У каждой строки явно виден предмет — у ученика их
// несколько, и без предмета список превращается в набор несвязанных тем.
function groupLessonsByDay(lessons) {
  const byDay = new Map();
  [...lessons]
    .sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt))
    .forEach((lesson) => {
      const key = startOfDay(lesson.scheduledAt).getTime();
      if (!byDay.has(key)) byDay.set(key, []);
      byDay.get(key).push(lesson);
    });
  return [...byDay.entries()].map(([time, items]) => ({ date: new Date(time), lessons: items }));
}

const dayDiff = (date) => Math.round((startOfDay(date) - startOfDay(new Date())) / 86400000);

const dayLabel = (date) => {
  const diff = dayDiff(date);
  if (diff === 0) return 'Сегодня';
  if (diff === 1) return 'Завтра';
  return date.toLocaleDateString('ru-RU', { weekday: 'long' });
};

// Относительная подпись читается быстрее абсолютной даты: «через 3 дня» понятнее,
// чем «31 июля», когда решаешь, надо ли готовиться прямо сейчас.
const relativeLabel = (date) => {
  const diff = dayDiff(date);
  if (diff === 0) return 'сегодня';
  if (diff === 1) return 'завтра';
  if (diff < 7) return `через ${diff} дн.`;
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
};

const hapticFeedback = (type) => {
  try {
    const haptic = window.Telegram?.WebApp?.HapticFeedback;
    if (type === 'tap') haptic?.impactOccurred?.('light');
    else haptic?.notificationOccurred?.(type);
  } catch (_) {
    // Haptics are optional and may be unavailable in a browser outside Telegram.
  }
};

async function jsonRequest(path, options = {}) {
  const response = await apiFetch(`${API_URL}/lesson${path}`, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || 'Не удалось выполнить действие');
  return data;
}

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
  if (ms === null || ms === undefined) return null;
  const totalSec = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSec / 60);
  const seconds = totalSec % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
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

// ТЗ §4.2/§6: один выделенный блок активного занятия — главный элемент экрана.
function ActiveLessonCard({ lesson, onStream }) {
  return (
    <section className="lesson-active" aria-live="polite">
      <div className="lesson-live-label"><span aria-hidden="true" /> Занятие идёт</div>
      <h1>{lesson.subject?.name || 'Занятие'}</h1>
      {lesson.topic && <p className="lesson-topic">{lesson.topic}</p>}
      <p className="lesson-active-meta">
        Началось в {formatTime(lesson.startedAt)}
        {lesson.sessionEndsAt && <> · осталось <CountdownBadge targetDate={lesson.sessionEndsAt} expiredLabel="завершается" /></>}
      </p>
      {lesson.streamUrl && (
        <button type="button" className="lesson-primary" onClick={onStream}>Перейти к трансляции</button>
      )}
    </section>
  );
}

// Одна строка расписания: время, предмет и тема. Предмет обязателен — без него
// ученик с несколькими предметами не понимает, к чему относится занятие.
function ScheduleRow({ lesson }) {
  return (
    <div className="lesson-day-row">
      <time className="lesson-day-time">{formatTime(lesson.scheduledAt)}</time>
      <span className="lesson-day-info">
        <span className="lesson-day-subject">
          {lesson.subject?.icon && <span className="lesson-day-icon" aria-hidden="true">{lesson.subject.icon}</span>}
          {lesson.subject?.name || 'Предмет не указан'}
        </span>
        <span className="lesson-day-topic">{lesson.topic || 'Тема пока не указана'}</span>
      </span>
    </div>
  );
}

// ТЗ §4.1: выделенный блок ближайшего занятия — главный ответ на вопрос
// «когда следующее занятие».
function NextLessonCard({ lesson }) {
  const date = new Date(lesson.scheduledAt);
  return (
    <section className="lesson-next">
      <div className="lesson-next-head">
        <span className="lesson-next-eyebrow">Ближайшее занятие</span>
        <span className="lesson-next-when">{relativeLabel(date)}</span>
      </div>
      <p className="lesson-next-date">{formatDayTime(lesson.scheduledAt)}</p>
      <h2 className="lesson-next-topic">{lesson.topic || 'Тема пока не указана'}</h2>
      <p className="lesson-next-subject">
        {lesson.subject?.icon && <span aria-hidden="true">{lesson.subject.icon}</span>}
        {lesson.subject?.name || 'Предмет не указан'}
      </p>
    </section>
  );
}

// ТЗ §4.1/§6: компактное состояние, ближайшее занятие и расписание.
// Ближайшее занятие показано и отдельной карточкой, и в ленте — так календарь
// остаётся полным и по нему видно, что идёт после ближайшего занятия.
function IdleState({ upcoming, lessons }) {
  const days = groupLessonsByDay(lessons);
  return (
    <>
      <section className="lesson-idle">
        <span className="lesson-idle-icon" aria-hidden="true">🎓</span>
        <div>
          <h1>Сейчас занятия нет</h1>
          <p>{upcoming
            ? 'Следующее занятие — по расписанию ниже'
            : 'Следующее занятие появится по расписанию'}</p>
        </div>
      </section>

      {upcoming && <NextLessonCard lesson={upcoming} />}

      {days.length > 0 && (
        <section className="lesson-schedule-block">
          <h2 className="lesson-schedule-title">Расписание</h2>
          {days.map(({ date, lessons: dayLessons }) => (
            <div className="lesson-day" key={date.getTime()}>
              <div className="lesson-day-head">
                <span className="lesson-day-num">{date.getDate()}</span>
                <span className="lesson-day-label">{dayLabel(date)}</span>
                <span className="lesson-day-month">{date.toLocaleDateString('ru-RU', { month: 'long' })}</span>
              </div>
              <div className="lesson-day-rows">
                {dayLessons.map((lesson) => <ScheduleRow lesson={lesson} key={lesson.id} />)}
              </div>
            </div>
          ))}
        </section>
      )}

      {!upcoming && days.length === 0 && (
        <section className="lesson-schedule-block">
          <p className="lesson-muted">Пока новых занятий нет. Здесь появятся дата, время и тема следующего занятия.</p>
        </section>
      )}
    </>
  );
}

// ТЗ §4.2: карточка голосования появляется только после запуска преподавателем.
function PollCard({ poll, onAnswer, pending }) {
  const [selected, setSelected] = useState(null);
  useEffect(() => setSelected(poll?.myOptionId || null), [poll?.id, poll?.myOptionId]);
  if (!poll) return null;
  const resultsById = new Map((poll.results?.options || []).map((option) => [Number(option.id), option]));
  const canAnswer = poll.status === 'active' && !poll.hasAnswered;
  return (
    <section className="lesson-panel lesson-panel--attention">
      <div className="lesson-panel-heading">
        <h2><MathText text={poll.question} /></h2>
        {poll.status === 'active' && poll.autoCloseAt && <CountdownBadge targetDate={poll.autoCloseAt} expiredLabel="Завершается…" />}
      </div>
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
              <span><MathText text={option.text} /></span>
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
      ) : <p className="lesson-accepted">{poll.hasAnswered ? 'Ответ принят' : 'Голосование завершено'}</p>}
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
      {question.questionText && <p className="lesson-question-text"><MathText text={question.questionText} /></p>}
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
            ><MathText text={option} /></button>
          );
        })}
      </div>
      {!myAnswer ? (
        <button type="button" className="lesson-primary" disabled={!selected.length || disabled} onClick={() => onSubmit(selected)}>Ответить</button>
      ) : <p className={`lesson-accepted ${resultVisible && !myAnswer.isCorrect ? 'lesson-accepted--wrong' : ''}`}>
        {resultVisible ? (myAnswer.isCorrect ? 'Правильно' : 'Ответ неверный') : 'Ответ принят. Ожидайте результат.'}
      </p>}
      {explanationVisible && (question.explanation || question.hintImage?.storageKey) && <div className="lesson-explanation"><strong>Объяснение</strong>{question.explanation && <p><MathText text={question.explanation} /></p>}{question.hintImage?.storageKey && <img src={`${API_URL}/practice-images/${question.hintImage.storageKey}`} alt="Подсказка" />}</div>}
    </div>
  );
}

// ТЗ §4.2: карточка викторины появляется только после запуска вопроса преподавателем.
function QuizCard({ quiz, onAnswer, pendingQuestionId }) {
  const [selfPacedIndex, setSelfPacedIndex] = useState(0);
  useEffect(() => setSelfPacedIndex(0), [quiz?.id]);
  if (!quiz) return null;

  if (quiz.mode === 'single_step') {
    // До показа вопроса преподавателем блок не занимает место на экране (§8.14).
    if (!quiz.currentQuestion) return null;
    return (
      <section className="lesson-panel lesson-panel--attention">
        <div className="lesson-panel-heading"><h2>Вопрос от преподавателя</h2></div>
        <QuizQuestion
          question={quiz.currentQuestion}
          myAnswer={quiz.myAnswer}
          disabled={pendingQuestionId === quiz.currentQuestion.id || quiz.questionRevealState !== 'question'}
          onSubmit={(selected) => onAnswer(quiz.currentQuestion.id, selected)}
          resultVisible={quiz.questionRevealState === 'answer'}
          explanationVisible={quiz.explanationRevealed}
        />
      </section>
    );
  }

  const questions = quiz.questions || [];
  if (!questions.length) return null;
  const current = questions[selfPacedIndex];
  const answered = questions.filter((question) => question.myAnswer).length;
  return (
    <section className="lesson-panel lesson-panel--attention">
      <div className="lesson-panel-heading"><h2>Вопрос от преподавателя</h2></div>
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
    </section>
  );
}

// Полное расписание — отдельный экран, открывается ссылкой во время занятия (ТЗ §4.2).
function ScheduleView({ lessons, onClose }) {
  const days = groupLessonsByDay(lessons);
  return (
    <section className="lesson-schedule-block">
      <div className="lesson-schedule-head">
        <h2 className="lesson-schedule-title">Расписание занятий</h2>
        <button type="button" className="lesson-details-close" onClick={onClose} aria-label="Закрыть расписание">×</button>
      </div>
      {days.length === 0
        ? <p className="lesson-muted">Пока новых занятий нет. Здесь появятся дата, время и тема следующего занятия.</p>
        : days.map(({ date, lessons: dayLessons }) => (
          <div className="lesson-day" key={date.getTime()}>
            <div className="lesson-day-head">
              <span className="lesson-day-num">{date.getDate()}</span>
              <span className="lesson-day-label">{dayLabel(date)}</span>
              <span className="lesson-day-month">{date.toLocaleDateString('ru-RU', { month: 'long' })}</span>
            </div>
            <div className="lesson-day-rows">
              {dayLessons.map((lesson) => <ScheduleRow lesson={lesson} key={lesson.id} />)}
            </div>
          </div>
        ))}
    </section>
  );
}

export default function Lesson({ studentId, isTabActive, entryRequest = null }) {
  const {
    currentLesson, setCurrentLesson, lessonSocket,
    lessonConnected, lessonReconnecting, dismissLessonNotice
  } = useData();
  const [upcoming, setUpcoming] = useState(null);
  const [upcomingList, setUpcomingList] = useState([]);
  const [activePoll, setActivePoll] = useState(null);
  const [activeQuiz, setActiveQuiz] = useState(null);
  const [myQuestions, setMyQuestions] = useState([]);
  const [canAskQuestions, setCanAskQuestions] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [questionText, setQuestionText] = useState('');
  const [questionOpen, setQuestionOpen] = useState(false);
  const [pending, setPending] = useState('');
  const [message, setMessage] = useState('');
  const [questionFeedback, setQuestionFeedback] = useState('idle');
  const joinedLessonRef = useRef(null);
  const questionFeedbackTimerRef = useRef(null);

  const studentRequest = useCallback((path, options = {}) => {
    const separator = path.includes('?') ? '&' : '?';
    return jsonRequest(`${path}${separator}studentId=${encodeURIComponent(studentId)}`, options);
  }, [studentId]);

  const loadSchedule = useCallback(async () => {
    try {
      const [currentData, upcomingData, listData] = await Promise.all([
        studentRequest('/current'),
        studentRequest('/schedule/upcoming'),
        studentRequest('/schedule/upcoming-list?limit=5')
      ]);
      setCurrentLesson(currentData.lesson || null);
      setUpcoming(upcomingData.lesson || null);
      setUpcomingList(listData.lessons || []);
    } catch (error) { setMessage(error.message); }
  }, [setCurrentLesson, studentRequest]);

  const applyState = useCallback((state) => {
    if (!state) return;
    if (state.lesson) setCurrentLesson(state.lesson);
    setActivePoll(state.activePoll || null);
    setActiveQuiz(state.activeQuiz || null);
    setMyQuestions(state.myQuestions || []);
    setCanAskQuestions(Boolean(state.canAskQuestions));
  }, [setCurrentLesson]);

  const refreshState = useCallback(async (lessonId = currentLesson?.id) => {
    if (!lessonId) return;
    try { applyState(await studentRequest(`/lessons/${lessonId}/state`)); }
    catch (error) { setMessage(error.message); }
  }, [currentLesson?.id, applyState, studentRequest]);

  const resetSessionState = useCallback(() => {
    joinedLessonRef.current = null;
    setActivePoll(null);
    setActiveQuiz(null);
    setMyQuestions([]);
    setCanAskQuestions(false);
    setQuestionOpen(false);
    setQuestionFeedback('idle');
  }, []);

  useEffect(() => { loadSchedule(); }, [loadSchedule]);

  useEffect(() => () => clearTimeout(questionFeedbackTimerRef.current), []);

  // ТЗ §8.17: экран занятия обновляется без перезагрузки.
  useEffect(() => {
    if (!lessonSocket) return undefined;
    const onState = (state) => applyState(state);
    const reload = () => refreshState();
    const onStarted = () => loadSchedule();
    const onFinished = ({ lessonId } = {}) => {
      if (!lessonId || Number(joinedLessonRef.current) === Number(lessonId)) resetSessionState();
      loadSchedule();
    };
    const onQuestionsToggled = ({ questionsEnabled } = {}) => setCanAskQuestions(Boolean(questionsEnabled));
    const onQuestionStatus = ({ question }) => setMyQuestions((items) => items.map((item) => item.id === question.id ? question : item));
    const onError = (error) => setMessage(error?.message || 'Ошибка соединения');
    const activityEvents = [
      'poll:started', 'poll:closed', 'poll:results-revealed',
      'quiz:started', 'quiz:question-shown', 'quiz:answer-revealed',
      'quiz:explanation-shown', 'quiz:next-question', 'quiz:finished'
    ];
    lessonSocket.on('lesson:state', onState);
    activityEvents.forEach((event) => lessonSocket.on(event, reload));
    lessonSocket.on('lesson:started', onStarted);
    lessonSocket.on('lesson:finished', onFinished);
    lessonSocket.on('lesson:questions-toggled', onQuestionsToggled);
    lessonSocket.on('question:status-changed', onQuestionStatus);
    lessonSocket.on('error', onError);
    return () => {
      lessonSocket.off('lesson:state', onState);
      activityEvents.forEach((event) => lessonSocket.off(event, reload));
      lessonSocket.off('lesson:started', onStarted);
      lessonSocket.off('lesson:finished', onFinished);
      lessonSocket.off('lesson:questions-toggled', onQuestionsToggled);
      lessonSocket.off('question:status-changed', onQuestionStatus);
      lessonSocket.off('error', onError);
    };
  }, [lessonSocket, applyState, refreshState, loadSchedule, resetSessionState]);

  // Занятие идёт — экран сразу показывает активную сессию (ТЗ §4.2).
  const live = currentLesson?.status === 'live';

  useEffect(() => {
    if (!live) resetSessionState();
  }, [live, currentLesson?.id, resetSessionState]);

  useEffect(() => {
    if (!live) return;
    setScheduleOpen(false);
    dismissLessonNotice();
  }, [live, currentLesson?.id, dismissLessonNotice]);

  useEffect(() => {
    if (!entryRequest?.lessonId) return;
    loadSchedule();
  }, [entryRequest?.lessonId, entryRequest?.nonce]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!lessonSocket || !live) return;
    if (joinedLessonRef.current !== currentLesson.id || lessonConnected) {
      lessonSocket.emit('student:join-lesson', { lessonId: currentLesson.id, studentId, forceReconnect: true });
      joinedLessonRef.current = currentLesson.id;
    }
  }, [lessonSocket, lessonConnected, currentLesson?.id, live, studentId]);

  useEffect(() => {
    if (!live || !currentLesson?.id) return;
    refreshState(currentLesson.id);
  }, [live, currentLesson?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!isTabActive || !live) return;
    studentRequest(`/lessons/${currentLesson.id}/attendance/ping`, { method: 'POST' }).catch(() => {});
  }, [isTabActive, live, currentLesson?.id, studentRequest]);

  useEffect(() => {
    if (!live || !activeQuiz?.id) return;
    const questionIds = activeQuiz.mode === 'self_paced'
      ? (activeQuiz.questions || []).map((question) => question.id)
      : activeQuiz.currentQuestion?.id ? [activeQuiz.currentQuestion.id] : [];
    questionIds.forEach((questionId) => {
      studentRequest(`/lesson-quiz/${activeQuiz.id}/questions/${questionId}/received`, { method: 'POST' }).catch(() => {});
    });
  }, [
    live,
    activeQuiz?.id,
    activeQuiz?.mode,
    activeQuiz?.currentQuestion?.id,
    activeQuiz?.questions?.map((question) => question.id).join(','),
    studentRequest
  ]);

  const act = async (key, callback) => {
    setPending(key); setMessage('');
    try { await callback(); } catch (error) { setMessage(error.message); }
    finally { setPending(''); }
  };

  const answerPoll = (optionId) => act('poll', async () => {
    await studentRequest(`/polls/${activePoll.id}/answer`, { method: 'POST', body: JSON.stringify({ optionId }) });
    await refreshState();
  });

  const answerQuiz = (questionId, selectedAnswer) => act(`quiz-${questionId}`, async () => {
    await studentRequest(`/lesson-quiz/${activeQuiz.id}/questions/${questionId}/answer`, {
      method: 'POST', body: JSON.stringify({ selectedAnswer })
    });
    await refreshState();
  });

  const sendQuestion = async () => {
    if (pending === 'question') return;
    clearTimeout(questionFeedbackTimerRef.current);
    setPending('question');
    setQuestionFeedback('sending');
    setMessage('');
    hapticFeedback('tap');
    try {
      const data = await studentRequest(`/lessons/${currentLesson.id}/questions`, {
        method: 'POST', body: JSON.stringify({ text: questionText })
      });
      setMyQuestions((items) => [data.question, ...items]);
      setQuestionText('');
      setQuestionOpen(false);
      setQuestionFeedback('success');
      hapticFeedback('success');
      questionFeedbackTimerRef.current = setTimeout(() => setQuestionFeedback('idle'), 1800);
    } catch (error) {
      setQuestionFeedback('error');
      setMessage(error.message);
      hapticFeedback('error');
    } finally {
      setPending('');
    }
  };

  const openStream = async () => {
    if (!currentLesson?.streamUrl) return;
    studentRequest(`/lessons/${currentLesson.id}/attendance/stream-click`, { method: 'POST' }).catch(() => {});
    const tg = window.Telegram?.WebApp;
    if (tg?.openLink) tg.openLink(currentLesson.streamUrl);
    else window.open(currentLesson.streamUrl, '_blank', 'noopener,noreferrer');
  };

  // Кнопка держит статус вопроса, только пока он ждёт реакции преподавателя.
  // Как только преподаватель его отвечает или откладывает, кнопка возвращается
  // к обычному «Задать вопрос преподавателю» — прошлый вопрос закрыт.
  const latestQuestion = myQuestions[0];
  const openQuestion = latestQuestion && ['pending', 'answering'].includes(latestQuestion.status)
    ? latestQuestion
    : null;
  // ТЗ §5 состояние №6: на экране показывается не больше одной основной активности.
  const hasQuizCard = Boolean(activeQuiz && (activeQuiz.mode === 'single_step'
    ? activeQuiz.currentQuestion
    : (activeQuiz.questions || []).length));
  const hasPollCard = Boolean(activePoll) && !hasQuizCard;
  const hasActivity = hasQuizCard || hasPollCard;

  // Синяя шапка — общий для всех разделов элемент (практика, домашка, статистика).
  const hero = (
    <div className="section-hero lesson-hero">
      <div className="section-hero-glow" />
      <div className="section-hero-content">
        <div className="section-hero-main">
          <StudentBrandMark variant="hero" />
          <div className="section-hero-text">
            <h1 className="section-hero-title">Занятие</h1>
            <p className="section-hero-sub">
              {live
                ? `${currentLesson.subject?.name || 'Занятие'} · идёт сейчас`
                : upcoming
                  ? 'Расписание ниже'
                  : 'Занятий пока не запланировано'}
            </p>
          </div>
        </div>
        {live && <span className="lesson-hero-live" aria-label="Занятие идёт"><span aria-hidden="true" />В эфире</span>}
      </div>
      <svg className="section-hero-wave" viewBox="0 0 400 40" preserveAspectRatio="none">
        <path d="M0,40 L0,22 Q100,2 200,18 T400,15 L400,40 Z" />
      </svg>
    </div>
  );

  if (scheduleOpen) {
    return (
      <div className="lesson-page">
        {hero}
        <div className="lesson-content">
          {message && <button type="button" className="lesson-toast" onClick={() => setMessage('')}>{message}<span>×</span></button>}
          <ScheduleView lessons={upcomingList} onClose={() => setScheduleOpen(false)} />
        </div>
      </div>
    );
  }

  return (
    <div className="lesson-page">
      {hero}
      <div className="lesson-content">
      {(lessonReconnecting || (!lessonConnected && live)) && <div className="lesson-reconnecting" role="status"><span /> Восстанавливаем соединение…</div>}
      {message && <button type="button" className="lesson-toast" onClick={() => setMessage('')}>{message}<span>×</span></button>}

      {live ? (
        <>
          <ActiveLessonCard lesson={currentLesson} onStream={openStream} />

          {hasQuizCard && (
            <QuizCard
              quiz={activeQuiz}
              onAnswer={answerQuiz}
              pendingQuestionId={pending.startsWith('quiz-') ? Number(pending.slice(5)) : null}
            />
          )}
          {hasPollCard && <PollCard poll={activePoll} onAnswer={answerPoll} pending={pending === 'poll'} />}
          {!hasActivity && <p className="lesson-waiting">Ожидайте заданий от преподавателя</p>}

          {/* ТЗ §4.2: блок вопроса не показывается, если преподаватель их отключил. */}
          {canAskQuestions && (
            <button
              type="button"
              className={`lesson-question-button ${questionFeedback === 'success' ? 'lesson-question-button--success' : ''}`}
              onClick={() => setQuestionOpen(true)}
            >
              <span className="lesson-question-icon" aria-hidden="true">{questionFeedback === 'success' ? '✓' : '✋'}</span>
              <span>
                <strong>Задать вопрос преподавателю</strong>
                <small>{questionFeedback === 'success'
                  ? 'Преподаватель получил уведомление'
                  : openQuestion
                    ? ({ pending: 'Ожидает ответа', answering: 'Преподаватель отвечает' }[openQuestion.status] || 'Статус обновляется')
                    : 'Короткий вопрос во время занятия'}</small>
              </span>
              <span aria-hidden="true">→</span>
            </button>
          )}

          {/* ТЗ §4.2: во время занятия расписание — только небольшая ссылка внизу. */}
          <button type="button" className="lesson-schedule-link" onClick={() => setScheduleOpen(true)}>
            Расписание занятий →
          </button>
        </>
      ) : (
        <IdleState upcoming={upcoming} lessons={upcomingList} />
      )}
      </div>

      {questionOpen && typeof document !== 'undefined' && createPortal(
        <div className="lesson-modal-backdrop" onClick={() => setQuestionOpen(false)}>
          <div className="lesson-modal" role="dialog" aria-modal="true" aria-labelledby="lesson-question-title" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="lesson-details-close" onClick={() => setQuestionOpen(false)}>×</button>
            <h2 id="lesson-question-title">Задать вопрос</h2>
            <textarea value={questionText} onChange={(event) => setQuestionText(event.target.value.slice(0, 500))} placeholder="Что осталось непонятным?" rows="4" />
            <button type="button" className="lesson-primary" disabled={pending === 'question'} onClick={sendQuestion}>
              {pending === 'question' ? 'Отправляем…' : 'Отправить'}
            </button>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
