import { addDays, addWeeks, addMonths, subDays, parseISO, isBefore, format } from 'date-fns';
import { Task, ExternalTask, InterdayGroup, TaskKind, DEFAULT_REMINDER_TIMES } from '../types';
import { getNow } from './mockTime';

export interface UpcomingReminder {
  key: string;
  taskId: string;
  date: Date;
  title: string;
  body: string;
  kind: TaskKind;
}

const GROUP_HOURS: Record<InterdayGroup, number> = {
  morning: 8,
  afternoon: 14,
  evening: 19,
  none: 9,
};

function computeOccurrences(startISO: string, recurrence: ExternalTask['recurrence'], count: number): Date[] {
  const dates: Date[] = [];
  let current = parseISO(startISO);
  for (let i = 0; i < count; i++) {
    if (i === 0) {
      dates.push(new Date(current));
    } else if (recurrence) {
      const { every, unit } = recurrence;
      if (unit === 'days') current = addDays(current, every);
      else if (unit === 'weeks') current = addWeeks(current, every);
      else current = addMonths(current, every);
      dates.push(new Date(current));
    }
  }
  return dates;
}

export function getUpcomingReminders(tasks: Task[], windowDays = 14): UpcomingReminder[] {
  const now = getNow();
  const cutoff = addDays(now, windowDays);
  const reminders: UpcomingReminder[] = [];

  for (const task of tasks) {
    if ('completedAt' in task && task.completedAt) continue;
    if ('archivedAt' in task && task.archivedAt) continue;

    if (task.kind === 'external') {
      const occurrences = task.recurrence
        ? computeOccurrences(task.dateTime, task.recurrence, 4)
        : [parseISO(task.dateTime)];

      for (const occ of occurrences) {
        if (isBefore(occ, now)) continue;

        const [remH, remM] = (task.reminderTime ?? DEFAULT_REMINDER_TIMES.defaultTime).split(':').map(Number);

        const reminderDays = Array.isArray(task.earlyReminderDays)
          ? task.earlyReminderDays
          : (task.earlyReminderDays as unknown as number) > 0 ? [task.earlyReminderDays as unknown as number] : [];
        for (const days of reminderDays) {
          const earlyDate = subDays(occ, days);
          earlyDate.setHours(remH, remM, 0, 0);
          const startOfEarlyDay = new Date(earlyDate);
          startOfEarlyDay.setHours(0, 0, 0, 0);
          const startOfToday = new Date(now);
          startOfToday.setHours(0, 0, 0, 0);
          if (!isBefore(startOfEarlyDay, startOfToday) && isBefore(earlyDate, cutoff)) {
            reminders.push({
              key: `${task.id}_early_${days}_${occ.getTime()}`,
              taskId: task.id,
              date: earlyDate,
              title: 'Upcoming Appointment',
              body: `"${task.title}" is in ${days} day${days > 1 ? 's' : ''}.`,
              kind: 'external',
            });
          }
        }

        if (task.dayOfReminder) {
          const dayOf = new Date(occ);
          dayOf.setHours(remH, remM, 0, 0);
          if (!isBefore(dayOf, now) && isBefore(dayOf, cutoff)) {
            reminders.push({
              key: `${task.id}_dayof_${occ.getTime()}`,
              taskId: task.id,
              date: dayOf,
              title: `Today: ${task.title}`,
              body: `Your appointment is today at ${format(occ, 'h:mm a')}.`,
              kind: 'external',
            });
          }
        }
      }
    } else if (task.kind === 'internal') {
      const [intH, intM] = (task.reminderTime ?? DEFAULT_REMINDER_TIMES.defaultTime).split(':').map(Number);
      const dueDateAnchor = new Date(task.nextDueDate + 'T12:00:00');

      const earlyDays = task.earlyReminderDays ?? [];
      for (const days of earlyDays) {
        const earlyDate = subDays(dueDateAnchor, days);
        earlyDate.setHours(intH, intM, 0, 0);
        const startOfEarlyDay = new Date(earlyDate);
        startOfEarlyDay.setHours(0, 0, 0, 0);
        const startOfToday = new Date(now);
        startOfToday.setHours(0, 0, 0, 0);
        if (!isBefore(startOfEarlyDay, startOfToday) && isBefore(earlyDate, cutoff)) {
          reminders.push({
            key: `${task.id}_early_${days}`,
            taskId: task.id,
            date: earlyDate,
            title: 'Upcoming To-Do',
            body: `"${task.title}" is due in ${days} day${days > 1 ? 's' : ''}.`,
            kind: 'internal',
          });
        }
      }

      const dueDate = new Date(dueDateAnchor);
      dueDate.setHours(intH, intM, 0, 0);
      if (!isBefore(dueDate, now) && isBefore(dueDate, cutoff)) {
        reminders.push({
          key: `${task.id}_due`,
          taskId: task.id,
          date: dueDate,
          title: 'Reminder',
          body: task.title,
          kind: 'internal',
        });
      }
    } else if (task.kind === 'interday') {
      const [hour, minute] = task.timeSlot
        ? task.timeSlot.split(':').map(Number)
        : [GROUP_HOURS[task.group], 0];

      const activeDays = task.activeDays.length > 0 ? task.activeDays : [0, 1, 2, 3, 4, 5, 6];

      let cursor = new Date(now);
      cursor.setHours(0, 0, 0, 0);
      let found = 0;

      while (isBefore(cursor, cutoff) && found < 3) {
        if (activeDays.includes(cursor.getDay())) {
          const reminderDate = new Date(cursor);
          reminderDate.setHours(hour, minute, 0, 0);

          if (task.deferredUntil && !isBefore(new Date(task.deferredUntil), cursor)) {
            cursor = addDays(cursor, 1);
            continue;
          }

          if (!isBefore(reminderDate, now)) {
            reminders.push({
              key: `${task.id}_interday_${cursor.toDateString()}`,
              taskId: task.id,
              date: reminderDate,
              title: task.title,
              body: task.notes ?? `Time for: ${task.title}`,
              kind: 'interday',
            });
            found++;
          }
        }
        cursor = addDays(cursor, 1);
      }
    }
  }

  return reminders.sort((a, b) => a.date.getTime() - b.date.getTime());
}
