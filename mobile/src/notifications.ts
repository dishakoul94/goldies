import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import {
  addDays, addWeeks, addMonths, parseISO, subDays, isBefore, format,
} from 'date-fns';
import { ExternalTask, InternalTask, InterdayTask, Recurrence, UserProfile, ReminderTimesConfig, DEFAULT_REMINDER_TIMES } from './types';
import { getNow } from './utils/mockTime';

function resolveReminderTimes(profile?: UserProfile | null): ReminderTimesConfig {
  return { ...DEFAULT_REMINDER_TIMES, ...profile?.reminderTimes };
}

function parseTimeStr(hhmm: string): { hour: number; minute: number } {
  const [hour, minute] = hhmm.split(':').map(Number);
  return { hour, minute };
}

export async function setupNotifications(): Promise<boolean> {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });

  if (Platform.OS === 'web') return false;

  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return true;

  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

export async function cancelNotifications(ids: string[]): Promise<void> {
  await Promise.all(ids.map(id => Notifications.cancelScheduledNotificationAsync(id).catch(() => {})));
}

// When mock time is in the past, computed trigger dates may land in the real past.
// Expo rejects those — this bumps them to 1 min from now so they fire immediately.
function toFutureDate(date: Date): Date {
  return date > new Date() ? date : new Date(Date.now() + 60 * 1000);
}

// ─── External Task ───────────────────────────────────────────────────────────

function computeOccurrences(startISO: string, recurrence: Recurrence, count: number): Date[] {
  const dates: Date[] = [];
  let current = parseISO(startISO);
  for (let i = 0; i < count; i++) {
    if (i === 0) {
      dates.push(new Date(current));
    } else {
      const { every, unit } = recurrence;
      if (unit === 'days') current = addDays(current, every);
      else if (unit === 'weeks') current = addWeeks(current, every);
      else current = addMonths(current, every);
      dates.push(new Date(current));
    }
  }
  return dates;
}

export async function scheduleExternalTaskNotifications(task: ExternalTask, profile?: UserProfile | null): Promise<string[]> {
  if (Platform.OS === 'web') return [];
  const ids: string[] = [];
  const now = getNow();
  const { hour: remHour, minute: remMinute } = parseTimeStr(task.reminderTime ?? resolveReminderTimes(profile).defaultTime);

  const occurrences = task.recurrence
    ? computeOccurrences(task.dateTime, task.recurrence, 4)
    : [parseISO(task.dateTime)];

  for (const occ of occurrences) {
    if (isBefore(occ, now)) continue;

    const reminderDays = Array.isArray(task.earlyReminderDays)
      ? task.earlyReminderDays
      : (task.earlyReminderDays as unknown as number) > 0 ? [task.earlyReminderDays as unknown as number] : [];
    for (const days of reminderDays) {
      const earlyDate = subDays(occ, days);
      earlyDate.setHours(remHour, remMinute, 0, 0);
      if (!isBefore(earlyDate, now)) {
        const id = await Notifications.scheduleNotificationAsync({
          content: {
            title: 'Upcoming Appointment',
            body: `"${task.title}" is in ${days} day${days > 1 ? 's' : ''}.`,
            sound: true,
            data: { taskId: task.id },
          },
          trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: toFutureDate(earlyDate) },
        });
        ids.push(id);
      }
    }

    if (task.dayOfReminder) {
      const dayOf = new Date(occ);
      dayOf.setHours(remHour, remMinute, 0, 0);
      if (!isBefore(dayOf, now)) {
        const timeStr = format(occ, 'h:mm a');
        const id = await Notifications.scheduleNotificationAsync({
          content: {
            title: `Today: ${task.title}`,
            body: `Your appointment is today at ${timeStr}.`,
            sound: true,
            data: { taskId: task.id },
          },
          trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: toFutureDate(dayOf) },
        });
        ids.push(id);
      }
    }
  }
  return ids;
}

// ─── Internal Task ───────────────────────────────────────────────────────────

export async function scheduleInternalTaskNotification(task: InternalTask, profile?: UserProfile | null): Promise<string[]> {
  if (Platform.OS === 'web') return [];
  const { hour, minute } = parseTimeStr(task.reminderTime ?? resolveReminderTimes(profile).defaultTime);
  const dueDate = new Date(task.nextDueDate + 'T12:00:00');
  dueDate.setHours(hour, minute, 0, 0);

  const id = await Notifications.scheduleNotificationAsync({
    content: { title: 'Reminder', body: task.title, sound: true, data: { taskId: task.id } },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: toFutureDate(dueDate) },
  });
  return [id];
}

// ─── Interday Task ───────────────────────────────────────────────────────────

export async function scheduleInterdayTaskNotifications(task: InterdayTask, profile?: UserProfile | null): Promise<string[]> {
  if (Platform.OS === 'web') return [];
  const ids: string[] = [];
  const times = resolveReminderTimes(profile);

  let hour: number;
  let minute: number;
  if (task.timeSlot) {
    [hour, minute] = task.timeSlot.split(':').map(Number);
  } else {
    const groupKey = `${task.group}Time` as keyof typeof times;
    ({ hour, minute } = parseTimeStr(times[groupKey]));
  }

  const days = task.activeDays.length > 0 ? task.activeDays : [0, 1, 2, 3, 4, 5, 6];

  for (const day of days) {
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: task.title,
        body: task.notes ?? `Time for: ${task.title}`,
        sound: true,
        data: { taskId: task.id },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
        weekday: day + 1,
        hour,
        minute,
      },
    });
    ids.push(id);
  }
  return ids;
}
