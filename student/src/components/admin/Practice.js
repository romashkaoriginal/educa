import React, { useState, useEffect } from 'react';
import '../../styles/Practice.css';
import { adminFetch } from './adminApi';

import { API_URL } from '../../config';
import { useSectionRefresh } from './useSectionRefresh';
import { useConfirmDelete } from './useConfirmDelete';
import { getDeleteConfirm } from './cascadeDeleteMessages';
import ImageUploadField, { imageUrl } from './ImageUploadField';
import { checkQuestionFits, FIT_ERROR_MESSAGE } from '../../utils/questionFit';
// Допустимое число вариантов ответа при ручном создании/редактировании.
const MIN_OPTIONS = 2;
const MAX_OPTIONS = 4;

// correctAnswer хранится как массив индексов (multiple choice, ТЗ уточнение).
const toCorrectSet = (correctAnswer) =>
  new Set(Array.isArray(correctAnswer) ? correctAnswer : [correctAnswer]);

// Мобильное превью вопроса на контрольном экране 360×640 (ТЗ §4.2).
// Показывает порядок «изображение → текст → варианты» и предупреждает,
// если по эвристике вопрос не помещается.
function QuestionMobilePreview({ form }) {
  const hasImage = !!form.questionImage;
  const hasText = !!form.questionText.trim();
  const fit = checkQuestionFits({
    questionText: form.questionText,
    options: form.options,
    hasImage,
  });

  return (
    <div className="form-group">
      <label>Мобильное превью (360×640)</label>
      <div className="mobile-preview-wrap">
        <div className="mobile-preview-frame">
          <div className="mobile-preview-meta">
            {form.difficulty === 'easy' && '🟢 Легкий'}
            {form.difficulty === 'medium' && '🟡 Средний'}
            {form.difficulty === 'hard' && '🔴 Сложный'}
          </div>
          {hasImage && (
            <div className="mobile-preview-image">
              <img src={imageUrl(form.questionImage.storageKey)} alt="Превью вопроса" />
            </div>
          )}
          {hasText && (
            <div className="mobile-preview-text">{form.questionText}</div>
          )}
          <div className="mobile-preview-options">
            {form.options.map((opt, i) => (
              <div key={i} className="mobile-preview-option">
                <span>{String.fromCharCode(65 + i)}</span>
                <span>{opt || '—'}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      {!fit.fits && (
        <div className="mobile-preview-warning">
          ⚠️ Вопрос может не поместиться на одном экране ({fit.estimated}px из {fit.available}px).
          Сократите текст или варианты.
        </div>
      )}
    </div>
  );
}

function Practice({ dataRefreshKey = 0 }) {
  const { confirmDelete, ConfirmDeleteDialog } = useConfirmDelete();
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
    icon: '📝'
  });
  
  const [questionForm, setQuestionForm] = useState({
    questionText: '',
    questionImage: null,
    options: ['', '', '', ''],
    correctAnswer: [0],
    explanation: '',
    hintImage: null,
    difficulty: 'medium'
  });
  const [questionError, setQuestionError] = useState('');

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

  const downloadTemplate = async () => {
    try {
      const response = await adminFetch(`${API_URL}/practice/questions/import-template`);
      if (!response.ok) throw new Error('bad response');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'questions_template.xlsx';
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
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
      icon: '📝'
    });
  };

  // Вес тем больше не настраивается вручную — баллы распределяются
  // поровну между темами предмета на бэкенде.
  const buildTopicPayload = () => ({
    name: topicForm.name,
    description: topicForm.description,
    icon: topicForm.icon
  });

  const resetQuestionForm = () => {
    setQuestionForm({
      questionText: '',
      questionImage: null,
      options: ['', '', '', ''],
      correctAnswer: [0],
      explanation: '',
      hintImage: null,
      difficulty: 'medium'
    });
    setQuestionError('');
  };

  // Клиентская проверка перед сохранением (ТЗ §2.3). Возвращает текст ошибки или null.
  const validateQuestion = () => {
    const hasText = !!questionForm.questionText.trim();
    const hasImage = !!questionForm.questionImage;
    if (!hasText && !hasImage) {
      return 'Добавьте текст вопроса или изображение.';
    }
    if (questionForm.options.some((o) => !o.trim())) {
      return 'Заполните все варианты ответа.';
    }
    if (!questionForm.correctAnswer || questionForm.correctAnswer.length === 0) {
      return 'Выберите хотя бы один правильный вариант ответа.';
    }
    // Подсказка в этой модели «включена», только если задан её текст или картинка,
    // поэтому пустой она быть не может по построению — отдельной проверки не нужно.
    const fit = checkQuestionFits({
      questionText: questionForm.questionText,
      options: questionForm.options,
      hasImage,
    });
    if (!fit.fits) {
      return FIT_ERROR_MESSAGE;
    }
    return null;
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
      icon: topic.icon || '📝'
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

  const handleDeleteTopic = async (topic) => {
    const confirmed = await confirmDelete(getDeleteConfirm('topic', {
      name: topic.name,
      questionCount: topic.questionCount,
    }));
    if (!confirmed) return;

    try {
      const response = await adminFetch(`${API_URL}/practice/topics/${topic.id}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        if (selectedTopic && selectedTopic.id === topic.id) {
          setSelectedTopic(null);
        }
        await loadTopics();
      }
    } catch (error) {
      console.error('Error deleting topic:', error);
    }
  };

  const buildQuestionPayload = () => ({
    questionText: questionForm.questionText,
    questionImageId: questionForm.questionImage?.id ?? null,
    options: questionForm.options,
    correctAnswer: questionForm.correctAnswer,
    explanation: questionForm.explanation,
    hintImageId: questionForm.hintImage?.id ?? null,
    difficulty: questionForm.difficulty,
  });

  const handleCreateQuestion = async (e) => {
    e.preventDefault();
    const err = validateQuestion();
    if (err) { setQuestionError(err); return; }
    setQuestionError('');
    try {
      const response = await adminFetch(`${API_URL}/practice/questions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...buildQuestionPayload(),
          topicId: selectedTopic.id
        })
      });

      if (response.ok) {
        setShowQuestionModal(false);
        resetQuestionForm();
        await refreshQuestionsAndTopicCount();
      } else {
        const data = await response.json().catch(() => ({}));
        setQuestionError(data.message || 'Не удалось создать вопрос');
      }
    } catch (error) {
      console.error('Error creating question:', error);
      setQuestionError('Ошибка сети');
    }
  };

  const handleEditQuestion = (question) => {
    setEditingQuestion(question);
    setQuestionForm({
      questionText: question.questionText || '',
      questionImage: question.questionImage || null,
      options: question.options,
      correctAnswer: Array.from(toCorrectSet(question.correctAnswer)),
      explanation: question.explanation || '',
      hintImage: question.hintImage || null,
      difficulty: question.difficulty || 'medium'
    });
    setQuestionError('');
    setShowQuestionModal(true);
  };

  const handleUpdateQuestion = async (e) => {
    e.preventDefault();
    const err = validateQuestion();
    if (err) { setQuestionError(err); return; }
    setQuestionError('');
    try {
      const response = await adminFetch(`${API_URL}/practice/questions/${editingQuestion.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildQuestionPayload())
      });

      if (response.ok) {
        setShowQuestionModal(false);
        setEditingQuestion(null);
        resetQuestionForm();
        await refreshQuestionsAndTopicCount();
      } else {
        const data = await response.json().catch(() => ({}));
        setQuestionError(data.message || 'Не удалось сохранить вопрос');
      }
    } catch (error) {
      console.error('Error updating question:', error);
      setQuestionError('Ошибка сети');
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
                      handleDeleteTopic(topic);
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
        {ConfirmDeleteDialog}
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
                    {question.questionText
                      ? (question.questionText.length > 70
                          ? question.questionText.slice(0, 70) + '...'
                          : question.questionText)
                      : '🖼️ Вопрос с изображением'}
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
                  {question.questionImage && (
                    <div className="question-body-image">
                      <img src={imageUrl(question.questionImage.storageKey)} alt="Изображение вопроса" />
                    </div>
                  )}
                  {question.questionText && (
                    <div className="question-text">{question.questionText}</div>
                  )}

                  <div className="question-options">
                    {(() => {
                      const correctSet = toCorrectSet(question.correctAnswer);
                      return question.options.map((option, idx) => (
                        <div
                          key={idx}
                          className={`option ${correctSet.has(idx) ? 'correct' : ''}`}
                        >
                          <span className="option-letter">{String.fromCharCode(65 + idx)}</span>
                          <span className="option-text">{option}</span>
                          {correctSet.has(idx) && <span className="correct-mark">✓</span>}
                        </div>
                      ));
                    })()}
                  </div>

                  {(question.explanation || question.hintImage) && (
                    <div className="question-explanation">
                      <strong>💡 Подсказка:</strong>
                      {question.hintImage && (
                        <div className="question-body-image question-body-image--hint">
                          <img src={imageUrl(question.hintImage.storageKey)} alt="Изображение подсказки" />
                        </div>
                      )}
                      {question.explanation && <span> {question.explanation}</span>}
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
              {/* Содержание вопроса: текст и/или изображение (ТЗ §2.1) */}
              <div className="form-section">
                <div className="form-section-title">Содержание вопроса</div>
                <div className="form-group">
                  <label>Текст вопроса</label>
                  <textarea
                    value={questionForm.questionText}
                    onChange={(e) => setQuestionForm({...questionForm, questionText: e.target.value})}
                    rows="3"
                    placeholder="Можно оставить пустым, если добавлено изображение"
                  />
                </div>
                <div className="form-group">
                  <ImageUploadField
                    label="Изображение вопроса"
                    value={questionForm.questionImage}
                    onChange={(img) => setQuestionForm((f) => ({ ...f, questionImage: img }))}
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Варианты ответа * (от {MIN_OPTIONS} до {MAX_OPTIONS})</label>
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
                      type="checkbox"
                      checked={questionForm.correctAnswer.includes(idx)}
                      onChange={(e) => {
                        const next = e.target.checked
                          ? [...questionForm.correctAnswer, idx]
                          : questionForm.correctAnswer.filter((i) => i !== idx);
                        setQuestionForm({...questionForm, correctAnswer: next});
                      }}
                      title="Правильный ответ"
                    />
                    {questionForm.options.length > MIN_OPTIONS && (
                      <button
                        type="button"
                        className="btn-icon danger option-remove-btn"
                        title="Удалить вариант"
                        onClick={() => {
                          const newOptions = questionForm.options.filter((_, i) => i !== idx);
                          // Сдвигаем индексы правильных ответов после удаления варианта idx.
                          const newCorrect = questionForm.correctAnswer
                            .filter((i) => i !== idx)
                            .map((i) => (i > idx ? i - 1 : i));
                          setQuestionForm({
                            ...questionForm,
                            options: newOptions,
                            correctAnswer: newCorrect.length > 0 ? newCorrect : [0],
                          });
                        }}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}
                {questionForm.options.length < MAX_OPTIONS && (
                  <button
                    type="button"
                    className="btn-secondary option-add-btn"
                    onClick={() => setQuestionForm({
                      ...questionForm,
                      options: [...questionForm.options, '']
                    })}
                  >
                    + Добавить вариант
                  </button>
                )}
              </div>

              {/* Подсказка: текст и/или изображение (ТЗ §2.2) */}
              <div className="form-section">
                <div className="form-section-title">Подсказка</div>
                <div className="form-group">
                  <label>Текст подсказки</label>
                  <textarea
                    value={questionForm.explanation}
                    onChange={(e) => setQuestionForm({...questionForm, explanation: e.target.value})}
                    rows="2"
                    placeholder="Объяснение или подсказка (необязательно)"
                  />
                </div>
                <div className="form-group">
                  <ImageUploadField
                    label="Изображение подсказки"
                    value={questionForm.hintImage}
                    onChange={(img) => setQuestionForm((f) => ({ ...f, hintImage: img }))}
                  />
                </div>
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

              {/* Мобильное превью контрольного экрана 360×640 (ТЗ §4.2) */}
              <QuestionMobilePreview form={questionForm} />

              {questionError && (
                <div className="question-form-error">⚠️ {questionError}</div>
              )}

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
                <span className="import-hint-key">correct</span> — строчная буква: a / b / c / d (несколько правильных — через запятую, напр. "a,c")<br />
                <span className="import-hint-key">difficulty</span> — easy / medium / hard (по умолчанию medium)<br />
                <span className="import-hint-key">explanation</span> — объяснение
              </div>

              <div className="import-images-note">
                Через Excel загружаются только текстовые вопросы. Изображения к условию
                и подсказке можно добавить после импорта в редакторе вопроса.
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
      {ConfirmDeleteDialog}
    </div>
  );
}

export default Practice;