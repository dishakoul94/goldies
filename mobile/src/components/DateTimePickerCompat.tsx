import React, { useState } from 'react';
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

export default function DateTimePickerCompat({ value, mode, onChange, onClose, minimumDate, display }: Props) {
  const insets = useSafeAreaInsets();
  const [localValue, setLocalValue] = useState(value);

  if (Platform.OS === 'ios') {
    // For date mode, use inline calendar — each tap fires onChange reliably.
    // For time mode, use spinner + Done so the user can scroll and commit.
    const isDate = mode === 'date';
    const iosDisplay = display ?? (isDate ? 'inline' : 'spinner');

    const handleDone = () => {
      onChange(localValue);
      onClose?.();
    };

    return (
      <Modal transparent animationType="slide" visible onRequestClose={isDate ? onClose : handleDone}>
        <View style={[styles.overlay, { paddingTop: Math.max(insets.top + 40, 100) }]}>
          <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
            <View style={styles.toolbar}>
              {isDate ? (
                <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                  <Text style={styles.cancelBtn}>Cancel</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity onPress={handleDone} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                  <Text style={styles.doneBtn}>Done</Text>
                </TouchableOpacity>
              )}
            </View>
            <DateTimePicker
              value={isDate ? value : localValue}
              mode={mode}
              display={iosDisplay}
              minimumDate={minimumDate}
              style={isDate ? styles.inlinePicker : styles.picker}
              onChange={(_e: DateTimePickerEvent, d?: Date) => {
                if (!d) return;
                if (isDate) {
                  // inline calendar: each tap is a committed selection
                  onChange(d);
                  onClose?.();
                } else {
                  setLocalValue(d);
                }
              }}
            />
          </View>
        </View>
      </Modal>
    );
  }

  return (
    <DateTimePicker
      value={value}
      mode={mode}
      display={display ?? 'default'}
      minimumDate={minimumDate}
      onChange={(_e: DateTimePickerEvent, d?: Date) => {
        onClose?.();
        if (d) onChange(d);
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
  cancelBtn: {
    fontSize: 17,
    color: '#8E8E93',
  },
  picker: {
    height: 216,
  },
  inlinePicker: {
    height: 346,
  },
});
