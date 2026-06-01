import React, { useState, useCallback } from 'react';
import {
  View, Text, TextInput, ScrollView, StyleSheet, TouchableOpacity, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { TemplateList, TemplateListItem } from '../types';
import { loadAllLists, addList, updateList, deleteList } from '../storage';
import { COLORS, FONT, SPACING, RADIUS } from '../utils/theme';
import { showConfirm } from '../utils/alert';

const makeId = () => Math.random().toString(36).slice(2);

export default function ListsScreen() {
  const [lists, setLists] = useState<TemplateList[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      loadAllLists().then(setLists);
    }, []),
  );

  const handleNewList = async () => {
    const newList: TemplateList = {
      id: makeId(),
      name: 'New List',
      items: [],
      createdAt: new Date().toISOString(),
    };
    await addList(newList);
    setLists(prev => [...prev, newList]);
    setExpandedId(newList.id);
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleSave = async (updated: TemplateList) => {
    await updateList(updated);
    setLists(prev => prev.map(l => (l.id === updated.id ? updated : l)));
    setExpandedId(null);
    if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const handleDelete = (list: TemplateList) => {
    showConfirm(
      'Delete List',
      `Delete "${list.name}"? Tasks that already use this list won't be affected.`,
      async () => {
        if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        await deleteList(list.id);
        setLists(prev => prev.filter(l => l.id !== list.id));
        if (expandedId === list.id) setExpandedId(null);
      },
      'Delete',
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Text style={styles.title}>My Lists</Text>
          <TouchableOpacity style={styles.newBtn} onPress={handleNewList}>
            <Ionicons name="add" size={18} color={COLORS.PRIMARY} />
            <Text style={styles.newBtnText}>New List</Text>
          </TouchableOpacity>
        </View>

        {lists.length === 0 && (
          <View style={styles.emptyCard}>
            <Ionicons name="list-outline" size={40} color={COLORS.TEXT_MUTED} />
            <Text style={styles.emptyTitle}>No lists yet</Text>
            <Text style={styles.emptySubtext}>Create reusable checklists to attach to any task</Text>
          </View>
        )}

        {lists.map(list => (
          <ListCard
            key={list.id}
            list={list}
            expanded={expandedId === list.id}
            onExpand={() => setExpandedId(expandedId === list.id ? null : list.id)}
            onSave={handleSave}
            onDelete={() => handleDelete(list)}
          />
        ))}

        <View style={{ height: SPACING.XL }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── ListCard ─────────────────────────────────────────────────────────────────

interface ListCardProps {
  list: TemplateList;
  expanded: boolean;
  onExpand: () => void;
  onSave: (updated: TemplateList) => void;
  onDelete: () => void;
}

function ListCard({ list, expanded, onExpand, onSave, onDelete }: ListCardProps) {
  const [draftName, setDraftName] = useState(list.name);
  const [draftItems, setDraftItems] = useState<TemplateListItem[]>(list.items);
  const [newItemText, setNewItemText] = useState('');

  const handleOpen = () => {
    setDraftName(list.name);
    setDraftItems(list.items);
    setNewItemText('');
    onExpand();
  };

  const handleAddItem = () => {
    const text = newItemText.trim();
    if (!text) return;
    setDraftItems(prev => [...prev, { id: makeId(), title: text }]);
    setNewItemText('');
  };

  const handleRemoveItem = (id: string) => {
    setDraftItems(prev => prev.filter(i => i.id !== id));
  };

  const handleSave = () => {
    const name = draftName.trim() || 'Untitled List';
    onSave({ ...list, name, items: draftItems });
  };

  if (!expanded) {
    return (
      <View style={styles.listCard}>
        <View style={styles.listCardRow}>
          <Ionicons name="list-outline" size={20} color={COLORS.PRIMARY} />
          <Text style={styles.listName} numberOfLines={1}>{list.name}</Text>
          <View style={styles.countChip}>
            <Text style={styles.countChipText}>{list.items.length}</Text>
          </View>
          <TouchableOpacity style={styles.iconBtn} onPress={handleOpen}>
            <Ionicons name="pencil-outline" size={18} color={COLORS.PRIMARY} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconBtn} onPress={onDelete}>
            <Ionicons name="trash-outline" size={18} color={COLORS.DANGER} />
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.listCard, styles.listCardExpanded]}>
      <Text style={styles.editLabel}>List name</Text>
      <TextInput
        style={styles.nameInput}
        value={draftName}
        onChangeText={setDraftName}
        placeholder="List name"
        placeholderTextColor={COLORS.TEXT_MUTED}
        autoFocus
        returnKeyType="done"
      />

      {draftItems.length > 0 && (
        <>
          <Text style={[styles.editLabel, { marginTop: SPACING.SM }]}>Items</Text>
          {draftItems.map(item => (
            <View key={item.id} style={styles.itemRow}>
              <Ionicons name="reorder-three-outline" size={16} color={COLORS.TEXT_MUTED} />
              <Text style={styles.itemText} numberOfLines={1}>{item.title}</Text>
              <TouchableOpacity onPress={() => handleRemoveItem(item.id)} style={styles.removeBtn}>
                <Ionicons name="close-circle" size={18} color={COLORS.TEXT_MUTED} />
              </TouchableOpacity>
            </View>
          ))}
        </>
      )}

      <Text style={[styles.editLabel, { marginTop: SPACING.SM }]}>Add item</Text>
      <View style={styles.addItemRow}>
        <TextInput
          style={styles.addItemInput}
          value={newItemText}
          onChangeText={setNewItemText}
          placeholder="Item name"
          placeholderTextColor={COLORS.TEXT_MUTED}
          returnKeyType="done"
          onSubmitEditing={handleAddItem}
          blurOnSubmit={false}
        />
        <TouchableOpacity
          style={[styles.addItemBtn, !newItemText.trim() && { opacity: 0.4 }]}
          onPress={handleAddItem}
          disabled={!newItemText.trim()}
        >
          <Ionicons name="add" size={20} color={COLORS.WHITE} />
        </TouchableOpacity>
      </View>

      <View style={styles.cardActions}>
        <TouchableOpacity style={styles.cancelBtn} onPress={onExpand}>
          <Text style={styles.cancelBtnText}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
          <Ionicons name="checkmark" size={18} color={COLORS.WHITE} />
          <Text style={styles.saveBtnText}>Save</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.BACKGROUND },
  container: { padding: SPACING.MD, paddingTop: SPACING.LG },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.MD,
  },
  title: { fontSize: FONT.TITLE_CARD, fontWeight: '800', color: COLORS.TEXT },
  newBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.PRIMARY_LIGHT,
    paddingHorizontal: SPACING.SM,
    paddingVertical: 6,
    borderRadius: RADIUS.CHIP,
  },
  newBtnText: { fontSize: FONT.CAPTION, fontWeight: '700', color: COLORS.PRIMARY },

  emptyCard: {
    backgroundColor: COLORS.WHITE,
    borderRadius: RADIUS.CARD,
    padding: SPACING.LG,
    alignItems: 'center',
    gap: SPACING.XS,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  emptyTitle: { fontSize: FONT.BODY_SM, fontWeight: '700', color: COLORS.TEXT_SECONDARY },
  emptySubtext: { fontSize: FONT.CAPTION, color: COLORS.TEXT_MUTED, textAlign: 'center' },

  listCard: {
    backgroundColor: COLORS.WHITE,
    borderRadius: RADIUS.CARD,
    paddingHorizontal: SPACING.MD,
    paddingVertical: SPACING.SM,
    marginBottom: SPACING.SM,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  listCardExpanded: {
    paddingVertical: SPACING.MD,
  },
  listCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.SM,
    minHeight: 44,
  },
  listName: { flex: 1, fontSize: FONT.BODY_SM, fontWeight: '600', color: COLORS.TEXT },
  countChip: {
    backgroundColor: COLORS.PRIMARY_LIGHT,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: RADIUS.CHIP,
  },
  countChipText: { fontSize: FONT.CAPTION, fontWeight: '700', color: COLORS.PRIMARY },
  iconBtn: { padding: 4 },

  editLabel: {
    fontSize: FONT.CAPTION,
    fontWeight: '700',
    color: COLORS.TEXT_MUTED,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  nameInput: {
    backgroundColor: COLORS.BACKGROUND,
    borderWidth: 1.5,
    borderColor: COLORS.BORDER,
    borderRadius: RADIUS.CARD,
    paddingHorizontal: SPACING.MD,
    paddingVertical: SPACING.SM,
    fontSize: FONT.BODY_SM,
    color: COLORS.TEXT,
    minHeight: 48,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    gap: SPACING.SM,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.BORDER,
  },
  itemText: { flex: 1, fontSize: FONT.BODY_SM, color: COLORS.TEXT },
  removeBtn: { padding: 2 },

  addItemRow: { flexDirection: 'row', gap: SPACING.XS, alignItems: 'center' },
  addItemInput: {
    flex: 1,
    backgroundColor: COLORS.BACKGROUND,
    borderWidth: 1.5,
    borderColor: COLORS.BORDER,
    borderRadius: RADIUS.CARD,
    paddingHorizontal: SPACING.MD,
    paddingVertical: SPACING.SM,
    fontSize: FONT.BODY_SM,
    color: COLORS.TEXT,
    minHeight: 48,
  },
  addItemBtn: {
    backgroundColor: COLORS.PRIMARY,
    width: 48,
    height: 48,
    borderRadius: RADIUS.CARD,
    alignItems: 'center',
    justifyContent: 'center',
  },

  cardActions: {
    flexDirection: 'row',
    gap: SPACING.SM,
    marginTop: SPACING.MD,
    paddingTop: SPACING.SM,
    borderTopWidth: 1,
    borderTopColor: COLORS.BORDER,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: RADIUS.BUTTON,
    borderWidth: 1.5,
    borderColor: COLORS.BORDER,
    alignItems: 'center',
  },
  cancelBtnText: { fontSize: FONT.BODY_SM, fontWeight: '600', color: COLORS.TEXT_SECONDARY },
  saveBtn: {
    flex: 2,
    flexDirection: 'row',
    backgroundColor: COLORS.PRIMARY,
    borderRadius: RADIUS.BUTTON,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  saveBtnText: { fontSize: FONT.BODY_SM, fontWeight: '700', color: COLORS.WHITE },
});
