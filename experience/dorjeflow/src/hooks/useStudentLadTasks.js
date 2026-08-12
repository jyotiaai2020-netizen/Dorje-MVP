import { useCallback, useEffect, useState } from 'react';
import { runtimeProvider, studentLadApi } from '@/services/studentLadApi';

const STORAGE_KEY = 'studentlad.tasks';
const isOfflineDemo = () => window.sessionStorage.getItem('dorje.offline-demo') === 'true';

function readLocal(fallback) {
  try { return JSON.parse(window.localStorage.getItem(STORAGE_KEY)) || fallback; }
  catch { return fallback; }
}

export function useStudentLadTasks(initialTasks) {
  const [tasks, setTasks] = useState(() => readLocal(initialTasks));
  const [syncState, setSyncState] = useState(runtimeProvider === 'base44' ? 'base44' : isOfflineDemo() ? 'offline demo' : 'connecting');

  const persist = useCallback((next) => {
    setTasks(next);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }, []);

  const refresh = useCallback(async () => {
    if (runtimeProvider !== 'student-lad' || isOfflineDemo()) return;
    try {
      const remote = await studentLadApi.tasks.list();
      if (remote.length) persist(remote);
      setSyncState('verified');
    } catch (error) {
      setSyncState(error?.status === 401 ? 'sign in required' : 'offline');
    }
  }, [persist]);

  useEffect(() => { refresh(); }, [refresh]);

  const completeTask = useCallback(async (id) => {
    const before = tasks;
    const current = before.find((task) => task.id === id);
    const completed = current?.status !== 'completed';
    const next = before.map((task) => task.id === id ? { ...task, status: completed ? 'completed' : 'planned' } : task);
    persist(next);
    if (runtimeProvider !== 'student-lad' || isOfflineDemo() || !current?.authoritative) return;
    setSyncState('verifying');
    try {
      await studentLadApi.tasks.setCompleted(id, completed);
      await refresh();
    } catch {
      persist(before);
      setSyncState('verification failed');
    }
  }, [persist, refresh, tasks]);

  const addTask = useCallback(async (task) => {
    const localTask = { ...task, authoritative: false };
    persist([...tasks, localTask]);
    if (runtimeProvider !== 'student-lad' || isOfflineDemo()) return;
    setSyncState('verifying');
    try {
      const created = await studentLadApi.tasks.create(task);
      persist([...tasks, created]);
      setSyncState('verified');
    } catch {
      setSyncState('saved locally');
    }
  }, [persist, tasks]);

  return { tasks, syncState, completeTask, addTask, refresh };
}
