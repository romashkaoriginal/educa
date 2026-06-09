import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { apiFetch } from './api';

import { API_URL } from '../config';

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
  const [streak, setStreak] = useState({ streak: 0, todayDone: false });

  const [loaded, setLoaded] = useState({
    subjects: false, practice: false, homework: false,
    practiceStats: false, homeworkStats: false
  });

  const [loading, setLoading] = useState({
    subjects: false, practice: false, homework: false,
    practiceStats: false, homeworkStats: false
  });

  const loadedRef = useRef({ subjects: false, practice: false, homework: false, practiceStats: false, homeworkStats: false });
  const loadingRef = useRef({ subjects: false, practice: false, homework: false, practiceStats: false, homeworkStats: false });
  // Кэш вопросов практики: { topicId: [questions] }
  const questionsCache = useRef({});

  const loadSubjects = useCallback(async (force = false) => {
    if (loadedRef.current.subjects && !force) return subjects;
    if (loadingRef.current.subjects) return subjects;
    loadingRef.current.subjects = true;
    setLoading(prev => ({ ...prev, subjects: true }));
    try {
      const response = await apiFetch(`${API_URL}/subjects/student/${studentId}`);
      const data = await response.json();
      setSubjects(data.subjects || []);
      loadedRef.current.subjects = true;
      setLoaded(prev => ({ ...prev, subjects: true }));
      return data.subjects || [];
    } catch (error) {
      console.error('Error loading subjects:', error);
      return [];
    } finally {
      loadingRef.current.subjects = false;
      setLoading(prev => ({ ...prev, subjects: false }));
    }
  }, [studentId]); // eslint-disable-line

  const loadPractice = useCallback(async (force = false) => {
    if (loadedRef.current.practice && !force) return practiceTopics;
    if (loadingRef.current.practice) return practiceTopics;
    loadingRef.current.practice = true;
    setLoading(prev => ({ ...prev, practice: true }));
    try {
      const response = await apiFetch(`${API_URL}/practice/student/${studentId}`);
      const data = await response.json();
      const topics = data.practiceTopics || [];
      setPracticeTopics(topics);
      loadedRef.current.practice = true;
      setLoaded(prev => ({ ...prev, practice: true }));
      return topics;
    } catch (error) {
      console.error('Error loading practice:', error);
      return [];
    } finally {
      loadingRef.current.practice = false;
      setLoading(prev => ({ ...prev, practice: false }));
    }
  }, [studentId]); // eslint-disable-line

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
    if (loadedRef.current.homework && !force) return homeworks;
    if (loadingRef.current.homework) return homeworks;
    loadingRef.current.homework = true;
    setLoading(prev => ({ ...prev, homework: true }));
    try {
      const response = await apiFetch(`${API_URL}/homework/student/${studentId}`);
      const data = await response.json();
      setHomeworks(data.homeworks || []);
      loadedRef.current.homework = true;
      setLoaded(prev => ({ ...prev, homework: true }));
      return data.homeworks || [];
    } catch (error) {
      console.error('Error loading homeworks:', error);
      return [];
    } finally {
      loadingRef.current.homework = false;
      setLoading(prev => ({ ...prev, homework: false }));
    }
  }, [studentId]); // eslint-disable-line

  const loadPracticeStats = useCallback(async (force = false) => {
    if (loadedRef.current.practiceStats && !force) return practiceStats;
    if (loadingRef.current.practiceStats) return practiceStats;
    loadingRef.current.practiceStats = true;
    setLoading(prev => ({ ...prev, practiceStats: true }));
    try {
      const response = await apiFetch(`${API_URL}/practice/stats/${studentId}`);
      const data = await response.json();
      setPracticeStats(data);
      loadedRef.current.practiceStats = true;
      setLoaded(prev => ({ ...prev, practiceStats: true }));
      return data;
    } catch (error) {
      console.error('Error loading practice stats:', error);
      return null;
    } finally {
      loadingRef.current.practiceStats = false;
      setLoading(prev => ({ ...prev, practiceStats: false }));
    }
  }, [studentId]); // eslint-disable-line

  const loadHomeworkStats = useCallback(async (force = false) => {
    if (loadedRef.current.homeworkStats && !force) return homeworkStats;
    if (loadingRef.current.homeworkStats) return homeworkStats;
    loadingRef.current.homeworkStats = true;
    setLoading(prev => ({ ...prev, homeworkStats: true }));
    try {
      const response = await apiFetch(`${API_URL}/homework/student/${studentId}/stats`);
      const data = await response.json();
      setHomeworkStats(data);
      loadedRef.current.homeworkStats = true;
      setLoaded(prev => ({ ...prev, homeworkStats: true }));
      return data;
    } catch (error) {
      console.error('Error loading homework stats:', error);
      return null;
    } finally {
      loadingRef.current.homeworkStats = false;
      setLoading(prev => ({ ...prev, homeworkStats: false }));
    }
  }, [studentId]); // eslint-disable-line

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

  const loadStreak = useCallback(async (force = false) => {
    try {
      const response = await apiFetch(`${API_URL}/practice/streak/${studentId}`);
      const data = await response.json();
      setStreak(data || { streak: 0, todayDone: false });
      return data;
    } catch (error) {
      console.error('Error loading streak:', error);
      return null;
    }
  }, [studentId]); // eslint-disable-line

  const preloadAllData = useCallback(async () => {
    // Сначала грузим то что видно сразу — subjects и practice
    await Promise.all([loadSubjects(), loadPractice()]);
    // Остальное фоново — не блокируем UI
    Promise.all([loadHomeworks(), loadPracticeStats(), loadHomeworkStats(), loadStreak()]);
  }, [loadSubjects, loadPractice, loadHomeworks, loadPracticeStats, loadHomeworkStats]);

  const refreshAfterPractice = useCallback(async () => {
    loadedRef.current.practice = false;
    loadedRef.current.practiceStats = false;
    await Promise.all([loadPractice(true), loadPracticeStats(true), loadStreak(true)]);
  }, [loadPractice, loadPracticeStats, loadStreak]);

  const refreshAfterHomework = useCallback(async () => {
    loadedRef.current.homework = false;
    loadedRef.current.homeworkStats = false;
    await Promise.all([loadHomeworks(true), loadHomeworkStats(true)]);
  }, [loadHomeworks, loadHomeworkStats]);

  const value = {
    subjects, practiceTopics, homeworks, practiceStats, homeworkStats,
    loaded, loading,
    loadSubjects, loadPractice, loadHomeworks, loadPracticeStats, loadHomeworkStats,
    preloadAllData, refreshAfterPractice, refreshAfterHomework,
    prefetchQuestions, getQuestions, updatePracticeStatsOptimistic,
    streak, loadStreak
  };

  return (
    <DataContext.Provider value={value}>
      {children}
    </DataContext.Provider>
  );
};