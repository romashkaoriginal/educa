import React, { useState, useEffect } from 'react';
import './Homework.css';
import { useData } from './DataContext';

const API_URL = 'https://educa-production-a98e.up.railway.app/api';

function StudentHomework({ studentId }) {
  const { homeworks, subjects, refreshAfterHomework, loading: contextLoading } = useData();
  
  const [selectedSubject, setSelectedSubject] = useState(null);
  const [selectedHomework, setSelectedHomework] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({});
  const [currentIndex, setCurrentIndex] = useState(0); // ← текущий вопрос
  const [showResult, setShowResult] = useState(false);
  const [result, setResult] = useState(null);
  const [startTime, setStartTime] = useState(null);

  useEffect(() => {
    if (subjects.length === 1 && !selectedSubject) {
      setSelectedSubject(subjects[0]);
    }
  }, [subjects, selectedSubject]);

  const backToSubjects = () => setSelectedSubject(null);

  const startHomework = async (homework) => {
    try {
      const response = await fetch(`${API_URL}/homework/${homework.id}`);
      const data = await response.json();
      if (!data.homework) {
        alert('Ошибка: домашка не найдена');
        return;
      }
      setSelectedHomework(data.homework);
      setQuestions(data.homework.questions || []);
      setAnswers({});
      setCurrentIndex(0);
      setShowResult(false);
      setStartTime(Date.now());
    } catch (error) {
      console.error('Error loading homework:', error);
      alert('Ошибка загрузки домашки');
    }
  };

  const handleAnswer = (answer) => {
    setAnswers({ ...answers, [currentIndex]: answer });
  };

  const goNext = () => {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex(currentIndex + 1);
    }
  };

  const goPrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  };

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
    setCurrentIndex(0);
    setShowResult(false);
    setResult(null);
    refreshAfterHomework();
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
                onClick={() => handleAnswer(optIndex)}
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
                  const newAnswers = current.includes(optIndex)
                    ? current.filter(i => i !== optIndex)
                    : [...current, optIndex];
                  handleAnswer(newAnswers);
                }}
              >
                <span className="option-letter">
                  {selected.includes(optIndex) ? '☑' : '☐'}
                </span>
                <span className="option-text">{option}</span>
              </button>
            ))}
          </div>
        );
      }

      case 'text_input':
      case 'short_answer':
        return (
          <div className="text-input-container">
            <textarea
              className="text-input"
              value={answers[index] || ''}
              onChange={(e) => handleAnswer(e.target.value)}
              placeholder="Введите ваш ответ..."
              rows={4}
            />
          </div>
        );

      case 'number_input':
      case 'numeric':
        return (
          <div className="number-input-container">
            <input
              type="number"
              className="number-input"
              value={answers[index] || ''}
              onChange={(e) => handleAnswer(parseFloat(e.target.value))}
              placeholder="Введите число"
            />
          </div>
        );

      case 'true_false':
        return (
          <div className="true-false-options">
            <button
              className={`tf-btn ${answers[index] === true ? 'selected' : ''}`}
              onClick={() => handleAnswer(true)}
            >
              ✓ Правда
            </button>
            <button
              className={`tf-btn ${answers[index] === false ? 'selected' : ''}`}
              onClick={() => handleAnswer(false)}
            >
              ✗ Ложь
            </button>
          </div>
        );

      case 'matching': {
        const pairs = question.correctAnswer || question.options || [];
        const currentAnswers = answers[index] || pairs.map(p => ({ left: p.left, right: '' }));
        const rightOptions = pairs.map(p => p.right);
        return (
          <div className="matching-container">
            {currentAnswers.map((pair, pairIndex) => (
              <div key={pairIndex} className="matching-row">
                <div className="matching-left">{pair.left}</div>
                <select
                  className="matching-select"
                  value={pair.right || ''}
                  onChange={(e) => {
                    const newAnswers = [...currentAnswers];
                    newAnswers[pairIndex] = { ...pair, right: e.target.value };
                    handleAnswer(newAnswers);
                  }}
                >
                  <option value="">Выберите...</option>
                  {rightOptions.map((right, rightIndex) => (
                    <option key={rightIndex} value={right}>{right}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        );
      }

      case 'ordering': {
        const items = question.correctAnswer || [];
        const currentOrder = answers[index] || [...items].sort(() => Math.random() - 0.5);
        return (
          <div className="ordering-container">
            <p style={{ fontSize: '13px', color: '#6b7280', marginBottom: '10px' }}>
              Расставьте в правильном порядке:
            </p>
            {currentOrder.map((item, position) => (
              <div key={position} className="ordering-item">
                <span className="order-number">{position + 1}</span>
                <span className="order-text">{item}</span>
                <div className="order-controls">
                  {position > 0 && (
                    <button className="order-btn" onClick={() => {
                      const newOrder = [...currentOrder];
                      [newOrder[position], newOrder[position - 1]] = [newOrder[position - 1], newOrder[position]];
                      handleAnswer(newOrder);
                    }}>↑</button>
                  )}
                  {position < currentOrder.length - 1 && (
                    <button className="order-btn" onClick={() => {
                      const newOrder = [...currentOrder];
                      [newOrder[position], newOrder[position + 1]] = [newOrder[position + 1], newOrder[position]];
                      handleAnswer(newOrder);
                    }}>↓</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        );
      }

      case 'fill_in_blank':
      case 'fill_blanks': {
        const text = question.options?.text || question.textWithBlanks || question.questionText;
        const blanksCount = question.options?.blanks?.length || question.blanks?.length || 1;
        return (
          <div className="fill-blank-container">
            <div className="blank-text">{text}</div>
            {Array.from({ length: blanksCount }).map((_, blankIndex) => (
              <div key={blankIndex} className="blank-input-group">
                <label>Пропуск {blankIndex + 1}:</label>
                <input
                  type="text"
                  className="blank-input"
                  value={(answers[index] || [])[blankIndex] || ''}
                  onChange={(e) => {
                    const current = answers[index] || [];
                    const newAnswers = [...current];
                    newAnswers[blankIndex] = e.target.value;
                    handleAnswer(newAnswers);
                  }}
                  placeholder={`Введите ответ ${blankIndex + 1}`}
                />
              </div>
            ))}
          </div>
        );
      }

      default:
        return (
          <div style={{ padding: '12px', background: '#fee2e2', borderRadius: '8px', fontSize: '13px', color: '#991b1b' }}>
            Неизвестный тип вопроса: {question.questionType}
          </div>
        );
    }
  };

  // ========== ЭКРАН ПРОХОЖДЕНИЯ ДОМАШКИ (пошагово) ==========
  if (selectedHomework && !showResult) {
    const question = questions[currentIndex];
    const isLast = currentIndex === questions.length - 1;
    const isFirst = currentIndex === 0;
    const hasAnswer = answers[currentIndex] !== undefined;
    const answeredCount = Object.keys(answers).length;
    const progress = ((currentIndex + 1) / questions.length) * 100;

    return (
      <div className="homework-mode">
        {/* Header */}
        <div className="homework-header">
          <button className="back-button" onClick={closeHomework}>
            ← Выйти
          </button>
          <div className="homework-header-info">
            <h2>{selectedHomework.title}</h2>
            <p>{selectedHomework.subject?.name || ''}</p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="hw-progress-wrap">
          <div className="hw-progress-bar">
            <div className="hw-progress-fill" style={{ width: `${progress}%` }} />
          </div>
          <span className="hw-progress-text">
            {currentIndex + 1} / {questions.length}
          </span>
        </div>

        {/* Вопрос */}
        <div className="question-container">
          <div className="question-card">
            <div className="question-meta">
              <span className="question-num">Вопрос {currentIndex + 1}</span>
              <span className="question-points">{question?.points} баллов</span>
            </div>
            <div className="question-text">{question?.questionText}</div>
            {question && renderQuestion(question, currentIndex)}
          </div>
        </div>

        {/* Навигация */}
        <div className="hw-navigation">
          <button
            className="hw-nav-btn secondary"
            onClick={goPrev}
            disabled={isFirst}
          >
            ← Назад
          </button>

          {isLast ? (
            <button
              className="hw-nav-btn primary"
              onClick={submitHomework}
              disabled={answeredCount === 0}
            >
              Сдать домашку ✓
            </button>
          ) : (
            <button
              className="hw-nav-btn primary"
              onClick={goNext}
              disabled={!hasAnswer}
            >
              Далее →
            </button>
          )}
        </div>

        {/* Индикатор ответов внизу */}
        <div className="hw-dots">
          {questions.map((_, i) => (
            <button
              key={i}
              className={`hw-dot ${i === currentIndex ? 'active' : ''} ${answers[i] !== undefined ? 'answered' : ''}`}
              onClick={() => setCurrentIndex(i)}
            />
          ))}
        </div>
      </div>
    );
  }

  // ========== ЭКРАН РЕЗУЛЬТАТА ==========
  if (showResult && result) {
    const percentage = Math.round((result.totalScore / result.maxScore) * 100);
    let emoji = '📚';
    if (percentage >= 90) emoji = '🏆';
    else if (percentage >= 70) emoji = '🎉';
    else if (percentage >= 50) emoji = '👍';

    return (
      <div className="homework-result">
        <div className="result-card">
          <div className="result-emoji">{emoji}</div>
          <h2>Домашка сдана!</h2>
          <div className="result-score">{result.totalScore}/{result.maxScore}</div>
          <div className="result-percentage">{percentage}%</div>
          <div className="result-details">
            <div className="detail-item">
              <span className="detail-label">Правильных ответов:</span>
              <span className="detail-value">{result.correctAnswers}/{questions.length}</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">Время выполнения:</span>
              <span className="detail-value">{Math.floor((result.timeSpent || 0) / 60)} мин</span>
            </div>
            {result.attemptsUsed && result.maxAttempts && (
              <div className="detail-item">
                <span className="detail-label">Попытка:</span>
                <span className="detail-value">{result.attemptsUsed}/{result.maxAttempts}</span>
              </div>
            )}
          </div>
          <button className="result-button" onClick={closeHomework}>
            Вернуться к списку
          </button>
        </div>
      </div>
    );
  }

  if (contextLoading.homework && homeworks.length === 0) {
    return (
      <div className="section">
        <h1 className="section-title">Домашние задания</h1>
        <p style={{ textAlign: 'center', padding: '40px', color: '#6b7280' }}>Загрузка...</p>
      </div>
    );
  }

  // ========== ЭКРАН ВЫБОРА ПРЕДМЕТА ==========
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
                {unfinishedCount > 0 && (
                  <span className="badge-warning">❗ {unfinishedCount}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // ========== СПИСОК ДОМАШЕК ==========
  const filteredHomeworks = selectedSubject
    ? homeworks.filter(hw => hw.subjectId === selectedSubject.id)
    : homeworks;

  return (
    <div className="section">
      <div className={`page-header ${subjects.length === 1 ? 'single-subject' : ''}`}>
        {subjects.length > 1 && selectedSubject && (
          <button className="back-button" onClick={backToSubjects}>← Назад</button>
        )}
        <div className="page-header-title">
          <span className="page-header-icon">{selectedSubject?.icon || '📝'}</span>
          <span className="page-header-text">{selectedSubject ? selectedSubject.name : 'Домашка'}</span>
        </div>
      </div>

      <p style={{ margin: '12px 0 16px', color: '#6b7280', fontSize: '14px' }}>
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
            const isCompleted = homework.stats && homework.stats.bestScore > 0;
            const hasAttemptsLeft = homework.maxAttempts && homework.stats
              ? homework.stats.attemptsUsed < homework.maxAttempts
              : true;

            return (
              <div key={homework.id} className="homework-card">
                <div className="card-header">
                  <span className="subject-icon">{homework.subject?.icon}</span>
                  <div>
                    <h3 className="card-title">{homework.title}</h3>
                    <p className="subject-name">{homework.subject?.name}</p>
                  </div>
                </div>

                {homework.description && (
                  <p className="card-description">{homework.description}</p>
                )}

                <div className="homework-status">
                  {!isCompleted ? (
                    <span className="badge-warning">❗ Требуется выполнить</span>
                  ) : hasAttemptsLeft ? (
                    <span className="badge-info">🔄 Можно улучшить результат</span>
                  ) : (
                    <span className="badge-success">✅ Выполнено</span>
                  )}
                </div>

                <div className="card-info">
                  <div className="info-item">
                    <span className="info-icon">📚</span>
                    <span>{(homework.questions || []).length} вопросов</span>
                  </div>
                  <div className="info-item">
                    <span className="info-icon">⭐</span>
                    <span>Макс. {maxScore} баллов</span>
                  </div>
                  {homework.maxAttempts && (
                    <div className="info-item">
                      <span className="info-icon">🔄</span>
                      <span>
                        {homework.stats
                          ? `Попыток: ${homework.stats.attemptsUsed}/${homework.maxAttempts}`
                          : `До ${homework.maxAttempts} попыток`}
                      </span>
                    </div>
                  )}
                </div>

                {isCompleted && (
                  <div className="homework-stats">
                    <div className="stats-header">
                      <span>Ваш лучший результат:</span>
                      <span className="stats-score">
                        {homework.stats.bestScore}/{homework.stats.maxScore}
                      </span>
                    </div>
                    <div className="progress-bar">
                      <div
                        className="progress-fill"
                        style={{ width: `${(homework.stats.bestScore / homework.stats.maxScore) * 100}%` }}
                      />
                    </div>
                  </div>
                )}

                <div className="card-deadline">
                  {hoursLeft > 0 ? (
                    <span className="deadline-active">
                      ⏰ Осталось {hoursLeft > 24 ? Math.floor(hoursLeft / 24) + ' дней' : hoursLeft + ' часов'}
                    </span>
                  ) : (
                    <span className="deadline-expired">⏰ Срок истёк</span>
                  )}
                </div>

                <button
                  className="start-btn"
                  onClick={() => startHomework(homework)}
                  disabled={hoursLeft <= 0 || (!hasAttemptsLeft && isCompleted)}
                >
                  {!isCompleted ? 'Начать выполнение' : hasAttemptsLeft ? 'Улучшить результат' : 'Попытки исчерпаны'}
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