import React, { useState, useRef } from 'react';
import { Platform, Modal, View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type DisplayMode = 'default' | 'spinner' | 'calendar' | 'clock' | 'inline' | 'compact';

interface Props {
  value: Date;
  mode: 'date' | 'time' | 'datetime';
  onChange: (date: Date) => void;
  onClose?: () => void;
  minimumDate?: Date;
  display?: DisplayMode;
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];
const DAY_NAMES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

function JsCalendarPicker({ value, minimumDate, onSelect, onCancel }: {
  value: Date;
  minimumDate?: Date;
  onSelect: (date: Date) => void;
  onCancel: () => void;
}) {
  const [viewYear, setViewYear] = useState(value.getFullYear());
  const [viewMonth, setViewMonth] = useState(value.getMonth());

  const firstDayOfWeek = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

  const today = new Date();
  const minDay = minimumDate
    ? new Date(minimumDate.getFullYear(), minimumDate.getMonth(), minimumDate.getDate())
    : null;

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  };

  const isSelected = (d: number) =>
    value.getFullYear() === viewYear && value.getMonth() === viewMonth && value.getDate() === d;
  const isToday = (d: number) =>
    today.getFullYear() === viewYear && today.getMonth() === viewMonth && today.getDate() === d;
  const isDisabled = (d: number) => {
    if (!minDay) return false;
    return new Date(viewYear, viewMonth, d) < minDay;
  };

  const cells: (number | null)[] = Array(firstDayOfWeek).fill(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  const rows: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));

  return (
    <View style={cal.wrapper}>
      <View style={cal.header}>
        <Text style={cal.monthYear}>{MONTH_NAMES[viewMonth]} {viewYear}</Text>
        <View style={cal.navRow}>
          <TouchableOpacity onPress={prevMonth} style={cal.navBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={cal.navArrow}>{'<'}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={nextMonth} style={cal.navBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={cal.navArrow}>{'>'}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={cal.dayLabelsRow}>
        {DAY_NAMES.map(n => <Text key={n} style={cal.dayLabel}>{n}</Text>)}
      </View>

      {rows.map((row, ri) => (
        <View key={ri} style={cal.row}>
          {row.map((day, ci) => {
            if (!day) return <View key={ci} style={cal.cell} />;
            const sel = isSelected(day);
            const tod = isToday(day);
            const dis = isDisabled(day);
            return (
              <TouchableOpacity
                key={ci}
                style={[cal.cell, sel && cal.selectedCell]}
                onPress={() => {
                  const picked = new Date(viewYear, viewMonth, day);
                  onSelect(picked);
                }}
                disabled={dis}
                activeOpacity={0.7}
              >
                <Text style={[
                  cal.dayText,
                  tod && !sel && cal.todayText,
                  sel && cal.selectedText,
                  dis && cal.disabledText,
                ]}>
                  {day}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ))}

      <View style={cal.footer}>
        <TouchableOpacity onPress={onCancel} hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}>
          <Text style={cal.cancelText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function JSTimePicker({ value, onChange, onClose, insetBottom }: {
  value: Date; onChange: (d: Date) => void; onClose?: () => void; insetBottom: number;
}) {
  const selectedRef = useRef({ hours: value.getHours(), minutes: value.getMinutes() });
  const [displayH, setDisplayH] = useState(value.getHours());
  const [displayM, setDisplayM] = useState(value.getMinutes());

  // All mutations go through functional updaters so the Modal's potentially
  // stale closures always read/write the latest state via React's update queue.
  // selectedRef is also kept in sync so handleDone can read it synchronously.
  const incHour = () => setDisplayH(prev => { const h = (prev + 1) % 24; selectedRef.current = { ...selectedRef.current, hours: h }; return h; });
  const decHour = () => setDisplayH(prev => { const h = (prev + 23) % 24; selectedRef.current = { ...selectedRef.current, hours: h }; return h; });
  const incMin  = () => setDisplayM(prev => { const m = (prev + 1) % 60; selectedRef.current = { ...selectedRef.current, minutes: m }; return m; });
  const decMin  = () => setDisplayM(prev => { const m = (prev + 59) % 60; selectedRef.current = { ...selectedRef.current, minutes: m }; return m; });
  const toggleAMPM = () => setDisplayH(prev => { const h = prev >= 12 ? prev - 12 : prev + 12; selectedRef.current = { ...selectedRef.current, hours: h }; return h; });

  // handleDone reads from selectedRef — a stable mutable object — so it
  // always has the latest value regardless of which render's closure runs.
  const handleDone = () => {
    const d = new Date(value);
    d.setHours(selectedRef.current.hours, selectedRef.current.minutes, 0, 0);
    onChange(d);
    onClose?.();
  };

  const hour12 = displayH % 12 || 12;
  const isPM = displayH >= 12;

  return (
    <Modal transparent animationType="slide" visible onRequestClose={handleDone}>
      <View style={styles.overlay}>
        <View style={[styles.sheet, { paddingBottom: insetBottom }]}>
          <View style={styles.toolbar}>
            <TouchableOpacity onPress={handleDone} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Text style={styles.doneBtn}>Done</Text>
            </TouchableOpacity>
          </View>
          <View style={tp.row}>
            <View style={tp.col}>
              <TouchableOpacity onPress={incHour} hitSlop={{ top: 8, bottom: 8, left: 16, right: 16 }}>
                <Text style={tp.arrow}>▲</Text>
              </TouchableOpacity>
              <Text style={tp.digit}>{String(hour12).padStart(2, '0')}</Text>
              <TouchableOpacity onPress={decHour} hitSlop={{ top: 8, bottom: 8, left: 16, right: 16 }}>
                <Text style={tp.arrow}>▼</Text>
              </TouchableOpacity>
            </View>
            <Text style={tp.colon}>:</Text>
            <View style={tp.col}>
              <TouchableOpacity onPress={incMin} hitSlop={{ top: 8, bottom: 8, left: 16, right: 16 }}>
                <Text style={tp.arrow}>▲</Text>
              </TouchableOpacity>
              <Text style={tp.digit}>{String(displayM).padStart(2, '0')}</Text>
              <TouchableOpacity onPress={decMin} hitSlop={{ top: 8, bottom: 8, left: 16, right: 16 }}>
                <Text style={tp.arrow}>▼</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity onPress={toggleAMPM} style={tp.ampmBtn}>
              <Text style={tp.ampmText}>{isPM ? 'PM' : 'AM'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

export default function DateTimePickerCompat({ value, mode, onChange, onClose, minimumDate, display }: Props) {
  const insets = useSafeAreaInsets();

  if (Platform.OS === 'ios') {
    if (mode === 'date') {
      return (
        <JsCalendarPicker
          value={value}
          minimumDate={minimumDate}
          onSelect={(d) => { onChange(d); onClose?.(); }}
          onCancel={() => onClose?.()}
        />
      );
    }

    // Time mode: pure-JS picker in a Modal sheet.
    // Avoids native DateTimePicker onChange bridge timing issues entirely.
    // selectedRef holds the current selection so handleDone always reads the
    // latest value even if the Modal calls a stale closure of the handler.
    return <JSTimePicker value={value} onChange={onChange} onClose={onClose} insetBottom={Math.max(insets.bottom, 16)} />;
  }

  return (
    <DateTimePicker
      value={value}
      mode={mode}
      display={display ?? 'default'}
      minimumDate={minimumDate}
      onChange={(_e: DateTimePickerEvent, d?: Date) => {
        if (d) onChange(d);
        onClose?.();
      }}
    />
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  toolbar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E0E0E0',
  },
  doneBtn: {
    fontSize: 17,
    fontWeight: '600',
    color: '#007AFF',
  },
  picker: {
    height: 216,
  },
});

const BLUE = '#007AFF';
const cal = StyleSheet.create({
  wrapper: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    marginTop: 8,
    paddingHorizontal: 8,
    paddingBottom: 4,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingTop: 16,
    paddingBottom: 8,
  },
  monthYear: {
    fontSize: 17,
    fontWeight: '700',
    color: '#000',
  },
  navRow: {
    flexDirection: 'row',
    gap: 16,
  },
  navBtn: {
    padding: 4,
  },
  navArrow: {
    fontSize: 20,
    color: BLUE,
    fontWeight: '600',
  },
  dayLabelsRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  dayLabel: {
    flex: 1,
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '500',
    color: '#8E8E93',
    paddingVertical: 4,
  },
  row: {
    flexDirection: 'row',
  },
  cell: {
    flex: 1,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    margin: 1,
  },
  selectedCell: {
    backgroundColor: BLUE,
    borderRadius: 999,
  },
  dayText: {
    fontSize: 17,
    color: '#000',
  },
  todayText: {
    color: BLUE,
    fontWeight: '600',
  },
  selectedText: {
    color: '#FFF',
    fontWeight: '600',
  },
  disabledText: {
    color: '#C7C7CC',
  },
  footer: {
    alignItems: 'flex-end',
    paddingHorizontal: 8,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E0E0E0',
    marginTop: 4,
  },
  cancelText: {
    fontSize: 16,
    color: '#8E8E93',
  },
});

const tp = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
    gap: 8,
  },
  col: {
    alignItems: 'center',
    gap: 8,
  },
  arrow: {
    fontSize: 20,
    color: '#007AFF',
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  digit: {
    fontSize: 52,
    fontWeight: '600',
    color: '#000',
    minWidth: 72,
    textAlign: 'center',
  },
  colon: {
    fontSize: 52,
    fontWeight: '300',
    color: '#000',
    marginBottom: 4,
  },
  ampmBtn: {
    marginLeft: 12,
    backgroundColor: '#F2F2F7',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  ampmText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#007AFF',
  },
});
