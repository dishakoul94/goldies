import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, FlatList, StyleSheet, TouchableOpacity,
  KeyboardAvoidingView, Platform, ActivityIndicator, Animated,
} from 'react-native';
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import * as Speech from 'expo-speech';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { ChatMessage, TaskCreatePayload, TaskDeletePayload, TaskEditPayload, ExternalTask, InternalTask, InterdayTask } from '../types';
import { loadChatHistory, saveChatHistory, loadAllTasks, loadUserName, addTask, updateTask, deleteTask, getTaskById } from '../storage';
import { sendChatMessage, buildTasksContext } from '../api';
import {
  scheduleExternalTaskNotifications,
  scheduleInternalTaskNotification,
  scheduleInterdayTaskNotifications,
  cancelNotifications,
} from '../notifications';
import { COLORS, FONT, SPACING, RADIUS } from '../utils/theme';
import { showAlert } from '../utils/alert';

function makeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// Finds the best-matching active task by title. Tries exact match first,
// then falls back to substring containment in either direction.
function findTaskByTitle(tasks: import('../types').Task[], query: string) {
  const q = query.toLowerCase();
  const active = tasks.filter(t =>
    !('completedAt' in t && t.completedAt) && !('archivedAt' in t && t.archivedAt),
  );
  return (
    active.find(t => t.title.toLowerCase() === q) ??
    active.find(t => t.title.toLowerCase().includes(q)) ??
    active.find(t => q.includes(t.title.toLowerCase()))
  );
}

const WELCOME: ChatMessage = {
  id: 'welcome',
  role: 'assistant',
  content: "Hi there! I'm Goldie, your friendly helper. 😊\n\nI can help you with your tasks and appointments, answer questions, or just have a chat. What would you like to know?",
  timestamp: new Date().toISOString(),
};

export default function ChatScreen() {
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME]);
  const [input, setInputState] = useState('');
  const [loading, setLoadingState] = useState(false);
  const [userName, setUserName] = useState<string | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [speakingMsgId, setSpeakingMsgId] = useState<string | null>(null);
  const [voiceMode, setVoiceMode] = useState(false);

  // Refs that mirror state so callbacks/effects always read the latest value
  const inputRef = useRef('');
  const loadingRef = useRef(false);
  const voiceModeRef = useRef(false);
  const voiceInputUsed = useRef(false);
  const prevListeningRef = useRef(false);
  // Always points to the current handleSend so the isListening effect can call it
  const handleSendRef = useRef<() => Promise<void>>(async () => {});

  const listRef = useRef<FlatList>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pulseLoop = useRef<Animated.CompositeAnimation | null>(null);

  // Wrappers that keep refs in sync with state
  const setInput = (text: string) => { inputRef.current = text; setInputState(text); };
  const setLoading = (val: boolean) => { loadingRef.current = val; setLoadingState(val); };

  // ─── Speech recognition events ───────────────────────────────────────────
  useSpeechRecognitionEvent('result', (event) => {
    const transcript = event.results[0]?.transcript ?? '';
    if (transcript) setInput(transcript);
  });
  useSpeechRecognitionEvent('end', () => setIsListening(false));
  useSpeechRecognitionEvent('error', () => setIsListening(false));

  // ─── Mic pulse animation ─────────────────────────────────────────────────
  useEffect(() => {
    if (isListening) {
      pulseLoop.current = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.5, duration: 700, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
        ]),
      );
      pulseLoop.current.start();
    } else {
      pulseLoop.current?.stop();
      pulseAnim.setValue(1);
    }
  }, [isListening]);

  // ─── Cleanup on unmount ───────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      ExpoSpeechRecognitionModule.stop();
      Speech.stop();
    };
  }, []);

  // ─── Start listening helper (extracted so it can be called from multiple places) ──
  const startListening = useCallback(async () => {
    if (Platform.OS === 'web') return;
    const { granted } = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!granted) {
      showAlert('Microphone permission is needed for voice input.');
      return;
    }
    setInput('');
    setIsListening(true);
    voiceInputUsed.current = true;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    ExpoSpeechRecognitionModule.start({ lang: 'en-US', interimResults: true, continuous: false });
  }, []);

  // ─── Voice mode: react to isListening going false ────────────────────────
  // When STT ends in voice mode:
  //   • Has transcript → auto-send
  //   • Empty (user was silent) → wait 1.5 s then re-listen
  useEffect(() => {
    if (prevListeningRef.current && !isListening && voiceModeRef.current) {
      if (inputRef.current.trim()) {
        handleSendRef.current();
      } else {
        const timer = setTimeout(() => {
          if (voiceModeRef.current && !loadingRef.current) startListening();
        }, 1500);
        return () => clearTimeout(timer);
      }
    }
    prevListeningRef.current = isListening;
  }, [isListening, startListening]);

  // ─── TTS ─────────────────────────────────────────────────────────────────
  const speakMessage = useCallback((msgId: string, content: string) => {
    if (Platform.OS === 'web') return;
    Speech.stop();
    setSpeakingMsgId(msgId);
    const clean = content
      .replace(/\*\*(.+?)\*\*/gs, '$1')
      .replace(/\*(.+?)\*/gs, '$1')
      .replace(/`(.+?)`/gs, '$1')
      .replace(/#{1,6}\s/g, '')
      .replace(/\n\n+/g, '. ')
      .replace(/\n/g, ' ')
      .trim();
    Speech.speak(clean, {
      language: 'en-US',
      rate: 0.95,
      onDone: () => {
        setSpeakingMsgId(null);
        // In voice mode, kick off the next listening cycle once Goldie finishes speaking
        if (voiceModeRef.current && !loadingRef.current) startListening();
      },
      onStopped: () => setSpeakingMsgId(null),
      onError: () => setSpeakingMsgId(null),
    });
  }, [startListening]);

  const handleSpeak = useCallback((message: ChatMessage) => {
    if (speakingMsgId === message.id) {
      Speech.stop();
      setSpeakingMsgId(null);
    } else {
      speakMessage(message.id, message.content);
    }
  }, [speakingMsgId, speakMessage]);

  // ─── Voice mode toggle ────────────────────────────────────────────────────
  const toggleVoiceMode = useCallback(async () => {
    const next = !voiceModeRef.current;
    voiceModeRef.current = next;
    setVoiceMode(next);
    if (!next) {
      // Turning off — stop everything
      Speech.stop();
      setSpeakingMsgId(null);
      ExpoSpeechRecognitionModule.stop();
      setIsListening(false);
    } else {
      // Turning on — start listening immediately
      await startListening();
    }
  }, [startListening]);

  // ─── Manual mic button ────────────────────────────────────────────────────
  const handleMicPress = async () => {
    if (Platform.OS === 'web') return;
    if (isListening) { ExpoSpeechRecognitionModule.stop(); return; }
    await startListening();
  };

  useFocusEffect(
    useCallback(() => {
      Promise.all([loadChatHistory(), loadUserName()]).then(([history, name]) => {
        setMessages(history.length > 0 ? history : [WELCOME]);
        setUserName(name);
      });
    }, []),
  );

  const scrollToBottom = () => {
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
  };

  // ─── Task handlers (unchanged) ────────────────────────────────────────────
  const handleTaskCreate = useCallback(async (payload: TaskCreatePayload) => {
    const id = makeId();
    const now = new Date().toISOString();
    try {
      if (payload.tool === 'create_external_task') {
        const task: ExternalTask = {
          id, kind: 'external',
          title: payload.input.title ?? 'Appointment',
          notes: payload.input.notes,
          dateTime: payload.input.dateTime ?? now,
          earlyReminderDays: payload.input.earlyReminderDays ?? [1],
          dayOfReminder: payload.input.dayOfReminder ?? true,
          notificationIds: [],
          createdAt: now,
        };
        await addTask(task);
        const ids = await scheduleExternalTaskNotifications(task).catch(() => []);
        if (ids.length > 0) await updateTask({ ...task, notificationIds: ids });
      } else if (payload.tool === 'create_internal_task') {
        const task: InternalTask = {
          id, kind: 'internal',
          title: payload.input.title ?? 'Reminder',
          notes: payload.input.notes,
          nextDueDate: payload.input.nextDueDate ?? now.slice(0, 10),
          intervalDays: payload.input.intervalDays ?? 0,
          notificationIds: [],
          createdAt: now,
        };
        await addTask(task);
        const ids = await scheduleInternalTaskNotification(task).catch(() => []);
        if (ids.length > 0) await updateTask({ ...task, notificationIds: ids });
      } else if (payload.tool === 'create_interday_task') {
        const task: InterdayTask = {
          id, kind: 'interday',
          title: payload.input.title ?? 'Daily task',
          notes: payload.input.notes,
          group: payload.input.group ?? 'none',
          activeDays: payload.input.activeDays ?? [],
          canDefer: payload.input.canDefer ?? true,
          timeSlot: payload.input.timeSlot,
          notificationIds: [],
          createdAt: now,
        };
        await addTask(task);
        const ids = await scheduleInterdayTaskNotifications(task).catch(() => []);
        if (ids.length > 0) await updateTask({ ...task, notificationIds: ids });
      }
    } catch (err) {
      console.warn('[Goldie] Task creation from chat failed:', err);
    }
  }, []);

  const handleTaskDelete = useCallback(async (payload: TaskDeletePayload) => {
    try {
      const allTasks = await loadAllTasks();
      const target = findTaskByTitle(allTasks, payload.input.title);
      if (!target) { console.warn('[Goldie] Delete: no task found with title:', payload.input.title); return; }
      await cancelNotifications(target.notificationIds);
      await deleteTask(target.id);
    } catch (err) {
      console.warn('[Goldie] Task deletion from chat failed:', err);
    }
  }, []);

  const handleTaskEdit = useCallback(async (payload: TaskEditPayload) => {
    try {
      const allTasks = await loadAllTasks();
      const target = findTaskByTitle(allTasks, payload.input.title);
      if (!target) { console.warn('[Goldie] Edit: no task found with title:', payload.input.title); return; }
      await cancelNotifications(target.notificationIds);
      if (payload.tool === 'edit_external_task' && target.kind === 'external') {
        const updated: ExternalTask = {
          ...target,
          title: payload.input.newTitle ?? target.title,
          notes: payload.input.newNotes ?? target.notes,
          dateTime: payload.input.newDateTime ?? target.dateTime,
          earlyReminderDays: payload.input.newEarlyReminderDays ?? target.earlyReminderDays,
          dayOfReminder: payload.input.newDayOfReminder ?? target.dayOfReminder,
          notificationIds: [],
        };
        const ids = await scheduleExternalTaskNotifications(updated);
        await updateTask({ ...updated, notificationIds: ids });
      } else if (payload.tool === 'edit_internal_task' && target.kind === 'internal') {
        const updated: InternalTask = {
          ...target,
          title: payload.input.newTitle ?? target.title,
          notes: payload.input.newNotes ?? target.notes,
          nextDueDate: payload.input.newNextDueDate ?? target.nextDueDate,
          intervalDays: payload.input.newIntervalDays ?? target.intervalDays,
          notificationIds: [],
        };
        const ids = await scheduleInternalTaskNotification(updated);
        await updateTask({ ...updated, notificationIds: ids });
      } else if (payload.tool === 'edit_interday_task' && target.kind === 'interday') {
        const updated: InterdayTask = {
          ...target,
          title: payload.input.newTitle ?? target.title,
          notes: payload.input.newNotes ?? target.notes,
          group: payload.input.newGroup ?? target.group,
          canDefer: payload.input.newCanDefer ?? target.canDefer,
          activeDays: payload.input.newActiveDays ?? target.activeDays,
          timeSlot: payload.input.newTimeSlot ?? target.timeSlot,
          notificationIds: [],
        };
        const ids = await scheduleInterdayTaskNotifications(updated);
        await updateTask({ ...updated, notificationIds: ids });
      } else {
        console.warn('[Goldie] Edit: task kind mismatch for', payload.tool, 'on', target.kind);
      }
    } catch (err) {
      console.warn('[Goldie] Task edit from chat failed:', err);
    }
  }, []);

  // ─── Send ─────────────────────────────────────────────────────────────────
  const handleSend = async () => {
    // Use inputRef so this function always sees the latest value even when
    // called via handleSendRef from the isListening effect.
    const text = inputRef.current.trim();
    if (!text || loadingRef.current) return;

    const usedVoice = voiceInputUsed.current;
    voiceInputUsed.current = false;
    Speech.stop();
    setSpeakingMsgId(null);

    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setInput('');

    const userMsg: ChatMessage = { id: makeId(), role: 'user', content: text, timestamp: new Date().toISOString() };
    const assistantMsg: ChatMessage = { id: makeId(), role: 'assistant', content: '', timestamp: new Date().toISOString() };

    const nextMessages = [...messages.filter(m => m.id !== 'welcome' || messages.length > 1), userMsg, assistantMsg];
    setMessages(nextMessages);
    setLoading(true);
    scrollToBottom();

    try {
      const allTasks = await loadAllTasks();
      const tasksContext = buildTasksContext(allTasks);
      const history = nextMessages
        .filter(m => m.id !== 'welcome' && m.id !== assistantMsg.id && m.content)
        .map(m => ({ role: m.role, content: m.content }));

      let accumulated = '';

      await sendChatMessage(
        [...history, { role: 'user', content: text }],
        tasksContext,
        userName,
        (token) => {
          accumulated += token;
          setMessages(prev => prev.map(m => m.id === assistantMsg.id ? { ...m, content: accumulated } : m));
          scrollToBottom();
        },
        handleTaskCreate,
        handleTaskDelete,
        handleTaskEdit,
      );

      const finalMessages = nextMessages.map(m => m.id === assistantMsg.id ? { ...m, content: accumulated } : m);
      await saveChatHistory(finalMessages);
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      // Speak when voice was used manually OR when voice mode is on
      if ((usedVoice || voiceModeRef.current) && accumulated) speakMessage(assistantMsg.id, accumulated);
    } catch (err) {
      setMessages(prev =>
        prev.map(m =>
          m.id === assistantMsg.id
            ? { ...m, content: "I'm sorry, I couldn't connect right now. Please make sure the backend is running and try again." }
            : m,
        ),
      );
    } finally {
      setLoading(false);
    }
  };

  // Keep the ref current every render so the isListening effect can call it
  handleSendRef.current = handleSend;

  const handleClear = () => {
    Speech.stop();
    setSpeakingMsgId(null);
    setMessages([WELCOME]);
    saveChatHistory([]);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={0}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>G</Text>
            </View>
            <View>
              <Text style={styles.headerName}>Goldie</Text>
              <Text style={[styles.headerStatus, voiceMode && styles.headerStatusActive]}>
                {voiceMode ? 'Voice mode on' : 'Your friendly helper'}
              </Text>
            </View>
          </View>
          <View style={styles.headerActions}>
            {Platform.OS !== 'web' && (
              <TouchableOpacity
                onPress={toggleVoiceMode}
                style={[styles.voiceModeBtn, voiceMode && styles.voiceModeBtnActive]}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Ionicons
                  name={voiceMode ? 'headset' : 'headset-outline'}
                  size={22}
                  color={voiceMode ? COLORS.PRIMARY : COLORS.TEXT_MUTED}
                />
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={handleClear} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Ionicons name="refresh-outline" size={22} color={COLORS.TEXT_MUTED} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Messages */}
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={m => m.id}
          renderItem={({ item }) => <MessageBubble message={item} speakingMsgId={speakingMsgId} onSpeak={handleSpeak} voiceMode={voiceMode} />}
          contentContainerStyle={styles.messageList}
          onLayout={scrollToBottom}
          showsVerticalScrollIndicator={false}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          ListFooterComponent={loading ? <TypingIndicator /> : null}
        />

        {/* Input */}
        <View style={styles.inputRow}>
          {Platform.OS !== 'web' && (
            <TouchableOpacity style={styles.micBtn} onPress={handleMicPress} activeOpacity={0.7}>
              <Animated.View
                style={[
                  styles.micPulse,
                  isListening && { transform: [{ scale: pulseAnim }], backgroundColor: '#FFD6D6' },
                ]}
              />
              <Ionicons
                name={isListening ? 'mic' : 'mic-outline'}
                size={24}
                color={isListening ? '#E53935' : COLORS.TEXT_MUTED}
              />
            </TouchableOpacity>
          )}
          <TextInput
            style={[styles.textInput, isListening && styles.textInputListening]}
            value={input}
            onChangeText={setInput}
            placeholder={isListening ? 'Listening…' : voiceMode ? 'Voice mode active…' : 'Type a message…'}
            placeholderTextColor={isListening ? COLORS.PRIMARY : voiceMode ? COLORS.PRIMARY : COLORS.TEXT_MUTED}
            multiline
            maxLength={1000}
            returnKeyType="default"
            editable={!isListening}
          />
          <TouchableOpacity
            style={[styles.sendBtn, (!input.trim() || loading) && { opacity: 0.4 }]}
            onPress={handleSend}
            disabled={!input.trim() || loading}
          >
            <Ionicons name="send" size={22} color={COLORS.WHITE} />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function MessageBubble({
  message,
  speakingMsgId,
  onSpeak,
  voiceMode,
}: {
  message: ChatMessage;
  speakingMsgId: string | null;
  onSpeak: (msg: ChatMessage) => void;
  voiceMode: boolean;
}) {
  const isUser = message.role === 'user';
  const isSpeaking = speakingMsgId === message.id;
  return (
    <View style={[styles.bubbleWrapper, isUser ? styles.bubbleRight : styles.bubbleLeft]}>
      {!isUser && (
        <View style={styles.bubbleAvatar}>
          <Text style={styles.bubbleAvatarText}>G</Text>
        </View>
      )}
      <View style={styles.bubbleColumn}>
        <View style={[styles.bubble, isUser ? styles.userBubble : styles.assistantBubble]}>
          {message.content ? (
            <Text style={[styles.bubbleText, isUser ? styles.userBubbleText : styles.assistantBubbleText]}>
              {message.content}
            </Text>
          ) : (
            <ActivityIndicator size="small" color={COLORS.TEXT_MUTED} />
          )}
        </View>
        {/* Hide speaker icon in voice mode — TTS is automatic */}
        {!isUser && message.content && Platform.OS !== 'web' && !voiceMode && (
          <TouchableOpacity onPress={() => onSpeak(message)} style={styles.speakBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons
              name={isSpeaking ? 'stop-circle-outline' : 'volume-medium-outline'}
              size={15}
              color={isSpeaking ? COLORS.PRIMARY : COLORS.TEXT_MUTED}
            />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

function TypingIndicator() {
  return (
    <View style={[styles.bubbleWrapper, styles.bubbleLeft]}>
      <View style={styles.bubbleAvatar}>
        <Text style={styles.bubbleAvatarText}>G</Text>
      </View>
      <View style={[styles.bubble, styles.assistantBubble, styles.typingBubble]}>
        <Text style={styles.typingDots}>• • •</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.BACKGROUND },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.MD, paddingVertical: SPACING.SM,
    backgroundColor: COLORS.WHITE, borderBottomWidth: 1, borderBottomColor: COLORS.BORDER,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: SPACING.SM },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: SPACING.SM },
  voiceModeBtn: { padding: 4, borderRadius: 20 },
  voiceModeBtnActive: { backgroundColor: COLORS.PRIMARY_LIGHT },
  avatar: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: COLORS.PRIMARY, alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: 20, fontWeight: '800', color: COLORS.WHITE },
  headerName: { fontSize: FONT.BODY, fontWeight: '700', color: COLORS.TEXT },
  headerStatus: { fontSize: FONT.CAPTION, color: COLORS.TEXT_MUTED },
  headerStatusActive: { color: COLORS.PRIMARY, fontWeight: '600' },
  messageList: { padding: SPACING.MD, paddingBottom: SPACING.SM, gap: SPACING.SM },
  bubbleWrapper: { flexDirection: 'row', alignItems: 'flex-end', gap: SPACING.XS, marginBottom: SPACING.SM },
  bubbleLeft: { justifyContent: 'flex-start' },
  bubbleRight: { justifyContent: 'flex-end' },
  bubbleAvatar: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: COLORS.PRIMARY_LIGHT, alignItems: 'center', justifyContent: 'center',
    marginBottom: 2,
  },
  bubbleAvatarText: { fontSize: 14, fontWeight: '800', color: COLORS.PRIMARY },
  bubbleColumn: { maxWidth: '80%', gap: 2 },
  speakBtn: { alignSelf: 'flex-start', paddingLeft: 4, paddingTop: 2 },
  bubble: {
    borderRadius: 20, paddingHorizontal: SPACING.MD, paddingVertical: SPACING.SM,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 1,
  },
  userBubble: { backgroundColor: COLORS.PRIMARY, borderBottomRightRadius: 4 },
  assistantBubble: { backgroundColor: COLORS.WHITE, borderBottomLeftRadius: 4 },
  typingBubble: { paddingVertical: SPACING.SM, minWidth: 64, alignItems: 'center' },
  bubbleText: { fontSize: FONT.BODY, lineHeight: 28 },
  userBubbleText: { color: COLORS.WHITE },
  assistantBubbleText: { color: COLORS.TEXT },
  typingDots: { fontSize: 18, color: COLORS.TEXT_MUTED, letterSpacing: 4 },
  inputRow: {
    flexDirection: 'row', alignItems: 'flex-end', gap: SPACING.SM,
    paddingHorizontal: SPACING.MD, paddingVertical: SPACING.SM,
    backgroundColor: COLORS.WHITE, borderTopWidth: 1, borderTopColor: COLORS.BORDER,
  },
  micBtn: {
    width: 44, height: 44, alignItems: 'center', justifyContent: 'center',
    marginBottom: 4,
  },
  micPulse: {
    position: 'absolute', width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'transparent',
  },
  textInput: {
    flex: 1, backgroundColor: COLORS.BACKGROUND, borderWidth: 1.5, borderColor: COLORS.BORDER,
    borderRadius: 24, paddingHorizontal: SPACING.MD, paddingVertical: SPACING.SM,
    fontSize: FONT.BODY, color: COLORS.TEXT, maxHeight: 120, lineHeight: 26,
  },
  textInputListening: { borderColor: COLORS.PRIMARY, borderWidth: 1.5 },
  sendBtn: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: COLORS.PRIMARY, alignItems: 'center', justifyContent: 'center',
  },
});
