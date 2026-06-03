import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { adminFetch } from './adminApi';

const API_URL = 'https://educa-production-a98e.up.railway.app/api';

const AdminDataContext = createContext(null);

export function AdminDataProvider({ children, subjects }) {
  const [students, setStudents] = useState([]);
  const [users, setUsers] = useState([]);
  const [applications, setApplications] = useState([]);
  const [statistics, setStatistics] = useState(null);
  const [statsStudents, setStatsStudents] = useState([]);

  const [loading, setLoading] = useState({
    students: false, users: false, applications: false, statistics: false
  });

  // Флаги чтобы не грузить повторно при переходе обратно
  const loadedRef = useRef({
    students: false, users: false, applications: false, statistics: false
  });

  const load = useCallback(async (key, fetcher, force = false) => {
    if (loadedRef.current[key] && !force) return;
    setLoading(prev => ({ ...prev, [key]: true }));
    try {
      await fetcher();
      loadedRef.current[key] = true;
    } catch (e) {
      console.error(`Load ${key} error:`, e);
    } finally {
      setLoading(prev => ({ ...prev, [key]: false }));
    }
  }, []);

  const loadStudents = useCallback((force = false) => load('students', async () => {
    const r = await adminFetch(`${API_URL}/students`);
    const d = await r.json();
    setStudents(d.students || []);
  }, force), [load]);

  const loadUsers = useCallback((force = false) => load('users', async () => {
    const r = await adminFetch(`${API_URL}/users`);
    const d = await r.json();
    setUsers(d.users || []);
  }, force), [load]);

  const loadApplications = useCallback((force = false) => load('applications', async () => {
    const r = await adminFetch(`${API_URL}/applications`);
    const d = await r.json();
    setApplications(d.applications || []);
  }, force), [load]);

  const loadStatistics = useCallback((force = false) => load('statistics', async () => {
    const [statsR, studentsR] = await Promise.all([
      adminFetch(`${API_URL}/stats/admin`),
      adminFetch(`${API_URL}/stats/students`)
    ]);
    const statsD = await statsR.json();
    const studentsD = await studentsR.json();
    setStatistics(statsD);
    setStatsStudents(studentsD.students || []);
  }, force), [load]);

  // Refresh конкретного раздела (для кнопки "Обновить")
  const refresh = useCallback((section) => {
    loadedRef.current[section] = false;
    switch (section) {
      case 'students': return loadStudents(true);
      case 'users': return loadUsers(true);
      case 'applications': return loadApplications(true);
      case 'statistics': return loadStatistics(true);
      default: break;
    }
  }, [loadStudents, loadUsers, loadApplications, loadStatistics]);

  return (
    <AdminDataContext.Provider value={{
      students, users, applications, statistics, statsStudents,
      loading,
      loadStudents, loadUsers, loadApplications, loadStatistics,
      refresh,
      // Утилиты для оптимистичных обновлений после мутаций
      setStudents, setUsers, setApplications
    }}>
      {children}
    </AdminDataContext.Provider>
  );
}

export function useAdminData() {
  const ctx = useContext(AdminDataContext);
  if (!ctx) throw new Error('useAdminData must be used inside AdminDataProvider');
  return ctx;
}