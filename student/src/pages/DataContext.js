import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { apiFetch, getTelegramInitData } from './api';

import { API_URL, SOCKET_URL } from '../config';

const parseOkJson = async (response, label) => {
  if (!response.ok) {
    console.error(`${label} failed:`, response.status);
    return null;
  }
  return response.json();
};

const sameId = (a, b) => Number(a) === Number(b);

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
  const [streakLoaded, setStreakLoaded] = useState(false);
  const [predictedScore, setPredictedScore] = useState(null);
  const [dailyGoal, setDailyGoal] = useState(null);
  const [leaderboard, setLeaderboard] = useState(null);
  const [scoreHistory, setScoreHistory] = useState(null);
  const [subjectDashboard, setSubjectDashboard] = useState(null);
  const [practiceIntent, setPracticeIntent] = useState(null);
  const [practiceHomeToken, setPracticeHomeToken] = useState(0);
  const [homeworkHomeToken, setHomeworkHomeToken] = useState(0);
  const [dashboardRefreshKey, setDashboardRefreshKey] = useState(0);
  const [currentLesson, setCurrentLesson] = useState(null);
  const [lessonNotice, setLessonNotice] = useState(null);
  const [lessonConnected, setLessonConnected] = useState(false);
  const [lessonReconnecting, setLessonReconnecting] = useState(false);
  const lessonSocketRef = useRef(null);

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

  useEffect(() => {
    if (!studentId) return undefined;
    const socket = io(SOCKET_URL, {
      auth: { initData: getTelegramInitData() },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 800,
      reconnectionDelayMax: 5000
    });
    lessonSocketRef.current = socket;

    const onConnect = () => {
      setLessonConnected(true);
      setLessonReconnecting(false);
    };
    const onDisconnect = () => {
      setLessonConnected(false);
      setLessonReconnecting(true);
    };
    const onStarted = ({ lesson }) => {
      setCurrentLesson(lesson);
      setLessonNotice({ type: 'started', lesson });
    };
    const onFinished = ({ lessonId }) => {
      setCurrentLesson((lesson) => Number(lesson?.id) === Number(lessonId) ? null : lesson);
      setLessonNotice({ type: 'finished', lessonId });
    };
    const onState = (state) => {
      if (state?.lesson) setCurrentLesson(state.lesson);
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('lesson:started', onStarted);
    socket.on('lesson:finished', onFinished);
    socket.on('lesson:state', onState);
    socket.io.on('reconnect_attempt', () => setLessonReconnecting(true));
    socket.io.on('reconnect', () => setLessonReconnecting(false));

    return () => {
      socket.removeAllListeners();
      socket.io.removeAllListeners();
      socket.disconnect();
      if (lessonSocketRef.current === socket) lessonSocketRef.current = null;
    };
  }, [studentId]);

  const dismissLessonNotice = useCallback(() => setLessonNotice(null), []);

  const loadSubjects = useCallback(async (force = false) => {
    if (loadedRef.current.subjects && !force) return subjects;
    if (loadingRef.current.subjects) return subjects;
    loadingRef.current.subjects = true;
    setLoading(prev => ({ ...prev, subjects: true }));
    try {
      const response = await apiFetch(`${API_URL}/subjects/student/${studentId}`);
      const data = await parseOkJson(response, 'loadSubjects');
      if (!data) return [];
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
      const data = await parseOkJson(response, 'loadPractice');
      if (!data) return [];
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
          const data = await parseOkJson(res, 'prefetchQuestions');
          if (!data) return;
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
    const data = await parseOkJson(res, 'getQuestions');
    if (!data) return [];
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
      const data = await parseOkJson(response, 'loadHomeworks');
      if (!data) return [];
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
      const data = await parseOkJson(response, 'loadPracticeStats');
      if (!data) return null;
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
      const data = await parseOkJson(response, 'loadHomeworkStats');
      if (!data) return null;
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
      if (Number(topic.id) !== Number(topicId)) return topic;
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

  const loadStreak = useCallback(async (subjectId = null, force = false) => {
    if (typeof subjectId === 'boolean') {
      force = subjectId;
      subjectId = null;
    }
    try {
      const qs = subjectId ? `?subjectId=${subjectId}` : '';
      const response = await apiFetch(`${API_URL}/practice/streak/${studentId}${qs}`);
      const data = await parseOkJson(response, 'loadStreak');
      setStreak(data || { streak: 0, todayDone: false });
      setStreakLoaded(true);
      return data;
    } catch (error) {
      console.error('Error loading streak:', error);
      setStreakLoaded(true);
      return null;
    }
  }, [studentId]); // eslint-disable-line

  const loadPredictedScore = useCallback(async (subjectId) => {
    if (!subjectId) return null;
    try {
      const response = await apiFetch(`${API_URL}/practice/predicted/${studentId}/${subjectId}`);
      const data = await parseOkJson(response, 'loadPredictedScore');
      if (!data) return null;
      setPredictedScore(data);
      return data;
    } catch (error) {
      console.error('Error loading predicted score:', error);
      return null;
    }
  }, [studentId]);

  const loadDailyGoal = useCallback(async () => {
    try {
      const response = await apiFetch(`${API_URL}/practice/daily-goal/${studentId}`);
      const data = await parseOkJson(response, 'loadDailyGoal');
      if (!data) return null;
      setDailyGoal(data);
      return data;
    } catch (error) {
      console.error('Error loading daily goal:', error);
      return null;
    }
  }, [studentId]);

  const patchDailyGoal = useCallback((goalEntry) => {
    if (!goalEntry?.subjectId) return;
    setDailyGoal((prev) => {
      if (!prev?.goals) return prev;
      const goals = prev.goals.map((g) =>
        sameId(g.subjectId, goalEntry.subjectId) ? { ...g, ...goalEntry } : g
      );
      const totalCorrectToday = goals.reduce((sum, g) => sum + (g.solved || 0), 0);
      return { ...prev, goals, totalCorrectToday, totalUniqueToday: totalCorrectToday };
    });
  }, []);

  const loadLeaderboard = useCallback(async (subjectId, period = 'day') => {
    if (!subjectId) return null;
    try {
      const response = await apiFetch(`${API_URL}/practice/leaderboard/${subjectId}?period=${period}&studentId=${studentId}`);
      const data = await parseOkJson(response, 'loadLeaderboard');
      if (!data) return null;
      setLeaderboard(data);
      return data;
    } catch (error) {
      console.error('Error loading leaderboard:', error);
      return null;
    }
  }, [studentId]);

  const loadScoreHistory = useCallback(async (subjectId) => {
    if (!subjectId) return null;
    try {
      const response = await apiFetch(`${API_URL}/practice/score-history/${studentId}/${subjectId}`);
      const data = await parseOkJson(response, 'loadScoreHistory');
      if (!data) return null;
      setScoreHistory(data);
      return data;
    } catch (error) {
      console.error('Error loading score history:', error);
      return null;
    }
  }, [studentId]);

  const loadWeakTopicsQuestions = useCallback(async (subjectId) => {
    if (!subjectId) return null;
    try {
      const response = await apiFetch(`${API_URL}/practice/weak-topics/${studentId}/${subjectId}`);
      if (!response.ok) {
        console.error('loadWeakTopicsQuestions failed:', response.status);
        return null;
      }
      return await response.json();
    } catch (error) {
      console.error('Error loading weak topics:', error);
      return null;
    }
  }, [studentId]);

  const loadSubjectDashboard = useCallback(async (subjectId) => {
    if (!subjectId) return null;
    try {
      let response = await apiFetch(`${API_URL}/practice/dashboard/${studentId}/${subjectId}`);
      if (response.status === 404) {
        response = await apiFetch(`${API_URL}/practice/predicted/${studentId}/${subjectId}?dashboard=1`);
      }
      if (!response.ok) {
        console.error('Dashboard load failed:', response.status, subjectId);
        return null;
      }
      const data = await response.json();
      setSubjectDashboard(data);
      return data;
    } catch (error) {
      console.error('Error loading subject dashboard:', error);
      return null;
    }
  }, [studentId]);

  const refreshDashboard = useCallback(() => {
    setDashboardRefreshKey((k) => k + 1);
  }, []);

  const requestPractice = useCallback((intent) => {
    setPracticeIntent(intent);
  }, []);

  const clearPracticeIntent = useCallback(() => {
    setPracticeIntent(null);
  }, []);

  const requestPracticeHome = useCallback(() => {
    setPracticeHomeToken((t) => t + 1);
  }, []);

  const requestHomeworkHome = useCallback(() => {
    setHomeworkHomeToken((t) => t + 1);
  }, []);

  const preloadAllData = useCallback(async () => {
    // Сначала грузим то что видно сразу — subjects, practice и streak (огонёк в hero)
    await Promise.all([loadSubjects(), loadPractice(), loadStreak()]);
    // Остальное фоново — не блокируем UI
    Promise.all([loadHomeworks(), loadPracticeStats(), loadHomeworkStats()]);
  }, [loadSubjects, loadPractice, loadStreak, loadHomeworks, loadPracticeStats, loadHomeworkStats]);

  const refreshAfterPractice = useCallback(async (subjectId, leaderboardPeriod = 'day') => {
    loadedRef.current.practice = false;
    loadedRef.current.practiceStats = false;
    const [, , newStreak] = await Promise.all([
      loadPractice(true),
      loadPracticeStats(true),
      loadStreak(subjectId, true),
      loadDailyGoal(),
      subjectId ? loadPredictedScore(subjectId) : Promise.resolve(),
      subjectId ? loadScoreHistory(subjectId) : Promise.resolve(),
      subjectId ? loadLeaderboard(subjectId, leaderboardPeriod) : Promise.resolve(),
      subjectId ? loadSubjectDashboard(subjectId) : Promise.resolve(),
    ]);
    return newStreak;
  }, [loadPractice, loadPracticeStats, loadStreak, loadDailyGoal, loadPredictedScore, loadScoreHistory, loadLeaderboard, loadSubjectDashboard]);

  const refreshAfterHomework = useCallback(async (subjectId) => {
    loadedRef.current.homework = false;
    loadedRef.current.homeworkStats = false;
    await Promise.all([
      loadHomeworks(true),
      loadHomeworkStats(true),
      subjectId ? loadPredictedScore(subjectId) : Promise.resolve(),
      subjectId ? loadSubjectDashboard(subjectId) : Promise.resolve(),
    ]);
    if (subjectId) refreshDashboard();
  }, [loadHomeworks, loadHomeworkStats, loadPredictedScore, loadSubjectDashboard, refreshDashboard]);

  const value = {
    subjects, practiceTopics, homeworks, practiceStats, homeworkStats,
    loaded, loading,
    loadSubjects, loadPractice, loadHomeworks, loadPracticeStats, loadHomeworkStats,
    preloadAllData, refreshAfterPractice, refreshAfterHomework,
    prefetchQuestions, getQuestions, updatePracticeStatsOptimistic,
    streak, streakLoaded, setStreak, setStreakLoaded, loadStreak,
    predictedScore, loadPredictedScore,
    dailyGoal, loadDailyGoal, patchDailyGoal,
    leaderboard, loadLeaderboard,
    scoreHistory, loadScoreHistory,
    loadWeakTopicsQuestions,
    subjectDashboard, loadSubjectDashboard, refreshDashboard, dashboardRefreshKey,
    practiceIntent, requestPractice, clearPracticeIntent,
    practiceHomeToken, requestPracticeHome,
    homeworkHomeToken, requestHomeworkHome,
    currentLesson, setCurrentLesson, lessonNotice, dismissLessonNotice,
    lessonSocket: lessonSocketRef.current, lessonConnected, lessonReconnecting
  };

  return (
    <DataContext.Provider value={value}>
      {children}
    </DataContext.Provider>
  );
};
