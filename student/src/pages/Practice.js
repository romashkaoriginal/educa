import React, { useState, useEffect } from 'react';
import './Practice.css';

const API_URL = 'https://educa-production-a98e.up.railway.app/api';

function Practice({ studentId }) {
  const [practiceTopics, setPracticeTopics] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [selectedSubject, setSelectedSubject] = useState('all');
  const [loading, setLoading] = useState(true);
  
  // Режим прохождения практики
  const [activePractice, setActivePractice] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [userAnswers, setUserAnswers] = useState([]);
  const [showResult, setShowResult] = useState(false);
  const [practiceResult, setPracticeResult] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [practiceRes, subjectsRes] = await Promise.all([
          fetch(`${API_URL}/practice/student/${studentId}`),
          fetch(`${API_URL}/subjects/student/${studentId}`)
        ]);

        const practiceData = await practiceRes.json();
        const subjectsData = await subjectsRes.json();

        setPracticeTopics(practiceData.practiceTopics || []);
        setSubjects(subjectsData.subjects || []);
      } catch (error) {
        console.error('Error fetching practice:', error);
      } finally {
        setLoading(false);
      }
    };

    if (studentId) {
      fetchData();
    }
  }, [studentId]);

  const startPractice = async (topic) => {
    try {
      const response = await fetch(`${API_URL}/practice/questions/${topic.id}`);
      const data = await response.json();
      
      // Фильтруем только активные вопросы
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
    } catch (error) {
      console.error('Error loading questions:', error);
      alert('Ошибка загрузки вопросов');
    }
  };

  const handleAnswerSelect = (answerIndex) => {
    setSelectedAnswer(answerIndex);
  };

  const handleNextQuestion = () => {
    // Сохраняем ответ
    const newAnswers = [...userAnswers, {
      questionId: questions[currentQuestionIndex].id,
      selectedAnswer: selectedAnswer,
      correctAnswer: questions[currentQuestionIndex].correctAnswer,
      isCorrect: selectedAnswer === questions[currentQuestionIndex].correctAnswer
    }];
    setUserAnswers(newAnswers);

    // Переходим к следующему вопросу или показываем результат
    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1);
      setSelectedAnswer(null);
    } else {
      finishPractice(newAnswers);
    }
  };

  const finishPractice = async (answers) => {
    const correctCount = answers.filter(a => a.isCorrect).length;
    const totalCount = answers.length;
    const scorePercentage = Math.round((correctCount / totalCount) * 100);

    const result = {
      correctCount,
      totalCount,
      scorePercentage,
      answers
    };

    setPracticeResult(result);
    setShowResult(true);

    // Сохраняем попытку в БД
    try {
      await fetch(`${API_URL}/practice/attempts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: studentId,
          topicId: activePractice.id,
          score: scorePercentage,
          correctAnswers: correctCount,
          totalQuestions: totalCount
        })
      });
    } catch (error) {
      console.error('Error saving attempt:', error);
    }
  };

  const closePractice = () => {
    setActivePractice(null);
    setQuestions([]);
    setCurrentQuestionIndex(0);
    setSelectedAnswer(null);
    setUserAnswers([]);
    setShowResult(false);
    setPracticeResult(null);
  };

  // Фильтрация по предмету
  const filteredTopics = selectedSubject === 'all'
    ? practiceTopics
    : practiceTopics.filter(topic => topic.subjectId === selectedSubject);

  if (loading) {
    return (
      <div className="section">
        <h1 className="section-title">Практика</h1>
        <p style={{ textAlign: 'center', color: '#6b7280', padding: '40px' }}>
          Загрузка практики...
        </p>
      </div>
    );
  }

  // Режим прохождения практики
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
            <h2>{activePractice.title}</h2>
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
          </div>

          <h3 className="question-text">{currentQuestion.questionText}</h3>

          <div className="answers-list">
            {currentQuestion.options.map((option, index) => (
              <button
                key={index}
                className={`answer-option ${selectedAnswer === index ? 'selected' : ''}`}
                onClick={() => handleAnswerSelect(index)}
              >
                <span className="answer-letter">{String.fromCharCode(65 + index)}</span>
                <span className="answer-text">{option}</span>
              </button>
            ))}
          </div>

          <button
            className="primary-button"
            disabled={selectedAnswer === null}
            onClick={handleNextQuestion}
          >
            {currentQuestionIndex < questions.length - 1 ? 'Следующий вопрос →' : 'Завершить практику'}
          </button>
        </div>
      </div>
    );
  }

  // Экран результатов
  if (showResult && practiceResult) {
    return (
      <div className="section practice-result">
        <div className="result-header">
          <h1>Результаты практики</h1>
          <p className="result-topic">{activePractice.title}</p>
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

  // Список практик
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
              <button 
                className="primary-button"
                onClick={() => startPractice(topic)}
                disabled={!topic.questions || topic.questions.length === 0}
              >
                Начать практику
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default Practice;
ENDFILE
cat /home/claude/Practice-Student-Full.js
Output

import React, { useState, useEffect } from 'react';
import './Practice.css';

const API_URL = 'https://educa-production-a98e.up.railway.app/api';

function Practice({ studentId }) {
  const [practiceTopics, setPracticeTopics] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [selectedSubject, setSelectedSubject] = useState('all');
  const [loading, setLoading] = useState(true);
  
  // Режим прохождения практики
  const [activePractice, setActivePractice] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [userAnswers, setUserAnswers] = useState([]);
  const [showResult, setShowResult] = useState(false);
  const [practiceResult, setPracticeResult] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [practiceRes, subjectsRes] = await Promise.all([
          fetch(`${API_URL}/practice/student/${studentId}`),
          fetch(`${API_URL}/subjects/student/${studentId}`)
        ]);

        const practiceData = await practiceRes.json();
        const subjectsData = await subjectsRes.json();

        setPracticeTopics(practiceData.practiceTopics || []);
        setSubjects(subjectsData.subjects || []);
      } catch (error) {
        console.error('Error fetching practice:', error);
      } finally {
        setLoading(false);
      }
    };

    if (studentId) {
      fetchData();
    }
  }, [studentId]);

  const startPractice = async (topic) => {
    try {
      const response = await fetch(`${API_URL}/practice/questions/${topic.id}`);
      const data = await response.json();
      
      // Фильтруем только активные вопросы
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
    } catch (error) {
      console.error('Error loading questions:', error);
      alert('Ошибка загрузки вопросов');
    }
  };

  const handleAnswerSelect = (answerIndex) => {
    setSelectedAnswer(answerIndex);
  };

  const handleNextQuestion = () => {
    // Сохраняем ответ
    const newAnswers = [...userAnswers, {
      questionId: questions[currentQuestionIndex].id,
      selectedAnswer: selectedAnswer,
      correctAnswer: questions[currentQuestionIndex].correctAnswer,
      isCorrect: selectedAnswer === questions[currentQuestionIndex].correctAnswer
    }];
    setUserAnswers(newAnswers);

    // Переходим к следующему вопросу или показываем результат
    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1);
      setSelectedAnswer(null);
    } else {
      finishPractice(newAnswers);
    }
  };

  const finishPractice = async (answers) => {
    const correctCount = answers.filter(a => a.isCorrect).length;
    const totalCount = answers.length;
    const scorePercentage = Math.round((correctCount / totalCount) * 100);

    const result = {
      correctCount,
      totalCount,
      scorePercentage,
      answers
    };

    setPracticeResult(result);
    setShowResult(true);

    // Сохраняем попытку в БД
    try {
      await fetch(`${API_URL}/practice/attempts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: studentId,
          topicId: activePractice.id,
          score: scorePercentage,
          correctAnswers: correctCount,
          totalQuestions: totalCount
        })
      });
    } catch (error) {
      console.error('Error saving attempt:', error);
    }
  };

  const closePractice = () => {
    setActivePractice(null);
    setQuestions([]);
    setCurrentQuestionIndex(0);
    setSelectedAnswer(null);
    setUserAnswers([]);
    setShowResult(false);
    setPracticeResult(null);
  };

  // Фильтрация по предмету
  const filteredTopics = selectedSubject === 'all'
    ? practiceTopics
    : practiceTopics.filter(topic => topic.subjectId === selectedSubject);

  if (loading) {
    return (
      <div className="section">
        <h1 className="section-title">Практика</h1>
        <p style={{ textAlign: 'center', color: '#6b7280', padding: '40px' }}>
          Загрузка практики...
        </p>
      </div>
    );
  }

  // Режим прохождения практики
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
            <h2>{activePractice.title}</h2>
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
          </div>

          <h3 className="question-text">{currentQuestion.questionText}</h3>

          <div className="answers-list">
            {currentQuestion.options.map((option, index) => (
              <button
                key={index}
                className={`answer-option ${selectedAnswer === index ? 'selected' : ''}`}
                onClick={() => handleAnswerSelect(index)}
              >
                <span className="answer-letter">{String.fromCharCode(65 + index)}</span>
                <span className="answer-text">{option}</span>
              </button>
            ))}
          </div>

          <button
            className="primary-button"
            disabled={selectedAnswer === null}
            onClick={handleNextQuestion}
          >
            {currentQuestionIndex < questions.length - 1 ? 'Следующий вопрос →' : 'Завершить практику'}
          </button>
        </div>
      </div>
    );
  }

  // Экран результатов
  if (showResult && practiceResult) {
    return (
      <div className="section practice-result">
        <div className="result-header">
          <h1>Результаты практики</h1>
          <p className="result-topic">{activePractice.title}</p>
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

  // Список практик
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
              <button 
                className="primary-button"
                onClick={() => startPractice(topic)}
                disabled={!topic.questions || topic.questions.length === 0}
              >
                Начать практику
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default Practice;