import React from 'react';
import { Platform } from 'react-native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';

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
  const resolvedDisplay: DisplayMode = display ?? (
    mode === 'date'
      ? (Platform.OS === 'ios' ? 'compact' : 'default')
      : (Platform.OS === 'ios' ? 'spinner' : 'default')
  );
  return (
    <DateTimePicker
      value={value}
      mode={mode}
      display={resolvedDisplay}
      minimumDate={minimumDate}
      onChange={(_e: DateTimePickerEvent, d?: Date) => {
        if (Platform.OS !== 'ios') onClose?.();
        if (d) onChange(d);
      }}
    />
  );
}
