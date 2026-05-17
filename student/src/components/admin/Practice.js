import React, { useState, useEffect } from 'react';
import '../../styles/Practice.css';

const API_URL = 'https://educa-production-a98e.up.railway.app/api';

function Practice() {
  const [subjects, setSubjects] = useState([]);
  const [selectedSubject, setSelectedSubject] = useState(null);
  const [topics, setTopics] = useState([]);
  const [selectedTopic, setSelectedTopic] = useState(null);
  const [questions, setQuestions] = useState([]);
  
  const [showTopicModal, setShowTopicModal] = useState(false);
  const [showQuestionModal, setShowQuestionModal] = useState(false);
  
  const [editingQuestion, setEditingQuestion] = useState(null);
  const [editingTopic, setEditingTopic] = useState(null);
  
  const [topicForm, setTopicForm] = useState({
    name: '',
    description: '',
    icon: '📝'
  });
  
  const [questionForm, setQuestionForm] = useState({
    questionText: '',
    options: ['', '', '', ''],
    correctAnswer: 0,
    explanation: '',
    difficulty: 'medium'
  });

  useEffect(() => {
    loadSubjects();
  }, []);

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

  const loadSubjects = async () => {
    try {
      const response = await fetch(`${API_URL}/subjects`);
      const data = await response.json();
      setSubjects(data.subjects || []);
    } catch (error) {
      console.error('Error loading subjects:', error);
    }
  };

  const loadTopics = async () => {
    try {
      const response = await fetch(`${API_URL}/practice/topics/${selectedSubject.id}`);
      const data = await response.json();
      setTopics(data.topics || []);
    } catch (error) {
      console.error('Error loading topics:', error);
    }
  };

  const loadQuestions = async () => {
    try {
      const response = await fetch(`${API_URL}/practice/questions/${selectedTopic.id}`);
      const data = await response.json();
      setQuestions(data.questions || []);
    } catch (error) {
      console.error('Error loading questions:', error);
    }
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

  const handleEditTopic = (topic) => {
    setEditingTopic(topic);
    setTopicForm({
      name: topic.name,
      description: topic.description || '',
      icon: topic.icon || '📝'
    });
    setShowTopicModal(true);
  };

  const handleUpdateTopic = async (e) => {
    e.preventDefault();
    try {
      const response = await fetch(`${API_URL}/practice/topics/${editingTopic.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(topicForm)
      });

      if (response.ok) {
        setShowTopicModal(false);
        setEditingTopic(null);
        resetTopicForm();
        await loadTopics();
      }
    } catch (error) {
      console.error('Error updating topic:', error);
    }
  };

  const handleDeleteTopic = async (topicId) => {
    if (!window.confirm('Удалить раздел? Все вопросы в нём будут удалены!')) return;

    try {
      const response = await fetch(`${API_URL}/practice/topics/${topicId}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        if (selectedTopic && selectedTopic.id === topicId) {
          setSelectedTopic(null);
        }
        await loadTopics();
      }
    } catch (error) {
      console.error('Error deleting topic:', error);
    }
  };

  const handleCreateQuestion = async (e) => {
    e.preventDefault();
    try {
      const response = await fetch(`${API_URL}/practice/questions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...questionForm,
          topicId: selectedTopic.id
        })
      });

      if (response.ok) {
        setShowQuestionModal(false);
        resetQuestionForm();
        await loadQuestions();
      }
    } catch (error) {
      console.error('Error creating question:', error);
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

  const handleUpdateQuestion = async (e) => {
    e.preventDefault();
    try {
      const response = await fetch(`${API_URL}/practice/questions/${editingQuestion.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(questionForm)
      });

      if (response.ok) {
        setShowQuestionModal(false);
        setEditingQuestion(null);
        resetQuestionForm();
        await loadQuestions();
      }
    } catch (error) {
      console.error('Error updating question:', error);
    }
  };

  const handleToggleQuestion = async (questionId, isActive) => {
    try {
      await fetch(`${API_URL}/practice/questions/${questionId}/toggle`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !isActive })
      });
      await loadQuestions();
    } catch (error) {
      console.error('Error toggling question:', error);
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

  // BREADCRUMBS
  const renderBreadcrumbs = () => {
    return (
      <div className="breadcrumbs">
        <button onClick={() => { setSelectedSubject(null); setSelectedTopic(null); }}>
          Предметы
        </button>
        {selectedSubject && (
          <>
            <span className="separator">→</span>
            <button onClick={() => setSelectedTopic(null)}>
              {selectedSubject.name}
            </button>
          </>
        )}
        {selectedTopic && (
          <>
            <span className="separator">→</span>
            <span className="current">{selectedTopic.name}</span>
          </>
        )}
      </div>
    );
  };

  // SUBJECT LIST
  if (!selectedSubject) {
    return (
      <div className="practice-admin">
        <h2 className="section-title">Управление практикой</h2>
        <p className="section-description">Выберите предмет для настройки разделов и вопросов</p>

        <div className="subjects-grid">
          {subjects.map(subject => (
            <div
              key={subject.id}
              className="subject-card"
              onClick={() => setSelectedSubject(subject)}
            >
              <div className="subject-icon">{subject.icon}</div>
              <h3>{subject.name}</h3>
              <p>{subject.description}</p>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // TOPICS LIST
  if (!selectedTopic) {
    return (
      <div className="practice-admin">
        {renderBreadcrumbs()}
        
        <div className="section-header">
          <div>
            <h2 className="section-title">Разделы практики</h2>
            <p className="section-description">{selectedSubject.name}</p>
          </div>
          <button 
            className="btn-primary"
            onClick={() => {
              setEditingTopic(null);
              resetTopicForm();
              setShowTopicModal(true);
            }}
          >
            + Создать раздел
          </button>
        </div>

        <div className="topics-grid">
          {topics.map(topic => (
            <div
              key={topic.id}
              className="topic-card"
            >
              <div className="topic-card-header">
                <div className="topic-actions">
                  <button 
                    className="btn-icon"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleEditTopic(topic);
                    }}
                    title="Редактировать"
                  >
                    ✏️
                  </button>
                  <button 
                    className="btn-icon danger"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteTopic(topic.id);
                    }}
                    title="Удалить"
                  >
                    🗑️
                  </button>
                </div>
              </div>
              <div 
                className="topic-card-body"
                onClick={() => setSelectedTopic(topic)}
              >
                <div className="topic-icon">{topic.icon}</div>
                <h4>{topic.name}</h4>
                <p>{topic.description}</p>
                <div className="topic-meta">
                  <span>📝 {topic.questionCount || 0} вопросов</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* TOPIC MODAL */}
        {showTopicModal && (
          <div className="modal-overlay" onClick={() => {
            setShowTopicModal(false);
            setEditingTopic(null);
          }}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h2>{editingTopic ? 'Редактировать раздел' : 'Создать раздел'}</h2>
                <button className="modal-close" onClick={() => {
                  setShowTopicModal(false);
                  setEditingTopic(null);
                }}>✕</button>
              </div>

              <form onSubmit={editingTopic ? handleUpdateTopic : handleCreateTopic}>
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
                  <button type="button" className="btn-secondary" onClick={() => {
                    setShowTopicModal(false);
                    setEditingTopic(null);
                  }}>
                    Отмена
                  </button>
                  <button type="submit" className="btn-primary">
                    {editingTopic ? 'Сохранить' : 'Создать'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  }

  // QUESTIONS LIST
  return (
    <div className="practice-admin">
      {renderBreadcrumbs()}
      
      <div className="section-header">
        <div>
          <h2 className="section-title">Вопросы</h2>
          <p className="section-description">{selectedTopic.name}</p>
        </div>
        <button 
          className="btn-primary"
          onClick={() => {
            setEditingQuestion(null);
            resetQuestionForm();
            setShowQuestionModal(true);
          }}
        >
          + Добавить вопрос
        </button>
      </div>

      <div className="questions-list">
        {questions.map((question, index) => (
          <div 
            key={question.id} 
            className={`question-card ${!question.isActive ? 'inactive' : ''}`}
          >
            <div className="question-header">
              <div className="question-number">Вопрос #{index + 1}</div>
              <div className="question-actions">
                {question.difficulty && (
                  <span className={`difficulty-badge ${question.difficulty}`}>
                    {question.difficulty === 'easy' && '🟢 Легкий'}
                    {question.difficulty === 'medium' && '🟡 Средний'}
                    {question.difficulty === 'hard' && '🔴 Сложный'}
                  </span>
                )}
                <button
                  className="btn-icon"
                  onClick={() => handleToggleQuestion(question.id, question.isActive)}
                  title={question.isActive ? 'Деактивировать' : 'Активировать'}
                >
                  {question.isActive ? '👁️' : '🚫'}
                </button>
                <button
                  className="btn-icon"
                  onClick={() => handleEditQuestion(question)}
                  title="Редактировать"
                >
                  ✏️
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

            <div className="question-text">{question.questionText}</div>

            <div className="question-options">
              {question.options.map((option, idx) => (
                <div 
                  key={idx} 
                  className={`option ${idx === question.correctAnswer ? 'correct' : ''}`}
                >
                  <span className="option-letter">{String.fromCharCode(65 + idx)}</span>
                  <span className="option-text">{option}</span>
                  {idx === question.correctAnswer && <span className="correct-mark">✓</span>}
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

      {/* QUESTION MODAL */}
      {showQuestionModal && (
        <div className="modal-overlay" onClick={() => {
          setShowQuestionModal(false);
          setEditingQuestion(null);
        }}>
          <div className="modal modal-large" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editingQuestion ? 'Редактировать вопрос' : 'Добавить вопрос'}</h2>
              <button className="modal-close" onClick={() => {
                setShowQuestionModal(false);
                setEditingQuestion(null);
              }}>✕</button>
            </div>

            <form onSubmit={editingQuestion ? handleUpdateQuestion : handleCreateQuestion}>
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
                <label>Варианты ответа *</label>
                {questionForm.options.map((option, idx) => (
                  <div key={idx} className="option-input">
                    <span className="option-letter">{String.fromCharCode(65 + idx)}</span>
                    <input
                      type="text"
                      value={option}
                      onChange={(e) => {
                        const newOptions = [...questionForm.options];
                        newOptions[idx] = e.target.value;
                        setQuestionForm({...questionForm, options: newOptions});
                      }}
                      required
                    />
                    <input
                      type="radio"
                      name="correctAnswer"
                      checked={questionForm.correctAnswer === idx}
                      onChange={() => setQuestionForm({...questionForm, correctAnswer: idx})}
                      title="Правильный ответ"
                    />
                  </div>
                ))}
              </div>

              <div className="form-group">
                <label>Объяснение</label>
                <textarea
                  value={questionForm.explanation}
                  onChange={(e) => setQuestionForm({...questionForm, explanation: e.target.value})}
                  rows="2"
                  placeholder="Почему это правильный ответ?"
                />
              </div>

              <div className="form-group">
                <label>Сложность</label>
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
                <button type="button" className="btn-secondary" onClick={() => {
                  setShowQuestionModal(false);
                  setEditingQuestion(null);
                }}>
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