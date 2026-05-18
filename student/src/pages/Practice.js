import React, { useState, useEffect, useRef } from 'react';
import './Practice.css';
import { useData } from './DataContext';

const API_URL = 'https://educa-production-a98e.up.railway.app/api';

function Practice({ studentId }) {
  // Используем данные из контекста
  const { practiceTopics, subjects, refreshAfterPractice, loading: contextLoading } = useData();
  
  const [selectedSubject, setSelectedSubject] = useState('all');
  
  const [activePractice, setActivePractice] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [userAnswers, setUserAnswers] = useState([]);
  const [showResult, setShowResult] = useState(false);
  const [practiceResult, setPracticeResult] = useState(null);
  
  const [holdingAnswer, setHoldingAnswer] = useState(null);
  const [holdProgress, setHoldProgress] = useState(0);
  const [showAnswerResult, setShowAnswerResult] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [showExplanationHint, setShowExplanationHint] = useState(false);
  
  const holdTimerRef = useRef(null);
  const progressIntervalRef = useRef(null);
  const autoNextTimerRef = useRef(null);

  const HOLD_DURATION = 1000;
const PROGRESS_INTERVAL = 20;  // Уменьшить интервал для плавности
const RESULT_DURATION = 1200;

  // Очистка таймеров при размонтировании
  useEffect(() => {
    return () => {
      if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
      if (autoNextTimerRef.current) clearTimeout(autoNextTimerRef.current);
    };
  }, []);

  const startPractice = async (topic) => {
    try {
      const response = await fetch(`${API_URL}/practice/questions/${topic.id}`);
      const data = await response.json();
      
      const activeQuestions = data.questions.filter(q => q.isActive);
      
      if (activeQuestions.length === 0) {
        alert('В этой практике пока нет вопросов');
        return;
      }

      setActivePractice(topic);
      setQuestions(activeQuestions);
      setCurrentQuestionIndex(0);
      setSelectedAnswer(null);
      setUserAnswers([]);
      setShowResult(false);
      setShowAnswerResult(false);
      setShowExplanationHint(false);
    } catch (error) {
      console.error('Error loading questions:', error);
      alert('Ошибка загрузки вопросов');
    }
  };

  const handleAnswerPress = (answerIndex) => {
    if (showAnswerResult || selectedAnswer !== null) return;

    setHoldingAnswer(answerIndex);
    setHoldProgress(0);

    progressIntervalRef.current = setInterval(() => {
      setHoldProgress(prev => {
        const newProgress = prev + (PROGRESS_INTERVAL / HOLD_DURATION) * 100;
        return newProgress >= 100 ? 100 : newProgress;
      });
    }, PROGRESS_INTERVAL);

    holdTimerRef.current = setTimeout(() => {
      submitAnswer(answerIndex);
    }, HOLD_DURATION);
  };

  const handleAnswerRelease = () => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
    setHoldingAnswer(null);
    setHoldProgress(0);
  };

  const submitAnswer = async (answerIndex) => {
    const currentQuestion = questions[currentQuestionIndex];
    const correct = answerIndex === currentQuestion.correctAnswer;

    setSelectedAnswer(answerIndex);
    setIsCorrect(correct);
    setShowAnswerResult(true);
    setShowExplanationHint(false);

    if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
    if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    setHoldingAnswer(null);
    setHoldProgress(0);

    const newAnswers = [...userAnswers, {
      questionId: currentQuestion.id,
      selectedAnswer: answerIndex,
      correctAnswer: currentQuestion.correctAnswer,
      isCorrect: correct
    }];
    setUserAnswers(newAnswers);

    try {
      await fetch(`${API_URL}/practice/attempts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: studentId,
          topicId: activePractice.id,
          questionId: currentQuestion.id,
          subjectId: activePractice.subjectId,
          selectedAnswer: answerIndex,
          isCorrect: correct,
          timeSpent: 0
        })
      });
    } catch (error) {
      console.error('Error saving attempt:', error);
    }

    autoNextTimerRef.current = setTimeout(() => {
      if (currentQuestionIndex < questions.length - 1) {
        setCurrentQuestionIndex(currentQuestionIndex + 1);
        setSelectedAnswer(null);
        setShowAnswerResult(false);
        setIsCorrect(false);
      } else {
        finishPractice(newAnswers);
      }
    }, RESULT_DURATION);
  };

  const finishPractice = (answers) => {
    const correctCount = answers.filter(a => a.isCorrect).length;
    const totalCount = answers.length;
    const scorePercentage = Math.round((correctCount / totalCount) * 100);

    setPracticeResult({
      correctCount,
      totalCount,
      scorePercentage,
      answers
    });
    setShowResult(true);
  };

  const closePractice = () => {
    if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
    if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    if (autoNextTimerRef.current) clearTimeout(autoNextTimerRef.current);

    setActivePractice(null);
    setQuestions([]);
    setCurrentQuestionIndex(0);
    setSelectedAnswer(null);
    setUserAnswers([]);
    setShowResult(false);
    setPracticeResult(null);
    setShowAnswerResult(false);
    setShowExplanationHint(false);
    setHoldingAnswer(null);
    setHoldProgress(0);
    
    // Обновляем данные через контекст
    refreshAfterPractice();
  };

  const filteredTopics = selectedSubject === 'all'
    ? practiceTopics
    : practiceTopics.filter(topic => topic.subjectId === selectedSubject);

  if (contextLoading.practice && practiceTopics.length === 0) {
    return (
      <div className="section">
        <h1 className="section-title">Практика</h1>
        <p style={{ textAlign: 'center', color: '#6b7280', padding: '40px' }}>
          Загрузка практики...
        </p>
      </div>
    );
  }

  if (activePractice && !showResult) {
    const currentQuestion = questions[currentQuestionIndex];
    const progress = ((currentQuestionIndex + 1) / questions.length) * 100;

    return (
      <div className="section practice-mode">
        <div className="practice-header">
          <button className="back-button" onClick={closePractice}>
            ← Назад к списку
          </button>
          <div className="practice-info">
            <h2>{activePractice.name}</h2>
            <p>Вопрос {currentQuestionIndex + 1} из {questions.length}</p>
          </div>
        </div>

        <div className="progress-bar">
          <div className="progress-fill" style={{ width: `${progress}%` }}></div>
        </div>

        <div className="question-container">
          <div className="question-header">
            {currentQuestion.difficulty && (
              <span className={`difficulty-badge ${currentQuestion.difficulty}`}>
                {currentQuestion.difficulty === 'easy' && '🟢 Легкий'}
                {currentQuestion.difficulty === 'medium' && '🟡 Средний'}
                {currentQuestion.difficulty === 'hard' && '🔴 Сложный'}
              </span>
            )}
            {currentQuestion.explanation && !showAnswerResult && (
              <button 
                className="hint-button"
                onClick={() => setShowExplanationHint(!showExplanationHint)}
              >
                💡 {showExplanationHint ? 'Скрыть подсказку' : 'Подсказка'}
              </button>
            )}
          </div>

          <h3 className="question-text">{currentQuestion.questionText}</h3>

          {showExplanationHint && currentQuestion.explanation && !showAnswerResult && (
            <div className="hint-box">
              <div className="hint-title">💡 Подсказка:</div>
              <div className="hint-text">{currentQuestion.explanation}</div>
            </div>
          )}

          <div className="answers-list">
            {currentQuestion.options.map((option, index) => {
              const isSelected = selectedAnswer === index;
              const isHolding = holdingAnswer === index;
              const showCorrect = showAnswerResult && index === currentQuestion.correctAnswer;
              const showWrong = showAnswerResult && isSelected && !isCorrect;

              return (
                <div
                  key={index}
                  className={`answer-option ${isHolding ? 'holding' : ''} ${showCorrect ? 'correct' : ''} ${showWrong ? 'wrong' : ''}`}
                  onMouseDown={() => handleAnswerPress(index)}
                  onMouseUp={handleAnswerRelease}
                  onMouseLeave={handleAnswerRelease}
                  onTouchStart={(e) => {
                    e.preventDefault();
                    handleAnswerPress(index);
                  }}
                  onTouchEnd={(e) => {
                    e.preventDefault();
                    handleAnswerRelease();
                  }}
                  style={{
                    pointerEvents: showAnswerResult ? 'none' : 'auto',
                    position: 'relative',
                    overflow: 'hidden'
                  }}
                >
                  {isHolding && (
                    <div 
                      className="hold-progress" 
                      style={{ 
                        width: `${holdProgress}%`,
                        position: 'absolute',
                        left: 0,
                        top: 0,
                        height: '100%',
                        background: 'linear-gradient(90deg, rgba(59, 130, 246, 0.15) 0%, rgba(30, 64, 175, 0.3) 100%)',
                        transition: 'width 0.02s linear',
                        pointerEvents: 'none',
                        zIndex: 0
                      }}
                    />
                  )}
                  <span className="answer-letter" style={{ position: 'relative', zIndex: 1 }}>
                    {String.fromCharCode(65 + index)}
                  </span>
                  <span className="answer-text" style={{ position: 'relative', zIndex: 1 }}>
                    {option}
                  </span>
                  {showCorrect && <span className="answer-icon correct-icon" style={{ position: 'relative', zIndex: 1 }}>✓</span>}
                  {showWrong && <span className="answer-icon wrong-icon" style={{ position: 'relative', zIndex: 1 }}>✗</span>}
                </div>
              );
            })}
          </div>

          {showAnswerResult && (
            <div className={`answer-result-box ${isCorrect ? 'correct-result' : 'wrong-result'}`}>
              <div className="result-icon">
                {isCorrect ? '✅' : '❌'}
              </div>
              <div className="result-text">
                {isCorrect ? 'Правильно!' : 'Неправильно'}
              </div>
            </div>
          )}

          {!showAnswerResult && (
            <div className="hold-hint">
              💡 Зажмите ответ чтобы подтвердить
            </div>
          )}
        </div>
      </div>
    );
  }

  if (showResult && practiceResult) {
    return (
      <div className="section practice-result">
        <div className="result-header">
          <h1>Результаты практики</h1>
          <p className="result-topic">{activePractice.name}</p>
        </div>

        <div className="result-score">
          <div className="score-circle">
            <div className="score-number">{practiceResult.scorePercentage}%</div>
            <div className="score-label">
              {practiceResult.correctCount} из {practiceResult.totalCount} правильно
            </div>
          </div>
        </div>

        <div className="result-details">
          <h3>Разбор ответов</h3>
          {questions.map((question, qIndex) => {
            const userAnswer = practiceResult.answers[qIndex];
            const isCorrect = userAnswer.isCorrect;

            return (
              <div key={question.id} className={`result-question ${isCorrect ? 'correct' : 'incorrect'}`}>
                <div className="result-question-header">
                  <span className="result-question-number">Вопрос {qIndex + 1}</span>
                  <span className={`result-badge ${isCorrect ? 'correct' : 'incorrect'}`}>
                    {isCorrect ? '✓ Правильно' : '✗ Неправильно'}
                  </span>
                </div>

                <p className="result-question-text">{question.questionText}</p>

                <div className="result-answers">
                  {question.options.map((option, oIndex) => {
                    const isUserAnswer = oIndex === userAnswer.selectedAnswer;
                    const isCorrectAnswer = oIndex === question.correctAnswer;

                    return (
                      <div 
                        key={oIndex}
                        className={`result-answer ${
                          isCorrectAnswer ? 'correct-answer' : ''
                        } ${
                          isUserAnswer && !isCorrect ? 'wrong-answer' : ''
                        }`}
                      >
                        <span className="answer-letter">{String.fromCharCode(65 + oIndex)}</span>
                        <span className="answer-text">{option}</span>
                        {isCorrectAnswer && <span className="correct-mark">✓</span>}
                        {isUserAnswer && !isCorrect && <span className="wrong-mark">✗</span>}
                      </div>
                    );
                  })}
                </div>

                {question.explanation && (
                  <div className="result-explanation">
                    <strong>💡 Объяснение:</strong> {question.explanation}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="result-actions">
          <button className="primary-button" onClick={() => startPractice(activePractice)}>
            Пройти заново
          </button>
          <button className="secondary-button" onClick={closePractice}>
            К списку практик
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="section">
      <h1 className="section-title">Практика</h1>
      
      <p style={{ marginBottom: '20px', color: '#6b7280', fontSize: '14px' }}>
        💪 Тренируйся в свободное время и улучшай свои навыки!
      </p>

      {subjects.length > 1 && (
        <div className="subject-filters">
          <button
            className={`filter-button ${selectedSubject === 'all' ? 'active' : ''}`}
            onClick={() => setSelectedSubject('all')}
          >
            <span>Все предметы</span>
          </button>
          {subjects.map(subject => (
            <button
              key={subject.id}
              className={`filter-button ${selectedSubject === subject.id ? 'active' : ''}`}
              onClick={() => setSelectedSubject(subject.id)}
            >
              <span className="filter-icon">{subject.icon}</span>
              <span>{subject.name}</span>
            </button>
          ))}
        </div>
      )}

      {filteredTopics.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📚</div>
          <p className="empty-text">
            {selectedSubject === 'all'
              ? 'Пока нет доступных заданий для практики.'
              : 'Нет заданий по этому предмету.'
            }
          </p>
        </div>
      ) : (
        <div className="practice-grid">
          {filteredTopics.map(topic => (
            <div key={topic.id} className="card practice-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ fontSize: '32px' }}>{topic.subject.icon}</span>
                  <div>
                    <h3 className="card-title">{topic.name}</h3>
                    <p style={{ fontSize: '12px', color: '#6b7280', margin: 0 }}>
                      {topic.subject.name}
                    </p>
                  </div>
                </div>
              </div>
              <p className="card-description">
                {topic.description || 'Попрактикуйся в этой теме'}
              </p>
              <p style={{ fontSize: '13px', color: '#9ca3af', marginTop: '8px' }}>
                📚 Вопросов: {topic.questions?.length || 0}
              </p>
              
              {topic.stats && topic.stats.total > 0 && (
                <div style={{
                  marginTop: '12px',
                  padding: '12px',
                  background: '#f9fafb',
                  borderRadius: '8px',
                  fontSize: '13px'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <span style={{ color: '#6b7280' }}>Ваш прогресс:</span>
                    <span style={{ fontWeight: '600', color: '#1f2937' }}>
                      {topic.stats.correct}/{topic.stats.total}
                    </span>
                  </div>
                  <div style={{
                    height: '6px',
                    background: '#e5e7eb',
                    borderRadius: '3px',
                    overflow: 'hidden'
                  }}>
                    <div style={{
                      height: '100%',
                      width: `${topic.stats.successRate}%`,
                      background: topic.stats.successRate >= 70 ? '#10b981' : topic.stats.successRate >= 50 ? '#f59e0b' : '#ef4444',
                      transition: 'width 0.3s'
                    }}></div>
                  </div>
                  <div style={{ marginTop: '6px', color: '#6b7280', fontSize: '12px' }}>
                    Точность: {topic.stats.successRate}%
                  </div>
                </div>
              )}
              
              <button 
                className="primary-button"
                onClick={() => startPractice(topic)}
                disabled={!topic.questions || topic.questions.length === 0}
              >
                {topic.stats && topic.stats.total > 0 ? 'Пройти заново' : 'Начать практику'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default Practice;