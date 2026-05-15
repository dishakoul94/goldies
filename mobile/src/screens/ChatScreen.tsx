import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, FlatList, StyleSheet, TouchableOpacity,
  KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
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
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [userName, setUserName] = useState<string | null>(null);
  const listRef = useRef<FlatList>(null);

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
          earlyReminderDays: payload.input.earlyReminderDays ?? 1,
          dayOfReminder: payload.input.dayOfReminder ?? true,
          notificationIds: [],
          createdAt: now,
        };
        const ids = await scheduleExternalTaskNotifications(task);
        await addTask({ ...task, notificationIds: ids });
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
        const ids = await scheduleInternalTaskNotification(task);
        await addTask({ ...task, notificationIds: ids });
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
        const ids = await scheduleInterdayTaskNotifications(task);
        await addTask({ ...task, notificationIds: ids });
      }
    } catch (err) {
      console.warn('[Goldie] Task creation from chat failed:', err);
    }
  }, []);

  const handleTaskDelete = useCallback(async (payload: TaskDeletePayload) => {
    try {
      const allTasks = await loadAllTasks();
      const target = findTaskByTitle(allTasks, payload.input.title);
      if (!target) {
        console.warn('[Goldie] Delete: no task found with title:', payload.input.title);
        return;
      }
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
      if (!target) {
        console.warn('[Goldie] Edit: no task found with title:', payload.input.title);
        return;
      }

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

  const handleSend = async () => {
    const text = input.trim();
    if (!text || loading) return;

    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setInput('');

    const userMsg: ChatMessage = {
      id: makeId(),
      role: 'user',
      content: text,
      timestamp: new Date().toISOString(),
    };

    const assistantMsg: ChatMessage = {
      id: makeId(),
      role: 'assistant',
      content: '',
      timestamp: new Date().toISOString(),
    };

    const nextMessages = [...messages.filter(m => m.id !== 'welcome' || messages.length > 1), userMsg, assistantMsg];
    setMessages(nextMessages);
    setLoading(true);
    scrollToBottom();

    try {
      const allTasks = await loadAllTasks();
      const tasksContext = buildTasksContext(allTasks);

      // Build conversation history for the API (exclude the empty assistant placeholder)
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
          setMessages(prev =>
            prev.map(m => m.id === assistantMsg.id ? { ...m, content: accumulated } : m),
          );
          scrollToBottom();
        },
        handleTaskCreate,
        handleTaskDelete,
        handleTaskEdit,
      );

      // Save complete history
      const finalMessages = nextMessages.map(m =>
        m.id === assistantMsg.id ? { ...m, content: accumulated } : m,
      );
      await saveChatHistory(finalMessages);
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
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

  const handleClear = () => {
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
              <Text style={styles.headerStatus}>Your friendly helper</Text>
            </View>
          </View>
          <TouchableOpacity onPress={handleClear} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons name="refresh-outline" size={22} color={COLORS.TEXT_MUTED} />
          </TouchableOpacity>
        </View>

        {/* Messages */}
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={m => m.id}
          renderItem={({ item }) => <MessageBubble message={item} />}
          contentContainerStyle={styles.messageList}
          onLayout={scrollToBottom}
          showsVerticalScrollIndicator={false}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          ListFooterComponent={loading ? <TypingIndicator /> : null}
        />

        {/* Input */}
        <View style={styles.inputRow}>
          <TextInput
            style={styles.textInput}
            value={input}
            onChangeText={setInput}
            placeholder="Type a message…"
            placeholderTextColor={COLORS.TEXT_MUTED}
            multiline
            maxLength={1000}
            returnKeyType="default"
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

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';
  return (
    <View style={[styles.bubbleWrapper, isUser ? styles.bubbleRight : styles.bubbleLeft]}>
      {!isUser && (
        <View style={styles.bubbleAvatar}>
          <Text style={styles.bubbleAvatarText}>G</Text>
        </View>
      )}
      <View style={[styles.bubble, isUser ? styles.userBubble : styles.assistantBubble]}>
        {message.content ? (
          <Text style={[styles.bubbleText, isUser ? styles.userBubbleText : styles.assistantBubbleText]}>
            {message.content}
          </Text>
        ) : (
          <ActivityIndicator size="small" color={COLORS.TEXT_MUTED} />
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
  avatar: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: COLORS.PRIMARY, alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: 20, fontWeight: '800', color: COLORS.WHITE },
  headerName: { fontSize: FONT.BODY, fontWeight: '700', color: COLORS.TEXT },
  headerStatus: { fontSize: FONT.CAPTION, color: COLORS.TEXT_MUTED },
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
  bubble: {
    maxWidth: '80%', borderRadius: 20, paddingHorizontal: SPACING.MD, paddingVertical: SPACING.SM,
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
  textInput: {
    flex: 1, backgroundColor: COLORS.BACKGROUND, borderWidth: 1.5, borderColor: COLORS.BORDER,
    borderRadius: 24, paddingHorizontal: SPACING.MD, paddingVertical: SPACING.SM,
    fontSize: FONT.BODY, color: COLORS.TEXT, maxHeight: 120, lineHeight: 26,
  },
  sendBtn: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: COLORS.PRIMARY, alignItems: 'center', justifyContent: 'center',
  },
});
