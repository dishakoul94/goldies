import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format, isToday, isTomorrow } from 'date-fns';
import { COLORS, FONT, SPACING, RADIUS } from '../utils/theme';
import { TaskKind } from '../types';
import { UpcomingReminder } from '../utils/reminders';

const KIND_COLOR: Record<TaskKind, string> = {
  external: COLORS.EXTERNAL,
  internal: COLORS.INTERNAL,
  interday: COLORS.INTERDAY,
};

function formatReminderDate(date: Date): string {
  const time = format(date, 'h:mm a');
  if (isToday(date)) return `Today at ${time}`;
  if (isTomorrow(date)) return `Tomorrow at ${time}`;
  return `${format(date, 'EEE, MMM d')} at ${time}`;
}

interface Props {
  reminder: UpcomingReminder;
  onPress: (reminder: UpcomingReminder) => void;
}

export default function ReminderCard({ reminder, onPress }: Props) {
  const color = KIND_COLOR[reminder.kind];
  return (
    <TouchableOpacity style={styles.card} onPress={() => onPress(reminder)} activeOpacity={0.8}>
      <View style={[styles.iconWrap, { backgroundColor: color + '22' }]}>
        <Ionicons name="notifications" size={20} color={color} />
      </View>
      <View style={styles.content}>
        <Text style={styles.dateText}>{formatReminderDate(reminder.date)}</Text>
        <Text style={styles.title} numberOfLines={1}>{reminder.title}</Text>
        <Text style={styles.body} numberOfLines={2}>{reminder.body}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={COLORS.TEXT_MUTED} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.CARD,
    borderRadius: RADIUS.CARD,
    padding: SPACING.MD,
    marginBottom: SPACING.XS,
    gap: SPACING.SM,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  content: { flex: 1 },
  dateText: {
    fontSize: FONT.CAPTION,
    color: COLORS.TEXT_MUTED,
    fontWeight: '600',
    marginBottom: 2,
  },
  title: {
    fontSize: FONT.BODY_SM,
    fontWeight: '700',
    color: COLORS.TEXT,
  },
  body: {
    fontSize: FONT.CAPTION,
    color: COLORS.TEXT_SECONDARY,
    marginTop: 2,
  },
});
