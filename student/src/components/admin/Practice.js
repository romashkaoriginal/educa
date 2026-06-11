import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import '../../styles/Practice.css';
import { adminFetch } from './adminApi';

import { API_URL } from '../../config';
import { useSectionRefresh } from './useSectionRefresh';

function Practice({ dataRefreshKey = 0 }) {
  const [subjects, setSubjects] = useState([]);
  const [selectedSubject, setSelectedSubject] = useState(null);
  const [topics, setTopics] = useState([]);
  const [selectedTopic, setSelectedTopic] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [expandedQuestions, setExpandedQuestions] = useState(new Set());
  
  const [showTopicModal, setShowTopicModal] = useState(false);
  const [showQuestionModal, setShowQuestionModal] = useState(false);
  
  const [editingQuestion, setEditingQuestion] = useState(null);
  const [editingTopic, setEditingTopic] = useState(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importResult, setImportResult] = useState(null);

  const [topicForm, setTopicForm] = useState({
    name: '',
    description: '',
    icon: '📝',
    weight: ''
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
      const response = await adminFetch(`${API_URL}/subjects`);
      const data = await response.json();
      setSubjects(data.subjects || []);
    } catch (error) {
      console.error('Error loading subjects:', error);
    }
  };

  const loadTopics = async () => {
    if (!selectedSubject) return [];
    try {
      const response = await adminFetch(`${API_URL}/practice/topics/${selectedSubject.id}`);
      const data = await response.json();
      const list = data.topics || [];
      setTopics(list);
      return list;
    } catch (error) {
      console.error('Error loading topics:', error);
      return [];
    }
  };

  const loadQuestions = async () => {
    if (!selectedTopic) return [];
    try {
      const response = await adminFetch(`${API_URL}/practice/questions/${selectedTopic.id}`);
      const data = await response.json();
      const list = data.questions || [];
      setQuestions(list);
      setExpandedQuestions(new Set());
      return list;
    } catch (error) {
      console.error('Error loading questions:', error);
      return [];
    }
  };

  const refreshQuestionsAndTopicCount = async () => {
    const list = await loadQuestions();
    const topicId = selectedTopic?.id;
    if (!topicId) return list;

    const updatedTopics = await loadTopics();
    const updatedTopic = updatedTopics.find((t) => t.id === topicId);
    if (updatedTopic) {
      setSelectedTopic(updatedTopic);
    } else {
      setSelectedTopic((prev) => (
        prev ? { ...prev, questionCount: list.length } : prev
      ));
    }
    return list;
  };

  useSectionRefresh(dataRefreshKey, () => {
    loadSubjects();
    if (selectedSubject) loadTopics();
    if (selectedTopic) loadQuestions();
  });

  const downloadTemplate = () => {
    try {
      const rows = [
        ['question', 'a', 'b', 'c', 'd', 'correct', 'difficulty', 'explanation'],
        ['Чему равно 2+2?', '3', '4', '5', '6', 'b', 'easy', 'Простое сложение'],
      ];
      const sheet = XLSX.utils.aoa_to_sheet(rows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, sheet, 'Questions');
      XLSX.writeFile(workbook, 'questions_template.xlsx');
    } catch (e) {
      alert('Ошибка скачивания шаблона');
    }
  };

  const handleImport = async () => {
    if (!importFile || !selectedTopic) return;
    setImportLoading(true);
    setImportResult(null);
    try {
      const formData = new FormData();
      formData.append('file', importFile);
      const response = await adminFetch(
        `${API_URL}/practice/questions/${selectedTopic.id}/import`,
        { method: 'POST', body: formData }
      );
      const data = await response.json();
      if (response.ok) {
        setImportResult(data);
        await refreshQuestionsAndTopicCount();
      } else {
        setImportResult({ error: data.message || 'Ошибка импорта' });
      }
    } catch (e) {
      setImportResult({ error: 'Ошибка сети: ' + e.message });
    } finally {
      setImportLoading(false);
    }
  };

  const toggleQuestion = (id) => {
    setExpandedQuestions(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const expandAll = () => setExpandedQuestions(new Set(questions.map(q => q.id)));
  const collapseAll = () => setExpandedQuestions(new Set());

  const resetTopicForm = () => {
    setTopicForm({
      name: '',
      description: '',
      icon: '📝',
      weight: ''
    });
  };

  const getTopicWeightSum = (excludeTopicId = null) => {
    return topics.reduce((sum, t) => {
      if (excludeTopicId && t.id === excludeTopicId) return sum;
      const w = parseFloat(t.weight);
      return sum + (Number.isFinite(w) ? w : 0);
    }, 0);
  };

  const getProjectedWeightSum = () => {
    const formWeight = parseFloat(topicForm.weight);
    const currentWeight = Number.isFinite(formWeight) ? formWeight : 0;
    const othersSum = getTopicWeightSum(editingTopic?.id || null);
    return Math.round((othersSum + currentWeight) * 10) / 10;
  };

  const buildTopicPayload = () => {
    const payload = {
      name: topicForm.name,
      description: topicForm.description,
      icon: topicForm.icon
    };
    if (topicForm.weight !== '' && topicForm.weight != null) {
      const w = parseFloat(topicForm.weight);
      if (Number.isFinite(w)) payload.weight = w;
    }
    return payload;
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
      const response = await adminFetch(`${API_URL}/practice/topics`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...buildTopicPayload(),
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
      icon: topic.icon || '📝',
      weight: topic.weight != null ? String(topic.weight) : ''
    });
    setShowTopicModal(true);
  };

  const handleUpdateTopic = async (e) => {
    e.preventDefault();
    try {
      const response = await adminFetch(`${API_URL}/practice/topics/${editingTopic.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildTopicPayload())
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
      const response = await adminFetch(`${API_URL}/practice/topics/${topicId}`, {
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
      const response = await adminFetch(`${API_URL}/practice/questions`, {
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
        await refreshQuestionsAndTopicCount();
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
      const response = await adminFetch(`${API_URL}/practice/questions/${editingQuestion.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(questionForm)
      });

      if (response.ok) {
        setShowQuestionModal(false);
        setEditingQuestion(null);
        resetQuestionForm();
        await refreshQuestionsAndTopicCount();
      }
    } catch (error) {
      console.error('Error updating question:', error);
    }
  };

  const handleToggleQuestion = async (questionId, isActive) => {
    try {
      await adminFetch(`${API_URL}/practice/questions/${questionId}/toggle`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !isActive })
      });
      await refreshQuestionsAndTopicCount();
    } catch (error) {
      console.error('Error toggling question:', error);
    }
  };

  const handleDeleteQuestion = async (questionId) => {
    if (!window.confirm('Удалить вопрос?')) return;

    try {
      const response = await adminFetch(`${API_URL}/practice/questions/${questionId}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        await refreshQuestionsAndTopicCount();
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
            {(() => {
              const sum = getTopicWeightSum();
              if (sum <= 0) return null;
              const ok = Math.abs(sum - 100) < 0.01;
              return (
                <p className={`weight-sum-banner ${ok ? 'ok' : 'warn'}`}>
                  Сумма весов тем: {sum}% {ok ? '✓' : '— должно быть 100%'}
                </p>
              );
            })()}
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
                  {topic.weight != null && (
                    <span className="topic-weight-badge">⚖️ {topic.weight}%</span>
                  )}
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

                <div className="form-group">
                  <label>Вес темы (%)</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    value={topicForm.weight}
                    onChange={(e) => setTopicForm({...topicForm, weight: e.target.value})}
                    placeholder="Например: 25"
                  />
                  <p className="form-hint">
                    Сумма весов всех тем предмета должна быть 100%.
                    {topicForm.weight !== '' && (
                      <> Итого будет: <strong>{getProjectedWeightSum()}%</strong></>
                    )}
                  </p>
                  {topicForm.weight !== '' && Math.abs(getProjectedWeightSum() - 100) >= 0.01 && (
                    <p className="weight-warning">⚠️ Сумма весов не равна 100%</p>
                  )}
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
          <p className="section-description">{selectedTopic.name} · {questions.length} вопросов</p>
        </div>
        <div className="section-header-actions">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              setShowImportModal(true);
              setImportFile(null);
              setImportResult(null);
            }}
          >
            📥 Загрузить из Excel
          </button>
          <button
            type="button"
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
      </div>

      {/* Панель развернуть/свернуть */}
      {questions.length > 0 && (
        <div className="questions-expand-bar">
          <span className="questions-expand-hint">
            {expandedQuestions.size === 0
              ? 'Все вопросы свёрнуты'
              : `Развёрнуто: ${expandedQuestions.size} из ${questions.length}`}
          </span>
          <div className="questions-expand-btns">
            <button className="btn-expand" onClick={expandAll}>Развернуть все</button>
            <button className="btn-expand" onClick={collapseAll}>Свернуть все</button>
          </div>
        </div>
      )}

      <div className="questions-list">
        {questions.map((question, index) => {
          const isExpanded = expandedQuestions.has(question.id);
          return (
            <div 
              key={question.id} 
              className={`question-card ${!question.isActive ? 'inactive' : ''}`}
            >
              {/* Шапка — всегда видна, клик разворачивает */}
              <div
                className="question-header"
                onClick={() => toggleQuestion(question.id)}
                style={{ cursor: 'pointer' }}
              >
                <div className="question-header-left">
                  <span className="question-expand-icon">{isExpanded ? '▼' : '▶'}</span>
                  <span className="question-number">#{index + 1}</span>
                  <span className="question-preview">
                    {question.questionText.length > 70
                      ? question.questionText.slice(0, 70) + '...'
                      : question.questionText}
                  </span>
                  {!question.isActive && <span className="inactive-badge">скрыт</span>}
                </div>
                <div className="question-actions" onClick={e => e.stopPropagation()}>
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

              {/* Тело — только если развёрнут */}
              {isExpanded && (
                <div className="question-body">
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
              )}
            </div>
          );
        })}
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

      {showImportModal && (
        <div className="modal-overlay" onClick={() => setShowImportModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>📥 Загрузка из Excel</h2>
              <button className="modal-close" onClick={() => setShowImportModal(false)}>✕</button>
            </div>
            <div className="import-modal-body">
              <div className="import-format-hint">
                <strong>Формат файла (.xlsx):</strong><br />
                Колонки: <code>question</code>, <code>a</code>, <code>b</code>, <code>c</code>, <code>d</code>, <code>correct</code>, <code>difficulty</code>, <code>explanation</code><br />
                <span className="import-hint-key">correct</span> — строчная буква: a / b / c / d<br />
                <span className="import-hint-key">difficulty</span> — easy / medium / hard (по умолчанию medium)<br />
                <span className="import-hint-key">explanation</span> — необязательно, можно оставить пустым
              </div>

              <button type="button" className="btn-secondary import-template-btn" onClick={downloadTemplate}>
                ⬇️ Скачать шаблон
              </button>

              <div className="form-group">
                <label>Выберите файл .xlsx</label>
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  className="import-file-input"
                  onChange={(e) => {
                    setImportFile(e.target.files[0]);
                    setImportResult(null);
                  }}
                />
              </div>

              {importResult && !importResult.error && (
                <div className="import-result-ok">
                  ✅ Загружено: <strong>{importResult.imported}</strong> вопросов
                  {importResult.skipped > 0 && (
                    <>, пропущено: <strong>{importResult.skipped}</strong></>
                  )}
                  {importResult.errors?.length > 0 && (
                    <div className="import-result-errors">
                      {importResult.errors.map((e, i) => (
                        <div key={i}>⚠️ Строка {e.row}: {e.reason}</div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {importResult?.error && (
                <div className="import-result-error">❌ {importResult.error}</div>
              )}

              <div className="modal-actions">
                <button type="button" className="btn-secondary" onClick={() => setShowImportModal(false)}>
                  Закрыть
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={handleImport}
                  disabled={!importFile || importLoading}
                >
                  {importLoading ? 'Загружаю...' : 'Загрузить'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Practice;