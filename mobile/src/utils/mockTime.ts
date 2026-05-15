import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'goldies_mock_time';

let _mockTime: Date | null = null;

export async function loadMockTime(): Promise<void> {
  const raw = await AsyncStorage.getItem(KEY);
  _mockTime = raw ? new Date(raw) : null;
}

export async function saveMockTime(date: Date | null): Promise<void> {
  _mockTime = date;
  if (date === null) {
    await AsyncStorage.removeItem(KEY);
  } else {
    await AsyncStorage.setItem(KEY, date.toISOString());
  }
}

export function getNow(): Date {
  return _mockTime ? new Date(_mockTime) : new Date();
}

export function getMockTime(): Date | null {
  return _mockTime;
}
