export type TaskKind = 'external' | 'internal' | 'interday';
export type RecurrenceUnit = 'days' | 'weeks' | 'months';
export type InterdayGroup = 'morning' | 'afternoon' | 'evening' | 'none';

export interface ReminderTimesConfig {
  defaultTime: string;    // External early/day-of + Internal reminders
  morningTime: string;    // Interday morning group
  afternoonTime: string;  // Interday afternoon group
  eveningTime: string;    // Interday evening group
  noneTime: string;       // Interday none group
}

export const DEFAULT_REMINDER_TIMES: ReminderTimesConfig = {
  defaultTime: '09:00',
  morningTime: '08:00',
  afternoonTime: '14:00',
  eveningTime: '19:00',
  noneTime: '09:00',
};

export interface UserProfile {
  firstName: string;
  lastName: string;
  dateOfBirth?: string; // YYYY-MM-DD
  email?: string;
  reminderTimes?: ReminderTimesConfig;
}

export interface ServiceProvider {
  id: string;
  name: string;
  specialty?: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
  createdAt: string;
}

export interface Recurrence {
  every: number;
  unit: RecurrenceUnit;
}

export interface ExternalTask {
  id: string;
  kind: 'external';
  title: string;
  notes?: string;
  dateTime: string;           // ISO-8601 date+time
  recurrence?: Recurrence;
  earlyReminderDays: number[];  // empty = no early reminder; each value = days before
  dayOfReminder: boolean;
  serviceProviderId?: string;
  notificationIds: string[];
  createdAt: string;
  completedAt?: string;
}

export interface InternalTask {
  id: string;
  kind: 'internal';
  title: string;
  notes?: string;
  nextDueDate: string;        // ISO date (YYYY-MM-DD)
  intervalDays: number;       // 0 = one-time
  notificationIds: string[];
  createdAt: string;
  completedAt?: string;
}

export interface InterdayTask {
  id: string;
  kind: 'interday';
  title: string;
  notes?: string;
  timeSlot?: string;          // "08:30" 24h format
  group: InterdayGroup;
  activeDays: number[];       // 0=Sun…6=Sat; [] = every day
  canDefer: boolean;
  deferredUntil?: string;     // ISO date
  notificationIds: string[];
  createdAt: string;
  archivedAt?: string;
}

export type Task = ExternalTask | InternalTask | InterdayTask;

export type MessageRole = 'user' | 'assistant';

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: string;
}

export interface TaskCreatePayload {
  tool: 'create_external_task' | 'create_internal_task' | 'create_interday_task';
  input: {
    title?: string;
    notes?: string;
    // ExternalTask
    dateTime?: string;
    earlyReminderDays?: number[];
    dayOfReminder?: boolean;
    // InternalTask
    nextDueDate?: string;
    intervalDays?: number;
    // InterdayTask
    group?: InterdayGroup;
    canDefer?: boolean;
    activeDays?: number[];
    timeSlot?: string;
  };
}

export interface TaskDeletePayload {
  tool: 'delete_task';
  input: {
    title: string;
  };
}

export interface TaskEditPayload {
  tool: 'edit_external_task' | 'edit_internal_task' | 'edit_interday_task';
  input: {
    title: string;
    // shared
    newTitle?: string;
    newNotes?: string;
    // ExternalTask
    newDateTime?: string;
    newEarlyReminderDays?: number[];
    newDayOfReminder?: boolean;
    // InternalTask
    newNextDueDate?: string;
    newIntervalDays?: number;
    // InterdayTask
    newGroup?: InterdayGroup;
    newCanDefer?: boolean;
    newActiveDays?: number[];
    newTimeSlot?: string;
  };
}

export type TabParamList = {
  Today: undefined;
  Tasks: undefined;
  Chat: undefined;
  Profile: undefined;
};

export type RootStackParamList = {
  Tabs: undefined;
  AddTask: { kind: TaskKind };
  EditTask: { taskId: string };
  TaskDetail: { taskId: string };
  ServiceProviderForm: { providerId?: string };
};
