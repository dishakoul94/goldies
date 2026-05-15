import React, { useState, useCallback } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity, ScrollView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import * as Haptics from 'expo-haptics';
import { RootStackParamList, Task, TaskKind } from '../types';
import {
  loadAllTasks, updateTask, getTasksDueToday, getUpcomingExternal, saveAllTasks,
} from '../storage';
import {
  cancelNotifications, scheduleInternalTaskNotification, scheduleExternalTaskNotifications,
  scheduleInterdayTaskNotifications,
} from '../notifications';
import { COLORS, FONT, SPACING, RADIUS } from '../utils/theme';
import { showConfirm } from '../utils/alert';
import TaskCard from '../components/TaskCard';
import ReminderCard from '../components/ReminderCard';
import { getUpcomingReminders, UpcomingReminder } from '../utils/reminders';
import { addDays, parseISO, format as dateFnsFormat } from 'date-fns';

type Nav = NativeStackNavigationProp<RootStackParamList>;

function getGreeting(name: string | null): string {
  const h = new Date().getHours();
  const who = name ? `, ${name}` : '';
  if (h < 12) return `Good morning${who}! ☀️`;
  if (h < 17) return `Good afternoon${who}! 🌤`;
  return `Good evening${who}! 🌙`;
}

export default function TodayScreen() {
  const navigation = useNavigation<Nav>();
  const [dueTasks, setDueTasks] = useState<Task[]>([]);
  const [upcomingTasks, setUpcomingTasks] = useState<Task[]>([]);
  const [reminders, setReminders] = useState<UpcomingReminder[]>([]);
  const [userName, setUserName] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      loadAllTasks().then(tasks => {
        setDueTasks(getTasksDueToday(tasks));
        setUpcomingTasks(getUpcomingExternal(tasks, 7));
        setReminders(getUpcomingReminders(tasks, 14));
      });

      // Load name from storage
      import('../storage').then(s => s.loadUserName().then(setUserName));
    }, []),
  );

  const handleComplete = useCallback(async (task: Task) => {
    await cancelNotifications(task.notificationIds);
    const updated = { ...task, completedAt: new Date().toISOString(), notificationIds: [] } as Task;
    await updateTask(updated);
    const all = await loadAllTasks();
    setDueTasks(getTasksDueToday(all));
    setUpcomingTasks(getUpcomingExternal(all, 7));
    setReminders(getUpcomingReminders(all, 14));
  }, []);

  const handleDefer = useCallback(async (task: Task) => {
    if (task.kind === 'internal') {
      await cancelNotifications(task.notificationIds);
      const newDate = dateFnsFormat(addDays(parseISO(task.nextDueDate), 1), 'yyyy-MM-dd');
      const updated = { ...task, nextDueDate: newDate };
      const ids = await scheduleInternalTaskNotification(updated);
      await updateTask({ ...updated, notificationIds: ids });
    } else if (task.kind === 'interday') {
      await cancelNotifications(task.notificationIds);
      const newDefer = dateFnsFormat(addDays(new Date(), 1), 'yyyy-MM-dd');
      const updated = { ...task, deferredUntil: newDefer };
      const ids = await scheduleInterdayTaskNotifications(updated);
      await updateTask({ ...updated, notificationIds: ids });
    }
    const all = await loadAllTasks();
    setDueTasks(getTasksDueToday(all));
    setReminders(getUpcomingReminders(all, 14));
  }, []);

  const handleAddTask = (kind: TaskKind) => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    navigation.navigate('AddTask', { kind });
  };

  const today = format(new Date(), 'EEEE, MMMM d');

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.greeting}>{getGreeting(userName)}</Text>
          <Text style={styles.date}>{today}</Text>
        </View>

        {/* Due Today */}
        <Text style={styles.sectionLabel}>Due Today</Text>
        {dueTasks.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="checkmark-circle" size={40} color={COLORS.INTERDAY} />
            <Text style={styles.emptyText}>All clear for today!</Text>
          </View>
        ) : (
          dueTasks.map(task => (
            <TaskCard
              key={task.id}
              task={task}
              onComplete={handleComplete}
              onDefer={handleDefer}
              onPress={t => navigation.navigate('TaskDetail', { taskId: t.id })}
            />
          ))
        )}

        {/* Upcoming Reminders */}
        {reminders.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>Upcoming Reminders</Text>
            {reminders.map(reminder => (
              <ReminderCard
                key={reminder.key}
                reminder={reminder}
                onPress={r => navigation.navigate('TaskDetail', { taskId: r.taskId })}
              />
            ))}
          </>
        )}

        {/* Coming Up */}
        {upcomingTasks.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>Coming Up This Week</Text>
            {upcomingTasks.map(task => (
              <TaskCard
                key={task.id}
                task={task}
                onPress={t => navigation.navigate('TaskDetail', { taskId: t.id })}
              />
            ))}
          </>
        )}

        {/* Add Task buttons */}
        <Text style={styles.sectionLabel}>Add a Task</Text>
        <View style={styles.addRow}>
          <AddKindButton label="Appointment" icon="calendar" kind="external" onPress={handleAddTask} color={COLORS.EXTERNAL} />
          <AddKindButton label="To-Do" icon="checkmark-done" kind="internal" onPress={handleAddTask} color={COLORS.INTERNAL} />
          <AddKindButton label="Daily" icon="repeat" kind="interday" onPress={handleAddTask} color={COLORS.INTERDAY} />
        </View>

        <View style={{ height: SPACING.XL }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function AddKindButton({
  label, icon, kind, onPress, color,
}: { label: string; icon: keyof typeof Ionicons.glyphMap; kind: TaskKind; onPress: (k: TaskKind) => void; color: string }) {
  return (
    <TouchableOpacity style={[styles.addKindBtn, { borderColor: color }]} onPress={() => onPress(kind)} activeOpacity={0.8}>
      <Ionicons name={icon} size={28} color={color} />
      <Text style={[styles.addKindLabel, { color }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.BACKGROUND },
  scroll: { flex: 1 },
  container: { padding: SPACING.MD, paddingTop: SPACING.LG },
  header: { marginBottom: SPACING.LG },
  greeting: { fontSize: FONT.TITLE_SCREEN, fontWeight: '800', color: COLORS.TEXT },
  date: { fontSize: FONT.BODY, color: COLORS.TEXT_SECONDARY, marginTop: 4 },
  sectionLabel: {
    fontSize: FONT.BODY,
    fontWeight: '700',
    color: COLORS.TEXT,
    marginBottom: SPACING.SM,
    marginTop: SPACING.LG,
  },
  emptyCard: {
    backgroundColor: COLORS.CARD,
    borderRadius: RADIUS.CARD,
    padding: SPACING.LG,
    alignItems: 'center',
    gap: SPACING.SM,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  emptyText: { fontSize: FONT.BODY, color: COLORS.TEXT_SECONDARY, fontWeight: '600' },
  addRow: { flexDirection: 'row', gap: SPACING.SM },
  addKindBtn: {
    flex: 1,
    borderWidth: 2,
    borderRadius: RADIUS.CARD,
    paddingVertical: SPACING.MD,
    alignItems: 'center',
    gap: SPACING.XS,
    backgroundColor: COLORS.CARD,
  },
  addKindLabel: { fontSize: FONT.CAPTION, fontWeight: '700' },
});
