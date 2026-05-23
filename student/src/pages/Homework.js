import React, { useState, useEffect } from 'react';
import './Homework.css';
import { useData } from './DataContext';

const API_URL = 'https://educa-production-a98e.up.railway.app/api';

function StudentHomework({ studentId }) {
  // Используем контекст
  const { homeworks, subjects, refreshAfterHomework, loading: contextLoading } = useData();
  
  const [selectedSubject, setSelectedSubject] = useState(null);
  const [selectedHomework, setSelectedHomework] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({});
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [showResult, setShowResult] = useState(false);
  const [result, setResult] = useState(null);
  const [startTime, setStartTime] = useState(null);

  // Автоматический выбор предмета если он один
  useEffect(() => {
    if (subjects.length === 1 && !selectedSubject) {
      setSelectedSubject(subjects[0]);
    }
  }, [subjects, selectedSubject]);

  const backToSubjects = () => {
    setSelectedSubject(null);
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
    const timeSpent = Math.floor((Date.now() - startTime) / 1000);

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
    refreshAfterHomework();
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
                    const newAnswers = current.includes(optIndex)
                      ? current.filter(i => i !== optIndex)
                      : [...current, optIndex];
                    handleAnswer(index, newAnswers);
                  }}
                >
                  <span className="option-letter">
                    {selected.includes(optIndex) ? '☑' : '☐'}
                  </span>
                  <span className="option-text">{option}</span>
                </button>
              );
            })}
          </div>
        );

      case 'text_input':
        return (
          <div className="text-input-container">
            <textarea
              className="text-input"
              value={answers[index] || ''}
              onChange={(e) => handleAnswer(index, e.target.value)}
              placeholder="Введите ваш ответ..."
              rows={4}
            />
          </div>
        );

      case 'number_input':
        return (
          <div className="number-input-container">
            <input
              type="number"
              className="number-input"
              value={answers[index] || ''}
              onChange={(e) => handleAnswer(index, e.target.value)}
              placeholder="Введите число"
            />
          </div>
        );

      case 'matching':
        return (
          <div className="matching-container">
            {question.leftColumn.map((leftItem, leftIndex) => (
              <div key={leftIndex} className="matching-row">
                <div className="matching-left">{leftItem}</div>
                <select
                  className="matching-select"
                  value={(answers[index] || {})[leftIndex] || ''}
                  onChange={(e) => {
                    const current = answers[index] || {};
                    handleAnswer(index, {
                      ...current,
                      [leftIndex]: e.target.value
                    });
                  }}
                >
                  <option value="">Выберите соответствие</option>
                  {question.rightColumn.map((rightItem, rightIndex) => (
                    <option key={rightIndex} value={rightIndex}>
                      {rightItem}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        );

      case 'true_false':
        return (
          <div className="true-false-options">
            <button
              className={`tf-btn ${answers[index] === true ? 'selected' : ''}`}
              onClick={() => handleAnswer(index, true)}
            >
              ✓ Правда
            </button>
            <button
              className={`tf-btn ${answers[index] === false ? 'selected' : ''}`}
              onClick={() => handleAnswer(index, false)}
            >
              ✗ Ложь
            </button>
          </div>
        );

      case 'ordering':
        const currentOrder = answers[index] || question.items.map((_, i) => i);
        return (
          <div className="ordering-container">
            {currentOrder.map((itemIndex, position) => (
              <div key={position} className="ordering-item">
                <span className="order-number">{position + 1}</span>
                <span className="order-text">{question.items[itemIndex]}</span>
                <div className="order-controls">
                  {position > 0 && (
                    <button
                      className="order-btn"
                      onClick={() => {
                        const newOrder = [...currentOrder];
                        [newOrder[position], newOrder[position - 1]] = 
                        [newOrder[position - 1], newOrder[position]];
                        handleAnswer(index, newOrder);
                      }}
                    >
                      ↑
                    </button>
                  )}
                  {position < currentOrder.length - 1 && (
                    <button
                      className="order-btn"
                      onClick={() => {
                        const newOrder = [...currentOrder];
                        [newOrder[position], newOrder[position + 1]] = 
                        [newOrder[position + 1], newOrder[position]];
                        handleAnswer(index, newOrder);
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

      case 'fill_in_blank':
        return (
          <div className="fill-blank-container">
            <div className="blank-text">{question.textWithBlanks}</div>
            {question.blanks.map((blank, blankIndex) => (
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
                    handleAnswer(index, newAnswers);
                  }}
                  placeholder={`Введите ответ для пропуска ${blankIndex + 1}`}
                />
              </div>
            ))}
          </div>
        );

      default:
        return <p>Неизвестный тип вопроса</p>;
    }
  };

  // ========== ЭКРАН ПРОХОЖДЕНИЯ ДОМАШКИ ==========
  if (selectedHomework && !showResult) {
    return (
      <div className="homework-mode">
        <div className="homework-header">
          <button className="back-button" onClick={closeHomework}>
            ← Назад к списку
          </button>
          <h2>{selectedHomework.title}</h2>
          <p>{selectedHomework.subject.name}</p>
        </div>

        <div className="questions-container">
          {questions.map((question, index) => (
            <div key={index} className="question-card">
              <div className="question-number">
                Вопрос {index + 1} из {questions.length}
                <span className="question-points">({question.points} баллов)</span>
              </div>
              <div className="question-text">{question.questionText}</div>
              {renderQuestion(question, index)}
            </div>
          ))}
        </div>

        <div className="submit-section">
          <button
            className="submit-btn"
            onClick={submitHomework}
            disabled={Object.keys(answers).length === 0}
          >
            Отправить домашку
          </button>
        </div>
      </div>
    );
  }

  // ========== ЭКРАН РЕЗУЛЬТАТА ==========
  if (showResult && result) {
    const percentage = Math.round((result.totalScore / result.maxScore) * 100);
    let emoji = '🎉';
    if (percentage >= 90) emoji = '🏆';
    else if (percentage >= 70) emoji = '🎉';
    else if (percentage >= 50) emoji = '👍';
    else emoji = '📚';

    return (
      <div className="homework-result">
        <div className="result-card">
          <div className="result-emoji">{emoji}</div>
          <h2>Домашка сдана!</h2>
          <div className="result-score">
            {result.totalScore}/{result.maxScore}
          </div>
          <div className="result-percentage">{percentage}%</div>
          <div className="result-details">
            <div className="detail-item">
              <span className="detail-label">Правильных ответов:</span>
              <span className="detail-value">{result.correctAnswers}/{questions.length}</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">Время выполнения:</span>
              <span className="detail-value">{Math.floor(result.timeSpent / 60)} мин</span>
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
        <p style={{ textAlign: 'center', padding: '40px', color: '#6b7280' }}>
          Загрузка...
        </p>
      </div>
    );
  }

  // ========== ЭКРАН ВЫБОРА ПРЕДМЕТА (если предметов несколько) ==========
  if (!selectedSubject && subjects.length > 1) {
    return (
      <div className="section">
        <h1 className="section-title">📝 Домашние задания</h1>
        <p style={{ marginBottom: '16px', color: '#6b7280', fontSize: '14px' }}>
          Выберите предмет:
        </p>

        <div className="subjects-grid">
          {subjects.map(subject => {
            const subjectHomeworks = homeworks.filter(hw => hw.subjectId === subject.id);
            // ИСПРАВЛЕНО: считаем несделанными только те, где действительно нет результата
            const unfinishedCount = subjectHomeworks.filter(hw => 
              !hw.stats || hw.stats.bestScore === 0
            ).length;

            return (
              <button
                key={subject.id}
                className="subject-card"
                onClick={() => setSelectedSubject(subject)}
              >
                <span className="subject-icon-big">{subject.icon}</span>
                <h3>{subject.name}</h3>
                <p>{subjectHomeworks.length} заданий</p>
                {unfinishedCount > 0 && (
                  <span className="badge-warning">
                    ❗ {unfinishedCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // ========== СПИСОК ДОМАШЕК ДЛЯ ВЫБРАННОГО ПРЕДМЕТА ==========
  const filteredHomeworks = selectedSubject 
    ? homeworks.filter(hw => hw.subjectId === selectedSubject.id)
    : homeworks;

  return (
    <div className="section">
      {/* Page Header */}
      <div className={`page-header ${subjects.length === 1 ? 'single-subject' : ''}`}>
        {subjects.length > 1 && selectedSubject && (
          <button className="back-button" onClick={backToSubjects}>
            ← Назад
          </button>
        )}
        <div className="page-header-title">
          <span className="page-header-icon">{selectedSubject?.icon || '📝'}</span>
          <span className="page-header-text">
            {selectedSubject ? selectedSubject.name : 'Домашка'}
          </span>
        </div>
      </div>

      <p style={{ marginBottom: '16px', color: '#6b7280', fontSize: '14px' }}>
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
            const maxScore = homework.questions.reduce((sum, q) => sum + q.points, 0);
            
            // ИСПРАВЛЕНО: проверяем реальный статус выполнения
            const isCompleted = homework.stats && homework.stats.bestScore > 0;
            const hasAttemptsLeft = homework.maxAttempts && homework.stats 
              ? homework.stats.attemptsUsed < homework.maxAttempts 
              : true;

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

                {/* ИСПРАВЛЕНО: статус выполнения */}
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
                    <span>{homework.questions.length} вопросов</span>
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
                          : `До ${homework.maxAttempts} попыток`
                        }
                      </span>
                    </div>
                  )}
                </div>

                {homework.stats && homework.stats.bestScore > 0 && (
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
                        style={{
                          width: `${(homework.stats.bestScore / homework.stats.maxScore) * 100}%`
                        }}
                      ></div>
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
                  {!isCompleted 
                    ? 'Начать выполнение'
                    : hasAttemptsLeft 
                      ? 'Улучшить результат'
                      : 'Попытки исчерпаны'
                  }
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