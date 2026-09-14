import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import MathText from './MathText';
import { StreamLeaderboard } from './QuizLeaderboard';
import QuizAnswerMark from './QuizAnswerMark';
import { API_URL } from '../config';
import '../styles/LessonQuizArena.css';

function Symbol({ kind = 'check' }) {
  return <svg viewBox="0 0 48 48" fill="none" aria-hidden="true">
    {kind === 'check' ? <path d="m12 24 8 8 17-18" /> : kind === 'cup' ? <><path d="M15 7h18v13a9 9 0 0 1-18 0V7ZM15 11H8v7a7 7 0 0 0 7 7m18-14h7v7a7 7 0 0 1-7 7M24 29v10m-9 2h18" /></> : <><path d="m24 5 17 10v19L24 44 7 34V15L24 5Zm0 20 17-10M24 25 7 15m17 10v19" /></>}
  </svg>;
}

export default function LessonQuizArena({ quiz, studentId, subjectName, onAnswer, onClose, pendingQuestionId, joining = false, error, connected = true }) {
  const dialog = useRef(null);
  const heading = useRef(null);
  const [selected, setSelected] = useState([]);
  const [clock, setClock] = useState(Date.now());
  const [selfIndex, setSelfIndex] = useState(0);
  const offset = useRef(0);
  const question = quiz.mode === 'self_paced' ? quiz.questions?.[selfIndex] : quiz.currentQuestion;
  const answer = quiz.mode === 'self_paced' ? question?.myAnswer : quiz.myAnswer;
  const deadline = quiz.deadline || (quiz.questionStartedAt && question
    ? new Date(quiz.questionStartedAt).getTime() + Number(question.timeLimit || 30) * 1000 : null);
  const remaining = deadline ? Math.max(0, Math.ceil((deadline - clock) / 1000)) : null;
  const expired = quiz.mode === 'single_step' && remaining === 0;
  const phase = quiz.phase || (question ? 'question' : 'waiting');
  const isRanking = phase === 'leaderboard' || phase === 'finished';
  const busy = pendingQuestionId === question?.id;
  const locked = Boolean(answer) || busy || expired || !connected || !quiz.joined;
  const questionIndex = quiz.mode === 'self_paced' ? selfIndex : Number(quiz.currentQuestionIndex || 0);
  const total = quiz.totalQuestions || quiz.questions?.length || 0;
  const ratio = remaining === null ? 1 : Math.min(1, remaining / Number(question?.timeLimit || 30));
  const standing = quiz.myStanding || quiz.leaderboard?.find(entry => Number(entry.id) === Number(studentId));

  useLayoutEffect(() => {
    const node = dialog.current;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    if (node.showModal) node.showModal();
    else node.setAttribute('open', '');
    return () => {
      node.close?.();
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus?.();
    };
  }, []);
  useEffect(() => {
    offset.current = (quiz.serverNow || Date.now()) - Date.now();
    setClock(Date.now() + offset.current);
  }, [quiz.serverNow]);
  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now() + offset.current), 200);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => { setSelected(answer?.selectedAnswer || []); }, [question?.id, answer]);
  useEffect(() => { heading.current?.focus({ preventScroll: true }); dialog.current?.scrollTo?.(0, 0); }, [phase, question?.id]);

  const choose = index => {
    if (locked) return;
    setSelected(items => question.multiple
      ? items.includes(index) ? items.filter(item => item !== index) : [...items, index]
      : [index]);
  };
  const submit = () => { if (!locked && selected.length) onAnswer(question.id, selected); };
  return createPortal(
    <dialog ref={dialog} className={`quiz-arena stream-screen quiz-arena--${phase}`} aria-labelledby="quiz-arena-title" onCancel={event => { event.preventDefault(); onClose(); }}>
      <div className="quiz-arena-shell">
        <div className="quiz-arena-atmosphere" aria-hidden="true"><i /><i /><i /></div>
        <header className="quiz-arena-header">
          <div className="quiz-arena-brand"><Symbol kind="cube" /><strong>KUBIK</strong><span>{subjectName || 'Викторина'}</span></div>
          <button type="button" className="quiz-arena-exit" onClick={onClose}>К занятию <span aria-hidden="true">↗</span></button>
        </header>
        {!connected && <p className="quiz-arena-notice" role="status">Восстанавливаем связь. Ответы снова станут доступны после подключения.</p>}
        {error && <p className="quiz-arena-notice" role="alert">{error}</p>}
        <div className="quiz-arena-content" key={`${phase}-${question?.id || ''}`}>
          {isRanking ? <>
            <div className="quiz-arena-ranking-heading">
              <span className="quiz-arena-rank-chip">{phase === 'finished' ? 'Финальный топ' : `Раунд ${String(questionIndex + 1).padStart(2, '0')} · итоги`}</span>
              <h1 id="quiz-arena-title" ref={heading} tabIndex={-1}>{phase === 'finished' ? <>Вот это <em>финал.</em></> : <>Расстановка <em>сил.</em></>}</h1>
              <p>{phase === 'finished' ? quiz.title : 'Следующий вопрос — по команде преподавателя.'}</p>
            </div>
            <StreamLeaderboard entries={quiz.leaderboard || []} />
            <footer className="quiz-arena-ranking-footer">
              {standing ? <div className="quiz-arena-personal" aria-label="Ваш результат"><span>Ваше место <strong>{standing.place}</strong></span><span><strong>{standing.totalScore}</strong> баллов</span></div>
                : <p>{quiz.joined ? 'Результаты обновляются…' : 'Вы смотрите викторину как зритель'}</p>}
              {phase === 'finished' ? <button type="button" className="quiz-arena-submit" onClick={onClose}>Вернуться к занятию <span aria-hidden="true">→</span></button> : <span className="quiz-arena-wait-label">Ждём следующий вопрос</span>}
            </footer>
          </> : question ? <>
            <div className="quiz-arena-round"><span>Вопрос <strong>{questionIndex + 1}</strong><span className="quiz-arena-round-total"> / {total}</span></span><span>{quiz.title}</span></div>
            <div className="quiz-arena-question-head">
              <h1 id="quiz-arena-title" ref={heading} tabIndex={-1}><MathText text={question.questionText || 'Рассмотрите изображение и выберите ответ'} /></h1>
              {remaining !== null && <div className={`quiz-arena-timer${remaining <= 5 ? ' is-urgent' : ''}`} role="timer" aria-label={`Осталось ${remaining} секунд`}>
                <svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="44" /><circle cx="50" cy="50" r="44" pathLength="1" strokeDasharray="1" strokeDashoffset={1 - ratio} /></svg>
                <strong>{remaining}</strong><span>сек</span>
              </div>}
            </div>
            {question.questionImage?.storageKey && <img className="quiz-arena-image" src={`${API_URL}/practice-images/${question.questionImage.storageKey}`} alt="Иллюстрация к заданию" />}
            <div className="quiz-arena-time-track" aria-hidden="true"><span style={{ transform: `scaleX(${ratio})` }} /></div>
            <p className="quiz-arena-instruction">{!quiz.joined ? 'Регистрация закрыта. Вы можете наблюдать за игрой.' : question.multiple ? 'Выберите все подходящие варианты' : 'Выберите один ответ'}</p>
            <div className="quiz-arena-answers" aria-label="Варианты ответа">
              {(question.options || []).map((option, index) => <button type="button" key={index}
                className={`quiz-arena-answer${selected.includes(index) ? ' is-selected' : ''}${answer && selected.includes(index) ? ' is-sent' : ''}`}
                aria-pressed={selected.includes(index)} disabled={locked} onClick={() => choose(index)}>
                <QuizAnswerMark index={index} /><span className="quiz-arena-answer-text"><MathText text={option} /></span>
                <span className="quiz-arena-choice" aria-hidden="true">{selected.includes(index) && <Symbol />}</span>
              </button>)}
            </div>
            <div className="quiz-arena-answer-footer">
              {answer ? <div className="quiz-arena-received" role="status"><Symbol /><div><strong>Ответ принят</strong><span>Места появятся после завершения вопроса</span></div></div>
                : expired ? <div className="quiz-arena-received" role="status"><div><strong>Время вышло</strong><span>Собираем результаты вопроса…</span></div></div>
                  : <button type="button" className="quiz-arena-submit" disabled={!selected.length || locked} onClick={submit}>{busy ? 'Отправляем…' : 'Отправить ответ'}<span aria-hidden="true">→</span></button>}
              {quiz.mode === 'self_paced' && <div className="quiz-arena-self-nav"><button disabled={selfIndex === 0} onClick={() => setSelfIndex(value => value - 1)}>Назад</button><button disabled={selfIndex + 1 >= total} onClick={() => setSelfIndex(value => value + 1)}>Далее</button></div>}
            </div>
          </> : <div className="quiz-arena-ready">
            <div className="quiz-arena-ready-mark"><span>{String(total).padStart(2, '0')}</span><Symbol kind="cube" /></div>
            <span className="quiz-arena-ready-eyebrow">{subjectName || 'Викторина занятия'} · live</span>
            <h1 id="quiz-arena-title" ref={heading} tabIndex={-1}>Приготовьтесь.<br /><em>Сейчас начнём.</em></h1>
            <p>{quiz.title}</p>
            <div className="quiz-arena-ready-status"><span aria-hidden="true" />{quiz.joined ? 'Вы в игре. Ждём первый вопрос.' : joining || !quiz.rosterLocked ? 'Подключаем вас к игре…' : 'Вы смотрите игру. Регистрация уже закрыта.'}</div>
          </div>}
        </div>
      </div>
    </dialog>, document.body
  );
}
