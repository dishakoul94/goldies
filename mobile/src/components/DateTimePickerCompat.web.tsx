import React from 'react';
import { View } from 'react-native';

interface Props {
  value: Date;
  mode: 'date' | 'time' | 'datetime';
  onChange: (date: Date) => void;
  onClose?: () => void;
  minimumDate?: Date;
}

function toInputValue(d: Date, mode: 'date' | 'time'): string {
  if (mode === 'date') {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${min}`;
}

export default function DateTimePickerCompat({ value, mode, onChange, onClose, minimumDate }: Props) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (!val) return;
    const next = new Date(value);
    if (mode === 'date') {
      const [year, month, day] = val.split('-').map(Number);
      next.setFullYear(year, month - 1, day);
      onChange(next);
      onClose?.();
    } else {
      const [hours, minutes] = val.split(':').map(Number);
      next.setHours(hours, minutes);
      onChange(next);
    }
  };

  const handleBlur = () => {
    if (mode === 'time') onClose?.();
  };

  const minAttr = minimumDate ? toInputValue(minimumDate, 'date') : undefined;

  return (
    <View>
      {/* @ts-ignore — raw HTML input rendered via react-native-web */}
      <input
        type={mode === 'date' ? 'date' : 'time'}
        value={toInputValue(value, mode)}
        min={minAttr}
        onChange={handleChange}
        onBlur={handleBlur}
        style={{
          fontSize: 16,
          padding: '10px 14px',
          borderRadius: 12,
          border: '1.5px solid #E0E0E0',
          backgroundColor: '#FFFFFF',
          color: '#1A1A1A',
          width: '100%',
          marginTop: 8,
          boxSizing: 'border-box',
          outline: 'none',
        } as React.CSSProperties}
      />
    </View>
  );
}
