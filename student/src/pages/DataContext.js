import React, { createContext, useContext, useState, useCallback } from 'react';

const API_URL = 'https://educa-production-a98e.up.railway.app/api';

const DataContext = createContext();

export const useData = () => {
  const context = useContext(DataContext);
  if (!context) {
    throw new Error('useData must be used within DataProvider');
  }
  return context;
};

export const DataProvider = ({ children, studentId }) => {
  const [subjects, setSubjects] = useState([]);
  const [practiceTopics, setPracticeTopics] = useState([]);
  const [homeworks, setHomeworks] = useState([]);
  const [practiceStats, setPracticeStats] = useState(null);
  const [homeworkStats, setHomeworkStats] = useState(null);

  const [loaded, setLoaded] = useState({
    subjects: false,
    practice: false,
    homework: false,
    practiceStats: false,
    homeworkStats: false
  });

  const [loading, setLoading] = useState({
    subjects: false,
    practice: false,
    homework: false,
    practiceStats: false,
    homeworkStats: false
  });

  const loadSubjects = useCallback(async (force = false) => {
    if (loaded.subjects && !force) return subjects;
    if (loading.subjects) return subjects;

    setLoading(prev => ({ ...prev, subjects: true }));
    try {
      const response = await fetch(`${API_URL}/subjects/student/${studentId}`);
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
      const response = await fetch(`${API_URL}/practice/student/${studentId}`);
      const data = await response.json();
      setPracticeTopics(data.practiceTopics || []);
      setLoaded(prev => ({ ...prev, practice: true }));
      return data.practiceTopics || [];
    } catch (error) {
      console.error('Error loading practice:', error);
      return [];
    } finally {
      setLoading(prev => ({ ...prev, practice: false }));
    }
  }, [studentId, loaded.practice, loading.practice, practiceTopics]);

  const loadHomeworks = useCallback(async (force = false) => {
    if (loaded.homework && !force) return homeworks;
    if (loading.homework) return homeworks;

    setLoading(prev => ({ ...prev, homework: true }));
    try {
      const response = await fetch(`${API_URL}/homework/student/${studentId}`);
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
      const response = await fetch(`${API_URL}/practice/stats/${studentId}`);
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
      const response = await fetch(`${API_URL}/homework/student/${studentId}/stats`);
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
    subjects,
    practiceTopics,
    homeworks,
    practiceStats,
    homeworkStats,
    loaded,
    loading,
    loadSubjects,
    loadPractice,
    loadHomeworks,
    loadPracticeStats,
    loadHomeworkStats,
    preloadAllData,
    refreshAfterPractice,
    refreshAfterHomework
  };

  return (
    <DataContext.Provider value={value}>
      {children}
    </DataContext.Provider>
  );
};