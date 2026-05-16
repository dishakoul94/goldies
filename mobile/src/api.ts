import { Task, ExternalTask, TaskCreatePayload, TaskDeletePayload, TaskEditPayload } from './types';
import { addDays, parseISO, isToday, isWithinInterval, format } from 'date-fns';

export const BASE_URL = __DEV__
  ? 'http://localhost:8000'
  : 'https://goldies-production.up.railway.app';

export async function sendChatMessage(
  messages: Array<{ role: string; content: string }>,
  tasksContext: string,
  userName: string | null,
  onToken: (token: string) => void,
  onTaskCreate?: (payload: TaskCreatePayload) => Promise<void> | void,
  onTaskDelete?: (payload: TaskDeletePayload) => Promise<void> | void,
  onTaskEdit?: (payload: TaskEditPayload) => Promise<void> | void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${BASE_URL}/api/chat`);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.setRequestHeader('Accept', 'text/event-stream');

    let cursor = 0;
    let currentEventType = 'message';
    // Buffer incomplete lines — HTTP chunks can split mid-line, which would
    // truncate "event: task_delete" to "event: task_del" and break event detection.
    let lineBuffer = '';
    // Collect promises from async task handlers so onload can await them before
    // resolving — prevents a race where the user navigates before storage writes finish.
    const pendingOps: Promise<void>[] = [];

    xhr.onprogress = () => {
      lineBuffer += xhr.responseText.slice(cursor);
      cursor = xhr.responseText.length;

      // Only process complete lines; hold the last (possibly partial) line in the buffer.
      const lines = lineBuffer.split('\n');
      lineBuffer = lines.pop() ?? '';

      for (const line of lines) {
        if (line.startsWith('event: ')) {
          currentEventType = line.slice(7).trim();
        } else if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') return;
          if (!data) continue;

          if (currentEventType === 'task_create') {
            try {
              const payload: TaskCreatePayload = JSON.parse(data);
              const p = onTaskCreate?.(payload);
              if (p) pendingOps.push(p);
            } catch { /* malformed JSON — ignore */ }
          } else if (currentEventType === 'task_delete') {
            try {
              const payload: TaskDeletePayload = JSON.parse(data);
              const p = onTaskDelete?.(payload);
              if (p) pendingOps.push(p);
            } catch { /* malformed JSON — ignore */ }
          } else if (currentEventType === 'task_edit') {
            try {
              const payload: TaskEditPayload = JSON.parse(data);
              const p = onTaskEdit?.(payload);
              if (p) pendingOps.push(p);
            } catch { /* malformed JSON — ignore */ }
          } else {
            onToken(data);
          }
          currentEventType = 'message';
        }
      }
    };

    xhr.onload = () => {
      const finish = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve();
        } else {
          reject(new Error(`Server error: ${xhr.status}`));
        }
      };
      // Wait for any in-flight storage writes before resolving so callers
      // (and subsequent navigation) see a consistent AsyncStorage state.
      if (pendingOps.length > 0) {
        Promise.all(pendingOps).then(finish, finish);
      } else {
        finish();
      }
    };

    xhr.onerror = () => reject(new Error('Network error'));
    xhr.ontimeout = () => reject(new Error('Request timed out'));
    xhr.timeout = 30000;

    xhr.send(JSON.stringify({ messages, tasks_context: tasksContext, user_name: userName }));
  });
}

export function buildTasksContext(tasks: Task[]): string {
  const now = new Date();
  const lines: string[] = [];

  const dueToday = tasks.filter(task => {
    if ('completedAt' in task && task.completedAt) return false;
    if ('archivedAt' in task && (task as any).archivedAt) return false;
    if (task.kind === 'external') return isToday(parseISO(task.dateTime));
    if (task.kind === 'internal') {
      const d = parseISO(task.nextDueDate);
      return isToday(d) || d < now;
    }
    if (task.kind === 'interday') {
      if ((task as any).deferredUntil && parseISO((task as any).deferredUntil) > now) return false;
      const days = task.activeDays.length > 0 ? task.activeDays : [0,1,2,3,4,5,6];
      return days.includes(now.getDay());
    }
    return false;
  });

  if (dueToday.length > 0) {
    lines.push('Tasks for today:');
    dueToday.forEach(t => {
      const time = t.kind === 'interday' && t.timeSlot ? ` at ${t.timeSlot}` : '';
      lines.push(`- ${t.title}${time}`);
    });
  }

  const upcomingExternal = tasks
    .filter((t): t is ExternalTask => t.kind === 'external' && !t.completedAt)
    .filter(t => parseISO(t.dateTime) > now && !isToday(parseISO(t.dateTime)))
    .sort((a, b) => a.dateTime.localeCompare(b.dateTime));

  if (upcomingExternal.length > 0) {
    lines.push('Upcoming appointments:');
    upcomingExternal.forEach(t =>
      lines.push(`- ${t.title} on ${format(parseISO(t.dateTime), 'EEEE, MMM d')} at ${format(parseISO(t.dateTime), 'h:mm a')}`),
    );
  }

  const activeReminders = tasks.filter(t => t.kind === 'internal' && !t.completedAt);
  if (activeReminders.length > 0) {
    lines.push('Active reminders/to-dos:');
    activeReminders.forEach(t => {
      const due = (t as any).nextDueDate ? ` (due ${(t as any).nextDueDate})` : '';
      lines.push(`- ${t.title}${due}`);
    });
  }

  const dailyRoutines = tasks.filter(t => t.kind === 'interday' && !(t as any).archivedAt);
  if (dailyRoutines.length > 0) {
    lines.push('Daily routines:');
    dailyRoutines.forEach(t => lines.push(`- ${t.title}`));
  }

  return lines.join('\n') || 'No tasks scheduled right now.';
}
