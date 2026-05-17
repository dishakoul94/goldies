import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, ScrollView, StyleSheet, TouchableOpacity,
  Switch, Platform, KeyboardAvoidingView, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import DateTimePickerCompat from '../components/DateTimePickerCompat';
import { format, parseISO } from 'date-fns';
import { RootStackParamList, Task, ExternalTask, InternalTask, InterdayTask, InterdayGroup, Recurrence, RecurrenceUnit, ServiceProvider, DEFAULT_REMINDER_TIMES } from '../types';
import { getTaskById, updateTask, addServiceProvider, loadUserProfile } from '../storage';
import ServiceProviderPicker, { ProviderSelection } from '../components/ServiceProviderPicker';
import { cancelNotifications, scheduleExternalTaskNotifications, scheduleInternalTaskNotification, scheduleInterdayTaskNotifications } from '../notifications';
import { COLORS, FONT, SPACING, RADIUS } from '../utils/theme';
import { showAlert } from '../utils/alert';

type RouteParams = RouteProp<RootStackParamList, 'EditTask'>;

const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const RECURRENCE_UNITS: RecurrenceUnit[] = ['days', 'weeks', 'months'];
const GROUPS: InterdayGroup[] = ['morning', 'afternoon', 'evening', 'none'];
const EARLY_REMINDER_OPTIONS = [0, 1, 2, 3, 7, 14];
const INTERVAL_OPTIONS = [0, 1, 3, 7, 14, 30];

export default function EditTaskScreen() {
  const navigation = useNavigation();
  const route = useRoute<RouteParams>();
  const [task, setTask] = useState<Task | null>(null);
  const [loading, setLoading] = useState(true);
  const [defaultReminderTime, setDefaultReminderTime] = useState(DEFAULT_REMINDER_TIMES.defaultTime);

  useEffect(() => {
    getTaskById(route.params.taskId).then(t => {
      setTask(t);
      setLoading(false);
    });
    loadUserProfile().then(p => {
      if (p?.reminderTimes?.defaultTime) setDefaultReminderTime(p.reminderTimes.defaultTime);
    });
  }, [route.params.taskId]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.PRIMARY} />
      </View>
    );
  }

  if (!task) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>Task not found.</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <Text style={styles.formTitle}>
            {task.kind === 'external' ? '📅 Edit Appointment' : task.kind === 'internal' ? '✅ Edit To-Do' : '🔁 Edit Daily Task'}
          </Text>

          {task.kind === 'external' && <ExternalEditForm task={task} navigation={navigation} defaultReminderTime={defaultReminderTime} />}
          {task.kind === 'internal' && <InternalEditForm task={task} navigation={navigation} defaultReminderTime={defaultReminderTime} />}
          {task.kind === 'interday' && <InterdayEditForm task={task} navigation={navigation} />}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function makeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function ExternalEditForm({ task, navigation, defaultReminderTime }: { task: ExternalTask; navigation: any; defaultReminderTime: string }) {
  const [title, setTitle] = useState(task.title);
  const [notes, setNotes] = useState(task.notes ?? '');
  const [dateTime, setDateTime] = useState(parseISO(task.dateTime));
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [isRecurring, setIsRecurring] = useState(!!task.recurrence);
  const [recurEvery, setRecurEvery] = useState(String(task.recurrence?.every ?? 1));
  const [recurUnit, setRecurUnit] = useState<RecurrenceUnit>(task.recurrence?.unit ?? 'weeks');
  const [earlyReminderDays, setEarlyReminderDays] = useState<number[]>(
    Array.isArray(task.earlyReminderDays)
      ? task.earlyReminderDays
      : (task.earlyReminderDays as unknown as number) > 0 ? [task.earlyReminderDays as unknown as number] : [],
  );
  const [dayOfReminder, setDayOfReminder] = useState(task.dayOfReminder);
  const [reminderTimeValue, setReminderTimeValue] = useState(() => {
    const hhmm = task.reminderTime ?? defaultReminderTime;
    const [h, m] = hhmm.split(':').map(Number);
    const d = new Date(); d.setHours(h, m, 0, 0); return d;
  });
  const [showReminderTimePicker, setShowReminderTimePicker] = useState(false);
  const [providerSelection, setProviderSelection] = useState<ProviderSelection>(
    task.serviceProviderId
      ? { type: 'existing', providerId: task.serviceProviderId }
      : { type: 'none' },
  );
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!title.trim()) { showAlert('Please enter a title'); return; }
    setSaving(true);
    try {
      await cancelNotifications(task.notificationIds);
      const recurrence: Recurrence | undefined = isRecurring
        ? { every: parseInt(recurEvery) || 1, unit: recurUnit }
        : undefined;

      let serviceProviderId: string | undefined;
      if (providerSelection.type === 'existing') {
        serviceProviderId = providerSelection.providerId;
      } else if (providerSelection.type === 'new' && providerSelection.draft.name.trim()) {
        const newProvider: ServiceProvider = {
          id: makeId(),
          name: providerSelection.draft.name.trim(),
          specialty: providerSelection.draft.specialty.trim() || undefined,
          phone: providerSelection.draft.phone.trim() || undefined,
          createdAt: new Date().toISOString(),
        };
        await addServiceProvider(newProvider);
        serviceProviderId = newProvider.id;
      }

      const updated: ExternalTask = {
        ...task,
        title: title.trim(),
        notes: notes.trim() || undefined,
        dateTime: dateTime.toISOString(),
        recurrence,
        earlyReminderDays,
        dayOfReminder,
        reminderTime: format(reminderTimeValue, 'HH:mm'),
        serviceProviderId,
        notificationIds: [],
      };
      const profile = await loadUserProfile();
      const ids = await scheduleExternalTaskNotifications(updated, profile);
      await updateTask({ ...updated, notificationIds: ids });
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      navigation.goBack();
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <FormField label="Service Provider">
        <ServiceProviderPicker value={providerSelection} onChange={setProviderSelection} />
      </FormField>
      <FormField label="Title">
        <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholderTextColor={COLORS.TEXT_MUTED} returnKeyType="done" />
      </FormField>
      <FormField label="Date">
        <TouchableOpacity style={styles.pickerBtn} onPress={() => setShowDatePicker(true)}>
          <Ionicons name="calendar-outline" size={22} color={COLORS.PRIMARY} />
          <Text style={styles.pickerBtnText}>{format(dateTime, 'EEEE, MMMM d, yyyy')}</Text>
        </TouchableOpacity>
        {showDatePicker && (
          <DateTimePickerCompat value={dateTime} mode="date"
            onChange={(d) => setDateTime(prev => { const n = new Date(prev); n.setFullYear(d.getFullYear(), d.getMonth(), d.getDate()); return n; })}
            onClose={() => setShowDatePicker(false)} />
        )}
      </FormField>
      <FormField label="Time">
        <TouchableOpacity style={styles.pickerBtn} onPress={() => setShowTimePicker(true)}>
          <Ionicons name="time-outline" size={22} color={COLORS.PRIMARY} />
          <Text style={styles.pickerBtnText}>{format(dateTime, 'h:mm a')}</Text>
        </TouchableOpacity>
        {showTimePicker && (
          <DateTimePickerCompat value={dateTime} mode="time"
            onChange={(d) => setDateTime(prev => { const n = new Date(prev); n.setHours(d.getHours(), d.getMinutes()); return n; })}
            onClose={() => setShowTimePicker(false)} />
        )}
      </FormField>
      <FormField label="Recurring?">
        <View style={styles.toggleRow}>
          <Switch value={isRecurring} onValueChange={setIsRecurring} thumbColor={isRecurring ? COLORS.PRIMARY : undefined} trackColor={{ true: COLORS.PRIMARY_LIGHT }} />
          <Text style={styles.toggleLabel}>{isRecurring ? 'Yes' : 'No'}</Text>
        </View>
        {isRecurring && (
          <View style={styles.recurRow}>
            <Text style={styles.recurLabel}>Every</Text>
            <TextInput style={[styles.input, styles.smallInput]} value={recurEvery} onChangeText={setRecurEvery} keyboardType="number-pad" maxLength={2} />
            <View style={styles.unitPicker}>
              {RECURRENCE_UNITS.map(u => (
                <TouchableOpacity key={u} style={[styles.unitBtn, recurUnit === u && styles.unitBtnActive]} onPress={() => setRecurUnit(u)}>
                  <Text style={[styles.unitLabel, recurUnit === u && styles.unitLabelActive]}>{u}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}
      </FormField>
      <FormField label="Early reminder">
        <View style={styles.chipRow}>
          {EARLY_REMINDER_OPTIONS.map(n => {
            const isNone = n === 0;
            const active = isNone ? earlyReminderDays.length === 0 : earlyReminderDays.includes(n);
            const toggle = () => {
              if (isNone) { setEarlyReminderDays([]); return; }
              setEarlyReminderDays(prev =>
                prev.includes(n) ? prev.filter(d => d !== n) : [...prev, n],
              );
            };
            return (
              <TouchableOpacity key={n} style={[styles.chip, active && styles.chipActive]} onPress={toggle}>
                <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>{isNone ? 'None' : `${n}d`}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </FormField>
      <FormField label="Remind on the day">
        <View style={styles.toggleRow}>
          <Switch value={dayOfReminder} onValueChange={setDayOfReminder} thumbColor={dayOfReminder ? COLORS.PRIMARY : undefined} trackColor={{ true: COLORS.PRIMARY_LIGHT }} />
          <Text style={styles.toggleLabel}>{dayOfReminder ? 'Yes' : 'No'}</Text>
        </View>
      </FormField>
      <FormField label="Reminder notification time">
        <TouchableOpacity style={styles.pickerBtn} onPress={() => setShowReminderTimePicker(true)}>
          <Ionicons name="alarm-outline" size={22} color={COLORS.PRIMARY} />
          <Text style={styles.pickerBtnText}>{format(reminderTimeValue, 'h:mm a')}</Text>
        </TouchableOpacity>
        {showReminderTimePicker && (
          <DateTimePickerCompat value={reminderTimeValue} mode="time"
            onChange={(d) => setReminderTimeValue(d)}
            onClose={() => setShowReminderTimePicker(false)} />
        )}
      </FormField>
      <FormField label="Notes (optional)">
        <TextInput style={[styles.input, styles.notesInput]} value={notes} onChangeText={setNotes} placeholder="Any extra details..." placeholderTextColor={COLORS.TEXT_MUTED} multiline numberOfLines={3} />
      </FormField>
      <SaveButton onPress={handleSave} loading={saving} />
    </>
  );
}

function InternalEditForm({ task, navigation, defaultReminderTime }: { task: InternalTask; navigation: any; defaultReminderTime: string }) {
  const [title, setTitle] = useState(task.title);
  const [notes, setNotes] = useState(task.notes ?? '');
  const [dueDate, setDueDate] = useState(parseISO(task.nextDueDate));
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [intervalDays, setIntervalDays] = useState(task.intervalDays);
  const [earlyReminderDays, setEarlyReminderDays] = useState<number[]>(task.earlyReminderDays ?? []);
  const [reminderTimeValue, setReminderTimeValue] = useState(() => {
    const hhmm = task.reminderTime ?? defaultReminderTime;
    const [h, m] = hhmm.split(':').map(Number);
    const d = new Date(); d.setHours(h, m, 0, 0); return d;
  });
  const [showReminderTimePicker, setShowReminderTimePicker] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!title.trim()) { showAlert('Please enter a title'); return; }
    setSaving(true);
    try {
      await cancelNotifications(task.notificationIds);
      const updated: InternalTask = {
        ...task, title: title.trim(), notes: notes.trim() || undefined,
        nextDueDate: format(dueDate, 'yyyy-MM-dd'), intervalDays, earlyReminderDays,
        reminderTime: format(reminderTimeValue, 'HH:mm'), notificationIds: [],
      };
      const profile = await loadUserProfile();
      const ids = await scheduleInternalTaskNotification(updated, profile);
      await updateTask({ ...updated, notificationIds: ids });
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      navigation.goBack();
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <FormField label="Title">
        <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholderTextColor={COLORS.TEXT_MUTED} returnKeyType="done" />
      </FormField>
      <FormField label="Due date">
        <TouchableOpacity style={styles.pickerBtn} onPress={() => setShowDatePicker(true)}>
          <Ionicons name="calendar-outline" size={22} color={COLORS.PRIMARY} />
          <Text style={styles.pickerBtnText}>{format(dueDate, 'EEEE, MMMM d, yyyy')}</Text>
        </TouchableOpacity>
        {showDatePicker && (
          <DateTimePickerCompat value={dueDate} mode="date"
            onChange={(d) => setDueDate(d)}
            onClose={() => setShowDatePicker(false)} />
        )}
      </FormField>
      <FormField label="Remind me every">
        <View style={styles.chipRow}>
          {INTERVAL_OPTIONS.map(n => (
            <TouchableOpacity key={n} style={[styles.chip, intervalDays === n && styles.chipActive]} onPress={() => setIntervalDays(n)}>
              <Text style={[styles.chipLabel, intervalDays === n && styles.chipLabelActive]}>{n === 0 ? 'Once' : `${n}d`}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </FormField>
      <FormField label="Early reminder">
        <View style={styles.chipRow}>
          {EARLY_REMINDER_OPTIONS.map(n => {
            const isNone = n === 0;
            const active = isNone ? earlyReminderDays.length === 0 : earlyReminderDays.includes(n);
            const toggle = () => {
              if (isNone) { setEarlyReminderDays([]); return; }
              setEarlyReminderDays(prev => prev.includes(n) ? prev.filter(d => d !== n) : [...prev, n]);
            };
            return (
              <TouchableOpacity key={n} style={[styles.chip, active && styles.chipActive]} onPress={toggle}>
                <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>{isNone ? 'None' : `${n}d`}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </FormField>
      <FormField label="Reminder notification time">
        <TouchableOpacity style={styles.pickerBtn} onPress={() => setShowReminderTimePicker(true)}>
          <Ionicons name="alarm-outline" size={22} color={COLORS.PRIMARY} />
          <Text style={styles.pickerBtnText}>{format(reminderTimeValue, 'h:mm a')}</Text>
        </TouchableOpacity>
        {showReminderTimePicker && (
          <DateTimePickerCompat value={reminderTimeValue} mode="time"
            onChange={(d) => setReminderTimeValue(d)}
            onClose={() => setShowReminderTimePicker(false)} />
        )}
      </FormField>
      <FormField label="Notes (optional)">
        <TextInput style={[styles.input, styles.notesInput]} value={notes} onChangeText={setNotes} placeholder="Any extra details..." placeholderTextColor={COLORS.TEXT_MUTED} multiline numberOfLines={3} />
      </FormField>
      <SaveButton onPress={handleSave} loading={saving} />
    </>
  );
}

function InterdayEditForm({ task, navigation }: { task: InterdayTask; navigation: any }) {
  const [title, setTitle] = useState(task.title);
  const [notes, setNotes] = useState(task.notes ?? '');
  const [hasTime, setHasTime] = useState(!!task.timeSlot);
  const parseTime = (slot?: string) => { const d = new Date(); if (slot) { const [h, m] = slot.split(':').map(Number); d.setHours(h, m); } return d; };
  const [timeValue, setTimeValue] = useState(parseTime(task.timeSlot));
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [group, setGroup] = useState<InterdayGroup>(task.group);
  const [activeDays, setActiveDays] = useState<number[]>(task.activeDays);
  const [canDefer, setCanDefer] = useState(task.canDefer);
  const [saving, setSaving] = useState(false);

  const toggleDay = (day: number) => setActiveDays(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]);

  const handleSave = async () => {
    if (!title.trim()) { showAlert('Please enter a title'); return; }
    setSaving(true);
    try {
      await cancelNotifications(task.notificationIds);
      const updated: InterdayTask = {
        ...task, title: title.trim(), notes: notes.trim() || undefined,
        timeSlot: hasTime ? format(timeValue, 'HH:mm') : undefined,
        group, activeDays, canDefer, notificationIds: [],
      };
      const profile = await loadUserProfile();
      const ids = await scheduleInterdayTaskNotifications(updated, profile);
      await updateTask({ ...updated, notificationIds: ids });
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      navigation.goBack();
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <FormField label="Title">
        <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholderTextColor={COLORS.TEXT_MUTED} returnKeyType="done" />
      </FormField>
      <FormField label="Has a specific time?">
        <View style={styles.toggleRow}>
          <Switch value={hasTime} onValueChange={setHasTime} thumbColor={hasTime ? COLORS.PRIMARY : undefined} trackColor={{ true: COLORS.PRIMARY_LIGHT }} />
          <Text style={styles.toggleLabel}>{hasTime ? 'Yes' : 'No'}</Text>
        </View>
        {hasTime && (
          <>
            <TouchableOpacity style={[styles.pickerBtn, { marginTop: SPACING.SM }]} onPress={() => setShowTimePicker(true)}>
              <Ionicons name="time-outline" size={22} color={COLORS.PRIMARY} />
              <Text style={styles.pickerBtnText}>{format(timeValue, 'h:mm a')}</Text>
            </TouchableOpacity>
            {showTimePicker && (
              <DateTimePickerCompat value={timeValue} mode="time"
                onChange={(d) => setTimeValue(d)}
                onClose={() => setShowTimePicker(false)} />
            )}
          </>
        )}
      </FormField>
      {!hasTime && (
        <FormField label="Time of day">
          <View style={styles.chipRow}>
            {GROUPS.map(g => (
              <TouchableOpacity key={g} style={[styles.chip, group === g && styles.chipActive]} onPress={() => setGroup(g)}>
                <Text style={[styles.chipLabel, group === g && styles.chipLabelActive]}>{g.charAt(0).toUpperCase() + g.slice(1)}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </FormField>
      )}
      <FormField label="Active days (empty = every day)">
        <View style={styles.dayRow}>
          {DAY_LABELS.map((label, idx) => (
            <TouchableOpacity key={idx} style={[styles.dayChip, activeDays.includes(idx) && styles.dayChipActive]} onPress={() => toggleDay(idx)}>
              <Text style={[styles.dayLabel, activeDays.includes(idx) && styles.dayLabelActive]}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </FormField>
      <FormField label="Can be deferred?">
        <View style={styles.toggleRow}>
          <Switch value={canDefer} onValueChange={setCanDefer} thumbColor={canDefer ? COLORS.PRIMARY : undefined} trackColor={{ true: COLORS.PRIMARY_LIGHT }} />
          <Text style={styles.toggleLabel}>{canDefer ? 'Yes' : 'No'}</Text>
        </View>
      </FormField>
      <FormField label="Notes (optional)">
        <TextInput style={[styles.input, styles.notesInput]} value={notes} onChangeText={setNotes} placeholder="Any extra details..." placeholderTextColor={COLORS.TEXT_MUTED} multiline numberOfLines={3} />
      </FormField>
      <SaveButton onPress={handleSave} loading={saving} />
    </>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

function SaveButton({ onPress, loading }: { onPress: () => void; loading: boolean }) {
  return (
    <TouchableOpacity style={[styles.saveBtn, loading && { opacity: 0.6 }]} onPress={onPress} disabled={loading}>
      <Ionicons name="checkmark-circle" size={24} color={COLORS.WHITE} />
      <Text style={styles.saveBtnText}>{loading ? 'Saving…' : 'Save Changes'}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.BACKGROUND },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.BACKGROUND },
  errorText: { fontSize: FONT.BODY, color: COLORS.TEXT_MUTED },
  container: { padding: SPACING.MD, paddingBottom: SPACING.XL },
  formTitle: { fontSize: FONT.TITLE_CARD, fontWeight: '800', color: COLORS.TEXT, marginBottom: SPACING.LG },
  field: { marginBottom: SPACING.MD },
  label: { fontSize: FONT.BODY_SM, fontWeight: '700', color: COLORS.TEXT, marginBottom: SPACING.XS },
  input: {
    backgroundColor: COLORS.WHITE, borderWidth: 1.5, borderColor: COLORS.BORDER, borderRadius: RADIUS.CARD,
    paddingHorizontal: SPACING.MD, paddingVertical: SPACING.SM, fontSize: FONT.BODY, color: COLORS.TEXT, minHeight: 56,
  },
  notesInput: { minHeight: 90, textAlignVertical: 'top', paddingTop: SPACING.SM },
  smallInput: { minHeight: 48, width: 60, textAlign: 'center' },
  pickerBtn: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.WHITE,
    borderWidth: 1.5, borderColor: COLORS.BORDER, borderRadius: RADIUS.CARD,
    paddingHorizontal: SPACING.MD, paddingVertical: SPACING.SM, gap: SPACING.SM, minHeight: 56,
  },
  pickerBtnText: { fontSize: FONT.BODY, color: COLORS.TEXT },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.SM },
  toggleLabel: { fontSize: FONT.BODY, color: COLORS.TEXT_SECONDARY },
  recurRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.SM, marginTop: SPACING.SM },
  recurLabel: { fontSize: FONT.BODY, color: COLORS.TEXT },
  unitPicker: { flexDirection: 'row', gap: SPACING.XS },
  unitBtn: { paddingHorizontal: SPACING.SM, paddingVertical: 8, borderRadius: RADIUS.CHIP, backgroundColor: COLORS.BORDER },
  unitBtnActive: { backgroundColor: COLORS.PRIMARY },
  unitLabel: { fontSize: FONT.CAPTION, fontWeight: '600', color: COLORS.TEXT_MUTED },
  unitLabelActive: { color: COLORS.WHITE },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.XS },
  chip: { paddingHorizontal: SPACING.MD, paddingVertical: 10, borderRadius: RADIUS.CHIP, backgroundColor: COLORS.BORDER, minWidth: 52, alignItems: 'center' },
  chipActive: { backgroundColor: COLORS.PRIMARY },
  chipLabel: { fontSize: FONT.BODY_SM, fontWeight: '600', color: COLORS.TEXT_MUTED },
  chipLabelActive: { color: COLORS.WHITE },
  dayRow: { flexDirection: 'row', gap: SPACING.XS },
  dayChip: { width: 40, height: 40, borderRadius: 20, backgroundColor: COLORS.BORDER, alignItems: 'center', justifyContent: 'center' },
  dayChipActive: { backgroundColor: COLORS.PRIMARY },
  dayLabel: { fontSize: FONT.CAPTION, fontWeight: '700', color: COLORS.TEXT_MUTED },
  dayLabelActive: { color: COLORS.WHITE },
  saveBtn: {
    flexDirection: 'row', backgroundColor: COLORS.PRIMARY, borderRadius: RADIUS.BUTTON,
    paddingVertical: 18, alignItems: 'center', justifyContent: 'center', gap: SPACING.SM, marginTop: SPACING.LG,
  },
  saveBtnText: { fontSize: FONT.BUTTON, fontWeight: '700', color: COLORS.WHITE },
});
