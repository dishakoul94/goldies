import { Task, ExternalTask } from './types';
import { addDays, parseISO, isToday, isWithinInterval, format } from 'date-fns';

export const BASE_URL = __DEV__
  ? 'http://10.0.0.209:8000'
  : 'https://your-goldies-backend.up.railway.app';

export async function sendChatMessage(
  messages: Array<{ role: string; content: string }>,
  tasksContext: string,
  userName: string | null,
  onToken: (token: string) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${BASE_URL}/api/chat`);
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.setRequestHeader('Accept', 'text/event-stream');

    let cursor = 0; // how many chars of responseText we've already processed

    xhr.onprogress = () => {
      const newChunk = xhr.responseText.slice(cursor);
      cursor = xhr.responseText.length;

      for (const line of newChunk.split('\n')) {
        if (line.startsWith('data: ')) {
          const token = line.slice(6);
          if (token === '[DONE]') return;
          if (token) onToken(token);
        }
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(`Server error: ${xhr.status}`));
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

  const cutoff = addDays(now, 7);
  const upcoming = tasks
    .filter((t): t is ExternalTask => t.kind === 'external' && !t.completedAt)
    .filter(t => {
      const dt = parseISO(t.dateTime);
      return isWithinInterval(dt, { start: now, end: cutoff }) && !isToday(dt);
    })
    .sort((a, b) => a.dateTime.localeCompare(b.dateTime))
    .slice(0, 5);

  if (upcoming.length > 0) {
    lines.push('Upcoming appointments (next 7 days):');
    upcoming.forEach(t => lines.push(`- ${t.title} on ${format(parseISO(t.dateTime), 'EEEE, MMM d')}`));
  }

  return lines.join('\n') || 'No tasks scheduled right now.';
}
