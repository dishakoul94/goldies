import React from 'react';
import { Platform } from 'react-native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';

interface Props {
  value: Date;
  mode: 'date' | 'time';
  onChange: (date: Date) => void;
  onClose?: () => void;
  minimumDate?: Date;
}

export default function DateTimePickerCompat({ value, mode, onChange, onClose, minimumDate }: Props) {
  return (
    <DateTimePicker
      value={value}
      mode={mode}
      display={mode === 'date' ? (Platform.OS === 'ios' ? 'inline' : 'default') : (Platform.OS === 'ios' ? 'spinner' : 'default')}
      minimumDate={minimumDate}
      onChange={(_e: DateTimePickerEvent, d?: Date) => {
        if (Platform.OS !== 'ios') onClose?.();
        if (d) onChange(d);
      }}
    />
  );
}
