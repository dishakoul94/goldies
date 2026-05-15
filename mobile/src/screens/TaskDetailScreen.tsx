import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, Platform, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { format, parseISO, addDays } from 'date-fns';
import { RootStackParamList, Task, ExternalTask, InternalTask, InterdayTask, ServiceProvider } from '../types';
import { getTaskById, updateTask, deleteTask, loadAllTasks, getServiceProviderById } from '../storage';
import {
  cancelNotifications, scheduleInternalTaskNotification,
  scheduleInterdayTaskNotifications,
} from '../notifications';
import { showConfirm } from '../utils/alert';
import { COLORS, FONT, SPACING, RADIUS } from '../utils/theme';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type RouteParams = RouteProp<RootStackParamList, 'TaskDetail'>;

const KIND_COLOR: Record<Task['kind'], string> = {
  external: COLORS.EXTERNAL,
  internal: COLORS.INTERNAL,
  interday: COLORS.INTERDAY,
};
const KIND_LABEL: Record<Task['kind'], string> = {
  external: 'Appointment',
  internal: 'To-Do',
  interday: 'Daily Task',
};

export default function TaskDetailScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<RouteParams>();
  const [task, setTask] = useState<Task | null>(null);
  const [provider, setProvider] = useState<ServiceProvider | null>(null);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      getTaskById(route.params.taskId).then(async t => {
        setTask(t);
        if (t?.kind === 'external' && t.serviceProviderId) {
          const p = await getServiceProviderById(t.serviceProviderId);
          setProvider(p);
        } else {
          setProvider(null);
        }
        setLoading(false);
      });
    }, [route.params.taskId]),
  );

  if (loading) {
    return <View style={styles.center}><ActivityIndicator size="large" color={COLORS.PRIMARY} /></View>;
  }

  if (!task) {
    return <View style={styles.center}><Text style={styles.muted}>Task not found.</Text></View>;
  }

  const barColor = KIND_COLOR[task.kind];

  const handleComplete = async () => {
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await cancelNotifications(task.notificationIds);
    await updateTask({ ...task, completedAt: new Date().toISOString(), notificationIds: [] } as Task);
    navigation.goBack();
  };

  const handleDefer = async (days: number) => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (task.kind === 'internal') {
      await cancelNotifications(task.notificationIds);
      const newDate = format(addDays(parseISO(task.nextDueDate), days), 'yyyy-MM-dd');
      const updated: InternalTask = { ...task, nextDueDate: newDate };
      const ids = await scheduleInternalTaskNotification(updated);
      await updateTask({ ...updated, notificationIds: ids });
    } else if (task.kind === 'interday') {
      await cancelNotifications(task.notificationIds);
      const newDefer = format(addDays(new Date(), days), 'yyyy-MM-dd');
      const updated: InterdayTask = { ...task, deferredUntil: newDefer };
      const ids = await scheduleInterdayTaskNotifications(updated);
      await updateTask({ ...updated, notificationIds: ids });
    }
    const refreshed = await getTaskById(task.id);
    setTask(refreshed);
  };

  const handleDelete = () => {
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    showConfirm(
      'Delete Task',
      `Delete "${task.title}"? This cannot be undone.`,
      async () => {
        await cancelNotifications(task.notificationIds);
        await deleteTask(task.id);
        navigation.goBack();
      },
      'Delete',
    );
  };

  const canDefer = task.kind === 'internal' || (task.kind === 'interday' && task.canDefer);
  const isCompleted = !!(task as any).completedAt || !!(task.kind === 'interday' && (task as any).archivedAt);

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        {/* Kind badge */}
        <View style={[styles.kindBadge, { backgroundColor: barColor + '22' }]}>
          <View style={[styles.kindDot, { backgroundColor: barColor }]} />
          <Text style={[styles.kindLabel, { color: barColor }]}>{KIND_LABEL[task.kind]}</Text>
        </View>

        {/* Title */}
        <Text style={styles.title}>{task.title}</Text>

        {/* Meta */}
        <View style={styles.metaCard}>
          {task.kind === 'external' && <ExternalMeta task={task} provider={provider} />}
          {task.kind === 'internal' && <InternalMeta task={task} />}
          {task.kind === 'interday' && <InterdayMeta task={task} />}
          {task.notes ? (
            <MetaRow icon="document-text-outline" label="Notes" value={task.notes} />
          ) : null}
          {isCompleted ? (
            <MetaRow icon="checkmark-circle" label="Completed" value="Done" valueColor={COLORS.INTERDAY} />
          ) : null}
        </View>

        {/* Actions */}
        {!isCompleted && (
          <View style={styles.actions}>
            {task.kind !== 'interday' && (
              <ActionBtn icon="checkmark-circle" label="Mark Complete" color={COLORS.INTERDAY} onPress={handleComplete} />
            )}
            {canDefer && (
              <>
                <ActionBtn icon="arrow-forward-circle" label="Push 1 Day" color={COLORS.PRIMARY} onPress={() => handleDefer(1)} />
                <ActionBtn icon="arrow-forward-circle" label="Push 3 Days" color={COLORS.PRIMARY} onPress={() => handleDefer(3)} />
              </>
            )}
            <ActionBtn
              icon="create-outline"
              label="Edit Task"
              color={COLORS.TEXT_SECONDARY}
              onPress={() => navigation.navigate('EditTask', { taskId: task.id })}
            />
            <ActionBtn icon="trash-outline" label="Delete Task" color={COLORS.DANGER} onPress={handleDelete} />
          </View>
        )}

        {isCompleted && (
          <ActionBtn icon="trash-outline" label="Delete Task" color={COLORS.DANGER} onPress={handleDelete} />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function ExternalMeta({ task, provider }: { task: ExternalTask; provider: ServiceProvider | null }) {
  return (
    <>
      <MetaRow icon="calendar" label="Date & Time" value={format(parseISO(task.dateTime), 'EEEE, MMMM d, yyyy · h:mm a')} />
      {task.recurrence && (
        <MetaRow icon="repeat" label="Repeats" value={`Every ${task.recurrence.every} ${task.recurrence.unit}`} />
      )}
      <MetaRow icon="notifications" label="Early reminder" value={task.earlyReminderDays === 0 ? 'None' : `${task.earlyReminderDays} day(s) before`} />
      <MetaRow icon="alarm" label="Day-of reminder" value={task.dayOfReminder ? 'On' : 'Off'} />
      {provider && (
        <MetaRow
          icon="person-circle-outline"
          label="Service Provider"
          value={[provider.name, provider.specialty].filter(Boolean).join(' · ')}
        />
      )}
    </>
  );
}

function InternalMeta({ task }: { task: InternalTask }) {
  return (
    <>
      <MetaRow icon="calendar" label="Due date" value={format(parseISO(task.nextDueDate), 'EEEE, MMMM d, yyyy')} />
      <MetaRow icon="refresh" label="Recurs every" value={task.intervalDays === 0 ? 'One-time' : `${task.intervalDays} day(s)`} />
    </>
  );
}

function InterdayMeta({ task }: { task: InterdayTask }) {
  const days = task.activeDays.length === 0 ? 'Every day' : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].filter((_, i) => task.activeDays.includes(i)).join(', ');
  return (
    <>
      <MetaRow icon="time" label="Time" value={task.timeSlot ?? `${task.group} (default time)`} />
      <MetaRow icon="calendar" label="Active days" value={days} />
      <MetaRow icon="arrow-forward-circle" label="Can defer" value={task.canDefer ? 'Yes' : 'No'} />
      {task.deferredUntil && (
        <MetaRow icon="pause-circle" label="Deferred until" value={format(parseISO(task.deferredUntil), 'MMM d, yyyy')} />
      )}
    </>
  );
}

function MetaRow({ icon, label, value, valueColor }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string; valueColor?: string }) {
  return (
    <View style={styles.metaRow}>
      <Ionicons name={icon} size={20} color={COLORS.PRIMARY} style={{ width: 26 }} />
      <View style={{ flex: 1 }}>
        <Text style={styles.metaLabel}>{label}</Text>
        <Text style={[styles.metaValue, valueColor ? { color: valueColor } : {}]}>{value}</Text>
      </View>
    </View>
  );
}

function ActionBtn({ icon, label, color, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; color: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={[styles.actionBtn, { borderColor: color + '44' }]} onPress={onPress} activeOpacity={0.8}>
      <Ionicons name={icon} size={22} color={color} />
      <Text style={[styles.actionLabel, { color }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.BACKGROUND },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.BACKGROUND },
  muted: { fontSize: FONT.BODY, color: COLORS.TEXT_MUTED },
  container: { padding: SPACING.MD, paddingBottom: SPACING.XL },
  kindBadge: {
    flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start',
    borderRadius: RADIUS.CHIP, paddingHorizontal: SPACING.SM, paddingVertical: 6, gap: 6, marginBottom: SPACING.SM,
  },
  kindDot: { width: 8, height: 8, borderRadius: 4 },
  kindLabel: { fontSize: FONT.CAPTION, fontWeight: '700' },
  title: { fontSize: FONT.TITLE_SCREEN, fontWeight: '800', color: COLORS.TEXT, marginBottom: SPACING.LG, lineHeight: 38 },
  metaCard: {
    backgroundColor: COLORS.WHITE, borderRadius: RADIUS.CARD, padding: SPACING.MD,
    gap: SPACING.MD, shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07, shadowRadius: 8, elevation: 2, marginBottom: SPACING.LG,
  },
  metaRow: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.SM },
  metaLabel: { fontSize: FONT.CAPTION, color: COLORS.TEXT_MUTED, fontWeight: '600' },
  metaValue: { fontSize: FONT.BODY_SM, color: COLORS.TEXT, fontWeight: '500', marginTop: 2 },
  actions: { gap: SPACING.SM },
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.SM,
    backgroundColor: COLORS.WHITE, borderRadius: RADIUS.CARD, borderWidth: 1.5,
    paddingVertical: 16, paddingHorizontal: SPACING.MD,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
  },
  actionLabel: { fontSize: FONT.BODY, fontWeight: '600' },
});
