import React, { useState, useEffect, useRef, useCallback } from 'react';
import './Homework.css';
import { useData } from './DataContext';

const API_URL = 'https://educa-production-a98e.up.railway.app/api';

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

  useEffect(() => {
    if (subjects.length === 1 && !selectedSubject) {
      setSelectedSubject(subjects[0]);
    }
  }, [subjects, selectedSubject]);

  useEffect(() => {
    if (selectedHomework && !showResult) {
      if (window.Telegram?.WebApp) {
        window.Telegram.WebApp.expand();
        window.Telegram.WebApp.disableVerticalSwipes?.();
        window.Telegram.WebApp.enableClosingConfirmation?.();
      }
    }
  }, [selectedHomework, showResult]);

  const backToSubjects = () => setSelectedSubject(null);

  // ОПТИМИЗАЦИЯ: используем вопросы из DataContext, не делаем лишний fetch
  const startHomework = async (homework) => {
    if (homework.questions && homework.questions.length > 0) {
      setSelectedHomework(homework);
      setQuestions(homework.questions);
      initialOrderRef.current = {};
      setCurrentQuestionIndex(0);
      setAnswers({});
      setShowResult(false);
      setStartTime(Date.now());
      return;
    }
    // Запасной вариант — загрузить с сервера если вопросов нет в кэше
    try {
      const response = await fetch(`${API_URL}/homework/${homework.id}`);
      const data = await response.json();
      if (!data.homework) {
        alert('Ошибка: домашка не найдена');
        return;
      }
      setSelectedHomework(data.homework);
      setQuestions(data.homework.questions || []);
      initialOrderRef.current = {};
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

  const closeHomework = () => {
    if (window.Telegram?.WebApp) {
      window.Telegram.WebApp.enableVerticalSwipes?.();
      window.Telegram.WebApp.disableClosingConfirmation?.();
    }
    setSelectedHomework(null);
    setQuestions([]);
    setAnswers({});
    setShowResult(false);
    setResult(null);
    refreshAfterHomework();
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

  const submitHomework = async () => {
    const timeSpent = Math.floor((Date.now() - startTime) / 1000);
    try {
      const response = await fetch(`${API_URL}/homework/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          homeworkId: selectedHomework.id,
          studentId,
          answers: Object.values(answers),
          timeSpent,
        }),
      });
      const data = await response.json();
      if (response.ok) {
        setResult(data);
        setShowResult(true);
      } else {
        alert(data.message || 'Ошибка отправки');
      }
    } catch (error) {
      console.error('Error submitting homework:', error);
      alert('Ошибка отправки');
    }
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
        const currentAnswers = answers[index] || pairs.map(p => ({ left: p.left, right: '' }));
        const rightOptions = pairs.map(p => p.right).sort(() => Math.random() - 0.5);
        return (
          <div className="matching-container">
            {currentAnswers.map((pair, pairIndex) => (
              <div key={pairIndex} className="matching-pair">
                <div className="matching-left">{pair.left}</div>
                <select
                  className="matching-select"
                  value={pair.right || ''}
                  onChange={(e) => {
                    const newPairs = [...currentAnswers];
                    newPairs[pairIndex] = { ...pair, right: e.target.value };
                    handleAnswer(index, newPairs);
                  }}
                >
                  <option value="">Выберите...</option>
                  {rightOptions.map((right, idx) => (
                    <option key={idx} value={right}>{right}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
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
          if (!Array.isArray(userAnswer)) return false;
          return userAnswer.every((pair, i) => {
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
          const userPairs = userAnswer || [];
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
          <button className="secondary-button" onClick={closeHomework}>
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
            const hoursLeft = Math.floor((closeDate - now) / (1000 * 60 * 60));
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
                  {hoursLeft > 24 ? (
                    <span className="deadline-ok">⏰ До сдачи: {Math.floor(hoursLeft / 24)} дн.</span>
                  ) : hoursLeft > 0 ? (
                    <span className="deadline-warning">⏰ До сдачи: {hoursLeft} ч.</span>
                  ) : (
                    <span className="deadline-urgent">⏰ Срок истёк!</span>
                  )}
                </div>
                <button
                  className="primary-button"
                  onClick={() => startHomework(homework)}
                  disabled={hoursLeft <= 0 || attemptsExhausted}
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