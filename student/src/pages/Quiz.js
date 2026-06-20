import React, { useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import { apiFetch, getTelegramInitData } from './api';
import { useData } from './DataContext';
import './Quiz.css';

import { API_URL, SOCKET_URL } from '../config';

// Анимированный счётчик: число докручивается от 0 к target
function useCountUp(target, duration = 900, active = true) {
  const [value, setValue] = React.useState(0);
  React.useEffect(() => {
    if (!active) { setValue(target); return undefined; }
    const end = parseFloat(target) || 0;
    if (end <= 0) { setValue(0); return undefined; }
    let raf;
    const start = performance.now();
    const tick = (now) => {
      const p = Math.min(1, (now - start) / duration);
      // easeOutCubic
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(Math.round(end * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
      else setValue(end);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration, active]);
  return value;
}

// Тактильный отклик: Telegram HapticFeedback, иначе navigator.vibrate.
function haptic(type = 'light') {
  try {
    const tg = window.Telegram?.WebApp?.HapticFeedback;
    if (tg) {
      if (type === 'success' || type === 'error' || type === 'warning') {
        tg.notificationOccurred(type);
      } else {
        tg.impactOccurred(type); // 'light' | 'medium' | 'heavy' | 'rigid' | 'soft'
      }
      return;
    }
  } catch (_) { /* ignore */ }
  try {
    if (navigator.vibrate) {
      const map = { light: 10, medium: 20, heavy: 35, success: [15, 40, 15], error: [40, 30, 40], warning: 30 };
      navigator.vibrate(map[type] || 10);
    }
  } catch (_) { /* ignore */ }
}

function formatQuizLine(subjectName, title, separator = '.') {
  if (subjectName && title) return `${subjectName}${separator} ${title}`;
  return title || subjectName || 'Викторина';
}

// Детерминированный выбор из массива по «семени» (чтобы статус не прыгал при ре-рендере).
function pick(arr, seed) {
  if (!arr.length) return null;
  return arr[Math.abs(seed) % arr.length];
}

const QUIZ_RANK_AWARDS = {
  legendary: [
    ['👑', 'Абсолютный чемпион', 'Идеальная игра: ни одной ошибки.'],
    ['💎', 'Алмазная серия', '100% точность. Так проходят викторины мастера.'],
    ['⚡', 'Молния без промаха', 'Быстро, точно и без единого лишнего движения.'],
    ['🌌', 'Космический уровень', 'Все ответы попали точно в цель.'],
    ['🧠', 'Гений раунда', 'Сегодня мозг работал как турбина.'],
    ['🏛️', 'Легенда класса', 'Такой результат хочется показывать всем.'],
    ['🪄', 'Маг точных ответов', 'Ни одной ошибки — почти фокус.'],
    ['🚀', 'Орбита победителя', 'Ты улетел выше всех ожиданий.'],
    ['🔥', 'Безошибочный режим', 'Полная концентрация и чистая победа.'],
    ['🦉', 'Мудрец викторины', 'Ответы были спокойные, точные и уверенные.']
  ],
  gold: [
    ['🏆', 'Чемпион викторины', 'Первое место. Никто не набрал больше.'],
    ['🥇', 'Золотой финиш', 'Ты забрал вершину таблицы.'],
    ['🦁', 'Лидер прайда', 'Уверенно вышел первым.'],
    ['⚔️', 'Победитель дуэли', 'Соперники были близко, но ты выше.'],
    ['🎖️', 'Командир результата', 'Первое место добыто по делу.'],
    ['🌟', 'Звезда раунда', 'Сегодня таблица начинается с тебя.'],
    ['🚩', 'Флаг на вершине', 'Ты закрепился на первом месте.'],
    ['🧭', 'Капитан зачёта', 'Вёл игру и довёл её до победы.'],
    ['💫', 'Первый импульс', 'Отличный рывок и лучший итог.'],
    ['🦅', 'Высота чемпиона', 'Сверху видно всю таблицу.']
  ],
  silver: [
    ['🥈', 'Серебряный рывок', 'Второе место — очень близко к золоту.'],
    ['🚀', 'Почти орбита', 'Ещё немного, и первое место твоё.'],
    ['🛡️', 'Сильный претендент', 'Ты в призёрах и держишь высокий темп.'],
    ['🌙', 'Серебряная точность', 'Спокойно и уверенно забрал вторую строчку.'],
    ['⚙️', 'Механика успеха', 'Результат собран почти идеально.'],
    ['🎯', 'В шаге от вершины', 'Очень крепкая игра.'],
    ['💪', 'Главный преследователь', 'Ты ближе всех к чемпиону.'],
    ['🪽', 'Высокий полёт', 'Пьедестал уже твой.'],
    ['📈', 'Рывок наверх', 'Таблица точно заметила этот результат.']
  ],
  bronze: [
    ['🥉', 'Бронзовый пьедестал', 'Третье место — ты среди лучших.'],
    ['🔥', 'Горячая тройка', 'Призовое место добыто в борьбе.'],
    ['🧩', 'Точный сборщик', 'Хорошо собрал ответы и попал в топ-3.'],
    ['🎖️', 'Медаль за напор', 'Бронза смотрится заслуженно.'],
    ['🌄', 'Вершина рядом', 'Ты уже на пьедестале.'],
    ['⚡', 'Быстрый призёр', 'Третья строчка и сильный результат.'],
    ['🦊', 'Хитрый ход', 'Умная игра вывела в тройку.'],
    ['🏅', 'Призовой зачёт', 'Ты закончил викторину с медалью.']
  ],
  elite: [
    ['🌟', 'Элита раунда', 'Ты в верхушке таблицы.'],
    ['💫', 'Топ-рывок', 'Результат заметно выше среднего.'],
    ['🛰️', 'На высокой орбите', 'Ты держишься рядом с лидерами.'],
    ['🧨', 'Сильный взрыв', 'Мощная игра без лишнего шума.'],
    ['🎯', 'Точный охотник', 'Много попаданий и высокий итог.'],
    ['🔭', 'Дальняя цель взята', 'Ты уверенно попал в верхнюю часть таблицы.'],
    ['🧠', 'Умный темп', 'Верные решения привели высоко.'],
    ['🏹', 'Стрела в топ', 'Твой результат улетел вверх.'],
    ['📌', 'Закрепился наверху', 'Хорошая позиция среди участников.']
  ],
  great: [
    ['🚀', 'Отличный старт', 'Ты в верхней части таблицы.'],
    ['🔥', 'Сильная игра', 'Темп хороший, результат крепкий.'],
    ['💪', 'Уверенный игрок', 'Ты явно был в форме.'],
    ['⚡', 'Быстрый разгон', 'Хороший темп дал хороший итог.'],
    ['🧭', 'Верный курс', 'Двигаешься к призовым местам.'],
    ['🎮', 'Комбо собрано', 'Несколько точных ответов сделали разницу.'],
    ['📈', 'Плюс к рейтингу', 'После такого хочется сыграть ещё.'],
    ['🦾', 'Железная попытка', 'Крепко, собрано, уверенно.'],
    ['🌊', 'Хорошая волна', 'Поймал ритм и прошёл достойно.']
  ],
  sharp: [
    ['🎯', 'Меткий стрелок', 'Высокая точность — отличный знак.'],
    ['🔬', 'Точный аналитик', 'Ошибок мало, мышление работает чисто.'],
    ['🧠', 'Холодная голова', 'Ответы были продуманными.'],
    ['🪶', 'Тонкая настройка', 'Точность уже есть, осталось добавить скорость.'],
    ['📐', 'Выверенный ответ', 'Ты умеешь выбирать аккуратно.'],
    ['🧿', 'Глаз-алмаз', 'Много точных попаданий.'],
    ['🧩', 'Собрал логику', 'Ответы легли в правильный порядок.'],
    ['🦉', 'Спокойная точность', 'Не спешил зря и попал куда нужно.']
  ],
  good: [
    ['👏', 'Хороший результат', 'Викторина пройдена достойно.'],
    ['💪', 'Крепкая игра', 'Есть база, есть движение вперёд.'],
    ['🧱', 'Надёжный фундамент', 'На этом результате можно строить дальше.'],
    ['🎒', 'Боевой зачёт', 'Ты справился и забрал опыт.'],
    ['🛠️', 'Режим прокачки', 'Ещё немного практики — и место выше.'],
    ['🌤️', 'Светлый прогресс', 'Хорошая попытка с понятным ростом.'],
    ['🧭', 'Курс найден', 'Следующая викторина может быть сильнее.'],
    ['🎲', 'Игра засчитана', 'Опыт получен, выводы сделаны.'],
    ['🚶', 'Шаг вперёд', 'Каждая такая игра двигает выше.']
  ],
  grow: [
    ['🌱', 'Старт положен', 'Это начало. Практика быстро подтянет результат.'],
    ['🧪', 'Первая проба', 'Ошибки показывают, что повторить дальше.'],
    ['🛤️', 'Маршрут построен', 'Теперь понятно, куда расти.'],
    ['🔧', 'Режим настройки', 'Чуть практики — и баллы начнут подниматься.'],
    ['🧗', 'Подъём начался', 'Сегодня не вершина, но движение есть.'],
    ['🌿', 'Росток результата', 'Следующая попытка может удивить.'],
    ['📚', 'Материал найден', 'Разбор ошибок даст быстрый прирост.'],
    ['🧯', 'Спокойный рестарт', 'Не страшно ошибаться, важно продолжать.']
  ]
};

function awardFrom(tier, seed, fallbackTier = 'good') {
  const pool = QUIZ_RANK_AWARDS[tier] || QUIZ_RANK_AWARDS[fallbackTier];
  const [emoji, title, subtitle] = pick(pool, seed);
  return { tier, emoji, title, subtitle };
}

// Большая база «званий» в зависимости от места, числа участников и точности.
// Возвращает данные для награды на финальном экране.
function getQuizRankStatus({ rank, total, accuracy = 0, correct = 0, totalQuestions = 0 }) {
  const r = Number(rank) || 0;
  const n = Number(total) || 0;
  const acc = Number(accuracy) || 0;
  const seed = r * 7 + n * 13 + correct * 3 + Math.round(acc); // стабильное семя
  const perfect = totalQuestions > 0 && correct >= totalQuestions;
  // Доля сверху: 0 — лучший, 1 — последний
  const topFraction = n > 1 ? (r - 1) / (n - 1) : 0;

  let award;
  if (perfect) {
    award = awardFrom('legendary', seed);
  } else if (r === 1 && n > 1) {
    award = awardFrom('gold', seed);
  } else if (r === 2 && n > 2) {
    award = awardFrom('silver', seed);
  } else if (r === 3 && n > 3) {
    award = awardFrom('bronze', seed);
  } else if (n >= 5 && topFraction <= 0.1) {
    award = awardFrom('elite', seed);
  } else if (n >= 4 && topFraction <= 0.34) {
    award = awardFrom('great', seed);
  } else if (acc >= 80) {
    award = awardFrom('sharp', seed);
  } else if (n >= 3 && topFraction <= 0.7) {
    award = awardFrom('good', seed);
  } else if (acc < 40) {
    award = awardFrom('grow', seed);
  } else {
    award = awardFrom('good', seed);
  }

  const rarityByTier = {
    legendary: 'легендарное звание',
    gold: 'золотое звание',
    silver: 'серебряное звание',
    bronze: 'бронзовое звание',
    elite: 'элитное звание',
    great: 'сильное звание',
    sharp: 'звание за точность',
    good: 'боевое звание',
    grow: 'звание роста'
  };

  return {
    ...award,
    rarity: rarityByTier[award.tier] || 'звание',
    placeLine: r && n ? `${r} место из ${n}` : 'место будет в истории',
    accuracyLine: totalQuestions ? `${correct}/${totalQuestions} верных · ${acc}% точность` : `${acc}% точность`
  };
}

function formatScore(value) {
  const n = parseFloat(value) || 0;
  if (Number.isInteger(n)) return String(n);
  const rounded = Math.round(n * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function formatQuizDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
}

function quizStatusLabel(status) {
  return status === 'finished' ? 'завершена' : 'не завершена';
}

function QuizShell({ children, className = '', sessionLock = false }) {
  return (
    <div className={`section section-quiz quiz-ui ${sessionLock ? 'quiz-ui--session' : ''} ${className}`.trim()}>
      <div className="quiz-ui__inner">{children}</div>
    </div>
  );
}

// Горизонтальная полоса лидерборда для экрана вопроса (эргономичнее сайдбара)
function MiniLeaderboardBar({ participants, studentId, myRank }) {
  if (participants.length === 0) return null;
  const top = participants.slice(0, 3);
  const meInTop = top.some((p) => p.userId === studentId);
  const medals = ['🥇', '🥈', '🥉'];
  return (
    <div className="quiz-ui-lb-bar" aria-label="Лидерборд">
      <div className="quiz-ui-lb-bar__list">
        {top.map((p, i) => (
          <span
            key={p.userId}
            className={`quiz-ui-lb-bar__item${p.userId === studentId ? ' is-me' : ''}`}
          >
            <span className="quiz-ui-lb-bar__medal">{medals[i]}</span>
            <span className="quiz-ui-lb-bar__name">{p.userId === studentId ? 'Вы' : p.firstName}</span>
            <span className="quiz-ui-lb-bar__score">{formatScore(p.totalScore)}</span>
          </span>
        ))}
      </div>
      {!meInTop && myRank > 0 && (
        <span className="quiz-ui-lb-bar__me">#{myRank} из {participants.length}</span>
      )}
    </div>
  );
}

function ScoreChip({ score }) {
  return (
    <div className="quiz-ui-score-chip">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l2.9 6.26L22 9.27l-5 4.87L18.2 22 12 18.27 5.8 22 7 14.14l-5-4.87 7.1-1.01L12 2z" /></svg>
      {formatScore(score)}
    </div>
  );
}

function Quiz({ studentId, studentName = 'Ученик' }) {
  const { requestPractice } = useData();
  const [view, setView] = useState('enter');
  const [accessCode, setAccessCode] = useState('');
  const [quiz, setQuiz] = useState(null);
  const [socket, setSocket] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [quizHistory, setQuizHistory] = useState([]);
  const [finishedInfo, setFinishedInfo] = useState(null);
  const [reconnectOffer, setReconnectOffer] = useState(null);
  const [participantCount, setParticipantCount] = useState(0);
  const [participants, setParticipants] = useState([]);

  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [totalQuestions, setTotalQuestions] = useState(0);
  const [timeLeft, setTimeLeft] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [answered, setAnswered] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [answerFeedback, setAnswerFeedback] = useState(null);
  const [questionTransition, setQuestionTransition] = useState(false);

  const [myScore, setMyScore] = useState(0);
  const [finalResults, setFinalResults] = useState(null);
  const [resultsSource, setResultsSource] = useState('live');
  const [showErrorsDetail, setShowErrorsDetail] = useState(false);
  const [enterTab, setEnterTab] = useState('join');

  const questionStartTime = useRef(null);
  const pendingQuizRef = useRef(null);
  const selectedAnswerRef = useRef(null);
  const timedOutRef = useRef(false);
  const currentQuestionRef = useRef(null);

  // Счёт для финального экрана (хук на верхнем уровне — без нарушения правил React)
  const finalScoreTarget = view === 'results' ? (parseFloat(finalResults?.me?.totalScore) || 0) : 0;
  const animatedScore = useCountUp(finalScoreTarget, 950, view === 'results');

  const cleanupSocket = useCallback(() => {
    if (socket) {
      if (quiz?.id) {
        socket.emit('student:leave-quiz', { quizId: quiz.id, userId: studentId });
      }
      socket.disconnect();
      setSocket(null);
    }
  }, [socket, quiz?.id, studentId]);

  useEffect(() => () => { cleanupSocket(); }, [cleanupSocket]);

  const loadQuizHistory = useCallback(async () => {
    try {
      const res = await apiFetch(`${API_URL}/quiz/student/${studentId}/stats`);
      if (!res.ok) return;
      const data = await res.json();
      setQuizHistory(data.quizzes || []);
    } catch (e) {
      console.error('Load quiz history:', e);
    }
  }, [studentId]);

  useEffect(() => { loadQuizHistory(); }, [loadQuizHistory]);

  const sessionLocked = ['lobby', 'playing'].includes(view);

  useEffect(() => {
    const appRoot = document.querySelector('.student-app');
    const content = document.querySelector('.student-app .content');
    if (sessionLocked) {
      appRoot?.classList.add('quiz-session-active');
      content?.classList.add('quiz-scroll-lock');
    }
    return () => {
      appRoot?.classList.remove('quiz-session-active');
      content?.classList.remove('quiz-scroll-lock');
    };
  }, [sessionLocked]);

  useEffect(() => {
    if (view !== 'playing' || timeLeft <= 0) return undefined;
    const timer = setTimeout(() => setTimeLeft((t) => t - 1), 1000);
    return () => clearTimeout(timer);
  }, [timeLeft, view]);

  useEffect(() => {
    if (view !== 'playing' || answered || !currentQuestion || timeLeft > 0) return;
    timedOutRef.current = true;
    setTimedOut(true);
    setAnswered(true);
    haptic('warning');
  }, [timeLeft, view, answered, currentQuestion]);

  const setupSocketListeners = (newSocket, quizData, forceReconnect = false) => {
    newSocket.on('student:joined', ({ quiz: q, participantCount: count }) => {
      setLoading(false);
      setReconnectOffer(null);
      setQuiz((prev) => ({ ...prev, ...q }));
      setParticipantCount(count || 0);
      setView(q.status === 'active' ? 'playing' : 'lobby');
    });

    newSocket.on('quiz:started', () => setView('playing'));

    newSocket.on('quiz:new-question', ({ question, questionIndex: idx, totalQuestions: total }) => {
      setCurrentQuestion(question);
      currentQuestionRef.current = question;
      setQuestionIndex(idx);
      setTotalQuestions(total);
      setTimeLeft(question.timeLimit);
      setSelectedAnswer(null);
      setAnswered(false);
      setTimedOut(false);
      selectedAnswerRef.current = null;
      timedOutRef.current = false;
      setAnswerFeedback(null);
      setQuestionTransition(false);
      setView('playing');
      questionStartTime.current = Date.now();
    });

    newSocket.on('student:answer-accepted', (data) => {
      setAnswered(true);
      if (quizData.showLeaderboardAfterQuestion !== false && data?.isCorrect != null) {
        setAnswerFeedback({
          isCorrect: data.isCorrect,
          earned: parseFloat(data.score) || 0,
          correctAnswer: data.correctAnswer
        });
        haptic(data.isCorrect ? 'success' : 'error');
        if (data.totalScore != null) {
          setMyScore(parseFloat(data.totalScore) || 0);
        }
      }
    });

    // Вопрос завершён у всех одновременно. Без промежуточных экранов:
    // гасим приём ответов и ждём следующий вопрос (или финал).
    newSocket.on('quiz:question-ended', () => {
      timedOutRef.current = true;
      setAnswered(true);
      setQuestionTransition(true);
    });

    newSocket.on('participants:updated', ({ participants: list }) => {
      const sorted = [...(list || [])].sort(
        (a, b) => (parseFloat(b.totalScore) || 0) - (parseFloat(a.totalScore) || 0)
      );
      setParticipants(sorted.map((p, i) => ({
        rank: i + 1,
        userId: p.userId,
        firstName: p.user?.firstName,
        lastName: p.user?.lastName,
        totalScore: parseFloat(p.totalScore) || 0
      })));
      setParticipantCount(list?.length || 0);
    });

    newSocket.on('quiz:finished', async () => {
      await loadFinalResults(quizData.id);
      setResultsSource('live');
      setShowErrorsDetail(false);
      setView('results');
      loadQuizHistory();
    });

    newSocket.on('error', ({ code, message }) => {
      if (code === 'ALREADY_CONNECTED') {
        setReconnectOffer({ quizId: quizData.id, message });
        setLoading(false);
        return;
      }
      setError(message || 'Ошибка подключения');
      setLoading(false);
    });

    newSocket.emit('student:join-quiz', {
      quizId: quizData.id,
      forceReconnect,
      studentId
    });
  };

  const connectToQuiz = (quizData, forceReconnect = false) => {
    pendingQuizRef.current = quizData;
    setQuiz(quizData);
    setError('');
    setFinishedInfo(null);

    const newSocket = io(SOCKET_URL, {
      auth: { initData: getTelegramInitData() },
    });
    newSocket.on('connect', () => {
      setupSocketListeners(newSocket, quizData, forceReconnect);
    });
    setSocket(newSocket);
  };

  const joinQuiz = async (forceReconnect = false) => {
    if (!accessCode.trim()) {
      setError('Введите код викторины');
      return;
    }
    setLoading(true);
    setError('');
    setFinishedInfo(null);
    setReconnectOffer(null);

    try {
      const response = await apiFetch(
        `${API_URL}/quiz/code/${accessCode.toUpperCase()}?studentId=${studentId}`
      );
      const data = await response.json();

      if (!response.ok) {
        if (data.code === 'FINISHED') {
          setFinishedInfo(data);
          setError(data.message);
        } else if (data.code === 'NO_ACCESS') {
          setError(data.message || 'У тебя нет доступа к этой викторине.');
        } else {
          setError(data.message || 'Викторина с таким кодом не найдена. Проверь код и попробуй ещё раз.');
        }
        setLoading(false);
        return;
      }

      connectToQuiz(data.quiz, forceReconnect);
      setParticipantCount(data.participantCount || 0);
    } catch (e) {
      console.error('Join quiz:', e);
      setError('Ошибка подключения');
      setLoading(false);
    }
  };

  const loadFinalResults = async (quizId) => {
    try {
      const res = await apiFetch(`${API_URL}/quiz/${quizId}/results`);
      if (!res.ok) return;
      const data = await res.json();
      const rankedParticipants = (data.participants || []).map((p) => {
        const score = parseFloat(p.totalScore) || 0;
        const rank = (data.participants || []).filter((other) => (parseFloat(other.totalScore) || 0) > score).length + 1;
        return { ...p, rank };
      });
      const me = rankedParticipants.find((p) => p.userId === studentId);
      setFinalResults({ quiz: data.quiz, me, participants: rankedParticipants });
      if (me) setMyScore(parseFloat(me.totalScore) || 0);
    } catch (e) {
      console.error('Load final results:', e);
    }
  };

  const openPastQuiz = async (quizId, source = 'history') => {
    setLoading(true);
    setShowErrorsDetail(false);
    await loadFinalResults(quizId);
    setResultsSource(source);
    setLoading(false);
    setView('results');
  };

  const backFromResults = () => {
    setFinalResults(null);
    setShowErrorsDetail(false);
    if (resultsSource === 'history') {
      setEnterTab('history');
      setView('enter');
      return;
    }
    if (resultsSource === 'live') {
      exitQuiz();
      return;
    }
    setView('enter');
  };

  useEffect(() => {
    if (view !== 'playing' || !currentQuestion?.id) return undefined;
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    return undefined;
  }, [view, currentQuestion?.id, questionIndex]);

  const submitAnswer = (answerIndex) => {
    if (answered || timeLeft <= 0 || !currentQuestion || !socket) return;
    haptic('medium');
    setSelectedAnswer(answerIndex);
    selectedAnswerRef.current = answerIndex;
    setAnswered(true);
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    const responseTime = Date.now() - (questionStartTime.current || Date.now());

    socket.emit('student:submit-answer', {
      quizId: quiz.id,
      questionId: currentQuestion.id,
      userId: studentId,
      selectedAnswer: answerIndex,
      responseTime
    });
  };

  const exitQuiz = () => {
    cleanupSocket();
    setView('enter');
    setAccessCode('');
    setQuiz(null);
    setCurrentQuestion(null);
    currentQuestionRef.current = null;
    setParticipants([]);
    setMyScore(0);
    setFinalResults(null);
    setAnswerFeedback(null);
    setFinishedInfo(null);
    setReconnectOffer(null);
    setError('');
    setResultsSource('live');
    setShowErrorsDetail(false);
    setEnterTab('join');
    setQuestionTransition(false);
  };

  const goToPractice = () => {
    const subjectId = finalResults?.quiz?.subjectId || quiz?.subjectId || quiz?.subject?.id;
    if (subjectId) requestPractice({ subjectId, mode: 'general' });
    exitQuiz();
  };

  const leaderboardEnabled = quiz?.showLeaderboardAfterQuestion !== false;
  const myRank = participants.findIndex((p) => p.userId === studentId) + 1;

  const renderHistoryList = (onItemClickSource) => (
    quizHistory.length === 0 ? (
      <p className="quiz-ui-empty">Ты ещё не участвовал в викторинах.</p>
    ) : (
      <ul className="quiz-ui-history-list quiz-ui-history-full">
        {quizHistory.map((item) => (
          <li key={item.quizId}>
            <button
              type="button"
              className="quiz-ui-history-item"
              onClick={() => item.quizStatus === 'finished' && openPastQuiz(item.quizId, onItemClickSource)}
              disabled={item.quizStatus !== 'finished' || loading}
            >
              <div className="quiz-ui-history-item__top">
                <span className="quiz-ui-history-item__title">
                  {formatQuizLine(item.subjectName, item.quizTitle, ':')}
                </span>
                <span className={`quiz-ui-badge quiz-ui-badge--${item.quizStatus === 'finished' ? 'done' : 'pending'}`}>
                  {quizStatusLabel(item.quizStatus)}
                </span>
              </div>
              <span className="quiz-ui-history-item__meta">{formatQuizDate(item.finishedAt || item.joinedAt)}</span>
              <span className="quiz-ui-history-item__meta">
                {formatScore(item.totalScore)} баллов · {item.correctAnswers}/{item.totalQuestions} правильных
                {item.rank ? ` · ${item.rank} место` : ''}
              </span>
            </button>
          </li>
        ))}
      </ul>
    )
  );

  // ========== ЛОББИ / ОЖИДАНИЕ ==========
  if (view === 'lobby') {
    return (
      <QuizShell className="quiz-ui-lobby" sessionLock>
        <div className="quiz-ui-lobby__pulse"><span>✓</span></div>
        <span className="quiz-ui__eyebrow">Комната ожидания</span>
        <h1 className="quiz-ui__title">{formatQuizLine(quiz?.subject?.name, quiz?.title, ':')}</h1>
        {quiz?.description && (
          <p className="quiz-ui-lobby__desc">{quiz.description}</p>
        )}
        <div className="quiz-ui-status-chip">Ты подключён</div>
        <div className="quiz-ui-info-grid">
          <div className="quiz-ui-info-row"><span>Ты подключён как</span><span>{studentName}</span></div>
          {quiz?.subject && (
            <div className="quiz-ui-info-row"><span>Предмет</span><span>{quiz.subject.icon} {quiz.subject.name}</span></div>
          )}
          <div className="quiz-ui-info-row"><span>Участников</span><span>{participantCount}</span></div>
        </div>
        <p className="quiz-ui-wait-text">Ждем запуска преподавателем…</p>
        <button type="button" className="quiz-ui-btn quiz-ui-btn--danger-outline" onClick={exitQuiz}>Выйти из викторины</button>
      </QuizShell>
    );
  }

  // ========== ЭКРАН ВОПРОСА ==========
  if (view === 'playing') {
    if (!currentQuestion) {
      return (
        <QuizShell>
          <div className="quiz-ui-loading">
            <div className="quiz-ui-spinner" />
            <p>Ждем следующий вопрос…</p>
          </div>
        </QuizShell>
      );
    }

    const timeLimit = currentQuestion.timeLimit || 1;
    const timeRatio = Math.max(0, Math.min(1, timeLeft / timeLimit));
    const showInstantFeedback = leaderboardEnabled && answerFeedback;
    const isUrgent = timeLeft <= 5;

    return (
      <QuizShell className={`quiz-ui-play${leaderboardEnabled ? ' quiz-ui-play--with-lb' : ''}${isUrgent ? ' quiz-ui-play--urgent' : ''}`} sessionLock>
        <div className="quiz-ui-aurora" aria-hidden="true">
          <span className="quiz-ui-aurora__blob quiz-ui-aurora__blob--1" />
          <span className="quiz-ui-aurora__blob quiz-ui-aurora__blob--2" />
          <span className="quiz-ui-aurora__blob quiz-ui-aurora__blob--3" />
        </div>
        <div className="quiz-ui-play-stack">
          {questionTransition && (
            <div className="quiz-ui-transition" aria-live="polite">
              <div className="quiz-ui-transition__spinner" />
              <span>Следующий вопрос…</span>
            </div>
          )}
          {leaderboardEnabled && (
            <MiniLeaderboardBar participants={participants} studentId={studentId} myRank={myRank} />
          )}
          <div className="quiz-ui-play-main">
            <header className="quiz-ui-play__header">
              <div className="quiz-ui-play__meta">
                <span className="quiz-ui-play__label">Вопрос {questionIndex + 1} из {totalQuestions}</span>
                <div className="quiz-ui-qnums">
                  {Array.from({ length: totalQuestions }, (_, i) => (
                    <span
                      key={i}
                      className={`quiz-ui-qnum${i < questionIndex ? ' is-done' : ''}${i === questionIndex ? ' is-current' : ''}`}
                    >
                      {i + 1}
                    </span>
                  ))}
                </div>
              </div>
              <div
                className={`quiz-ui-timer-ring ${isUrgent ? 'is-urgent' : ''}`}
                style={{ '--qz-ring': timeRatio }}
                role="timer"
                aria-label={`Осталось ${timeLeft} секунд`}
              >
                <svg viewBox="0 0 44 44" aria-hidden="true">
                  <circle className="quiz-ui-timer-ring__track" cx="22" cy="22" r="19" />
                  <circle className="quiz-ui-timer-ring__progress" cx="22" cy="22" r="19" />
                </svg>
                <span className="quiz-ui-timer-ring__value">{timeLeft}</span>
              </div>
              <ScoreChip score={myScore} />
            </header>

            <div className="quiz-ui-card quiz-ui-question-card">
              <h2>{currentQuestion.questionText}</h2>
              <div className="quiz-ui-points-badge">Баллы за вопрос: до {currentQuestion.points || 1}</div>

              <div className={`quiz-ui-answers${answered ? ' is-answered' : ''}`} key={currentQuestion.id}>
                {currentQuestion.options.map((option, index) => {
                  const letter = String.fromCharCode(65 + index);
                  const isMine = selectedAnswer === index;
                  const isLocked = answered || timeLeft <= 0;
                  // Подсветка появляется только после ответа сервера (showInstantFeedback).
                  const revealed = showInstantFeedback;
                  const isCorrectOption = revealed && index === answerFeedback.correctAnswer;
                  const isWrongMine = revealed && isMine && !answerFeedback.isCorrect;
                  // До прихода фидбэка свой выбор просто отмечен «галочкой принято».
                  const isPicked = isMine && answered && !revealed;
                  // чужие варианты после раскрытия — приглушаем (но не правильный/свой)
                  const isMuted = revealed && !isCorrectOption && !isWrongMine;
                  const cls = [
                    'quiz-ui-answer',
                    `quiz-ui-answer--${index}`,
                    isPicked ? 'is-picked' : '',
                    isCorrectOption ? 'is-correct' : '',
                    isWrongMine ? 'is-wrong' : '',
                    isMuted ? 'is-muted' : ''
                  ].filter(Boolean).join(' ');
                  return (
                    <button
                      key={`${currentQuestion.id}-${index}`}
                      type="button"
                      className={cls}
                      onClick={() => submitAnswer(index)}
                      onPointerUp={(e) => e.currentTarget.blur()}
                      disabled={isLocked}
                      aria-disabled={isLocked}
                    >
                      <span className="quiz-ui-answer__mark">{letter}</span>
                      <span className="quiz-ui-answer__text">{option}</span>
                      {isCorrectOption && <span className="quiz-ui-answer__icon">✓</span>}
                      {isWrongMine && <span className="quiz-ui-answer__icon">✗</span>}
                      {isPicked && <span className="quiz-ui-answer__check">✓</span>}
                    </button>
                  );
                })}
              </div>

              {showInstantFeedback && (
                <div className={`quiz-ui-toast ${answerFeedback.isCorrect ? 'quiz-ui-toast--correct' : 'quiz-ui-toast--wrong'}`}>
                  {answerFeedback.isCorrect ? (
                    <>✓ Верно! +{formatScore(answerFeedback.earned)} баллов</>
                  ) : (
                    <>✗ Неверно. 0 баллов</>
                  )}
                </div>
              )}
              {answered && !timedOut && !leaderboardEnabled && (
                <div className="quiz-ui-toast quiz-ui-toast--wait">
                  <div className="quiz-ui-dots"><span /><span /><span /></div>
                  Ответ принят. Ждем остальных участников.
                </div>
              )}
              {timedOut && selectedAnswer == null && (
                <div className="quiz-ui-toast quiz-ui-toast--timeout">
                  Время вышло. Ответ не засчитан.
                </div>
              )}
            </div>
          </div>
        </div>
      </QuizShell>
    );
  }

  // ========== ФИНАЛ / ПРОСМОТР ПРОШЛОЙ ВИКТОРИНЫ (§8) ==========
  if (view === 'results' && finalResults?.me) {
    const { me, quiz: q } = finalResults;
    const wrongAnswers = (me.answers || []).filter((a) => !a.isCorrect);
    const answeredCount = (me.answers || []).length;
    const unanswered = Math.max(0, (me.totalQuestions || 0) - answeredCount);
    const wrongCount = wrongAnswers.length;
    const accuracy = me.accuracy ?? (me.totalQuestions ? Math.round((me.correctAnswers / me.totalQuestions) * 100) : 0);
    const showReview = q?.showQuestionReview !== false;
    const showExplanations = q?.showExplanations !== false;
    const practiceSubjectId = q?.subjectId || q?.subject?.id;
    const allQuestions = q?.questions || [];

    const getAnswerForQuestion = (questionId) => (me.answers || []).find((a) => a.questionId === questionId);

    const rankStatus = getQuizRankStatus({
      rank: me.rank,
      total: finalResults.participants?.length || 0,
      accuracy,
      correct: me.correctAnswers || 0,
      totalQuestions: me.totalQuestions || 0
    });

    return (
      <QuizShell>
        <div className={`quiz-ui-final__hero quiz-ui-final__hero--${rankStatus.tier}`}>
          <span className="quiz-ui-final__spark quiz-ui-final__spark--left" aria-hidden="true" />
          <span className="quiz-ui-final__spark quiz-ui-final__spark--right" aria-hidden="true" />
          <div className="quiz-ui-achievement">
            <div className="quiz-ui-achievement__rarity">{rankStatus.rarity}</div>
            <div className="quiz-ui-achievement__badge">
              <span className="quiz-ui-achievement__emoji">{rankStatus.emoji}</span>
            </div>
            <div className="quiz-ui-achievement__title">{rankStatus.title}</div>
            <div className="quiz-ui-achievement__subtitle">{rankStatus.subtitle}</div>
            <div className="quiz-ui-achievement__meta">
              <span>{rankStatus.placeLine}</span>
              <span>{rankStatus.accuracyLine}</span>
            </div>
          </div>
          <p className="quiz-ui-final__quiz-name">{formatQuizLine(q?.subject?.name, q?.title, ':')}</p>
          <div className="quiz-ui-final__score">
            {animatedScore}
            <span>баллов</span>
          </div>
        </div>

        <div className="quiz-ui-stats-bento">
          <div className="quiz-ui-stat"><span>Правильных</span><strong>{me.correctAnswers}/{me.totalQuestions}</strong></div>
          <div className="quiz-ui-stat"><span>Неправильных</span><strong>{wrongCount}</strong></div>
          <div className="quiz-ui-stat"><span>Место</span><strong>{me.rank || '—'}/{finalResults.participants?.length || '—'}</strong></div>
          <div className="quiz-ui-stat"><span>Точность</span><strong>{accuracy}%</strong></div>
          <div className="quiz-ui-stat"><span>Без ответа</span><strong>{unanswered}</strong></div>
        </div>

        {showReview && allQuestions.length > 0 && (
          <div className="quiz-ui-panel">
            <h3>Результаты по вопросам</h3>
            <ul className="quiz-ui-review-list">
              {allQuestions.map((question) => {
                const ans = getAnswerForQuestion(question.id);
                const status = !ans ? 'Без ответа' : (ans.isCorrect ? 'Верно' : 'Неверно');
                return (
                  <li key={question.id} className={ans?.isCorrect ? 'is-correct' : (ans ? 'is-wrong' : 'is-empty')}>
                    <span>Вопрос {(question.order ?? 0) + 1}. {question.questionText?.slice(0, 70)}</span>
                    <strong>{status}</strong>
                    {showExplanations && question.explanation && (
                      <p className="quiz-ui-expl">{question.explanation}</p>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {wrongAnswers.length > 0 && (
          <div className="quiz-ui-panel">
            <div className="quiz-ui-panel-head">
              <h3>Ошибки</h3>
              <button type="button" className="quiz-ui-link-btn" onClick={() => setShowErrorsDetail((v) => !v)}>
                {showErrorsDetail ? 'Скрыть' : 'Разобрать ошибки'}
              </button>
            </div>
            <ul className="quiz-ui-errors-list">
              {wrongAnswers.map((a) => (
                <li key={a.id}>
                  Вопрос {(a.question?.order ?? 0) + 1}. {a.question?.questionText?.slice(0, 80)}
                </li>
              ))}
            </ul>
            {showErrorsDetail && showExplanations && (
              <div className="quiz-ui-error-detail">
                {wrongAnswers.map((a) => {
                  const qText = a.question?.questionText || 'Вопрос';
                  const options = a.question?.options || [];
                  const myAns = a.selectedAnswer != null ? options[a.selectedAnswer] : '—';
                  const correctAns = options[a.question?.correctAnswer] ?? '—';
                  return (
                    <div key={`detail-${a.id}`} className="quiz-ui-error-card">
                      <strong>Вопрос {(a.question?.order ?? 0) + 1}. {qText}</strong>
                      <p><span>Твой ответ:</span> {myAns}</p>
                      <p><span>Правильный ответ:</span> {correctAns}</p>
                      {a.question?.explanation && (
                        <p><span>Объяснение:</span> {a.question.explanation}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <div className="quiz-ui-btn-row">
          {practiceSubjectId && resultsSource === 'live' && (
            <button type="button" className="quiz-ui-btn quiz-ui-btn--secondary" onClick={goToPractice}>
              Перейти к практике по теме
            </button>
          )}
          <button type="button" className="quiz-ui-btn quiz-ui-btn--primary" onClick={backFromResults}>
            {resultsSource === 'history' ? 'Назад к истории' : 'Вернуться в викторины'}
          </button>
        </div>
      </QuizShell>
    );
  }

  // ========== ЭКРАН ВХОДА + ИСТОРИЯ (вкладки) ==========
  if (view === 'enter') {
    return (
      <QuizShell className="quiz-ui-enter-root">
        <div className="quiz-enter-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={enterTab === 'join'}
            className={`quiz-enter-tab ${enterTab === 'join' ? 'is-active' : ''}`}
            onClick={() => setEnterTab('join')}
          >
            Подключиться
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={enterTab === 'history'}
            className={`quiz-enter-tab ${enterTab === 'history' ? 'is-active' : ''}`}
            onClick={() => setEnterTab('history')}
          >
            Мои викторины
          </button>
        </div>

        {enterTab === 'join' ? (
          <div className="quiz-enter-classic">
            <div className="quiz-icon-big">🎯</div>
            <h1 className="quiz-title">Викторины</h1>
            <p className="quiz-subtitle">Введите код, который дал преподаватель на уроке.</p>
            <div className="code-input-container">
              <input
                type="text"
                className="code-input"
                placeholder="КОД"
                value={accessCode}
                onChange={(e) => { setAccessCode(e.target.value.toUpperCase()); setError(''); setFinishedInfo(null); }}
                maxLength={10}
                onKeyDown={(e) => e.key === 'Enter' && joinQuiz()}
              />
            </div>
            {error && <div className="error-message">{error}</div>}
            {finishedInfo?.participated && (
              <button type="button" className="join-button secondary" onClick={() => openPastQuiz(finishedInfo.quizId, 'enter')}>
                Посмотреть результат
              </button>
            )}
            {reconnectOffer && (
              <div className="reconnect-block">
                <p>{reconnectOffer.message}</p>
                <button type="button" className="join-button secondary" onClick={() => joinQuiz(true)}>Переподключиться</button>
              </div>
            )}
            <button type="button" className="join-button" onClick={() => joinQuiz()} disabled={loading || !accessCode.trim()}>
              {loading ? 'Подключение…' : 'Подключиться'}
            </button>
          </div>
        ) : (
          <div className="quiz-enter-history-tab">
            {renderHistoryList('history')}
          </div>
        )}
      </QuizShell>
    );
  }

  return null;
}

export default Quiz;