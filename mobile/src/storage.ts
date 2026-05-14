import AsyncStorage from '@react-native-async-storage/async-storage';
import { Task, ExternalTask, InternalTask, InterdayTask, ChatMessage } from './types';
import { isToday, parseISO, isBefore, addDays, isWithinInterval } from 'date-fns';

const KEYS = {
  TASKS: 'goldies_tasks',
  CHAT_HISTORY: 'goldies_chat',
  USER_NAME: 'goldies_user_name',
} as const;

// ─── Task CRUD ──────────────────────────────────────────────────────────────

export async function loadAllTasks(): Promise<Task[]> {
  const raw = await AsyncStorage.getItem(KEYS.TASKS);
  return raw ? JSON.parse(raw) : [];
}

export async function saveAllTasks(tasks: Task[]): Promise<void> {
  await AsyncStorage.setItem(KEYS.TASKS, JSON.stringify(tasks));
}

export async function addTask(task: Task): Promise<void> {
  const tasks = await loadAllTasks();
  await saveAllTasks([...tasks, task]);
}

export async function updateTask(updated: Task): Promise<void> {
  const tasks = await loadAllTasks();
  await saveAllTasks(tasks.map(t => (t.id === updated.id ? updated : t)));
}

export async function deleteTask(taskId: string): Promise<void> {
  const tasks = await loadAllTasks();
  await saveAllTasks(tasks.filter(t => t.id !== taskId));
}

export async function getTaskById(id: string): Promise<Task | null> {
  const tasks = await loadAllTasks();
  return tasks.find(t => t.id === id) ?? null;
}

// ─── Chat ───────────────────────────────────────────────────────────────────

export async function loadChatHistory(): Promise<ChatMessage[]> {
  const raw = await AsyncStorage.getItem(KEYS.CHAT_HISTORY);
  return raw ? JSON.parse(raw) : [];
}

export async function saveChatHistory(messages: ChatMessage[]): Promise<void> {
  await AsyncStorage.setItem(KEYS.CHAT_HISTORY, JSON.stringify(messages));
}

export async function clearChatHistory(): Promise<void> {
  await AsyncStorage.removeItem(KEYS.CHAT_HISTORY);
}

// ─── User prefs ─────────────────────────────────────────────────────────────

export async function loadUserName(): Promise<string | null> {
  return AsyncStorage.getItem(KEYS.USER_NAME);
}

export async function saveUserName(name: string): Promise<void> {
  await AsyncStorage.setItem(KEYS.USER_NAME, name);
}

// ─── Pure query helpers (synchronous, operate on already-loaded tasks) ──────

export function getTasksDueToday(tasks: Task[]): Task[] {
  const now = new Date();
  return tasks.filter(task => {
    if ((task.kind === 'external' || task.kind === 'internal') && task.completedAt) return false;
    if (task.kind === 'interday' && task.archivedAt) return false;

    if (task.kind === 'external') {
      return isToday(parseISO(task.dateTime));
    }
    if (task.kind === 'internal') {
      const due = parseISO(task.nextDueDate);
      return isToday(due) || isBefore(due, now);
    }
    if (task.kind === 'interday') {
      if (task.deferredUntil && isBefore(now, parseISO(task.deferredUntil))) return false;
      const todayDay = now.getDay(); // 0=Sun
      if (task.activeDays.length === 0) return true;
      return task.activeDays.includes(todayDay);
    }
    return false;
  });
}

export function getUpcomingExternal(tasks: Task[], days: number): ExternalTask[] {
  const now = new Date();
  const cutoff = addDays(now, days);
  return tasks
    .filter((t): t is ExternalTask => t.kind === 'external' && !t.completedAt)
    .filter(t => {
      const dt = parseISO(t.dateTime);
      return isWithinInterval(dt, { start: now, end: cutoff }) && !isToday(dt);
    })
    .sort((a, b) => a.dateTime.localeCompare(b.dateTime));
}

export function getActiveTasks(tasks: Task[]): Task[] {
  return tasks.filter(t => {
    if (t.kind === 'external') return !t.completedAt;
    if (t.kind === 'internal') return !t.completedAt;
    if (t.kind === 'interday') return !t.archivedAt;
    return false;
  });
}
