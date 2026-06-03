import React, { useState, useEffect, useRef, useCallback } from 'react';
import './Homework.css';
import { useData } from './DataContext';
import { apiFetch } from './api';

const API_URL = 'https://educa-production-a98e.up.railway.app/api';

function MatchingWire({ pairs, rightOrder, connections, colors, onChange }) {
  const containerRef = React.useRef(null);
  const [activeLeft, setActiveLeft] = React.useState(null);
  const [mousePos, setMousePos] = React.useState({ x: 0, y: 0 });
  const [dragging, setDragging] = React.useState(false);
  const [svgH, setSvgH] = React.useState(300);

  React.useEffect(() => {
    if (containerRef.current) setSvgH(containerRef.current.offsetHeight);
  });

  const getDotPos = (side, idx) => {
    if (!containerRef.current) return { x: 0, y: 0 };
    const root = containerRef.current;
    const rb = root.getBoundingClientRect();
    const el = root.querySelector(`.mw-${side}[data-idx="${idx}"]`);
    if (!el) return { x: 0, y: 0 };
    const eb = el.getBoundingClientRect();
    return {
      x: side === 'left' ? eb.right - rb.left : eb.left - rb.left,
      y: eb.top - rb.top + eb.height / 2
    };
  };

  const onLeftDown = (e, li) => {
    e.preventDefault();
    setActiveLeft(li);
    setDragging(true);
    const rb = containerRef.current.getBoundingClientRect();
    setMousePos({ x: e.clientX - rb.left, y: e.clientY - rb.top });
  };

  React.useEffect(() => {
    if (!dragging) return;
    const onMove = (e) => {
      if (!containerRef.current) return;
      const rb = containerRef.current.getBoundingClientRect();
      setMousePos({ x: e.clientX - rb.left, y: e.clientY - rb.top });
    };
    const onUp = (e) => {
      if (activeLeft !== null) {
        const els = document.elementsFromPoint(e.clientX, e.clientY);
        const rb = els.find(el => el.classList && el.classList.contains('mw-right'));
        if (rb) {
          const ri = +rb.dataset.idx;
          // Один к одному: снимаем старую связь с этим правым блоком
          const newConns = { ...connections };
          Object.keys(newConns).forEach(k => { if (newConns[k] === ri) delete newConns[k]; });
          newConns[activeLeft] = ri;
          onChange(newConns);
        }
      }
      setDragging(false);
      setActiveLeft(null);
    };
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    return () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
    };
  }, [dragging, activeLeft, connections, onChange]);

  return (
    <div ref={containerRef} style={{ position: 'relative', userSelect: 'none', touchAction: 'none', padding: '8px 0' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start' }}>
        {/* Левая колонка */}
        <div style={{ width: '44%', display: 'flex', flexDirection: 'column', gap: 10, zIndex: 2, position: 'relative' }}>
          {pairs.map((p, li) => {
            const isActive = dragging && activeLeft === li;
            const isConnected = connections[li] !== undefined;
            const color = colors[li % colors.length];
            return (
              <div
                key={li}
                className="mw-left"
                data-idx={li}
                onPointerDown={(e) => onLeftDown(e, li)}
                style={{
                  padding: '10px 12px',
                  borderRadius: '8px 0 0 8px',
                  border: `2px solid ${isActive ? color : isConnected ? color + 'aa' : 'var(--color-border-primary)'}`,
                  borderRight: 'none',
                  background: isActive ? color + '20' : isConnected ? color + '12' : 'var(--color-background-secondary)',
                  fontSize: 14,
                  cursor: 'grab',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                  minHeight: 44,
                  transition: 'border-color 0.15s, background 0.15s',
                }}
              >
                <span style={{ color: 'var(--color-text-primary)' }}>{p.left}</span>
                <span style={{
                  width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
                  background: isConnected || isActive ? color : 'var(--color-text-tertiary)',
                  transition: 'background 0.15s',
                }} />
              </div>
            );
          })}
        </div>

        {/* SVG проводов */}
        <svg style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: svgH, pointerEvents: 'none', overflow: 'visible', zIndex: 1 }} height={svgH}>
          {Object.entries(connections).map(([li, ri]) => {
            li = +li;
            const from = getDotPos('left', li);
            const to = getDotPos('right', ri);
            const cx = (from.x + to.x) / 2;
            const color = colors[li % colors.length];
            return (
              <g key={`c${li}`}>
                <path d={`M${from.x},${from.y} C${cx},${from.y} ${cx},${to.y} ${to.x},${to.y}`} stroke={color} strokeWidth="2.5" fill="none" opacity="0.9" />
                <circle cx={from.x} cy={from.y} r="4" fill={color} />
                <circle cx={to.x} cy={to.y} r="4" fill={color} />
              </g>
            );
          })}
          {dragging && activeLeft !== null && (() => {
            const from = getDotPos('left', activeLeft);
            const color = colors[activeLeft % colors.length];
            const cx = (from.x + mousePos.x) / 2;
            return <path d={`M${from.x},${from.y} C${cx},${from.y} ${cx},${mousePos.y} ${mousePos.x},${mousePos.y}`} stroke={color} strokeWidth="2.5" fill="none" opacity="0.5" strokeDasharray="6 3" />;
          })()}
        </svg>

        {/* Правая колонка */}
        <div style={{ width: '44%', marginLeft: 'auto', display: 'flex', flexDirection: 'column', gap: 10, zIndex: 2, position: 'relative' }}>
          {rightOrder.map(ri => {
            const li = Object.keys(connections).find(k => +connections[k] === ri);
            const isConnected = li !== undefined;
            const color = isConnected ? colors[+li % colors.length] : null;
            return (
              <div
                key={ri}
                className="mw-right"
                data-idx={ri}
                style={{
                  padding: '10px 12px',
                  borderRadius: '0 8px 8px 0',
                  border: `2px solid ${isConnected ? color + 'aa' : 'var(--color-border-primary)'}`,
                  borderLeft: 'none',
                  background: isConnected ? color + '12' : 'var(--color-background-secondary)',
                  fontSize: 14,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  minHeight: 44,
                  cursor: 'crosshair',
                  transition: 'border-color 0.15s, background 0.15s',
                }}
              >
                <span style={{
                  width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
                  background: isConnected ? color : 'var(--color-text-tertiary)',
                  transition: 'background 0.15s',
                }} />
                <span style={{ color: 'var(--color-text-primary)' }}>{pairs[ri].right}</span>
              </div>
            );
          })}
        </div>
      </div>
      <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 8, marginBottom: 0 }}>
        Зажмите левый блок и проведите к правому чтобы соединить
      </p>
    </div>
  );
}

function StudentHomework({ studentId }) {
  const { homeworks, subjects, refreshAfterHomework, loading: contextLoading } = useData();

  const [selectedSubject, setSelectedSubject] = useState(null);
  const [selectedHomework, setSelectedHomework] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({});
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [showResult, setShowResult] = useState(false);
  const [result, setResult] = useState(null);
  const [startTime, setStartTime] = useState(null);

  const [drag, setDrag] = useState({
    active: false,
    questionIndex: null,
    fromIndex: null,
    startY: 0,
    offsetY: 0,
    items: [],
    overIndex: null,
  });

  const orderingListRefs = useRef({});
  const initialOrderRef = useRef({});
  const matchingStateRef = useRef({}); // { [questionIndex]: { connections, rightOrder } }

  useEffect(() => {
    if (subjects.length === 1 && !selectedSubject) {
      setSelectedSubject(subjects[0]);
    }
  }, [subjects, selectedSubject]);

  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (!tg) return;
    // Свайпы всегда заблокированы глобально, closingConfirmation управляется в StudentApp
    tg.disableVerticalSwipes?.();
    if (selectedHomework && !showResult) tg.expand?.();
  }, [selectedHomework, showResult]);

  const backToSubjects = () => setSelectedSubject(null);

  // ОПТИМИЗАЦИЯ: используем вопросы из DataContext, не делаем лишний fetch
  const startHomework = async (homework) => {
    if (homework.questions && homework.questions.length > 0) {
      setSelectedHomework(homework);
      setQuestions(homework.questions);
      initialOrderRef.current = {};
      matchingStateRef.current = {};
      setCurrentQuestionIndex(0);
      setAnswers({});
      setShowResult(false);
      setStartTime(Date.now());
      return;
    }
    // Запасной вариант — загрузить с сервера если вопросов нет в кэше
    try {
      const response = await apiFetch(`${API_URL}/homework/${homework.id}`);
      const data = await response.json();
      if (!data.homework) {
        alert('Ошибка: домашка не найдена');
        return;
      }
      setSelectedHomework(data.homework);
      setQuestions(data.homework.questions || []);
      initialOrderRef.current = {};
      matchingStateRef.current = {};
      setCurrentQuestionIndex(0);
      setAnswers({});
      setShowResult(false);
      setStartTime(Date.now());
    } catch (error) {
      console.error('Error loading homework:', error);
      alert('Ошибка загрузки домашки');
    }
  };

  const handleAnswer = (questionIndex, answer) => {
    setAnswers(prev => ({ ...prev, [questionIndex]: answer }));
  };

  const closeHomework = (wasSubmitted = false) => {
    setSelectedHomework(null);
    setQuestions([]);
    setAnswers({});
    setShowResult(false);
    setResult(null);
    // Обновляем данные только если реально сдали домашку
    if (wasSubmitted) refreshAfterHomework();
  };

  const handlePointerDown = useCallback((e, questionIndex, itemIndex, items) => {
    e.preventDefault();
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    setDrag({
      active: true,
      questionIndex,
      fromIndex: itemIndex,
      startY: clientY,
      offsetY: 0,
      items: [...items],
      overIndex: itemIndex,
    });
  }, []);

  const handlePointerMove = useCallback((e) => {
    if (!drag.active) return;
    e.preventDefault();
    let clientX, clientY;
    if (e.touches) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }
    const offsetY = clientY - drag.startY;
    const elementUnder = document.elementFromPoint(clientX, clientY);
    if (elementUnder) {
      const orderItem = elementUnder.closest('.ordering-item');
      if (orderItem) {
        const indexAttr = orderItem.getAttribute('data-index');
        if (indexAttr !== null) {
          const overIndex = parseInt(indexAttr, 10);
          if (!isNaN(overIndex) && overIndex !== drag.overIndex) {
            setDrag(prev => ({ ...prev, offsetY, overIndex }));
            return;
          }
        }
      }
    }
    setDrag(prev => ({ ...prev, offsetY }));
  }, [drag.active, drag.startY, drag.overIndex]);

  const handlePointerUp = useCallback(() => {
    if (!drag.active) return;
    const { questionIndex, fromIndex, overIndex, items } = drag;
    if (fromIndex !== overIndex && overIndex !== null) {
      const newItems = [...items];
      [newItems[fromIndex], newItems[overIndex]] = [newItems[overIndex], newItems[fromIndex]];
      handleAnswer(questionIndex, newItems);
    }
    setDrag({
      active: false,
      questionIndex: null,
      fromIndex: null,
      startY: 0,
      offsetY: 0,
      items: [],
      overIndex: null,
    });
  }, [drag.active, drag.fromIndex, drag.overIndex, drag.items, drag.questionIndex]);

  useEffect(() => {
    if (!drag.active) return;
    const onMove = (e) => handlePointerMove(e);
    const onUp = () => handlePointerUp();
    document.addEventListener('pointermove', onMove, { passive: false });
    document.addEventListener('pointerup', onUp);
    document.addEventListener('pointercancel', onUp);
    return () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.removeEventListener('pointercancel', onUp);
    };
  }, [drag.active, handlePointerMove, handlePointerUp]);

  // Проверка ответа локально — те же правила что на бэкенде
  const checkAnswerLocal = (question, userAnswer) => {
    const correct = question.correctAnswer;
    switch (question.questionType) {
      case 'single_choice': return userAnswer === correct;
      case 'true_false': return userAnswer === correct;
      case 'multiple_choice': {
        if (!Array.isArray(userAnswer) || !Array.isArray(correct)) return false;
        if (userAnswer.length !== correct.length) return false;
        return [...userAnswer].sort().every((v, i) => v === [...correct].sort()[i]);
      }
      case 'short_answer':
      case 'text_input': {
        if (!userAnswer) return false;
        const norm = userAnswer.toString().toLowerCase().trim();
        return Array.isArray(correct)
          ? correct.some(a => a.toLowerCase().trim() === norm)
          : correct?.toLowerCase?.().trim() === norm;
      }
      case 'numeric':
      case 'number_input': {
        if (typeof userAnswer !== 'number') return false;
        const tol = correct?.tolerance || 0;
        return Math.abs(userAnswer - (correct?.value ?? correct)) <= tol;
      }
      case 'matching': {
        // userAnswer может быть {connections, pairs} или [{left,right}]
        const userPairs = userAnswer?.pairs || userAnswer || [];
        if (!Array.isArray(userPairs)) return false;
        return userPairs.every((pair, i) => {
          const cp = correct[i];
          return cp && pair.left === cp.left && pair.right === cp.right;
        });
      }
      case 'ordering': {
        if (!Array.isArray(userAnswer)) return false;
        return userAnswer.every((item, i) => item === correct[i]);
      }
      case 'fill_blanks':
      case 'fill_in_blank': {
        if (!Array.isArray(userAnswer)) return false;
        return userAnswer.every((ans, i) => {
          const norm = ans?.toLowerCase?.().trim() || '';
          return Array.isArray(correct[i])
            ? correct[i].some(a => a.toLowerCase().trim() === norm)
            : correct[i]?.toLowerCase?.().trim() === norm;
        });
      }
      default: return false;
    }
  };

  const submitHomework = () => {
    const timeSpent = Math.floor((Date.now() - startTime) / 1000);
    const answersArray = Object.values(answers).map(ans => {
      // matching хранится как {connections, pairs} — отправляем только pairs
      if (ans && ans.pairs) return ans.pairs;
      return ans;
    });

    // Считаем результат локально — мгновенно
    let totalScore = 0;
    let maxScore = 0;
    questions.forEach((question, index) => {
      const rawAnswer = Object.values(answers)[index];
      // matching хранит {connections, pairs} — берём pairs для проверки
      const userAnswer = rawAnswer?.pairs || rawAnswer;
      const isCorrect = checkAnswerLocal(question, userAnswer);
      maxScore += question.points || 1;
      if (isCorrect) totalScore += question.points || 1;
    });

    const percentage = maxScore > 0 ? Math.round(totalScore / maxScore * 100) : 0;

    // Показываем результат МГНОВЕННО
    setResult({
      totalScore,
      maxScore,
      percentage,
      correctAnswers: questions.filter((q, i) => checkAnswerLocal(q, answersArray[i])).length,
      attemptsUsed: 1,
      maxAttempts: selectedHomework.maxAttempts
    });
    setShowResult(true);

    // Отправляем на бэк фоново — не блокируем UI
    apiFetch(`${API_URL}/homework/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        homeworkId: selectedHomework.id,
        studentId,
        answers: answersArray,
        timeSpent,
      }),
    }).then(res => res.json()).then(data => {
      // Обновляем попытки если бэк вернул данные
      if (data.attemptsUsed !== undefined) {
        setResult(prev => ({ ...prev, attemptsUsed: data.attemptsUsed, maxAttempts: data.maxAttempts }));
      }
      // Фоново обновляем список домашек чтобы при переходе уже было актуально
      refreshAfterHomework();
    }).catch(e => console.error('Error submitting homework:', e));
  };

  const renderQuestion = (question, index) => {
    switch (question.questionType) {
      case 'single_choice': {
        const options = question.options || [];
        return (
          <div className="question-options">
            {options.map((option, optIndex) => (
              <button
                key={optIndex}
                className={`option-btn ${answers[index] === optIndex ? 'selected' : ''}`}
                onClick={() => handleAnswer(index, optIndex)}
              >
                <span className="option-letter">{String.fromCharCode(65 + optIndex)}</span>
                <span className="option-text">{option}</span>
              </button>
            ))}
          </div>
        );
      }

      case 'multiple_choice': {
        const options = question.options || [];
        const selected = answers[index] || [];
        return (
          <div className="question-options">
            {options.map((option, optIndex) => (
              <button
                key={optIndex}
                className={`option-btn ${selected.includes(optIndex) ? 'selected' : ''}`}
                onClick={() => {
                  const current = answers[index] || [];
                  const newAnswer = current.includes(optIndex)
                    ? current.filter(i => i !== optIndex)
                    : [...current, optIndex];
                  handleAnswer(index, newAnswer);
                }}
              >
                <input type="checkbox" checked={selected.includes(optIndex)} readOnly />
                <span className="option-text">{option}</span>
              </button>
            ))}
          </div>
        );
      }

      case 'short_answer':
      case 'text_input':
        return (
          <div className="short-answer-input">
            <input
              type="text"
              placeholder="Введите ответ"
              value={answers[index] || ''}
              onChange={(e) => handleAnswer(index, e.target.value)}
            />
          </div>
        );

      case 'numeric':
      case 'number_input':
        return (
          <div className="numeric-input">
            <input
              type="number"
              step="any"
              placeholder="Введите число"
              value={answers[index] || ''}
              onChange={(e) => handleAnswer(index, parseFloat(e.target.value))}
            />
          </div>
        );

      case 'matching': {
        const pairs = question.correctAnswer || question.options || [];

        // Инициализируем состояние для этого вопроса
        if (!matchingStateRef.current[index]) {
          matchingStateRef.current[index] = {
            rightOrder: [...pairs.map((_, i) => i)].sort(() => Math.random() - 0.5),
            connections: {} // { leftIdx: rightIdx }
          };
        }
        const mState = matchingStateRef.current[index];
        const connections = answers[index]?.connections || mState.connections;
        const rightOrder = mState.rightOrder;

        const WIRE_COLORS = ['#534AB7','#1D9E75','#D85A30','#993556','#185FA5'];

        const updateConnections = (newConns) => {
          matchingStateRef.current[index].connections = newConns;
          // Конвертируем в формат [{left, right}] для бэкенда
          const result = pairs.map((p, li) => ({
            left: p.left,
            right: newConns[li] !== undefined ? pairs[newConns[li]].right : ''
          }));
          handleAnswer(index, { connections: newConns, pairs: result });
        };

        return (
          <MatchingWire
            key={`matching-${index}`}
            pairs={pairs}
            rightOrder={rightOrder}
            connections={connections}
            colors={WIRE_COLORS}
            onChange={updateConnections}
          />
        );
      }

      case 'ordering': {
        if (!answers[index] && !initialOrderRef.current[index]) {
          initialOrderRef.current[index] = [...(question.correctAnswer || [])].sort(() => Math.random() - 0.5);
        }
        const items = answers[index] || initialOrderRef.current[index] || question.correctAnswer || [];
        const isActiveDrag = drag.active && drag.questionIndex === index;
        return (
          <div className="ordering-container">
            <p className="ordering-hint">Зажмите элемент и перетащите, чтобы изменить порядок:</p>
            <div
              className="ordering-list"
              ref={(el) => (orderingListRefs.current[index] = el)}
              style={{ touchAction: 'none' }}
            >
              {items.map((item, itemIndex) => {
                const isDragging = isActiveDrag && drag.fromIndex === itemIndex;
                const isOver = isActiveDrag && drag.overIndex === itemIndex && drag.fromIndex !== itemIndex;
                const style = isDragging
                  ? { transform: `translateY(${drag.offsetY}px)`, zIndex: 100, opacity: 0.8, pointerEvents: 'none' }
                  : {};
                return (
                  <div
                    key={`${item}-${itemIndex}`}
                    className={`ordering-item${isDragging ? ' dragging' : ''}${isOver ? ' drag-over' : ''}`}
                    style={style}
                    data-index={itemIndex}
                    onPointerDown={(e) => handlePointerDown(e, index, itemIndex, items)}
                  >
                    <span className="drag-handle">☰</span>
                    <span className="item-number">{itemIndex + 1}</span>
                    <span className="item-text">{item}</span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      }

      case 'fill_blanks':
      case 'fill_in_blank': {
        const text = question.questionText || '';
        const blanksCount = (text.match(/___/g) || []).length || question.options?.blanks?.length || 1;
        const blankAnswers = answers[index] || Array(blanksCount).fill('');
        const parts = text.split('___');
        return (
          <div className="fill-blanks-container">
            <div className="blanks-text">
              {parts.map((part, partIndex) => (
                <React.Fragment key={partIndex}>
                  <span>{part}</span>
                  {partIndex < parts.length - 1 && (
                    <input
                      type="text"
                      className="blank-input"
                      value={blankAnswers[partIndex] || ''}
                      onChange={(e) => {
                        const newBlanks = [...blankAnswers];
                        newBlanks[partIndex] = e.target.value;
                        handleAnswer(index, newBlanks);
                      }}
                      placeholder={`Пропуск ${partIndex + 1}`}
                    />
                  )}
                </React.Fragment>
              ))}
            </div>
          </div>
        );
      }

      case 'true_false':
        return (
          <div className="true-false-options">
            <button className={`tf-btn ${answers[index] === true ? 'selected' : ''}`} onClick={() => handleAnswer(index, true)}>
              ✓ Верно
            </button>
            <button className={`tf-btn ${answers[index] === false ? 'selected' : ''}`} onClick={() => handleAnswer(index, false)}>
              ✗ Неверно
            </button>
          </div>
        );

      default:
        return <p>Неизвестный тип вопроса: {question.questionType}</p>;
    }
  };

  if (contextLoading.homework && homeworks.length === 0) {
    return (
      <div className="section">
        <h1 className="section-title">Домашние задания</h1>
        <p style={{ textAlign: 'center', color: '#6b7280', padding: '40px' }}>Загрузка...</p>
      </div>
    );
  }

  if (showResult && result) {
    const percentage = result.percentage || Math.round((result.totalScore / result.maxScore) * 100);

    const renderAnswerReview = (question, index) => {
      const userAnswer = answers[index];
      const correct = question.correctAnswer;
      const isOk = checkAnswerLocal(question, userAnswer);

      switch (question.questionType) {
        case 'single_choice': {
          const options = question.options || [];
          return (
            <div className="result-answers">
              {options.map((option, oIndex) => {
                const isUser = userAnswer === oIndex;
                const isCorrectOpt = oIndex === correct;
                if (!isCorrectOpt && !isUser) return null;
                return (
                  <div key={oIndex} className={`result-answer ${isCorrectOpt ? 'correct-answer' : 'wrong-answer'}`}>
                    <span className="answer-letter">{String.fromCharCode(65 + oIndex)}</span>
                    <span className="answer-text">{option}</span>
                    <span className={isCorrectOpt ? 'correct-mark' : 'wrong-mark'}>{isCorrectOpt ? '✓' : '✗'}</span>
                  </div>
                );
              })}
            </div>
          );
        }
        case 'multiple_choice': {
          const options = question.options || [];
          const userArr = userAnswer || [];
          const correctArr = correct || [];
          return (
            <div className="result-answers">
              {options.map((option, oIndex) => {
                const isUser = userArr.includes(oIndex);
                const isCorrectOpt = correctArr.includes(oIndex);
                if (!isCorrectOpt && !isUser) return null;
                return (
                  <div key={oIndex} className={`result-answer ${isCorrectOpt ? 'correct-answer' : 'wrong-answer'}`}>
                    <span className="answer-letter">{isUser ? '☑' : '☐'}</span>
                    <span className="answer-text">{option}</span>
                    <span className={isCorrectOpt ? 'correct-mark' : 'wrong-mark'}>{isCorrectOpt ? '✓' : '✗'}</span>
                  </div>
                );
              })}
            </div>
          );
        }
        case 'true_false': {
          const userLabel = userAnswer === true ? '✓ Верно' : userAnswer === false ? '✗ Неверно' : '—';
          const correctLabel = correct === true ? '✓ Верно' : '✗ Неверно';
          return (
            <div className="result-answers">
              {isOk ? (
                <div className="result-answer correct-answer">
                  <span className="answer-text">Ваш ответ: <strong>{userLabel}</strong></span>
                  <span className="correct-mark">✓</span>
                </div>
              ) : (
                <>
                  <div className="result-answer wrong-answer">
                    <span className="answer-text">Ваш ответ: <strong>{userLabel}</strong></span>
                    <span className="wrong-mark">✗</span>
                  </div>
                  <div className="result-answer correct-answer">
                    <span className="answer-text">Правильно: <strong>{correctLabel}</strong></span>
                    <span className="correct-mark">✓</span>
                  </div>
                </>
              )}
            </div>
          );
        }
        case 'short_answer':
        case 'text_input': {
          return (
            <div className="result-answers">
              {isOk ? (
                <div className="result-answer correct-answer">
                  <span className="answer-text">Ваш ответ: <strong>{userAnswer || '—'}</strong></span>
                  <span className="correct-mark">✓</span>
                </div>
              ) : (
                <>
                  <div className="result-answer wrong-answer">
                    <span className="answer-text">Ваш ответ: <strong>{userAnswer || '—'}</strong></span>
                    <span className="wrong-mark">✗</span>
                  </div>
                  <div className="result-answer correct-answer">
                    <span className="answer-text">Правильно: <strong>{Array.isArray(correct) ? correct.join(' / ') : correct}</strong></span>
                    <span className="correct-mark">✓</span>
                  </div>
                </>
              )}
            </div>
          );
        }
        case 'numeric':
        case 'number_input': {
          const correctVal = correct?.value ?? correct;
          const tol = correct?.tolerance;
          return (
            <div className="result-answers">
              {isOk ? (
                <div className="result-answer correct-answer">
                  <span className="answer-text">Ваш ответ: <strong>{userAnswer ?? '—'}</strong></span>
                  <span className="correct-mark">✓</span>
                </div>
              ) : (
                <>
                  <div className="result-answer wrong-answer">
                    <span className="answer-text">Ваш ответ: <strong>{userAnswer ?? '—'}</strong></span>
                    <span className="wrong-mark">✗</span>
                  </div>
                  <div className="result-answer correct-answer">
                    <span className="answer-text">Правильно: <strong>{correctVal}</strong>{tol ? ` ±${tol}` : ''}</span>
                    <span className="correct-mark">✓</span>
                  </div>
                </>
              )}
            </div>
          );
        }
        case 'matching': {
          const pairs = correct || [];
          const userPairs = userAnswer?.pairs || userAnswer || [];
          return (
            <div className="result-answers">
              {pairs.map((pair, pi) => {
                const userPair = userPairs[pi] || {};
                const ok = userPair.right === pair.right;
                return (
                  <div key={pi} className={`result-answer ${ok ? 'correct-answer' : 'wrong-answer'}`}>
                    <span className="answer-text" style={{flex:1}}>
                      <strong>{pair.left}</strong>
                      {ok
                        ? <> → {pair.right}</>
                        : <> → <span style={{color:'#ef4444', textDecoration:'line-through'}}>{userPair.right || '—'}</span> → <span style={{color:'#10b981'}}>{pair.right}</span></>
                      }
                    </span>
                    <span className={ok ? 'correct-mark' : 'wrong-mark'}>{ok ? '✓' : '✗'}</span>
                  </div>
                );
              })}
            </div>
          );
        }
        case 'ordering': {
          const correctOrder = correct || [];
          const userOrder = userAnswer || [];
          return (
            <div className="result-answers">
              {isOk ? (
                <div className="result-answer correct-answer">
                  <span className="answer-text">Порядок верный: <strong>{userOrder.join(' → ')}</strong></span>
                  <span className="correct-mark">✓</span>
                </div>
              ) : (
                <>
                  <div className="result-answer wrong-answer">
                    <span className="answer-text">Ваш порядок: <strong>{userOrder.join(' → ')}</strong></span>
                    <span className="wrong-mark">✗</span>
                  </div>
                  <div className="result-answer correct-answer">
                    <span className="answer-text">Правильно: <strong>{correctOrder.join(' → ')}</strong></span>
                    <span className="correct-mark">✓</span>
                  </div>
                </>
              )}
            </div>
          );
        }
        case 'fill_blanks':
        case 'fill_in_blank': {
          const text = question.questionText || '';
          const parts = text.split('___');
          const userBlanks = userAnswer || [];
          const correctBlanks = correct || [];
          return (
            <div className="result-answers">
              {parts.length > 1 ? (
                parts.map((part, pi) => {
                  if (pi >= parts.length - 1) return null;
                  const userBlank = userBlanks[pi] || '—';
                  const correctBlankArr = correctBlanks[pi];
                  const correctBlank = Array.isArray(correctBlankArr) ? correctBlankArr[0] : correctBlankArr;
                  const norm = (userBlanks[pi] || '').toLowerCase().trim();
                  const blankOk = Array.isArray(correctBlankArr)
                    ? correctBlankArr.some(a => a.toLowerCase().trim() === norm)
                    : correctBlank?.toLowerCase?.().trim() === norm;
                  return blankOk ? (
                    <div key={pi} className="result-answer correct-answer">
                      <span className="answer-text">Пропуск {pi + 1}: <strong>{userBlank}</strong></span>
                      <span className="correct-mark">✓</span>
                    </div>
                  ) : (
                    <div key={pi} className="result-answer wrong-answer">
                      <span className="answer-text">
                        Пропуск {pi + 1}: <span style={{color:'#ef4444', textDecoration:'line-through'}}>{userBlank}</span>
                        {' → '}<span style={{color:'#10b981'}}>{Array.isArray(correctBlankArr) ? correctBlankArr.join(' / ') : correctBlank}</span>
                      </span>
                      <span className="wrong-mark">✗</span>
                    </div>
                  );
                })
              ) : (
                isOk ? (
                  <div className="result-answer correct-answer">
                    <span className="answer-text">Ваш ответ: <strong>{userBlanks.join(', ') || '—'}</strong></span>
                    <span className="correct-mark">✓</span>
                  </div>
                ) : (
                  <>
                    <div className="result-answer wrong-answer">
                      <span className="answer-text">Ваш ответ: <strong>{userBlanks.join(', ') || '—'}</strong></span>
                      <span className="wrong-mark">✗</span>
                    </div>
                    <div className="result-answer correct-answer">
                      <span className="answer-text">Правильно: <strong>{Array.isArray(correctBlanks[0]) ? correctBlanks[0].join(' / ') : correctBlanks[0]}</strong></span>
                      <span className="correct-mark">✓</span>
                    </div>
                  </>
                )
              )}
            </div>
          );
        }
        default: return null;
      }
    };

    return (
      <div className="section homework-result">
        <div className="result-header">
          <h1>Результат</h1>
          <p className="result-homework-title">{selectedHomework?.title}</p>
        </div>
        <div className="result-score-display">
          <div className="score-circle">
            <div className="score-value">{percentage}%</div>
            <div className="score-label">{result.totalScore} из {result.maxScore} баллов</div>
          </div>
        </div>
        <div className="result-message">
          {percentage >= 90 && <p className="excellent">🎉 Отлично! Превосходная работа!</p>}
          {percentage >= 70 && percentage < 90 && <p className="good">👍 Хорошо! Продолжай в том же духе!</p>}
          {percentage >= 50 && percentage < 70 && <p className="average">📖 Неплохо, но есть куда расти!</p>}
          {percentage < 50 && <p className="needs-work">💪 Стоит повторить материал и попробовать снова!</p>}
        </div>
        <div className="result-details">
          <h3>Разбор ответов</h3>
          {questions.map((question, qIndex) => {
            const isCorrect = checkAnswerLocal(question, answers[qIndex]);
            return (
              <div key={question.id} className={`result-question ${isCorrect ? 'correct' : 'incorrect'}`}>
                <div className="result-question-header">
                  <span className="result-question-number">Вопрос {qIndex + 1}</span>
                  <span className="hw-q-points">{question.points} б.</span>
                </div>
                <p className="result-question-text">{question.questionText}</p>
                {renderAnswerReview(question, qIndex)}
              </div>
            );
          })}
        </div>
        <div className="result-actions">
          {result.maxAttempts && result.attemptsUsed >= result.maxAttempts ? (
            <p className="attempts-exhausted">Вы использовали все попытки</p>
          ) : (
            <button className="primary-button" onClick={() => startHomework(selectedHomework)}>
              Попробовать еще раз
            </button>
          )}
          <button className="secondary-button" onClick={() => closeHomework(true)}>
            К списку домашек
          </button>
        </div>
      </div>
    );
  }

  if (selectedHomework && questions.length > 0) {
    const currentQuestion = questions[currentQuestionIndex];
    const progress = ((currentQuestionIndex + 1) / questions.length) * 100;
    const isLastQuestion = currentQuestionIndex === questions.length - 1;
    const canProceed = answers[currentQuestionIndex] !== undefined;

    return (
      <div className="section homework-mode">
        <div className="homework-header">
          <button className="back-button" onClick={closeHomework}>← Назад</button>
          <div className="homework-info">
            <h2>{selectedHomework.title}</h2>
            <p>Вопрос {currentQuestionIndex + 1} из {questions.length}</p>
          </div>
        </div>
        <div className="progress-bar">
          <div className="progress-fill" style={{ width: `${progress}%` }}></div>
        </div>
        <div className="question-container">
          <div className="question-header">
            <span className="question-number">Вопрос {currentQuestionIndex + 1}</span>
            <span className="question-points">{currentQuestion.points} баллов</span>
          </div>
          <h3 className="question-text">{currentQuestion.questionText}</h3>
          {renderQuestion(currentQuestion, currentQuestionIndex)}
          <div className="navigation-buttons">
            {currentQuestionIndex > 0 && (
              <button className="secondary-button" onClick={() => setCurrentQuestionIndex(currentQuestionIndex - 1)}>
                ← Назад
              </button>
            )}
            {!isLastQuestion ? (
              <button className="primary-button" disabled={!canProceed} onClick={() => setCurrentQuestionIndex(currentQuestionIndex + 1)}>
                Далее →
              </button>
            ) : (
              <button className="primary-button submit" disabled={!canProceed} onClick={submitHomework}>
                Отправить домашку
              </button>
            )}
          </div>
        </div>
        <div className="questions-nav">
          {questions.map((_, i) => (
            <button
              key={i}
              className={`q-nav-btn ${i === currentQuestionIndex ? 'active' : ''} ${answers[i] !== undefined ? 'answered' : ''}`}
              onClick={() => setCurrentQuestionIndex(i)}
            >
              {i + 1}
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (!selectedSubject && subjects.length > 1) {
    return (
      <div className="section">
        <h1 className="section-title">📝 Домашние задания</h1>
        <p style={{ marginBottom: '16px', color: '#6b7280', fontSize: '14px' }}>Выберите предмет:</p>
        <div className="subjects-grid">
          {subjects.map(subject => {
            const subjectHomeworks = homeworks.filter(hw => hw.subjectId === subject.id);
            const unfinishedCount = subjectHomeworks.filter(hw => !hw.stats || hw.stats.bestScore === 0).length;
            return (
              <button key={subject.id} className="subject-card" onClick={() => setSelectedSubject(subject)}>
                <span className="subject-icon-big">{subject.icon}</span>
                <h3>{subject.name}</h3>
                <p>{subjectHomeworks.length} заданий</p>
                {unfinishedCount > 0 && <span className="badge-warning">❗ {unfinishedCount}</span>}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  const filteredHomeworks = selectedSubject
    ? homeworks.filter(hw => hw.subjectId === selectedSubject.id)
    : homeworks;

  return (
    <div className="section">
      <div className={`page-header ${subjects.length === 1 ? 'single-subject' : ''}`}>
        {subjects.length > 1 && selectedSubject && (
          <button className="back-button-header" onClick={backToSubjects}>← Назад</button>
        )}
        <div className="page-header-title">
          <span className="page-header-icon">{selectedSubject?.icon || '📝'}</span>
          <span className="page-header-text">{selectedSubject ? selectedSubject.name : 'Домашка'}</span>
        </div>
      </div>
      <p style={{ margin: '12px 0 20px', color: '#6b7280', fontSize: '14px' }}>
        📝 Выполняйте домашние задания в указанные сроки
      </p>
      {filteredHomeworks.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📚</div>
          <p className="empty-text">Пока нет доступных домашних заданий</p>
        </div>
      ) : (
        <div className="homeworks-grid">
          {filteredHomeworks.map(homework => {
            const now = new Date();
            const closeDate = new Date(homework.closeDate);
            const minutesLeft = Math.floor((closeDate - now) / (1000 * 60));
            const hoursLeft = Math.floor(minutesLeft / 60);
            const isExpired = minutesLeft <= 0;
            const maxScore = (homework.questions || []).reduce((sum, q) => sum + (q.points || 0), 0);
            const usedAttempts = homework.stats?.attempts || homework.stats?.attemptsUsed || 0;
            const attemptsLeft = homework.maxAttempts ? homework.maxAttempts - usedAttempts : null;
            const attemptsExhausted = homework.maxAttempts && usedAttempts >= homework.maxAttempts;

            return (
              <div key={homework.id} className="homework-card">
                <div className="card-header">
                  <span className="subject-icon">{homework.subject?.icon}</span>
                  <div>
                    <h3 className="card-title">{homework.title}</h3>
                    <p className="subject-name">{homework.subject?.name}</p>
                  </div>
                </div>
                {homework.description && <p className="card-description">{homework.description}</p>}
                <div className="card-info">
                  <div className="info-item"><span className="info-icon">📚</span>{(homework.questions || []).length} вопросов</div>
                  <div className="info-item"><span className="info-icon">⭐</span>Макс. {maxScore} баллов</div>
                  {homework.maxAttempts && (
                    <div className="info-item">
                      <span className="info-icon">🔄</span>
                      {homework.stats ? `Осталось попыток: ${attemptsLeft} из ${homework.maxAttempts}` : `До ${homework.maxAttempts} попыток`}
                    </div>
                  )}
                </div>
                {homework.stats && homework.stats.bestScore > 0 && (
                  <div className="homework-stats">
                    <div className="stats-header">
                      <span>Ваш лучший результат:</span>
                      <span className="stats-score">{homework.stats.bestScore}/{homework.stats.maxScore}</span>
                    </div>
                    <div className="stats-bar">
                      <div className="stats-fill" style={{ width: `${(homework.stats.bestScore / homework.stats.maxScore) * 100}%` }}></div>
                    </div>
                    <p className="attempts-count">Попыток использовано: {usedAttempts}{homework.maxAttempts && ` из ${homework.maxAttempts}`}</p>
                  </div>
                )}
                <div className="deadline-info">
                  {minutesLeft > 24 * 60 ? (
                    <span className="deadline-ok">⏰ До сдачи: {Math.floor(hoursLeft / 24)} дн.</span>
                  ) : minutesLeft > 60 ? (
                    <span className="deadline-warning">⏰ До сдачи: {hoursLeft} ч.</span>
                  ) : minutesLeft > 0 ? (
                    <span className="deadline-warning">⏰ До сдачи: {minutesLeft} мин.</span>
                  ) : (
                    <span className="deadline-urgent">⏰ Срок истёк!</span>
                  )}
                </div>
                <button
                  className="primary-button"
                  onClick={() => startHomework(homework)}
                  disabled={isExpired || attemptsExhausted}
                >
                  {attemptsExhausted ? 'Попытки исчерпаны' : homework.stats?.bestScore > 0 ? 'Пройти заново' : 'Начать выполнение'}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default StudentHomework;