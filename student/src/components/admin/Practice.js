import React, { useState, useEffect } from 'react';
import '../../styles/Practice.css';

const API_URL = 'https://educa-production-a98e.up.railway.app/api';

function Practice({ subjects }) {
  const [selectedSubject, setSelectedSubject] = useState(null);
  const [topics, setTopics] = useState([]);
  const [selectedTopic, setSelectedTopic] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(false);
  
  // Модалки
  const [showTopicModal, setShowTopicModal] = useState(false);
  const [showQuestionModal, setShowQuestionModal] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState(null);
  
  // Форма топика
  const [topicForm, setTopicForm] = useState({
    name: '',
    description: '',
    icon: '📝'
  });

  // Форма вопроса
  const [questionForm, setQuestionForm] = useState({
    questionText: '',
    options: ['', '', '', ''],
    correctAnswer: 0,
    explanation: '',
    difficulty: 'medium'
  });

  useEffect(() => {
    if (selectedSubject) {
      loadTopics();
    }
  }, [selectedSubject]);

  useEffect(() => {
    if (selectedTopic) {
      loadQuestions();
    }
  }, [selectedTopic]);

  const loadTopics = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/practice/topics/${selectedSubject.id}`);
      const data = await response.json();
      setTopics(data.topics || []);
    } catch (error) {
      console.error('Error loading topics:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadQuestions = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/practice/questions/${selectedTopic.id}`);
      const data = await response.json();
      setQuestions(data.questions || []);
    } catch (error) {
      console.error('Error loading questions:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateTopic = async (e) => {
    e.preventDefault();
    try {
      const response = await fetch(`${API_URL}/practice/topics`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...topicForm,
          subjectId: selectedSubject.id
        })
      });

      if (response.ok) {
        setShowTopicModal(false);
        resetTopicForm();
        await loadTopics();
      }
    } catch (error) {
      console.error('Error creating topic:', error);
    }
  };

  const handleCreateQuestion = async (e) => {
    e.preventDefault();

    // Валидация
    if (questionForm.options.some(opt => !opt.trim())) {
      alert('Заполните все 4 варианта ответа!');
      return;
    }

    try {
      const url = editingQuestion 
        ? `${API_URL}/practice/questions/${editingQuestion.id}`
        : `${API_URL}/practice/questions`;
      
      const method = editingQuestion ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...questionForm,
          topicId: selectedTopic.id
        })
      });

      if (response.ok) {
        setShowQuestionModal(false);
        resetQuestionForm();
        setEditingQuestion(null);
        await loadQuestions();
      }
    } catch (error) {
      console.error('Error saving question:', error);
    }
  };

  const handleDeleteQuestion = async (questionId) => {
    if (!window.confirm('Удалить вопрос?')) return;

    try {
      const response = await fetch(`${API_URL}/practice/questions/${questionId}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        await loadQuestions();
      }
    } catch (error) {
      console.error('Error deleting question:', error);
    }
  };

  const handleToggleQuestion = async (questionId, isActive) => {
    try {
      const response = await fetch(`${API_URL}/practice/questions/${questionId}/toggle`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !isActive })
      });

      if (response.ok) {
        await loadQuestions();
      }
    } catch (error) {
      console.error('Error toggling question:', error);
    }
  };

  const handleEditQuestion = (question) => {
    setEditingQuestion(question);
    setQuestionForm({
      questionText: question.questionText,
      options: question.options,
      correctAnswer: question.correctAnswer,
      explanation: question.explanation || '',
      difficulty: question.difficulty || 'medium'
    });
    setShowQuestionModal(true);
  };

  const resetTopicForm = () => {
    setTopicForm({
      name: '',
      description: '',
      icon: '📝'
    });
  };

  const resetQuestionForm = () => {
    setQuestionForm({
      questionText: '',
      options: ['', '', '', ''],
      correctAnswer: 0,
      explanation: '',
      difficulty: 'medium'
    });
  };

  const handleOptionChange = (index, value) => {
    const newOptions = [...questionForm.options];
    newOptions[index] = value;
    setQuestionForm({ ...questionForm, options: newOptions });
  };

  return (
    <div className="practice-section">
      <div className="section-header">
        <h2>📚 Практика</h2>
      </div>

      {/* ВЫБОР ПРЕДМЕТА */}
      {!selectedSubject ? (
        <div className="subject-selection">
          <h3>Выберите предмет</h3>
          <div className="subjects-grid">
            {subjects.map(subject => (
              <div
                key={subject.id}
                className="subject-card"
                onClick={() => setSelectedSubject(subject)}
              >
                <div className="subject-icon">{subject.icon}</div>
                <h4>{subject.name}</h4>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <>
          {/* ХЛЕБНЫЕ КРОШКИ */}
          <div className="breadcrumbs">
            <span className="breadcrumb-item clickable" onClick={() => {
              setSelectedSubject(null);
              setSelectedTopic(null);
            }}>
              Предметы
            </span>
            <span className="breadcrumb-separator">›</span>
            <span className="breadcrumb-item">{selectedSubject.icon} {selectedSubject.name}</span>
            {selectedTopic && (
              <>
                <span className="breadcrumb-separator">›</span>
                <span className="breadcrumb-item">{selectedTopic.icon} {selectedTopic.name}</span>
              </>
            )}
          </div>

          {/* РАЗДЕЛЫ/ТОПИКИ */}
          {!selectedTopic ? (
            <div className="topics-container">
              <div className="section-header">
                <h3>Разделы практики</h3>
                <button className="add-button" onClick={() => setShowTopicModal(true)}>
                  + Создать раздел
                </button>
              </div>

              {loading ? (
                <div className="loading-state">Загрузка...</div>
              ) : (
                <div className="topics-grid">
                  {topics.map(topic => (
                    <div
                      key={topic.id}
                      className="topic-card"
                      onClick={() => setSelectedTopic(topic)}
                    >
                      <div className="topic-icon">{topic.icon}</div>
                      <h4>{topic.name}</h4>
                      <p>{topic.description}</p>
                      <div className="topic-meta">
                        <span>📝 {topic.questionCount || 0} вопросов</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {topics.length === 0 && !loading && (
                <div className="empty-state">
                  <p>Нет разделов. Создайте первый раздел!</p>
                </div>
              )}
            </div>
          ) : (
            // ВОПРОСЫ
            <div className="questions-container">
              <div className="section-header">
                <h3>Вопросы</h3>
                <button className="add-button" onClick={() => {
                  resetQuestionForm();
                  setEditingQuestion(null);
                  setShowQuestionModal(true);
                }}>
                  + Добавить вопрос
                </button>
              </div>

              {loading ? (
                <div className="loading-state">Загрузка...</div>
              ) : (
                <div className="questions-list">
                  {questions.map((question, index) => (
                    <div key={question.id} className={`question-card ${!question.isActive ? 'inactive' : ''}`}>
                      <div className="question-header">
                        <div className="question-number">#{index + 1}</div>
                        <div className="question-difficulty">
                          {question.difficulty === 'easy' && '🟢 Легкий'}
                          {question.difficulty === 'medium' && '🟡 Средний'}
                          {question.difficulty === 'hard' && '🔴 Сложный'}
                        </div>
                        <div className="question-actions">
                          <button 
                            className="btn-icon"
                            onClick={() => handleEditQuestion(question)}
                            title="Редактировать"
                          >
                            ✏️
                          </button>
                          <button 
                            className="btn-icon"
                            onClick={() => handleToggleQuestion(question.id, question.isActive)}
                            title={question.isActive ? 'Отключить' : 'Включить'}
                          >
                            {question.isActive ? '👁️' : '🚫'}
                          </button>
                          <button 
                            className="btn-icon danger"
                            onClick={() => handleDeleteQuestion(question.id)}
                            title="Удалить"
                          >
                            🗑️
                          </button>
                        </div>
                      </div>

                      <div className="question-text">
                        {question.questionText}
                      </div>

                      <div className="question-options">
                        {question.options.map((option, idx) => (
                          <div 
                            key={idx} 
                            className={`option ${idx === question.correctAnswer ? 'correct' : ''}`}
                          >
                            <span className="option-letter">{String.fromCharCode(65 + idx)}</span>
                            <span className="option-text">{option}</span>
                            {idx === question.correctAnswer && <span className="correct-badge">✓ Правильный</span>}
                          </div>
                        ))}
                      </div>

                      {question.explanation && (
                        <div className="question-explanation">
                          <strong>💡 Объяснение:</strong> {question.explanation}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {questions.length === 0 && !loading && (
                <div className="empty-state">
                  <p>Нет вопросов. Добавьте первый вопрос!</p>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* МОДАЛКА СОЗДАНИЯ РАЗДЕЛА */}
      {showTopicModal && (
        <div className="modal-overlay" onClick={() => setShowTopicModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Создать раздел</h2>
              <button className="modal-close" onClick={() => setShowTopicModal(false)}>✕</button>
            </div>

            <form onSubmit={handleCreateTopic}>
              <div className="form-group">
                <label>Название раздела *</label>
                <input
                  type="text"
                  value={topicForm.name}
                  onChange={(e) => setTopicForm({...topicForm, name: e.target.value})}
                  required
                />
              </div>

              <div className="form-group">
                <label>Описание</label>
                <textarea
                  value={topicForm.description}
                  onChange={(e) => setTopicForm({...topicForm, description: e.target.value})}
                  rows="3"
                />
              </div>

              <div className="form-group">
                <label>Иконка</label>
                <input
                  type="text"
                  value={topicForm.icon}
                  onChange={(e) => setTopicForm({...topicForm, icon: e.target.value})}
                  placeholder="📝"
                />
              </div>

              <div className="modal-actions">
                <button type="button" className="btn-secondary" onClick={() => setShowTopicModal(false)}>
                  Отмена
                </button>
                <button type="submit" className="btn-primary">
                  Создать
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* МОДАЛКА СОЗДАНИЯ/РЕДАКТИРОВАНИЯ ВОПРОСА */}
      {showQuestionModal && (
        <div className="modal-overlay" onClick={() => setShowQuestionModal(false)}>
          <div className="modal-content large" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingQuestion ? 'Редактировать вопрос' : 'Добавить вопрос'}</h2>
              <button className="modal-close" onClick={() => setShowQuestionModal(false)}>✕</button>
            </div>

            <form onSubmit={handleCreateQuestion}>
              <div className="form-group">
                <label>Текст вопроса *</label>
                <textarea
                  value={questionForm.questionText}
                  onChange={(e) => setQuestionForm({...questionForm, questionText: e.target.value})}
                  rows="3"
                  required
                />
              </div>

              <div className="form-group">
                <label>Варианты ответа (все 4 обязательны)</label>
                {questionForm.options.map((option, index) => (
                  <div key={index} className="option-input-group">
                    <span className="option-letter">{String.fromCharCode(65 + index)}</span>
                    <input
                      type="text"
                      value={option}
                      onChange={(e) => handleOptionChange(index, e.target.value)}
                      placeholder={`Вариант ${String.fromCharCode(65 + index)}`}
                      required
                    />
                    <input
                      type="radio"
                      name="correctAnswer"
                      checked={questionForm.correctAnswer === index}
                      onChange={() => setQuestionForm({...questionForm, correctAnswer: index})}
                      title="Правильный ответ"
                    />
                  </div>
                ))}
              </div>

              <div className="form-group">
                <label>Объяснение (опционально)</label>
                <textarea
                  value={questionForm.explanation}
                  onChange={(e) => setQuestionForm({...questionForm, explanation: e.target.value})}
                  rows="2"
                  placeholder="Почему этот ответ правильный..."
                />
              </div>

              <div className="form-group">
                <label>Уровень сложности (опционально)</label>
                <select
                  value={questionForm.difficulty}
                  onChange={(e) => setQuestionForm({...questionForm, difficulty: e.target.value})}
                >
                  <option value="easy">🟢 Легкий</option>
                  <option value="medium">🟡 Средний</option>
                  <option value="hard">🔴 Сложный</option>
                </select>
              </div>

              <div className="modal-actions">
                <button type="button" className="btn-secondary" onClick={() => setShowQuestionModal(false)}>
                  Отмена
                </button>
                <button type="submit" className="btn-primary">
                  {editingQuestion ? 'Сохранить' : 'Создать'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default Practice;