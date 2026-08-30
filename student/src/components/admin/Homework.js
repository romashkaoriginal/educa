import React, { useState, useEffect } from 'react';
import '../../styles/Homework.css';
import { adminFetch } from './adminApi';

import { API_URL } from '../../config';
import { useSectionRefresh } from './useSectionRefresh';
import StudentHomework from '../../pages/Homework';
import { PreviewDataProvider } from '../../pages/DataContext';
import MathText, { LatexHelp } from '../MathText';
import FormattingTextarea from '../FormattingTextarea';

const QUESTION_TYPES = [
  { value: 'single_choice', label: 'Тест с одним правильным ответом', icon: '⭕' },
  { value: 'multiple_choice', label: 'Тест с несколькими правильными ответами', icon: '☑️' },
  { value: 'short_answer', label: 'Краткий ответ', icon: '✍️' },
  { value: 'numeric', label: 'Числовой ответ', icon: '🔢' },
  { value: 'matching', label: 'Соединить пары', icon: '🔗' },
  { value: 'ordering', label: 'Расставить по порядку', icon: '📊' },
  { value: 'fill_blanks', label: 'Заполнить пропуски', icon: '📝' },
  { value: 'true_false', label: 'Верно / неверно', icon: '✓✗' }
];

const MONTHS_RU = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
];

function Homework({ subjects, currentUserId, dataRefreshKey = 0 }) {
  const [homeworks, setHomeworks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingHomework, setEditingHomework] = useState(null);
  const [selectedHomework, setSelectedHomework] = useState(null);
  const [previewHomework, setPreviewHomework] = useState(null);
  const [previewLoadingId, setPreviewLoadingId] = useState(null);

  // Навигация: null → subject → month → homeworks
  const [selectedSubject, setSelectedSubject] = useState(null);
  const [selectedMonth, setSelectedMonth] = useState(null); // { year, month } или null

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    subjectId: '',
    openDate: '',
    closeDate: '',
    maxAttempts: ''
  });

  const [questions, setQuestions] = useState([]);
  const [currentQuestion, setCurrentQuestion] = useState({
    questionType: 'single_choice',
    questionText: '',
    options: ['', '', '', ''],
    correctAnswer: null,
    explanation: '',
    points: 10
  });

  const [editingQuestionIndex, setEditingQuestionIndex] = useState(null);

  const [showImportModal, setShowImportModal] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importResult, setImportResult] = useState(null);

  useEffect(() => {
    loadHomeworks();
  }, []);

  const loadHomeworks = async () => {
    try {
      const response = await adminFetch(`${API_URL}/homework/all`);
      const data = await response.json();
      setHomeworks(data.homeworks || []);
    } catch (error) {
      console.error('Error loading homeworks:', error);
    } finally {
      setLoading(false);
    }
  };

  useSectionRefresh(dataRefreshKey, loadHomeworks);

  const openCreateModal = () => {
    setFormData({
      title: '',
      description: '',
      subjectId: selectedSubject?.id || subjects[0]?.id || '',
      openDate: '',
      closeDate: '',
      maxAttempts: ''
    });
    setQuestions([]);
    setEditingHomework(null);
    setEditingQuestionIndex(null);
    resetCurrentQuestion();
    setShowCreateModal(true);
  };

  const openEditModal = async (homework) => {
    try {
      const response = await adminFetch(`${API_URL}/homework/${homework.id}`);
      const data = await response.json();
      setFormData({
        title: data.homework.title,
        description: data.homework.description || '',
        subjectId: data.homework.subjectId,
        openDate: data.homework.openDate ? (() => { const d = new Date(data.homework.openDate); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); })() : '',
        closeDate: data.homework.closeDate ? (() => { const d = new Date(data.homework.closeDate); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); })() : '',
        maxAttempts: data.homework.maxAttempts || ''
      });
      setQuestions(data.homework.questions || []);
      setEditingHomework(homework);
      setEditingQuestionIndex(null);
      resetCurrentQuestion();
      setShowCreateModal(true);
    } catch (error) {
      console.error('Error loading homework:', error);
      alert('Ошибка загрузки домашки');
    }
  };

  const handleSaveHomework = async () => {
    if (!formData.title || !formData.subjectId || !formData.openDate || !formData.closeDate) {
      alert('Заполните все обязательные поля');
      return;
    }
    if (questions.length === 0) {
      alert('Добавьте хотя бы один вопрос');
      return;
    }
    try {
      const url = editingHomework
        ? `${API_URL}/homework/${editingHomework.id}`
        : `${API_URL}/homework/create`;
      const method = editingHomework ? 'PUT' : 'POST';

      const openDateUTC = formData.openDate ? new Date(formData.openDate).toISOString() : null;
      const closeDateUTC = formData.closeDate ? new Date(formData.closeDate).toISOString() : null;

      const response = await adminFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          openDate: openDateUTC,
          closeDate: closeDateUTC,
          maxAttempts: formData.maxAttempts === '' ? null : parseInt(formData.maxAttempts),
          questions: questions.map((q, index) => ({ ...q, order: index })),
          createdBy: currentUserId || 1
        })
      });
      if (response.ok) {
        setShowCreateModal(false);
        loadHomeworks();
      } else {
        const error = await response.json();
        alert(error.message || 'Ошибка сохранения');
      }
    } catch (error) {
      console.error('Error saving homework:', error);
      alert('Ошибка сохранения');
    }
  };

  const toggleHomeworkStatus = async (homework) => {
    try {
      await adminFetch(`${API_URL}/homework/${homework.id}/toggle`, { method: 'PATCH' });
      loadHomeworks();
    } catch (error) {
      console.error('Error toggling homework:', error);
    }
  };

  const deleteHomework = async (homeworkId) => {
    if (!window.confirm('Удалить эту домашку?')) return;
    try {
      await adminFetch(`${API_URL}/homework/${homeworkId}`, { method: 'DELETE' });
      loadHomeworks();
    } catch (error) {
      console.error('Error deleting homework:', error);
    }
  };

  const addQuestion = () => {
    if (!currentQuestion.questionText.trim()) {
      alert('Введите текст вопроса');
      return;
    }
    if (!validateQuestion(currentQuestion)) return;
    const questionToAdd = {
      ...currentQuestion,
      correctAnswer: currentQuestion.correctAnswer === null ? '' : currentQuestion.correctAnswer
    };
    if (editingQuestionIndex !== null) {
      const updated = [...questions];
      updated[editingQuestionIndex] = questionToAdd;
      setQuestions(updated);
      setEditingQuestionIndex(null);
    } else {
      setQuestions([...questions, questionToAdd]);
    }
    resetCurrentQuestion();
  };

  const startEditQuestion = (index) => {
    const q = questions[index];
    setCurrentQuestion({
      questionType: q.questionType || 'single_choice',
      questionText: q.questionText || '',
      options: q.options || ['', '', '', ''],
      correctAnswer: q.correctAnswer ?? null,
      explanation: q.explanation || '',
      points: q.points || 10,
    });
    setEditingQuestionIndex(index);
    setTimeout(() => {
      document.querySelector('.add-question-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  };

  const cancelEditQuestion = () => {
    setEditingQuestionIndex(null);
    resetCurrentQuestion();
  };

  const validateQuestion = (question) => {
    switch (question.questionType) {
      case 'single_choice':
        if (!question.options.some(opt => opt.trim())) { alert('Добавьте варианты ответов'); return false; }
        if (question.correctAnswer === null || question.correctAnswer === undefined) { alert('Укажите правильный ответ'); return false; }
        break;
      case 'multiple_choice':
        if (!question.options.some(opt => opt.trim())) { alert('Добавьте варианты ответов'); return false; }
        if (!question.correctAnswer || question.correctAnswer.length === 0) { alert('Выберите правильные ответы'); return false; }
        break;
      case 'short_answer':
        if (!question.correctAnswer || question.correctAnswer.length === 0 || question.correctAnswer.every(ans => !ans.trim())) { alert('Укажите правильные варианты ответа'); return false; }
        break;
      case 'numeric':
        if (question.correctAnswer?.value === undefined || question.correctAnswer?.value === null) { alert('Укажите правильный ответ'); return false; }
        break;
      case 'matching':
        if (!question.options || question.options.length === 0) { alert('Добавьте пары для соединения'); return false; }
        question.correctAnswer = question.options;
        break;
      case 'ordering':
        if (!question.correctAnswer || question.correctAnswer.length === 0) { alert('Укажите правильный порядок элементов'); return false; }
        break;
      case 'fill_blanks':
        if (!question.correctAnswer || question.correctAnswer.length === 0) { alert('Укажите правильные ответы для пропусков'); return false; }
        break;
      case 'true_false':
        if (question.correctAnswer === null || question.correctAnswer === undefined) { alert('Укажите правильный ответ'); return false; }
        break;
      default:
        return true;
    }
    return true;
  };

  const resetCurrentQuestion = () => {
    setCurrentQuestion({
      questionType: 'single_choice',
      questionText: '',
      options: ['', '', '', ''],
      correctAnswer: null,
      explanation: '',
      points: 10
    });
  };

  const removeQuestion = (index) => {
    setQuestions(questions.filter((_, i) => i !== index));
  };

  const downloadTemplate = async () => {
    try {
      const response = await adminFetch(`${API_URL}/homework/import-template`);
      if (!response.ok) throw new Error('bad response');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'homework_template.xlsx';
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      alert('Ошибка скачивания шаблона');
    }
  };

  const openImportModal = () => {
    setImportFile(null);
    setImportResult(null);
    setShowImportModal(true);
  };

  const handleImport = async () => {
    if (!importFile) return;
    setImportLoading(true);
    setImportResult(null);
    try {
      const formData = new FormData();
      formData.append('file', importFile);
      const response = await adminFetch(`${API_URL}/homework/import-questions`, {
        method: 'POST',
        body: formData
      });
      const data = await response.json();
      if (response.ok) {
        if (data.questions?.length) {
          setQuestions(prev => [...prev, ...data.questions]);
        }
        setShowImportModal(false);
      } else {
        setImportResult({ error: data.message || 'Ошибка импорта' });
      }
    } catch (e) {
      setImportResult({ error: 'Ошибка сети: ' + e.message });
    } finally {
      setImportLoading(false);
    }
  };

  const viewResults = async (homework) => {
    try {
      const response = await adminFetch(`${API_URL}/homework/${homework.id}/results`);
      const data = await response.json();
      setSelectedHomework({ ...homework, results: data.results });
    } catch (error) {
      console.error('Error loading results:', error);
      alert('Ошибка загрузки результатов');
    }
  };

  const openStudentPreview = async (homework) => {
    if (previewLoadingId) return;
    setPreviewLoadingId(homework.id);
    try {
      const response = await adminFetch(`${API_URL}/homework/${homework.id}`);
      const data = await response.json();
      if (!response.ok || !data.homework) {
        throw new Error(data.message || 'Не удалось загрузить домашку');
      }
      setPreviewHomework(data.homework);
    } catch (error) {
      console.error('Error loading homework preview:', error);
      alert(error.message || 'Ошибка загрузки предпросмотра');
    } finally {
      setPreviewLoadingId(null);
    }
  };

  const renderQuestionBuilder = () => {
    switch (currentQuestion.questionType) {
      case 'single_choice':
        return (
          <div className="question-options">
            <h4>Варианты ответа</h4>
            {currentQuestion.options.map((option, index) => (
              <div key={index} className="option-input-group">
                <input type="radio" name="correctAnswer" checked={currentQuestion.correctAnswer === index}
                  onChange={() => setCurrentQuestion({ ...currentQuestion, correctAnswer: index })} />
                <input type="text" placeholder={`Вариант ${index + 1}`} value={option}
                  onChange={(e) => {
                    const newOptions = [...currentQuestion.options];
                    newOptions[index] = e.target.value;
                    setCurrentQuestion({ ...currentQuestion, options: newOptions });
                  }} />
              </div>
            ))}
          </div>
        );
      case 'multiple_choice':
        return (
          <div className="question-options">
            <h4>Варианты ответа (выберите несколько правильных)</h4>
            {currentQuestion.options.map((option, index) => (
              <div key={index} className="option-input-group">
                <input type="checkbox" checked={(currentQuestion.correctAnswer || []).includes(index)}
                  onChange={(e) => {
                    let answers = currentQuestion.correctAnswer || [];
                    answers = e.target.checked ? [...answers, index] : answers.filter(a => a !== index);
                    setCurrentQuestion({ ...currentQuestion, correctAnswer: answers });
                  }} />
                <input type="text" placeholder={`Вариант ${index + 1}`} value={option}
                  onChange={(e) => {
                    const newOptions = [...currentQuestion.options];
                    newOptions[index] = e.target.value;
                    setCurrentQuestion({ ...currentQuestion, options: newOptions });
                  }} />
              </div>
            ))}
            <button type="button" className="add-option-btn"
              onClick={() => setCurrentQuestion({ ...currentQuestion, options: [...currentQuestion.options, ''] })}>
              + Добавить вариант
            </button>
          </div>
        );
      case 'short_answer':
        return (
          <div className="short-answer-builder">
            <h4>Правильные варианты ответа</h4>
            <p className="hint">Укажите все возможные правильные ответы (без учета регистра)</p>
            {(currentQuestion.correctAnswer || ['']).map((answer, index) => (
              <div key={index} className="answer-variant">
                <input type="text" placeholder={`Вариант ${index + 1}`} value={answer}
                  onChange={(e) => {
                    const answers = currentQuestion.correctAnswer || [];
                    answers[index] = e.target.value;
                    setCurrentQuestion({ ...currentQuestion, correctAnswer: [...answers] });
                  }} />
                {index > 0 && (
                  <button type="button"
                    onClick={() => setCurrentQuestion({ ...currentQuestion, correctAnswer: currentQuestion.correctAnswer.filter((_, i) => i !== index) })}>
                    ✕
                  </button>
                )}
              </div>
            ))}
            <button type="button" className="add-variant-btn"
              onClick={() => setCurrentQuestion({ ...currentQuestion, correctAnswer: [...(currentQuestion.correctAnswer || []), ''] })}>
              + Добавить вариант ответа
            </button>
          </div>
        );
      case 'numeric':
        return (
          <div className="numeric-answer-builder">
            <h4>Числовой ответ</h4>
            <div className="numeric-inputs">
              <div>
                <label>Правильный ответ:</label>
                <input type="number" step="any" placeholder="9.8"
                  value={currentQuestion.correctAnswer?.value || ''}
                  onChange={(e) => setCurrentQuestion({ ...currentQuestion, correctAnswer: { ...currentQuestion.correctAnswer, value: parseFloat(e.target.value) } })} />
              </div>
              <div>
                <label>Погрешность (±):</label>
                <input type="number" step="any" placeholder="0.1"
                  value={currentQuestion.correctAnswer?.tolerance || ''}
                  onChange={(e) => setCurrentQuestion({ ...currentQuestion, correctAnswer: { ...currentQuestion.correctAnswer, tolerance: parseFloat(e.target.value) || 0 } })} />
              </div>
            </div>
          </div>
        );
      case 'matching':
        return (
          <div className="matching-builder">
            <h4>Пары для соединения</h4>
            {(currentQuestion.options || []).map((pair, index) => (
              <div key={index} className="pair-input">
                <input type="text" placeholder="Левая часть" value={pair.left || ''}
                  onChange={(e) => {
                    const pairs = [...(currentQuestion.options || [])];
                    pairs[index] = { ...pairs[index], left: e.target.value };
                    setCurrentQuestion({ ...currentQuestion, options: pairs });
                  }} />
                <span>—</span>
                <input type="text" placeholder="Правая часть" value={pair.right || ''}
                  onChange={(e) => {
                    const pairs = [...(currentQuestion.options || [])];
                    pairs[index] = { ...pairs[index], right: e.target.value };
                    setCurrentQuestion({ ...currentQuestion, options: pairs });
                  }} />
                {index > 0 && (
                  <button type="button"
                    onClick={() => setCurrentQuestion({ ...currentQuestion, options: currentQuestion.options.filter((_, i) => i !== index) })}>
                    ✕
                  </button>
                )}
              </div>
            ))}
            <button type="button" className="add-pair-btn"
              onClick={() => setCurrentQuestion({ ...currentQuestion, options: [...(currentQuestion.options || []), { left: '', right: '' }], correctAnswer: currentQuestion.options || [] })}>
              + Добавить пару
            </button>
          </div>
        );
      case 'ordering':
        return (
          <div className="ordering-builder">
            <h4>Элементы для расстановки (в правильном порядке)</h4>
            {(currentQuestion.correctAnswer || ['']).map((item, index) => (
              <div key={index} className="order-item">
                <span className="order-number">{index + 1}.</span>
                <input type="text" placeholder={`Элемент ${index + 1}`} value={item}
                  onChange={(e) => {
                    const items = [...(currentQuestion.correctAnswer || [])];
                    items[index] = e.target.value;
                    setCurrentQuestion({ ...currentQuestion, correctAnswer: items });
                  }} />
                {index > 0 && (
                  <button type="button"
                    onClick={() => setCurrentQuestion({ ...currentQuestion, correctAnswer: currentQuestion.correctAnswer.filter((_, i) => i !== index) })}>
                    ✕
                  </button>
                )}
              </div>
            ))}
            <button type="button" className="add-item-btn"
              onClick={() => setCurrentQuestion({ ...currentQuestion, correctAnswer: [...(currentQuestion.correctAnswer || []), ''] })}>
              + Добавить элемент
            </button>
          </div>
        );
      case 'fill_blanks':
        return (
          <div className="fill-blanks-builder">
            <h4>Заполнить пропуски</h4>
            <p className="hint">В тексте вопроса используйте ___ для обозначения пропусков</p>
            <div className="blanks-answers">
              <h5>Правильные ответы для каждого пропуска:</h5>
              {(currentQuestion.correctAnswer || [[]]).map((blankAnswers, blankIndex) => (
                <div key={blankIndex} className="blank-group">
                  <h6>Пропуск {blankIndex + 1}:</h6>
                  {blankAnswers.map((answer, answerIndex) => (
                    <div key={answerIndex} className="blank-answer">
                      <input type="text" placeholder={`Вариант ${answerIndex + 1}`} value={answer}
                        onChange={(e) => {
                          const answers = [...(currentQuestion.correctAnswer || [])];
                          answers[blankIndex][answerIndex] = e.target.value;
                          setCurrentQuestion({ ...currentQuestion, correctAnswer: answers });
                        }} />
                      {answerIndex > 0 && (
                        <button type="button"
                          onClick={() => {
                            const answers = [...currentQuestion.correctAnswer];
                            answers[blankIndex] = answers[blankIndex].filter((_, i) => i !== answerIndex);
                            setCurrentQuestion({ ...currentQuestion, correctAnswer: answers });
                          }}>✕</button>
                      )}
                    </div>
                  ))}
                  <button type="button" className="add-variant-btn"
                    onClick={() => {
                      const answers = [...(currentQuestion.correctAnswer || [[]])];
                      if (!answers[blankIndex]) answers[blankIndex] = [];
                      answers[blankIndex].push('');
                      setCurrentQuestion({ ...currentQuestion, correctAnswer: answers });
                    }}>
                    + Вариант для пропуска {blankIndex + 1}
                  </button>
                </div>
              ))}
              <button type="button" className="add-blank-btn"
                onClick={() => {
                  const answers = [...(currentQuestion.correctAnswer || [])];
                  answers.push(['']);
                  setCurrentQuestion({ ...currentQuestion, correctAnswer: answers });
                }}>
                + Добавить пропуск
              </button>
            </div>
          </div>
        );
      case 'true_false':
        return (
          <div className="true-false-builder">
            <h4>Правильный ответ</h4>
            <div className="tf-options">
              <label className="tf-option">
                <input type="radio" name="trueFalse" checked={currentQuestion.correctAnswer === true}
                  onChange={() => setCurrentQuestion({ ...currentQuestion, correctAnswer: true })} />
                <span>✓ Верно</span>
              </label>
              <label className="tf-option">
                <input type="radio" name="trueFalse" checked={currentQuestion.correctAnswer === false}
                  onChange={() => setCurrentQuestion({ ...currentQuestion, correctAnswer: false })} />
                <span>✗ Неверно</span>
              </label>
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  if (loading) return <div className="loading">Загрузка...</div>;

  // Тот же экран, что видит ученик, но отправка заменена локальной проверкой.
  if (previewHomework) {
    return (
      <PreviewDataProvider>
        <StudentHomework
          studentId={currentUserId}
          previewHomework={previewHomework}
          onExitPreview={() => setPreviewHomework(null)}
        />
      </PreviewDataProvider>
    );
  }

  // ===== ЭКРАН РЕЗУЛЬТАТОВ =====
  if (selectedHomework) {
    return (
      <div className="admin-section">
        <div className="section-header">
          <button className="back-btn" onClick={() => setSelectedHomework(null)}>← Назад</button>
          <h2>Результаты: {selectedHomework.title}</h2>
        </div>
        <div className="results-container">
          {selectedHomework.results?.length === 0 ? (
            <p className="empty-message">Пока нет отправленных работ</p>
          ) : (
            <div className="results-list">
              {selectedHomework.results?.map(result => (
                <div key={result.id} className="result-card">
                  <div className="result-header">
                    <div className="student-info">
                      <span className="student-name">{result.student.firstName} {result.student.lastName}</span>
                      <span className="student-email">@{result.student.telegramUsername || 'no username'}</span>
                    </div>
                    <div className="result-score">
                      <span className="score">{result.totalScore}/{result.maxScore}</span>
                      <span className="percentage">{result.maxScore > 0 ? Math.round((result.totalScore / result.maxScore) * 100) : 0}%</span>
                    </div>
                  </div>
                  <div className="result-meta">
                    <span>Попытка {result.attemptNumber}</span>
                    <span>Отправлено: {new Date(result.submittedAt).toLocaleString('ru-RU')}</span>
                    {result.timeSpent && <span>Время: {Math.floor(result.timeSpent / 60)} мин</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ===== ФОРМА СОЗДАНИЯ/РЕДАКТИРОВАНИЯ =====
  if (showCreateModal) {
    return (
      <div className="admin-section">
        {showImportModal && (
          <div className="import-modal-overlay" onClick={() => !importLoading && setShowImportModal(false)}>
            <div className="import-modal" onClick={(e) => e.stopPropagation()}>
              <div className="import-modal-header">
                <h2>📥 Загрузка вопросов из Excel</h2>
                <button type="button" className="import-modal-close" onClick={() => !importLoading && setShowImportModal(false)}>✕</button>
              </div>
              <div className="import-modal-body">
                <div className="import-format-hint">
                  <strong>Формат файла (.xlsx):</strong><br />
                  <span className="import-hint-key">type</span> — тип вопроса: single / multiple / short / numeric / matching / ordering / fill / truefalse<br />
                  <span className="import-hint-key">question</span> — текст вопроса (для fill используйте ___ на месте пропусков)<br />
                  <span className="import-hint-key">a, b, c, d</span> — варианты (для single / multiple)<br />
                  <span className="import-hint-key">correct</span> — ответ: буква (a), буквы (a,c), true/false, число, варианты через | , пары «лево=право» через ;<br />
                  <span className="import-hint-key">points</span> — баллы (по умолчанию 10), <span className="import-hint-key">explanation</span> — необязательно
                </div>
                <button type="button" className="btn-secondary import-template-btn" onClick={downloadTemplate}>
                  ⬇️ Скачать пример Excel
                </button>
                <div className="import-file-group">
                  <label>Выберите файл .xlsx</label>
                  <input
                    type="file"
                    accept=".xlsx,.xls"
                    className="import-file-input"
                    onChange={(e) => { setImportFile(e.target.files[0] || null); setImportResult(null); }}
                  />
                </div>

                {importResult && !importResult.error && (
                  <div className="import-result-ok">
                    ✅ Добавлено вопросов: <strong>{importResult.imported}</strong>
                    {importResult.skipped > 0 && (
                      <>, пропущено: <strong>{importResult.skipped}</strong></>
                    )}
                    {importResult.errors?.length > 0 && (
                      <div className="import-result-errors">
                        {importResult.errors.map((er, i) => (
                          <div key={i}>Строка {er.row}: {er.reason}</div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {importResult?.error && (
                  <div className="import-result-error">❌ {importResult.error}</div>
                )}
              </div>
              <div className="import-modal-footer">
                <button type="button" className="cancel-btn" onClick={() => !importLoading && setShowImportModal(false)}>
                  {importResult && !importResult.error ? 'Готово' : 'Отмена'}
                </button>
                <button
                  type="button"
                  className="save-btn"
                  onClick={handleImport}
                  disabled={!importFile || importLoading}
                >
                  {importLoading ? 'Загружаю...' : 'Загрузить'}
                </button>
              </div>
            </div>
          </div>
        )}
        <div className="section-header">
          <button className="back-btn" onClick={() => setShowCreateModal(false)}>← Назад</button>
          <h2>{editingHomework ? 'Редактировать домашку' : 'Создать домашку'}</h2>
        </div>

        <div className="homework-form">
          <div className="form-group">
            <label>Название *</label>
            <input type="text" value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="Название домашнего задания" />
          </div>
          <div className="form-group">
            <label>Описание</label>
            <textarea value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Описание задания" rows={3} />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Предмет *</label>
              <select value={formData.subjectId}
                onChange={(e) => setFormData({ ...formData, subjectId: parseInt(e.target.value) })}>
                {subjects.map(subject => (
                  <option key={subject.id} value={subject.id}>{subject.icon} {subject.name}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Макс. попыток</label>
              <input type="number" min="1" value={formData.maxAttempts}
                onChange={(e) => setFormData({ ...formData, maxAttempts: e.target.value })}
                placeholder="Без ограничений" />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Дата и время открытия *</label>
              <input type="datetime-local" value={formData.openDate}
                onChange={(e) => setFormData({ ...formData, openDate: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Дата и время закрытия *</label>
              <input type="datetime-local" value={formData.closeDate}
                onChange={(e) => setFormData({ ...formData, closeDate: e.target.value })} />
            </div>
          </div>

          <div className="questions-section">
            <div className="questions-section-header">
              <h3>Вопросы ({questions.length})</h3>
              <button type="button" className="import-excel-btn" onClick={openImportModal}>
                📥 Загрузить из Excel
              </button>
            </div>
            {questions.length > 0 && (
              <div className="questions-list">
                {questions.map((q, index) => (
                  <div key={index} className="question-preview">
                    <div className="question-preview-header">
                      <span className="question-number">#{index + 1}</span>
                      <span className="question-type">
                        {QUESTION_TYPES.find(t => t.value === q.questionType)?.icon}{' '}
                        {QUESTION_TYPES.find(t => t.value === q.questionType)?.label}
                      </span>
                      <span className="question-points">{q.points} баллов</span>
                      <button type="button" className="edit-question-btn" onClick={() => startEditQuestion(index)}>✏️</button>
                      <button type="button" className="remove-question-btn" onClick={() => removeQuestion(index)}>✕</button>
                    </div>
                    <p className="question-text"><MathText text={q.questionText} /></p>
                  </div>
                ))}
              </div>
            )}

            <div className="add-question-form">
              <h4>{editingQuestionIndex !== null ? `Редактировать вопрос #${editingQuestionIndex + 1}` : 'Добавить вопрос'}</h4>
              <div className="form-group">
                <label>Тип вопроса</label>
                <select value={currentQuestion.questionType}
                  onChange={(e) => { resetCurrentQuestion(); setCurrentQuestion({ ...currentQuestion, questionType: e.target.value }); }}>
                  {QUESTION_TYPES.map(type => (
                    <option key={type.value} value={type.value}>{type.icon} {type.label}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Текст вопроса *</label>
                <FormattingTextarea value={currentQuestion.questionText}
                  onChange={(questionText) => setCurrentQuestion({ ...currentQuestion, questionText })}
                  placeholder="Введите вопрос" rows={3} />
                <LatexHelp />
              </div>
              {renderQuestionBuilder()}
              <div className="form-group">
                <label>Объяснение (опционально)</label>
                <textarea value={currentQuestion.explanation}
                  onChange={(e) => setCurrentQuestion({ ...currentQuestion, explanation: e.target.value })}
                  placeholder="Объяснение правильного ответа" rows={2} />
              </div>
              <div className="form-group">
                <label>Баллы за вопрос</label>
                <input type="number" min="1" value={currentQuestion.points}
                  onChange={(e) => setCurrentQuestion({ ...currentQuestion, points: parseInt(e.target.value) || 10 })} />
              </div>
              <div className="question-form-actions">
                <button type="button" className="add-question-btn" onClick={addQuestion}>
                  {editingQuestionIndex !== null ? '💾 Сохранить вопрос' : '+ Добавить вопрос'}
                </button>
                {editingQuestionIndex !== null && (
                  <button type="button" className="cancel-edit-question-btn" onClick={cancelEditQuestion}>Отмена</button>
                )}
              </div>
            </div>
          </div>

          <div className="form-actions">
            <button type="button" className="cancel-btn" onClick={() => setShowCreateModal(false)}>Отмена</button>
            <button type="button" className="save-btn" onClick={handleSaveHomework}>
              {editingHomework ? 'Сохранить изменения' : 'Создать домашку'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ===== СПИСОК ДОМАШЕК ПО МЕСЯЦУ =====
  if (selectedSubject && selectedMonth) {
    const monthHomeworks = homeworks.filter(hw => {
      if (hw.subjectId !== selectedSubject.id) return false;
      const d = new Date(hw.openDate);
      return d.getFullYear() === selectedMonth.year && d.getMonth() === selectedMonth.month;
    });

    return (
      <div className="admin-section">
        {/* Breadcrumbs */}
        <div className="hw-breadcrumbs">
          <button onClick={() => { setSelectedSubject(null); setSelectedMonth(null); }}>Предметы</button>
          <span>→</span>
          <button onClick={() => setSelectedMonth(null)}>{selectedSubject.icon} {selectedSubject.name}</button>
          <span>→</span>
          <span className="hw-bc-current">{MONTHS_RU[selectedMonth.month]} {selectedMonth.year}</span>
        </div>

        <div className="section-header">
          <div>
            <h2>{MONTHS_RU[selectedMonth.month]} {selectedMonth.year}</h2>
            <p style={{color:'#6b7280', fontSize:'14px', margin:'4px 0 0 0'}}>{selectedSubject.name} · {monthHomeworks.length} домашек</p>
          </div>
          <button className="primary-btn" onClick={openCreateModal}>+ Создать домашку</button>
        </div>

        {monthHomeworks.length === 0 ? (
          <div className="empty-state"><p>Нет домашек за этот месяц</p></div>
        ) : (
          <div className="homeworks-list">
            {monthHomeworks.map(homework => (
              <div key={homework.id} className="homework-card">
                <div className="homework-header">
                  <div className="homework-title-section">
                    <h3>{homework.title}</h3>
                    <span className={`status-badge ${homework.isActive ? 'active' : 'inactive'}`}>
                      {homework.isActive ? '✓ Активна' : '✗ Отключена'}
                    </span>
                  </div>
                  <div className="homework-actions">
                    <button
                      className="homework-retry-btn"
                      onClick={() => openStudentPreview(homework)}
                      disabled={previewLoadingId === homework.id}
                      aria-label={`Пройти «${homework.title}» от лица ученика`}
                    >
                      <span aria-hidden="true">↻</span>
                      {previewLoadingId === homework.id ? 'Открываем…' : 'Перерешать'}
                    </button>
                    <button className="icon-btn" onClick={() => openEditModal(homework)} title="Редактировать">✏️</button>
                    <button className="icon-btn" onClick={() => toggleHomeworkStatus(homework)} title={homework.isActive ? 'Отключить' : 'Включить'}>
                      {homework.isActive ? '👁️' : '🚫'}
                    </button>
                    <button className="icon-btn" onClick={() => viewResults(homework)} title="Результаты">📊</button>
                    <button className="icon-btn delete" onClick={() => deleteHomework(homework.id)} title="Удалить">🗑️</button>
                  </div>
                </div>
                <p className="homework-description"><MathText text={homework.description || 'Без описания'} /></p>
                <div className="homework-meta">
                  <span>📝 Вопросов: {homework.questions?.length || 0}</span>
                  <span>📅 Открытие: {new Date(homework.openDate).toLocaleString('ru-RU')}</span>
                  <span>⏰ Закрытие: {new Date(homework.closeDate).toLocaleString('ru-RU')}</span>
                  {homework.maxAttempts && <span>🔄 Попыток: {homework.maxAttempts}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ===== СПИСОК МЕСЯЦЕВ ДЛЯ ПРЕДМЕТА =====
  if (selectedSubject) {
    const subjectHomeworks = homeworks.filter(hw => hw.subjectId === selectedSubject.id);

    // Группируем по год+месяц
    const monthsMap = {};
    subjectHomeworks.forEach(hw => {
      const d = new Date(hw.openDate);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      if (!monthsMap[key]) {
        monthsMap[key] = { year: d.getFullYear(), month: d.getMonth(), count: 0 };
      }
      monthsMap[key].count++;
    });

    // Сортируем по убыванию (новые сверху)
    const months = Object.values(monthsMap).sort((a, b) =>
      b.year !== a.year ? b.year - a.year : b.month - a.month
    );

    return (
      <div className="admin-section">
        <div className="hw-breadcrumbs">
          <button onClick={() => setSelectedSubject(null)}>Предметы</button>
          <span>→</span>
          <span className="hw-bc-current">{selectedSubject.icon} {selectedSubject.name}</span>
        </div>

        <div className="section-header">
          <div>
            <h2>{selectedSubject.icon} {selectedSubject.name}</h2>
            <p style={{color:'#6b7280', fontSize:'14px', margin:'4px 0 0 0'}}>{subjectHomeworks.length} домашек всего</p>
          </div>
          <button className="primary-btn" onClick={openCreateModal}>+ Создать домашку</button>
        </div>

        {months.length === 0 ? (
          <div className="empty-state"><p>Нет домашек по этому предмету</p></div>
        ) : (
          <div className="hw-months-grid">
            {months.map(m => (
              <div key={`${m.year}-${m.month}`} className="hw-month-card"
                onClick={() => setSelectedMonth(m)}>
                <div className="hw-month-icon">📅</div>
                <div className="hw-month-name">{MONTHS_RU[m.month]}</div>
                <div className="hw-month-year">{m.year}</div>
                <div className="hw-month-count">{m.count} домашек</div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ===== СПИСОК ПРЕДМЕТОВ =====
  return (
    <div className="admin-section">
      <div className="section-header">
        <h2>Домашние задания</h2>
      </div>
      <p style={{color:'#6b7280', fontSize:'14px', marginBottom:'24px'}}>Выберите предмет для управления домашками</p>

      <div className="hw-subjects-grid">
        {subjects.map(subject => {
          const count = homeworks.filter(hw => hw.subjectId === subject.id).length;
          return (
            <div key={subject.id} className="hw-subject-card" onClick={() => setSelectedSubject(subject)}>
              <div className="hw-subject-icon">{subject.icon}</div>
              <div className="hw-subject-name">{subject.name}</div>
              <div className="hw-subject-count">{count} домашек</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default Homework;
