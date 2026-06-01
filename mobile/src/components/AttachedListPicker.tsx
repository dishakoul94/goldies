import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AttachedList, AttachedListItem, TemplateList } from '../types';
import { loadAllLists } from '../storage';
import { COLORS, FONT, SPACING, RADIUS } from '../utils/theme';

const makeId = () => Math.random().toString(36).slice(2);

interface Props {
  value: AttachedList | null;
  onChange: (v: AttachedList | null) => void;
}

type Phase = 'collapsed' | 'picking' | 'editing';

export default function AttachedListPicker({ value, onChange }: Props) {
  const [lists, setLists] = useState<TemplateList[]>([]);
  const [phase, setPhase] = useState<Phase>('collapsed');
  const [newItemText, setNewItemText] = useState('');

  useEffect(() => {
    loadAllLists().then(setLists);
  }, []);

  // If a value arrives (e.g. pre-populated from edit screen), stay collapsed.
  // If value is set externally and we're still picking, move to editing.
  useEffect(() => {
    if (value && phase === 'picking') setPhase('editing');
  }, [value]);

  const handleSelectTemplate = (template: TemplateList) => {
    const snapshot: AttachedList = {
      templateListId: template.id,
      name: template.name,
      items: template.items.map(item => ({
        id: item.id,
        title: item.title,
        completed: false,
      })),
    };
    onChange(snapshot);
    setPhase('editing');
    setNewItemText('');
  };

  const handleBlankList = () => {
    const snapshot: AttachedList = { name: 'Checklist', items: [] };
    onChange(snapshot);
    setPhase('editing');
    setNewItemText('');
  };

  const handleToggleItem = (itemId: string) => {
    if (!value) return;
    onChange({
      ...value,
      items: value.items.map(i => (i.id === itemId ? { ...i, completed: !i.completed } : i)),
    });
  };

  const handleRemoveItem = (itemId: string) => {
    if (!value) return;
    onChange({ ...value, items: value.items.filter(i => i.id !== itemId) });
  };

  const handleAddItem = () => {
    const text = newItemText.trim();
    if (!text || !value) return;
    const newItem: AttachedListItem = { id: makeId(), title: text, completed: false, isCustom: true };
    onChange({ ...value, items: [...value.items, newItem] });
    setNewItemText('');
  };

  const handleRemove = () => {
    onChange(null);
    setPhase('collapsed');
    setNewItemText('');
  };

  // ── Collapsed ───────────────────────────────────────────────────────────────

  if (phase === 'collapsed') {
    if (!value) {
      return (
        <TouchableOpacity style={styles.summaryBtn} onPress={() => setPhase('picking')}>
          <Ionicons name="list-outline" size={20} color={COLORS.TEXT_MUTED} />
          <Text style={styles.summaryPlaceholder}>Attach a checklist (optional)</Text>
          <Ionicons name="chevron-down" size={16} color={COLORS.TEXT_MUTED} />
        </TouchableOpacity>
      );
    }
    const done = value.items.filter(i => i.completed).length;
    const total = value.items.length;
    return (
      <View style={styles.selectedCard}>
        <Ionicons name="checkmark-done-outline" size={20} color={COLORS.PRIMARY} />
        <View style={styles.selectedInfo}>
          <Text style={styles.selectedName}>{value.name}</Text>
          <Text style={styles.selectedSub}>{done}/{total} done</Text>
        </View>
        <TouchableOpacity onPress={() => setPhase('editing')} style={styles.selectedChangeBtn}>
          <Text style={styles.selectedChangeBtnText}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={handleRemove} style={styles.clearBtn}>
          <Ionicons name="close-circle" size={20} color={COLORS.TEXT_MUTED} />
        </TouchableOpacity>
      </View>
    );
  }

  // ── Picking ──────────────────────────────────────────────────────────────────

  if (phase === 'picking') {
    return (
      <View style={styles.expandedPanel}>
        {lists.length > 0 ? (
          <>
            <Text style={styles.panelSectionLabel}>My Lists</Text>
            {lists.map(l => (
              <TouchableOpacity
                key={l.id}
                style={styles.listRow}
                onPress={() => handleSelectTemplate(l)}
                activeOpacity={0.7}
              >
                <View style={styles.listRowIcon}>
                  <Ionicons name="list-outline" size={18} color={COLORS.PRIMARY} />
                </View>
                <Text style={styles.listRowName}>{l.name}</Text>
                <Text style={styles.listRowCount}>{l.items.length} items</Text>
                <Ionicons name="chevron-forward" size={14} color={COLORS.TEXT_MUTED} />
              </TouchableOpacity>
            ))}
            <View style={styles.divider} />
          </>
        ) : (
          <Text style={styles.noListsNote}>
            No lists yet — create one in Profile → Template Lists
          </Text>
        )}

        <TouchableOpacity style={styles.listRow} onPress={handleBlankList} activeOpacity={0.7}>
          <View style={[styles.listRowIcon, { borderWidth: 2, borderColor: COLORS.PRIMARY, backgroundColor: 'transparent' }]}>
            <Ionicons name="add" size={18} color={COLORS.PRIMARY} />
          </View>
          <Text style={[styles.listRowName, { color: COLORS.PRIMARY }]}>Start with a blank list</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.cancelRow} onPress={() => setPhase('collapsed')}>
          <Text style={styles.cancelLabel}>Cancel</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Editing ──────────────────────────────────────────────────────────────────

  if (!value) return null;

  return (
    <View style={styles.expandedPanel}>
      <Text style={styles.panelSectionLabel}>List name</Text>
      <TextInput
        style={styles.miniInput}
        value={value.name}
        onChangeText={text => onChange({ ...value, name: text })}
        placeholder="Checklist name"
        placeholderTextColor={COLORS.TEXT_MUTED}
        returnKeyType="done"
      />

      {value.items.length > 0 && (
        <>
          <Text style={[styles.panelSectionLabel, { marginTop: SPACING.SM }]}>Items</Text>
          {value.items.map(item => (
            <TouchableOpacity
              key={item.id}
              style={styles.checkRow}
              onPress={() => handleToggleItem(item.id)}
              activeOpacity={0.7}
            >
              <Ionicons
                name={item.completed ? 'checkbox' : 'square-outline'}
                size={22}
                color={item.completed ? COLORS.INTERDAY : COLORS.BORDER}
              />
              <Text style={[styles.checkText, item.completed && styles.checkTextDone]}>
                {item.title}
              </Text>
              {item.isCustom && <Text style={styles.customTag}>custom</Text>}
              <TouchableOpacity onPress={() => handleRemoveItem(item.id)} style={styles.removeBtn}>
                <Ionicons name="close-circle" size={16} color={COLORS.TEXT_MUTED} />
              </TouchableOpacity>
            </TouchableOpacity>
          ))}
        </>
      )}

      <Text style={[styles.panelSectionLabel, { marginTop: SPACING.SM }]}>Add item</Text>
      <View style={styles.addItemRow}>
        <TextInput
          style={[styles.miniInput, { flex: 1, marginBottom: 0 }]}
          value={newItemText}
          onChangeText={setNewItemText}
          placeholder="Item name"
          placeholderTextColor={COLORS.TEXT_MUTED}
          returnKeyType="done"
          onSubmitEditing={handleAddItem}
          blurOnSubmit={false}
        />
        <TouchableOpacity
          style={[styles.addBtn, !newItemText.trim() && { opacity: 0.4 }]}
          onPress={handleAddItem}
          disabled={!newItemText.trim()}
        >
          <Ionicons name="add" size={20} color={COLORS.WHITE} />
        </TouchableOpacity>
      </View>

      <View style={styles.divider} />

      <TouchableOpacity style={styles.removeListRow} onPress={handleRemove}>
        <Ionicons name="trash-outline" size={16} color={COLORS.DANGER} />
        <Text style={styles.removeListLabel}>Remove checklist</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.cancelRow} onPress={() => setPhase('collapsed')}>
        <Text style={[styles.cancelLabel, { color: COLORS.PRIMARY, fontWeight: '700' }]}>Done</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  // Collapsed — no selection
  summaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.WHITE,
    borderWidth: 1.5,
    borderColor: COLORS.BORDER,
    borderRadius: RADIUS.CARD,
    paddingHorizontal: SPACING.MD,
    paddingVertical: SPACING.SM,
    gap: SPACING.SM,
    minHeight: 56,
  },
  summaryPlaceholder: { flex: 1, fontSize: FONT.BODY_SM, color: COLORS.TEXT_MUTED },

  // Collapsed — list selected
  selectedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.PRIMARY_LIGHT,
    borderWidth: 1.5,
    borderColor: COLORS.PRIMARY,
    borderRadius: RADIUS.CARD,
    paddingHorizontal: SPACING.MD,
    paddingVertical: SPACING.SM,
    gap: SPACING.SM,
    minHeight: 56,
  },
  selectedInfo: { flex: 1 },
  selectedName: { fontSize: FONT.BODY_SM, fontWeight: '700', color: COLORS.TEXT },
  selectedSub: { fontSize: FONT.CAPTION, color: COLORS.TEXT_MUTED, marginTop: 1 },
  selectedChangeBtn: { paddingHorizontal: SPACING.XS, paddingVertical: 4 },
  selectedChangeBtnText: { fontSize: FONT.CAPTION, fontWeight: '700', color: COLORS.PRIMARY },
  clearBtn: { padding: 4 },

  // Expanded panel (picking + editing)
  expandedPanel: {
    backgroundColor: COLORS.WHITE,
    borderWidth: 1.5,
    borderColor: COLORS.BORDER,
    borderRadius: RADIUS.CARD,
    paddingVertical: SPACING.SM,
    overflow: 'hidden',
  },
  panelSectionLabel: {
    fontSize: FONT.CAPTION,
    fontWeight: '700',
    color: COLORS.TEXT_MUTED,
    paddingHorizontal: SPACING.MD,
    paddingVertical: SPACING.XS,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  noListsNote: {
    fontSize: FONT.CAPTION,
    color: COLORS.TEXT_MUTED,
    paddingHorizontal: SPACING.MD,
    paddingVertical: SPACING.SM,
    fontStyle: 'italic',
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.MD,
    paddingVertical: SPACING.SM,
    gap: SPACING.SM,
  },
  listRowIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.PRIMARY_LIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  listRowName: { flex: 1, fontSize: FONT.BODY_SM, fontWeight: '600', color: COLORS.TEXT },
  listRowCount: { fontSize: FONT.CAPTION, color: COLORS.TEXT_MUTED },
  divider: { height: 1, backgroundColor: COLORS.BORDER, marginVertical: SPACING.XS },
  cancelRow: { alignItems: 'center', paddingVertical: SPACING.SM },
  cancelLabel: { fontSize: FONT.BODY_SM, color: COLORS.TEXT_MUTED, fontWeight: '600' },

  // Editing — mini input (matches ServiceProviderPicker miniInput)
  miniInput: {
    marginHorizontal: SPACING.MD,
    marginBottom: SPACING.XS,
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
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.MD,
    paddingVertical: 8,
    gap: SPACING.SM,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.BORDER,
  },
  checkText: { flex: 1, fontSize: FONT.BODY_SM, color: COLORS.TEXT },
  checkTextDone: { color: COLORS.TEXT_MUTED, textDecorationLine: 'line-through' },
  customTag: { fontSize: FONT.CAPTION, color: COLORS.TEXT_MUTED, fontStyle: 'italic' },
  removeBtn: { padding: 2 },

  addItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.XS,
    marginHorizontal: SPACING.MD,
    marginBottom: SPACING.XS,
  },
  addBtn: {
    backgroundColor: COLORS.PRIMARY,
    width: 48,
    height: 48,
    borderRadius: RADIUS.CARD,
    alignItems: 'center',
    justifyContent: 'center',
  },

  removeListRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: SPACING.SM,
  },
  removeListLabel: { fontSize: FONT.BODY_SM, fontWeight: '600', color: COLORS.DANGER },
});
