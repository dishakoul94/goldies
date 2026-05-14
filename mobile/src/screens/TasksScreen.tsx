import React, { useState, useCallback } from 'react';
import {
  View, Text, FlatList, SectionList, StyleSheet, TouchableOpacity, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { RootStackParamList, Task, TaskKind, InternalTask, InterdayTask, InterdayGroup } from '../types';
import { loadAllTasks, deleteTask, updateTask } from '../storage';
import { cancelNotifications, scheduleInternalTaskNotification, scheduleInterdayTaskNotifications } from '../notifications';
import { showConfirm } from '../utils/alert';
import { COLORS, FONT, SPACING, RADIUS } from '../utils/theme';
import TaskCard from '../components/TaskCard';
import { addDays, format } from 'date-fns';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Segment = 'external' | 'internal' | 'interday';

const SEGMENTS: { key: Segment; label: string }[] = [
  { key: 'external', label: 'Appointments' },
  { key: 'internal', label: 'To-Do' },
  { key: 'interday', label: 'Daily' },
];

const GROUP_ORDER: InterdayGroup[] = ['morning', 'afternoon', 'evening', 'none'];
const GROUP_META: Record<InterdayGroup, { label: string; icon: string; time: string }> = {
  morning:   { label: 'Morning',   icon: '🌅', time: '8:00 AM' },
  afternoon: { label: 'Afternoon', icon: '☀️',  time: '2:00 PM' },
  evening:   { label: 'Evening',   icon: '🌙', time: '7:00 PM' },
  none:      { label: 'Anytime',   icon: '🔁', time: '9:00 AM' },
};

export default function TasksScreen() {
  const navigation = useNavigation<Nav>();
  const [segment, setSegment] = useState<Segment>('external');
  const [tasks, setTasks] = useState<Task[]>([]);

  useFocusEffect(
    useCallback(() => {
      loadAllTasks().then(setTasks);
    }, []),
  );

  const activeTasks = tasks.filter(t => {
    if (t.kind !== segment) return false;
    if (t.kind === 'external' || t.kind === 'internal') return !t.completedAt;
    if (t.kind === 'interday') return !t.archivedAt;
    return true;
  });

  // Build sections for Daily tasks grouped by time-of-day
  const dailySections = GROUP_ORDER.map(group => ({
    group,
    title: `${GROUP_META[group].icon}  ${GROUP_META[group].label}`,
    defaultTime: GROUP_META[group].time,
    data: activeTasks.filter(
      (t): t is InterdayTask => t.kind === 'interday' && t.group === group,
    ),
  })).filter(s => s.data.length > 0);

  const handleComplete = useCallback(async (task: Task) => {
    await cancelNotifications(task.notificationIds);
    await updateTask({ ...task, completedAt: new Date().toISOString(), notificationIds: [] } as Task);
    setTasks(await loadAllTasks());
  }, []);

  const handleDefer = useCallback(async (task: Task) => {
    if (task.kind === 'internal') {
      await cancelNotifications(task.notificationIds);
      const newDate = format(addDays(new Date(task.nextDueDate + 'T12:00:00'), 1), 'yyyy-MM-dd');
      const updated: InternalTask = { ...task, nextDueDate: newDate };
      const ids = await scheduleInternalTaskNotification(updated);
      await updateTask({ ...updated, notificationIds: ids });
    } else if (task.kind === 'interday') {
      await cancelNotifications(task.notificationIds);
      const newDefer = format(addDays(new Date(), 1), 'yyyy-MM-dd');
      const updated: InterdayTask = { ...task, deferredUntil: newDefer };
      const ids = await scheduleInterdayTaskNotifications(updated);
      await updateTask({ ...updated, notificationIds: ids });
    }
    setTasks(await loadAllTasks());
  }, []);

  const handleLongPress = useCallback((task: Task) => {
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    showConfirm(
      'Delete Task',
      `Delete "${task.title}"? This cannot be undone.`,
      async () => {
        await cancelNotifications(task.notificationIds);
        await deleteTask(task.id);
        setTasks(await loadAllTasks());
      },
      'Delete',
    );
  }, []);

  const kindForSegment: Record<Segment, TaskKind> = {
    external: 'external',
    internal: 'internal',
    interday: 'interday',
  };

  const renderCard = (task: Task) => (
    <TaskCard
      key={task.id}
      task={task}
      onComplete={handleComplete}
      onDefer={handleDefer}
      onPress={t => navigation.navigate('TaskDetail', { taskId: t.id })}
      onLongPress={handleLongPress}
    />
  );

  const emptyComponent = (
    <View style={styles.empty}>
      <Ionicons name="checkmark-done-circle-outline" size={56} color={COLORS.BORDER} />
      <Text style={styles.emptyText}>No tasks here yet.</Text>
      <Text style={styles.emptyHint}>Tap + to add one!</Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.headerBar}>
        <Text style={styles.screenTitle}>My Tasks</Text>
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => {
            if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            navigation.navigate('AddTask', { kind: kindForSegment[segment] });
          }}
        >
          <Ionicons name="add-circle" size={36} color={COLORS.PRIMARY} />
        </TouchableOpacity>
      </View>

      {/* Segment Control */}
      <View style={styles.segmentRow}>
        {SEGMENTS.map(seg => (
          <TouchableOpacity
            key={seg.key}
            style={[styles.segBtn, segment === seg.key && styles.segBtnActive]}
            onPress={() => setSegment(seg.key)}
          >
            <Text style={[styles.segLabel, segment === seg.key && styles.segLabelActive]}>
              {seg.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Daily tasks: SectionList grouped by time of day */}
      {segment === 'interday' ? (
        dailySections.length === 0 ? (
          <View style={styles.list}>{emptyComponent}</View>
        ) : (
          <SectionList
            sections={dailySections}
            keyExtractor={t => t.id}
            renderItem={({ item }) => renderCard(item)}
            renderSectionHeader={({ section }) => (
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionHeaderText}>{section.title}</Text>
                <Text style={styles.sectionHeaderTime}>
                  Default reminder: {section.defaultTime}
                </Text>
              </View>
            )}
            contentContainerStyle={styles.list}
            stickySectionHeadersEnabled={false}
          />
        )
      ) : (
        /* Appointments and To-Do: flat list */
        <FlatList
          data={activeTasks}
          keyExtractor={t => t.id}
          renderItem={({ item }) => renderCard(item)}
          contentContainerStyle={styles.list}
          ListEmptyComponent={emptyComponent}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.BACKGROUND },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.MD,
    paddingTop: SPACING.MD,
    paddingBottom: SPACING.SM,
  },
  screenTitle: { fontSize: FONT.TITLE_SCREEN, fontWeight: '800', color: COLORS.TEXT },
  addBtn: { padding: 4 },
  segmentRow: {
    flexDirection: 'row',
    marginHorizontal: SPACING.MD,
    backgroundColor: COLORS.BORDER,
    borderRadius: RADIUS.CARD,
    padding: 3,
    marginBottom: SPACING.MD,
  },
  segBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: RADIUS.CARD - 2,
  },
  segBtnActive: {
    backgroundColor: COLORS.WHITE,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  segLabel: { fontSize: FONT.CAPTION, fontWeight: '600', color: COLORS.TEXT_MUTED },
  segLabelActive: { color: COLORS.TEXT, fontWeight: '700' },
  list: { paddingHorizontal: SPACING.MD, paddingBottom: SPACING.XL },
  sectionHeader: {
    marginTop: SPACING.MD,
    marginBottom: SPACING.SM,
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  sectionHeaderText: {
    fontSize: FONT.BODY,
    fontWeight: '800',
    color: COLORS.TEXT,
  },
  sectionHeaderTime: {
    fontSize: FONT.CAPTION,
    color: COLORS.TEXT_MUTED,
    fontStyle: 'italic',
  },
  empty: { alignItems: 'center', marginTop: SPACING.XL * 2, gap: SPACING.SM },
  emptyText: { fontSize: FONT.BODY, color: COLORS.TEXT_MUTED, fontWeight: '600' },
  emptyHint: { fontSize: FONT.BODY_SM, color: COLORS.TEXT_MUTED },
});
