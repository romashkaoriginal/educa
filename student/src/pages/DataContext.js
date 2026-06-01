import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { apiFetch } from './api';

const API_URL = 'https://educa-production-a98e.up.railway.app/api';

const DataContext = createContext();

export const useData = () => {
  const context = useContext(DataContext);
  if (!context) throw new Error('useData must be used within DataProvider');
  return context;
};

export const DataProvider = ({ children, studentId }) => {
  const [subjects, setSubjects] = useState([]);
  const [practiceTopics, setPracticeTopics] = useState([]);
  const [homeworks, setHomeworks] = useState([]);
  const [practiceStats, setPracticeStats] = useState(null);
  const [homeworkStats, setHomeworkStats] = useState(null);

  const [loaded, setLoaded] = useState({
    subjects: false, practice: false, homework: false,
    practiceStats: false, homeworkStats: false
  });

  const [loading, setLoading] = useState({
    subjects: false, practice: false, homework: false,
    practiceStats: false, homeworkStats: false
  });

  // Кэш вопросов практики: { topicId: [questions] }
  const questionsCache = useRef({});

  const loadSubjects = useCallback(async (force = false) => {
    if (loaded.subjects && !force) return subjects;
    if (loading.subjects) return subjects;
    setLoading(prev => ({ ...prev, subjects: true }));
    try {
      const response = await apiFetch(`${API_URL}/subjects/student/${studentId}`);
      const data = await response.json();
      setSubjects(data.subjects || []);
      setLoaded(prev => ({ ...prev, subjects: true }));
      return data.subjects || [];
    } catch (error) {
      console.error('Error loading subjects:', error);
      return [];
    } finally {
      setLoading(prev => ({ ...prev, subjects: false }));
    }
  }, [studentId, loaded.subjects, loading.subjects, subjects]);

  const loadPractice = useCallback(async (force = false) => {
    if (loaded.practice && !force) return practiceTopics;
    if (loading.practice) return practiceTopics;
    setLoading(prev => ({ ...prev, practice: true }));
    try {
      const response = await apiFetch(`${API_URL}/practice/student/${studentId}`);
      const data = await response.json();
      const topics = data.practiceTopics || [];
      setPracticeTopics(topics);
      setLoaded(prev => ({ ...prev, practice: true }));
      return topics;
    } catch (error) {
      console.error('Error loading practice:', error);
      return [];
    } finally {
      setLoading(prev => ({ ...prev, practice: false }));
    }
  }, [studentId, loaded.practice, loading.practice, practiceTopics]);

  // Prefetch вопросов всех тем фоново — вызывается при входе в раздел практики
  const prefetchQuestions = useCallback(async (topics) => {
    const topicsToLoad = topics.filter(t =>
      t.questions?.length > 0 && !questionsCache.current[t.id]
    );
    if (topicsToLoad.length === 0) return;

    // Грузим параллельно, но не блокируем UI
    Promise.all(
      topicsToLoad.map(async (topic) => {
        try {
          const res = await apiFetch(`${API_URL}/practice/questions/${topic.id}`);
          const data = await res.json();
          const active = (data.questions || []).filter(q => q.isActive);
          if (active.length > 0) {
            questionsCache.current[topic.id] = active;
          }
        } catch (e) {
          // тихо игнорируем ошибки prefetch
        }
      })
    );
  }, []);

  // Получить вопросы из кэша или загрузить
  const getQuestions = useCallback(async (topic) => {
    if (questionsCache.current[topic.id]) {
      return questionsCache.current[topic.id];
    }
    const res = await apiFetch(`${API_URL}/practice/questions/${topic.id}`);
    const data = await res.json();
    const active = (data.questions || []).filter(q => q.isActive);
    questionsCache.current[topic.id] = active;
    return active;
  }, []);

  const loadHomeworks = useCallback(async (force = false) => {
    if (loaded.homework && !force) return homeworks;
    if (loading.homework) return homeworks;
    setLoading(prev => ({ ...prev, homework: true }));
    try {
      const response = await apiFetch(`${API_URL}/homework/student/${studentId}`);
      const data = await response.json();
      setHomeworks(data.homeworks || []);
      setLoaded(prev => ({ ...prev, homework: true }));
      return data.homeworks || [];
    } catch (error) {
      console.error('Error loading homeworks:', error);
      return [];
    } finally {
      setLoading(prev => ({ ...prev, homework: false }));
    }
  }, [studentId, loaded.homework, loading.homework, homeworks]);

  const loadPracticeStats = useCallback(async (force = false) => {
    if (loaded.practiceStats && !force) return practiceStats;
    if (loading.practiceStats) return practiceStats;
    setLoading(prev => ({ ...prev, practiceStats: true }));
    try {
      const response = await apiFetch(`${API_URL}/practice/stats/${studentId}`);
      const data = await response.json();
      setPracticeStats(data);
      setLoaded(prev => ({ ...prev, practiceStats: true }));
      return data;
    } catch (error) {
      console.error('Error loading practice stats:', error);
      return null;
    } finally {
      setLoading(prev => ({ ...prev, practiceStats: false }));
    }
  }, [studentId, loaded.practiceStats, loading.practiceStats, practiceStats]);

  const loadHomeworkStats = useCallback(async (force = false) => {
    if (loaded.homeworkStats && !force) return homeworkStats;
    if (loading.homeworkStats) return homeworkStats;
    setLoading(prev => ({ ...prev, homeworkStats: true }));
    try {
      const response = await apiFetch(`${API_URL}/homework/student/${studentId}/stats`);
      const data = await response.json();
      setHomeworkStats(data);
      setLoaded(prev => ({ ...prev, homeworkStats: true }));
      return data;
    } catch (error) {
      console.error('Error loading homework stats:', error);
      return null;
    } finally {
      setLoading(prev => ({ ...prev, homeworkStats: false }));
    }
  }, [studentId, loaded.homeworkStats, loading.homeworkStats, homeworkStats]);

  // Оптимистичное обновление статистики после прохождения практики
  // newResult: { topicId, correct, total }
  const updatePracticeStatsOptimistic = useCallback((topicId, correct, total) => {
    setPracticeTopics(prev => prev.map(topic => {
      if (topic.id !== topicId) return topic;
      const prevStats = topic.stats || { correct: 0, total: 0, successRate: 0 };
      const newRate = total > 0 ? Math.round(correct / total * 100) : 0;
      const prevRate = prevStats.successRate || 0;
      // Обновляем только если текущая попытка лучше предыдущего лучшего результата
      if (newRate <= prevRate) return topic;
      return {
        ...topic,
        stats: {
          correct,
          total,
          successRate: newRate
        }
      };
    }));
  }, []);

  const preloadAllData = useCallback(async () => {
    await Promise.all([
      loadSubjects(),
      loadPractice(),
      loadHomeworks(),
      loadPracticeStats(),
      loadHomeworkStats()
    ]);
  }, [loadSubjects, loadPractice, loadHomeworks, loadPracticeStats, loadHomeworkStats]);

  const refreshAfterPractice = useCallback(async () => {
    await Promise.all([
      loadPractice(true),
      loadPracticeStats(true)
    ]);
  }, [loadPractice, loadPracticeStats]);

  const refreshAfterHomework = useCallback(async () => {
    await Promise.all([
      loadHomeworks(true),
      loadHomeworkStats(true)
    ]);
  }, [loadHomeworks, loadHomeworkStats]);

  const value = {
    subjects, practiceTopics, homeworks, practiceStats, homeworkStats,
    loaded, loading,
    loadSubjects, loadPractice, loadHomeworks, loadPracticeStats, loadHomeworkStats,
    preloadAllData, refreshAfterPractice, refreshAfterHomework,
    prefetchQuestions, getQuestions, updatePracticeStatsOptimistic
  };

  return (
    <DataContext.Provider value={value}>
      {children}
    </DataContext.Provider>
  );
};