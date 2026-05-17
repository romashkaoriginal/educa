import React, { useState, useEffect } from 'react';
import './Homework.css';

const API_URL = 'https://educa-production-a98e.up.railway.app/api';

function StudentHomework({ studentId }) {
  const [homeworks, setHomeworks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedHomework, setSelectedHomework] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({});
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [showResult, setShowResult] = useState(false);
  const [result, setResult] = useState(null);
  const [startTime, setStartTime] = useState(null);

  useEffect(() => {
    loadHomeworks();
  }, [studentId]);

  const loadHomeworks = async () => {
    try {
      const response = await fetch(`${API_URL}/homework/student/${studentId}`);
      const data = await response.json();
      setHomeworks(data.homeworks || []);
    } catch (error) {
      console.error('Error loading homeworks:', error);
    } finally {
      setLoading(false);
    }
  };

  const startHomework = async (homework) => {
    try {
      const response = await fetch(`${API_URL}/homework/${homework.id}`);
      const data = await response.json();

      setSelectedHomework(homework);
      setQuestions(data.homework.questions || []);
      setAnswers({});
      setCurrentQuestionIndex(0);
      setShowResult(false);
      setStartTime(Date.now());
    } catch (error) {
      console.error('Error loading homework:', error);
      alert('Ошибка загрузки домашки');
    }
  };

  const handleAnswer = (questionIndex, answer) => {
    setAnswers({
      ...answers,
      [questionIndex]: answer
    });
  };

  const submitHomework = async () => {
    const timeSpent = Math.floor((Date.now() - startTime) / 1000); // seconds

    try {
      const response = await fetch(`${API_URL}/homework/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          homeworkId: selectedHomework.id,
          studentId: studentId,
          answers: Object.values(answers),
          timeSpent
        })
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

  const closeHomework = () => {
    setSelectedHomework(null);
    setQuestions([]);
    setAnswers({});
    setShowResult(false);
    setResult(null);
    loadHomeworks();
  };

  const renderQuestion = (question, index) => {
    switch (question.questionType) {
      case 'single_choice':
        return (
          <div className="question-options">
            {question.options.map((option, optIndex) => (
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

      case 'multiple_choice':
        return (
          <div className="question-options">
            {question.options.map((option, optIndex) => {
              const selected = answers[index] || [];
              return (
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
                  <input 
                    type="checkbox" 
                    checked={selected.includes(optIndex)} 
                    readOnly 
                  />
                  <span className="option-text">{option}</span>
                </button>
              );
            })}
          </div>
        );

      case 'short_answer':
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

      case 'matching':
        const pairs = answers[index] || question.options.map(p => ({ ...p, right: '' }));
        const shuffledRights = question.options.map(p => p.right).sort(() => Math.random() - 0.5);
        
        return (
          <div className="matching-container">
            {pairs.map((pair, pairIndex) => (
              <div key={pairIndex} className="matching-pair">
                <div className="matching-left">{pair.left}</div>
                <select
                  className="matching-select"
                  value={pair.right}
                  onChange={(e) => {
                    const newPairs = [...pairs];
                    newPairs[pairIndex].right = e.target.value;
                    handleAnswer(index, newPairs);
                  }}
                >
                  <option value="">Выберите...</option>
                  {shuffledRights.map((right, idx) => (
                    <option key={idx} value={right}>{right}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        );

      case 'ordering':
        const items = answers[index] || [...question.correctAnswer].sort(() => Math.random() - 0.5);
        
        return (
          <div className="ordering-container">
            <p className="ordering-hint">Перетащите элементы в правильном порядке:</p>
            {items.map((item, itemIndex) => (
              <div key={itemIndex} className="ordering-item">
                <span className="item-number">{itemIndex + 1}</span>
                <span className="item-text">{item}</span>
                <div className="item-controls">
                  {itemIndex > 0 && (
                    <button
                      onClick={() => {
                        const newItems = [...items];
                        [newItems[itemIndex], newItems[itemIndex - 1]] = 
                        [newItems[itemIndex - 1], newItems[itemIndex]];
                        handleAnswer(index, newItems);
                      }}
                    >
                      ↑
                    </button>
                  )}
                  {itemIndex < items.length - 1 && (
                    <button
                      onClick={() => {
                        const newItems = [...items];
                        [newItems[itemIndex], newItems[itemIndex + 1]] = 
                        [newItems[itemIndex + 1], newItems[itemIndex]];
                        handleAnswer(index, newItems);
                      }}
                    >
                      ↓
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        );

      case 'fill_blanks':
        const blanksCount = (question.questionText.match(/___/g) || []).length;
        const blankAnswers = answers[index] || Array(blanksCount).fill('');
        const parts = question.questionText.split('___');
        
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

      case 'true_false':
        return (
          <div className="true-false-options">
            <button
              className={`tf-btn ${answers[index] === true ? 'selected' : ''}`}
              onClick={() => handleAnswer(index, true)}
            >
              ✓ Верно
            </button>
            <button
              className={`tf-btn ${answers[index] === false ? 'selected' : ''}`}
              onClick={() => handleAnswer(index, false)}
            >
              ✗ Неверно
            </button>
          </div>
        );

      default:
        return <p>Неизвестный тип вопроса</p>;
    }
  };

  if (loading) {
    return (
      <div className="section">
        <h1 className="section-title">Домашние задания</h1>
        <p style={{ textAlign: 'center', color: '#6b7280', padding: '40px' }}>
          Загрузка...
        </p>
      </div>
    );
  }

  if (showResult && result) {
    return (
      <div className="section homework-result">
        <div className="result-header">
          <h1>Результат</h1>
          <p className="result-homework-title">{selectedHomework.title}</p>
        </div>

        <div className="result-score-display">
          <div className="score-circle">
            <div className="score-value">{result.percentage}%</div>
            <div className="score-label">
              {result.totalScore} из {result.maxScore} баллов
            </div>
          </div>
        </div>

        <div className="result-message">
          {result.percentage >= 90 && <p className="excellent">🎉 Отлично! Превосходная работа!</p>}
          {result.percentage >= 70 && result.percentage < 90 && <p className="good">👍 Хорошо! Продолжай в том же духе!</p>}
          {result.percentage >= 50 && result.percentage < 70 && <p className="average">📖 Неплохо, но есть куда расти!</p>}
          {result.percentage < 50 && <p className="needs-work">💪 Стоит повторить материал и попробовать снова!</p>}
        </div>

        <div className="result-actions">
          {selectedHomework.maxAttempts && selectedHomework.stats && 
           selectedHomework.stats.attempts >= selectedHomework.maxAttempts ? (
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
          <button className="back-button" onClick={closeHomework}>
            ← Назад
          </button>
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
              <button
                className="secondary-button"
                onClick={() => setCurrentQuestionIndex(currentQuestionIndex - 1)}
              >
                ← Назад
              </button>
            )}
            {!isLastQuestion ? (
              <button
                className="primary-button"
                disabled={!canProceed}
                onClick={() => setCurrentQuestionIndex(currentQuestionIndex + 1)}
              >
                Далее →
              </button>
            ) : (
              <button
                className="primary-button submit"
                disabled={!canProceed}
                onClick={submitHomework}
              >
                Отправить домашку
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="section">
      <h1 className="section-title">Домашние задания</h1>
      
      <p style={{ marginBottom: '20px', color: '#6b7280', fontSize: '14px' }}>
        📝 Выполняйте домашние задания в указанные сроки
      </p>

      {homeworks.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📚</div>
          <p className="empty-text">Пока нет доступных домашних заданий</p>
        </div>
      ) : (
        <div className="homeworks-grid">
          {homeworks.map(homework => {
            const now = new Date();
            const closeDate = new Date(homework.closeDate);
            const hoursLeft = Math.floor((closeDate - now) / (1000 * 60 * 60));
            const maxScore = homework.questions.reduce((sum, q) => sum + q.points, 0);

            return (
              <div key={homework.id} className="homework-card">
                <div className="card-header">
                  <span className="subject-icon">{homework.subject.icon}</span>
                  <div>
                    <h3 className="card-title">{homework.title}</h3>
                    <p className="subject-name">{homework.subject.name}</p>
                  </div>
                </div>

                {homework.description && (
                  <p className="card-description">{homework.description}</p>
                )}

                <div className="card-info">
                  <div className="info-item">
                    <span className="info-icon">📚</span>
                    <span>{homework.questions.length} вопросов</span>
                  </div>
                  <div className="info-item">
                    <span className="info-icon">⭐</span>
                    <span>Макс. {maxScore} баллов</span>
                  </div>
                  {homework.maxAttempts && (
                    <div className="info-item">
                      <span className="info-icon">🔄</span>
                      <span>До {homework.maxAttempts} попыток</span>
                    </div>
                  )}
                </div>

                {homework.stats && (
                  <div className="homework-stats">
                    <div className="stats-header">
                      <span>Ваш лучший результат:</span>
                      <span className="stats-score">
                        {homework.stats.bestScore}/{homework.stats.maxScore}
                      </span>
                    </div>
                    <div className="stats-bar">
                      <div 
                        className="stats-fill"
                        style={{ 
                          width: `${(homework.stats.bestScore / homework.stats.maxScore) * 100}%` 
                        }}
                      ></div>
                    </div>
                    <p className="attempts-count">
                      Попыток использовано: {homework.stats.attempts}
                      {homework.maxAttempts && ` из ${homework.maxAttempts}`}
                    </p>
                  </div>
                )}

                <div className="deadline-info">
                  {hoursLeft > 24 ? (
                    <span className="deadline-ok">
                      ⏰ До сдачи: {Math.floor(hoursLeft / 24)} дн.
                    </span>
                  ) : hoursLeft > 0 ? (
                    <span className="deadline-warning">
                      ⏰ До сдачи: {hoursLeft} ч.
                    </span>
                  ) : (
                    <span className="deadline-urgent">
                      ⏰ Срок истекает!
                    </span>
                  )}
                </div>

                <button
                  className="primary-button"
                  onClick={() => startHomework(homework)}
                  disabled={
                    homework.maxAttempts && 
                    homework.stats && 
                    homework.stats.attempts >= homework.maxAttempts
                  }
                >
                  {homework.stats 
                    ? 'Пройти заново' 
                    : 'Начать выполнение'}
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