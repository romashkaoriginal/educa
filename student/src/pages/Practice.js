import React, { useState, useEffect, useRef } from 'react';
import './Practice.css';
import { useData } from './DataContext';

const API_URL = 'https://educa-production-a98e.up.railway.app/api';

function Practice({ studentId }) {
  // Используем данные из контекста
  const { practiceTopics, subjects, refreshAfterPractice, loading: contextLoading } = useData();
  
  const [selectedSubject, setSelectedSubject] = useState(null); // null = экран выбора предмета
  
  const [activePractice, setActivePractice] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [userAnswers, setUserAnswers] = useState([]);
  const [showResult, setShowResult] = useState(false);
  const [practiceResult, setPracticeResult] = useState(null);
  
  const [answered, setAnswered] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [showExplanationHint, setShowExplanationHint] = useState(false);
  
  const autoNextTimerRef = useRef(null);

  const RESULT_DURATION = 1500; // 1.5 секунды показ результата

  // Автоматический выбор предмета если он один
  useEffect(() => {
    if (subjects.length === 1 && !selectedSubject) {
      setSelectedSubject(subjects[0]);
    }
  }, [subjects, selectedSubject]);

  // Очистка таймера при размонтировании
  useEffect(() => {
    return () => {
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
      setAnswered(false);
      setShowExplanationHint(false);
    } catch (error) {
      console.error('Error loading questions:', error);
      alert('Ошибка загрузки вопросов');
    }
  };

  const submitAnswer = async (answerIndex) => {
    if (answered) return; // Предотвращаем повторный клик

    const currentQuestion = questions[currentQuestionIndex];
    const correct = answerIndex === currentQuestion.correctAnswer;

    setSelectedAnswer(answerIndex);
    setAnswered(true);
    setIsCorrect(correct);
    setShowExplanationHint(false);

    const newAnswers = [...userAnswers, {
      questionId: currentQuestion.id,
      selectedAnswer: answerIndex,
      correctAnswer: currentQuestion.correctAnswer,
      isCorrect: correct
    }];
    setUserAnswers(newAnswers);

    // Сохраняем попытку
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

    // Автопереход через 1.5 секунды
    autoNextTimerRef.current = setTimeout(() => {
      if (currentQuestionIndex < questions.length - 1) {
        setCurrentQuestionIndex(currentQuestionIndex + 1);
        setSelectedAnswer(null);
        setAnswered(false);
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
    if (autoNextTimerRef.current) clearTimeout(autoNextTimerRef.current);

    setActivePractice(null);
    setQuestions([]);
    setCurrentQuestionIndex(0);
    setSelectedAnswer(null);
    setUserAnswers([]);
    setShowResult(false);
    setPracticeResult(null);
    setAnswered(false);
    setShowExplanationHint(false);
    
    // Обновляем данные через контекст
    refreshAfterPractice();
  };

  const backToSubjects = () => {
    setSelectedSubject(null);
  };

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

  // ========== ЭКРАН ПРОХОЖДЕНИЯ ==========
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
            {currentQuestion.explanation && !answered && (
              <button 
                className="hint-button"
                onClick={() => setShowExplanationHint(!showExplanationHint)}
              >
                💡 {showExplanationHint ? 'Скрыть подсказку' : 'Подсказка'}
              </button>
            )}
          </div>

          <h3 className="question-text">{currentQuestion.questionText}</h3>

          {showExplanationHint && currentQuestion.explanation && !answered && (
            <div className="hint-box">
              <div className="hint-title">💡 Подсказка:</div>
              <div className="hint-text">{currentQuestion.explanation}</div>
            </div>
          )}

          <div className="answers-list">
            {currentQuestion.options.map((option, index) => {
              const isSelected = selectedAnswer === index;
              const showCorrect = answered && index === currentQuestion.correctAnswer;
              const showWrong = answered && isSelected && !isCorrect;

              return (
                <button
                  key={index}
                  className={`answer-option ${isSelected ? 'selected' : ''} ${showCorrect ? 'correct' : ''} ${showWrong ? 'wrong' : ''}`}
                  onClick={() => submitAnswer(index)}
                  disabled={answered}
                >
                  <span className="answer-letter">
                    {String.fromCharCode(65 + index)}
                  </span>
                  <span className="answer-text">
                    {option}
                  </span>
                  {showCorrect && <span className="answer-icon correct-icon">✓</span>}
                  {showWrong && <span className="answer-icon wrong-icon">✗</span>}
                </button>
              );
            })}
          </div>

          {answered && (
  <>
    <div className={`answer-result-box ${isCorrect ? 'correct-result' : 'wrong-result'}`}>
      <div className="result-icon">
        {isCorrect ? '✅' : '❌'}
      </div>
      <div className="result-text">
        {isCorrect ? 'Правильно!' : 'Неправильно'}
      </div>
    </div>

    {/* Объяснение показывается ПОСЛЕ ответа */}
    {currentQuestion.explanation && (
      <div className="explanation-box">
        <div className="hint-title">💡 Объяснение:</div>
        <div className="hint-text">{currentQuestion.explanation}</div>
      </div>
    )}
  </>
)}
        </div>
      </div>
    );
  }

  // ========== ЭКРАН РЕЗУЛЬТАТОВ ==========
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

  // ========== ЭКРАН ВЫБОРА ПРЕДМЕТА (если их несколько) ==========
  if (subjects.length > 1 && !selectedSubject) {
    return (
      <div className="section">
        <h1 className="section-title">💪 Практика</h1>
        <p style={{ marginBottom: '24px', color: '#6b7280', fontSize: '14px' }}>
          Выберите предмет для практики:
        </p>

        <div className="subjects-grid">
          {subjects.map(subject => {
            const subjectTopics = practiceTopics.filter(t => t.subjectId === subject.id);
            const totalQuestions = subjectTopics.reduce((sum, t) => sum + (t.questions?.length || 0), 0);

            return (
              <button
                key={subject.id}
                className="subject-card"
                onClick={() => setSelectedSubject(subject)}
              >
                <span className="subject-icon-big">{subject.icon}</span>
                <h3>{subject.name}</h3>
                <p>{subjectTopics.length} подразделов</p>
                <p className="subject-meta">📚 {totalQuestions} вопросов</p>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // ========== ЭКРАН СПИСКА ПОДРАЗДЕЛОВ ==========
  const filteredTopics = selectedSubject 
    ? practiceTopics.filter(topic => topic.subjectId === selectedSubject.id)
    : practiceTopics;

  return (
    <div className="section">
      <div className={`page-header ${subjects.length === 1 ? 'single-subject' : ''}`}>
  {subjects.length > 1 && selectedSubject && (
    <button className="back-button" onClick={backToSubjects}>
      ← Назад
    </button>
  )}
  <div className="page-header-title">
    <span className="page-header-icon">{selectedSubject?.icon || '💪'}</span>
    <span className="page-header-text">
      {selectedSubject ? selectedSubject.name : 'Практика'}
    </span>
  </div>
</div>
      
      <p style={{ marginBottom: '20px', color: '#6b7280', fontSize: '14px' }}>
        💪 Тренируйся в свободное время и улучшай свои навыки!
      </p>

      {filteredTopics.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📚</div>
          <p className="empty-text">
            Нет доступных заданий для практики по этому предмету.
          </p>
        </div>
      ) : (
        <div className="practice-grid">
          {filteredTopics.map(topic => (
            <div key={topic.id} className="card practice-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ fontSize: '32px' }}>{topic.icon || '📝'}</span>
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