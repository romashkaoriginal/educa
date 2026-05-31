import React, { useState, useEffect } from 'react';
import '../../styles/BotTestEditor.css';

const API_URL = 'https://educa-production-a98e.up.railway.app/api';

function BotTestEditor({ subjects }) {
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedSubject, setSelectedSubject] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState(null);
  const [expandedIds, setExpandedIds] = useState(new Set());

  const [form, setForm] = useState({
    subjectId: '',
    questionText: '',
    options: ['', '', '', ''],
    correctAnswer: 0,
    explanation: '',
    order: 0
  });

  useEffect(() => { loadQuestions(); }, []);

  const loadQuestions = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/bot-test`);
      const data = await res.json();
      setQuestions(data.questions || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const resetForm = () => setForm({
    subjectId: selectedSubject?.id || subjects[0]?.id || '',
    questionText: '',
    options: ['', '', '', ''],
    correctAnswer: 0,
    explanation: '',
    order: 0
  });

  const openCreate = () => {
    setEditingQuestion(null);
    resetForm();
    setShowModal(true);
  };

  const openEdit = (q) => {
    setEditingQuestion(q);
    setForm({
      subjectId: q.subjectId,
      questionText: q.questionText,
      options: [...q.options],
      correctAnswer: q.correctAnswer,
      explanation: q.explanation || '',
      order: q.order || 0
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.questionText.trim()) return alert('Введите текст вопроса');
    if (form.options.some(o => !o.trim())) return alert('Заполните все варианты ответа');
    if (!form.subjectId) return alert('Выберите предмет');

    const body = {
      subjectId: parseInt(form.subjectId),
      questionText: form.questionText.trim(),
      options: form.options.map(o => o.trim()),
      correctAnswer: form.correctAnswer,
      explanation: form.explanation.trim() || null,
      order: parseInt(form.order) || 0
    };

    try {
      const url = editingQuestion
        ? `${API_URL}/bot-test/${editingQuestion.id}`
        : `${API_URL}/bot-test`;
      const method = editingQuestion ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (res.ok) {
        setShowModal(false);
        await loadQuestions();
      }
    } catch (e) { console.error(e); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Удалить вопрос?')) return;
    try {
      await fetch(`${API_URL}/bot-test/${id}`, { method: 'DELETE' });
      await loadQuestions();
    } catch (e) { console.error(e); }
  };

  const handleToggle = async (q) => {
    try {
      await fetch(`${API_URL}/bot-test/${q.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !q.isActive })
      });
      await loadQuestions();
    } catch (e) { console.error(e); }
  };

  const toggleExpand = (id) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const bySubject = {};
  questions.forEach(q => {
    const sId = q.subjectId;
    if (!bySubject[sId]) bySubject[sId] = { subject: q.subject, questions: [] };
    bySubject[sId].questions.push(q);
  });

  const filteredSubjects = selectedSubject
    ? { [selectedSubject.id]: bySubject[selectedSubject.id] }
    : bySubject;

  return (
    <div className="bte-section">
      <div className="bte-header">
        <div>
          <h2>🤖 Тест для бота</h2>
          <p className="bte-desc">Вопросы для неавторизованных пользователей Telegram-бота</p>
        </div>
        <button className="bte-btn-primary" onClick={openCreate}>+ Добавить вопрос</button>
      </div>

      {/* Фильтр по предмету */}
      <div className="bte-subject-filter">
        <button
          className={`bte-subj-btn ${!selectedSubject ? 'active' : ''}`}
          onClick={() => setSelectedSubject(null)}
        >Все</button>
        {subjects.map(s => (
          <button
            key={s.id}
            className={`bte-subj-btn ${selectedSubject?.id === s.id ? 'active' : ''}`}
            onClick={() => setSelectedSubject(s)}
          >
            {s.icon} {s.name}
            <span className="bte-count">{bySubject[s.id]?.questions.length || 0}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <p style={{textAlign:'center', color:'#6b7280', padding:40}}>Загрузка...</p>
      ) : Object.keys(filteredSubjects).length === 0 ? (
        <div className="bte-empty">
          <div style={{fontSize:48, opacity:.4}}>🤖</div>
          <p>Вопросов пока нет. Добавьте первый!</p>
        </div>
      ) : (
        Object.values(filteredSubjects).filter(Boolean).map(({ subject, questions: qs }) => (
          <div key={subject?.id} className="bte-subject-block">
            <div className="bte-subject-title">
              {subject?.icon} {subject?.name}
              <span className="bte-count">{qs.length} вопросов</span>
            </div>
            <div className="bte-questions-list">
              {qs.map((q, idx) => {
                const isExpanded = expandedIds.has(q.id);
                return (
                  <div key={q.id} className={`bte-question-card ${!q.isActive ? 'inactive' : ''}`}>
                    <div className="bte-q-header" onClick={() => toggleExpand(q.id)}>
                      <div className="bte-q-header-left">
                        <span className="bte-expand-icon">{isExpanded ? '▼' : '▶'}</span>
                        <span className="bte-q-num">#{idx + 1}</span>
                        <span className="bte-q-preview">
                          {q.questionText.length > 70 ? q.questionText.slice(0, 70) + '...' : q.questionText}
                        </span>
                        {!q.isActive && <span className="bte-inactive-badge">скрыт</span>}
                      </div>
                      <div className="bte-q-actions" onClick={e => e.stopPropagation()}>
                        <button className="bte-icon-btn" onClick={() => handleToggle(q)} title={q.isActive ? 'Скрыть' : 'Показать'}>
                          {q.isActive ? '👁️' : '🚫'}
                        </button>
                        <button className="bte-icon-btn" onClick={() => openEdit(q)} title="Редактировать">✏️</button>
                        <button className="bte-icon-btn danger" onClick={() => handleDelete(q.id)} title="Удалить">🗑️</button>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="bte-q-body">
                        <p className="bte-q-text">{q.questionText}</p>
                        <div className="bte-options">
                          {q.options.map((opt, i) => (
                            <div key={i} className={`bte-option ${i === q.correctAnswer ? 'correct' : ''}`}>
                              <span className="bte-opt-letter">{String.fromCharCode(65 + i)}</span>
                              <span className="bte-opt-text">{opt}</span>
                              {i === q.correctAnswer && <span className="bte-correct-mark">✓</span>}
                            </div>
                          ))}
                        </div>
                        {q.explanation && (
                          <div className="bte-explanation">
                            💡 {q.explanation}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}

      {/* Модалка добавления/редактирования */}
      {showModal && (
        <div className="bte-modal-overlay" onClick={() => setShowModal(false)}>
          <div className="bte-modal" onClick={e => e.stopPropagation()}>
            <div className="bte-modal-header">
              <h2>{editingQuestion ? 'Редактировать вопрос' : 'Добавить вопрос'}</h2>
              <button className="bte-modal-close" onClick={() => setShowModal(false)}>✕</button>
            </div>

            <div className="bte-modal-body">
              <div className="bte-form-group">
                <label>Предмет *</label>
                <select value={form.subjectId} onChange={e => setForm({...form, subjectId: e.target.value})}>
                  <option value="">Выберите предмет</option>
                  {subjects.map(s => (
                    <option key={s.id} value={s.id}>{s.icon} {s.name}</option>
                  ))}
                </select>
              </div>

              <div className="bte-form-group">
                <label>Текст вопроса *</label>
                <textarea
                  rows={3}
                  placeholder="Введите вопрос..."
                  value={form.questionText}
                  onChange={e => setForm({...form, questionText: e.target.value})}
                />
              </div>

              <div className="bte-form-group">
                <label>Варианты ответа * <span style={{fontWeight:400,color:'#9ca3af',fontSize:12}}>(отметьте правильный)</span></label>
                {form.options.map((opt, i) => (
                  <div key={i} className="bte-option-input">
                    <input
                      type="radio"
                      name="correct"
                      checked={form.correctAnswer === i}
                      onChange={() => setForm({...form, correctAnswer: i})}
                    />
                    <span className="bte-opt-letter-sm">{String.fromCharCode(65 + i)}</span>
                    <input
                      type="text"
                      placeholder={`Вариант ${String.fromCharCode(65 + i)}`}
                      value={opt}
                      onChange={e => {
                        const opts = [...form.options];
                        opts[i] = e.target.value;
                        setForm({...form, options: opts});
                      }}
                    />
                  </div>
                ))}
                {form.options.length < 6 && (
                  <button className="bte-add-option" onClick={() => setForm({...form, options: [...form.options, '']})}>
                    + Добавить вариант
                  </button>
                )}
                {form.options.length > 2 && (
                  <button className="bte-add-option danger" onClick={() => setForm({...form, options: form.options.slice(0, -1), correctAnswer: Math.min(form.correctAnswer, form.options.length - 2)})}>
                    − Убрать последний
                  </button>
                )}
              </div>

              <div className="bte-form-group">
                <label>Объяснение <span style={{fontWeight:400,color:'#9ca3af',fontSize:12}}>(необязательно — показывается после ответа)</span></label>
                <textarea
                  rows={2}
                  placeholder="Почему этот ответ правильный..."
                  value={form.explanation}
                  onChange={e => setForm({...form, explanation: e.target.value})}
                />
              </div>

              <div className="bte-form-group">
                <label>Порядок <span style={{fontWeight:400,color:'#9ca3af',fontSize:12}}>(меньше = раньше)</span></label>
                <input
                  type="number"
                  min="0"
                  value={form.order}
                  onChange={e => setForm({...form, order: e.target.value})}
                  style={{width:100}}
                />
              </div>
            </div>

            <div className="bte-modal-footer">
              <button className="bte-btn-secondary" onClick={() => setShowModal(false)}>Отмена</button>
              <button className="bte-btn-primary" onClick={handleSave}>
                {editingQuestion ? 'Сохранить' : 'Создать'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default BotTestEditor;