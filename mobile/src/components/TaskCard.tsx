import React from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { format, parseISO } from 'date-fns';
import { Task } from '../types';
import { COLORS, FONT, SPACING, RADIUS } from '../utils/theme';

interface Props {
  task: Task;
  onComplete?: (task: Task) => void;
  onDefer?: (task: Task) => void;
  onPress?: (task: Task) => void;
  onLongPress?: (task: Task) => void;
}

const KIND_COLOR: Record<Task['kind'], string> = {
  external: COLORS.EXTERNAL,
  internal: COLORS.INTERNAL,
  interday: COLORS.INTERDAY,
};

const KIND_LABEL: Record<Task['kind'], string> = {
  external: 'Appointment',
  internal: 'To-Do',
  interday: 'Daily',
};

function getSubtitle(task: Task): string {
  if (task.kind === 'external') {
    return format(parseISO(task.dateTime), 'EEE, MMM d · h:mm a');
  }
  if (task.kind === 'internal') {
    return `Due ${format(parseISO(task.nextDueDate), 'MMM d')}${task.intervalDays > 0 ? ` · every ${task.intervalDays}d` : ''}`;
  }
  if (task.kind === 'interday') {
    return task.timeSlot ? `Daily at ${task.timeSlot}` : `Daily · ${task.group}`;
  }
  return '';
}

export default function TaskCard({ task, onComplete, onDefer, onPress, onLongPress }: Props) {
  const barColor = KIND_COLOR[task.kind];
  const canDefer = task.kind === 'internal' || (task.kind === 'interday' && task.canDefer);

  const handleComplete = () => {
    if (Platform.OS !== 'web') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    onComplete?.(task);
  };

  const handleDefer = () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    onDefer?.(task);
  };

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => onPress?.(task)}
      onLongPress={() => onLongPress?.(task)}
      activeOpacity={0.8}
      accessibilityRole="button"
    >
      <View style={[styles.colorBar, { backgroundColor: barColor }]} />
      <View style={styles.content}>
        <View style={styles.row}>
          <View style={styles.textBlock}>
            <View style={styles.badgeRow}>
              <View style={[styles.badge, { backgroundColor: barColor + '22' }]}>
                <Text style={[styles.badgeText, { color: barColor }]}>{KIND_LABEL[task.kind]}</Text>
              </View>
            </View>
            <Text style={styles.title} numberOfLines={2}>{task.title}</Text>
            <Text style={styles.subtitle}>{getSubtitle(task)}</Text>
            {task.notes ? <Text style={styles.notes} numberOfLines={1}>{task.notes}</Text> : null}
          </View>
          {onComplete ? (
            <TouchableOpacity style={styles.checkBtn} onPress={handleComplete} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Ionicons name="checkmark-circle-outline" size={34} color={COLORS.INTERDAY} />
            </TouchableOpacity>
          ) : null}
        </View>
        {canDefer && onDefer ? (
          <TouchableOpacity style={styles.deferBtn} onPress={handleDefer}>
            <Ionicons name="arrow-forward-circle-outline" size={16} color={COLORS.TEXT_MUTED} />
            <Text style={styles.deferText}>Push 1 day</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    backgroundColor: COLORS.CARD,
    borderRadius: RADIUS.CARD,
    marginBottom: SPACING.SM,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
    overflow: 'hidden',
  },
  colorBar: {
    width: 5,
  },
  content: {
    flex: 1,
    padding: SPACING.MD,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  textBlock: {
    flex: 1,
    marginRight: SPACING.SM,
  },
  badgeRow: {
    flexDirection: 'row',
    marginBottom: SPACING.XS,
  },
  badge: {
    borderRadius: RADIUS.CHIP,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  badgeText: {
    fontSize: FONT.CAPTION,
    fontWeight: '600',
  },
  title: {
    fontSize: FONT.TITLE_CARD,
    fontWeight: '700',
    color: COLORS.TEXT,
    lineHeight: 30,
  },
  subtitle: {
    fontSize: FONT.BODY_SM,
    color: COLORS.TEXT_SECONDARY,
    marginTop: 4,
  },
  notes: {
    fontSize: FONT.CAPTION,
    color: COLORS.TEXT_MUTED,
    marginTop: 4,
    fontStyle: 'italic',
  },
  checkBtn: {
    padding: 4,
    marginLeft: 4,
  },
  deferBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: SPACING.SM,
    gap: 4,
  },
  deferText: {
    fontSize: FONT.CAPTION,
    color: COLORS.TEXT_MUTED,
  },
});
