import React from 'react';
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

  if (Platform.OS === 'ios') {
    const iosDisplay: DisplayMode = display ?? (mode === 'time' ? 'spinner' : 'inline');
    return (
      <Modal transparent animationType="slide" visible onRequestClose={onClose}>
        <View style={[styles.overlay, { paddingTop: Math.max(insets.top + 40, 100) }]}>
          <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
            <View style={styles.toolbar}>
              <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                <Text style={styles.doneBtn}>Done</Text>
              </TouchableOpacity>
            </View>
            <DateTimePicker
              value={value}
              mode={mode}
              display={iosDisplay}
              minimumDate={minimumDate}
              onChange={(_e: DateTimePickerEvent, d?: Date) => {
                if (d) onChange(d);
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
});
