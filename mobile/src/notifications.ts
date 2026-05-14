import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import {
  addDays, addWeeks, addMonths, parseISO, subDays, isBefore, format,
} from 'date-fns';
import { ExternalTask, InternalTask, InterdayTask, InterdayGroup, Recurrence } from './types';

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

export async function scheduleExternalTaskNotifications(task: ExternalTask): Promise<string[]> {
  if (Platform.OS === 'web') return [];
  const ids: string[] = [];
  const now = new Date();

  const occurrences = task.recurrence
    ? computeOccurrences(task.dateTime, task.recurrence, 4)
    : [parseISO(task.dateTime)];

  for (const occ of occurrences) {
    if (isBefore(occ, now)) continue;

    if (task.earlyReminderDays > 0) {
      const earlyDate = subDays(occ, task.earlyReminderDays);
      earlyDate.setHours(9, 0, 0, 0);
      if (!isBefore(earlyDate, now)) {
        const id = await Notifications.scheduleNotificationAsync({
          content: {
            title: 'Upcoming Appointment',
            body: `"${task.title}" is in ${task.earlyReminderDays} day${task.earlyReminderDays > 1 ? 's' : ''}.`,
            sound: true,
          },
          trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: earlyDate },
        });
        ids.push(id);
      }
    }

    if (task.dayOfReminder) {
      const dayOf = new Date(occ);
      if (dayOf.getHours() < 9) dayOf.setHours(9, 0, 0, 0);
      if (!isBefore(dayOf, now)) {
        const timeStr = format(occ, 'h:mm a');
        const id = await Notifications.scheduleNotificationAsync({
          content: {
            title: `Today: ${task.title}`,
            body: `Your appointment is today at ${timeStr}.`,
            sound: true,
          },
          trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: dayOf },
        });
        ids.push(id);
      }
    }
  }
  return ids;
}

// ─── Internal Task ───────────────────────────────────────────────────────────

export async function scheduleInternalTaskNotification(task: InternalTask): Promise<string[]> {
  if (Platform.OS === 'web') return [];
  const dueDate = parseISO(task.nextDueDate);
  dueDate.setHours(9, 0, 0, 0);
  const now = new Date();
  if (isBefore(dueDate, now)) return [];

  const id = await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Reminder',
      body: task.title,
      sound: true,
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: dueDate },
  });
  return [id];
}

// ─── Interday Task ───────────────────────────────────────────────────────────

const GROUP_HOURS: Record<InterdayGroup, number> = {
  morning: 8,
  afternoon: 14,
  evening: 19,
  none: 9,
};

export async function scheduleInterdayTaskNotifications(task: InterdayTask): Promise<string[]> {
  if (Platform.OS === 'web') return [];
  const ids: string[] = [];

  const [hour, minute] = task.timeSlot
    ? task.timeSlot.split(':').map(Number)
    : [GROUP_HOURS[task.group], 0];

  // activeDays: [] means every day (0-6)
  const days = task.activeDays.length > 0 ? task.activeDays : [0, 1, 2, 3, 4, 5, 6];

  for (const day of days) {
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: task.title,
        body: task.notes ?? `Time for: ${task.title}`,
        sound: true,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
        weekday: day + 1, // expo: 1=Sun…7=Sat
        hour,
        minute,
      },
    });
    ids.push(id);
  }
  return ids;
}
