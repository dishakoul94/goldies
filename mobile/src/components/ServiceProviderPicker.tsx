import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ServiceProvider } from '../types';
import { loadServiceProviders } from '../storage';
import { COLORS, FONT, SPACING, RADIUS } from '../utils/theme';

export type ProviderSelection =
  | { type: 'none' }
  | { type: 'existing'; providerId: string }
  | { type: 'new'; draft: { name: string; specialty: string; phone: string } };

interface Props {
  value: ProviderSelection;
  onChange: (v: ProviderSelection) => void;
}

export default function ServiceProviderPicker({ value, onChange }: Props) {
  const [providers, setProviders] = useState<ServiceProvider[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [showNewForm, setShowNewForm] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [draftSpecialty, setDraftSpecialty] = useState('');
  const [draftPhone, setDraftPhone] = useState('');

  useEffect(() => {
    loadServiceProviders().then(setProviders);
  }, []);

  // Sync new-form fields when value is type 'new' (e.g. on edit screen pre-population)
  useEffect(() => {
    if (value.type === 'new') {
      setDraftName(value.draft.name);
      setDraftSpecialty(value.draft.specialty);
      setDraftPhone(value.draft.phone);
    }
  }, []);

  const selectedProvider =
    value.type === 'existing'
      ? providers.find(p => p.id === value.providerId)
      : undefined;

  const handleSelectExisting = (provider: ServiceProvider) => {
    onChange({ type: 'existing', providerId: provider.id });
    setExpanded(false);
    setShowNewForm(false);
  };

  const handleStartNew = () => {
    setShowNewForm(true);
    setDraftName('');
    setDraftSpecialty('');
    setDraftPhone('');
  };

  const handleConfirmNew = () => {
    if (!draftName.trim()) return;
    onChange({ type: 'new', draft: { name: draftName, specialty: draftSpecialty, phone: draftPhone } });
    setExpanded(false);
    setShowNewForm(false);
  };

  const handleClear = () => {
    onChange({ type: 'none' });
    setExpanded(false);
    setShowNewForm(false);
  };

  // ── Summary button (collapsed state) ──────────────────────────────────────

  const renderSummary = () => {
    if (value.type === 'none') {
      return (
        <TouchableOpacity style={styles.summaryBtn} onPress={() => setExpanded(true)}>
          <Ionicons name="person-add-outline" size={20} color={COLORS.TEXT_MUTED} />
          <Text style={styles.summaryPlaceholder}>Link a service provider (optional)</Text>
          <Ionicons name="chevron-down" size={16} color={COLORS.TEXT_MUTED} />
        </TouchableOpacity>
      );
    }

    if (value.type === 'existing' && selectedProvider) {
      return (
        <View style={styles.selectedCard}>
          <View style={styles.selectedAvatar}>
            <Text style={styles.selectedAvatarText}>{selectedProvider.name.charAt(0).toUpperCase()}</Text>
          </View>
          <View style={styles.selectedInfo}>
            <Text style={styles.selectedName}>{selectedProvider.name}</Text>
            {selectedProvider.specialty ? (
              <Text style={styles.selectedSub}>{selectedProvider.specialty}</Text>
            ) : null}
          </View>
          <TouchableOpacity onPress={() => setExpanded(true)} style={styles.selectedChangeBtn}>
            <Text style={styles.selectedChangeBtnText}>Change</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleClear} style={styles.clearBtn}>
            <Ionicons name="close-circle" size={20} color={COLORS.TEXT_MUTED} />
          </TouchableOpacity>
        </View>
      );
    }

    if (value.type === 'new') {
      return (
        <View style={styles.selectedCard}>
          <View style={[styles.selectedAvatar, { backgroundColor: COLORS.INTERDAY + '22' }]}>
            <Text style={[styles.selectedAvatarText, { color: COLORS.INTERDAY }]}>
              {value.draft.name.charAt(0).toUpperCase()}
            </Text>
          </View>
          <View style={styles.selectedInfo}>
            <Text style={styles.selectedName}>{value.draft.name}</Text>
            <Text style={[styles.selectedSub, { color: COLORS.INTERDAY }]}>New — will be saved</Text>
          </View>
          <TouchableOpacity onPress={() => { setShowNewForm(true); setExpanded(true); }} style={styles.selectedChangeBtn}>
            <Text style={styles.selectedChangeBtnText}>Edit</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleClear} style={styles.clearBtn}>
            <Ionicons name="close-circle" size={20} color={COLORS.TEXT_MUTED} />
          </TouchableOpacity>
        </View>
      );
    }

    // Fallback for existing provider that hasn't loaded yet
    return (
      <TouchableOpacity style={styles.summaryBtn} onPress={() => setExpanded(true)}>
        <Ionicons name="person-outline" size={20} color={COLORS.PRIMARY} />
        <Text style={styles.summaryText}>Provider linked</Text>
        <Ionicons name="chevron-down" size={16} color={COLORS.TEXT_MUTED} />
      </TouchableOpacity>
    );
  };

  // ── Expanded picker ────────────────────────────────────────────────────────

  const renderExpanded = () => (
    <View style={styles.expandedPanel}>
      {!showNewForm ? (
        <>
          {providers.length > 0 && (
            <>
              <Text style={styles.panelSectionLabel}>Saved providers</Text>
              {providers.map(p => {
                const isSelected = value.type === 'existing' && value.providerId === p.id;
                return (
                  <TouchableOpacity
                    key={p.id}
                    style={[styles.providerRow, isSelected && styles.providerRowSelected]}
                    onPress={() => handleSelectExisting(p)}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.rowAvatar, isSelected && { backgroundColor: COLORS.PRIMARY }]}>
                      <Text style={[styles.rowAvatarText, isSelected && { color: COLORS.WHITE }]}>
                        {p.name.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <View style={styles.rowInfo}>
                      <Text style={[styles.rowName, isSelected && { color: COLORS.PRIMARY }]}>{p.name}</Text>
                      {p.specialty ? <Text style={styles.rowSub}>{p.specialty}</Text> : null}
                    </View>
                    {isSelected && (
                      <Ionicons name="checkmark-circle" size={20} color={COLORS.PRIMARY} />
                    )}
                  </TouchableOpacity>
                );
              })}
              <View style={styles.divider} />
            </>
          )}

          <TouchableOpacity style={styles.addNewRow} onPress={handleStartNew}>
            <View style={styles.addNewIcon}>
              <Ionicons name="add" size={18} color={COLORS.PRIMARY} />
            </View>
            <Text style={styles.addNewLabel}>Add a new provider</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.cancelRow} onPress={() => setExpanded(false)}>
            <Text style={styles.cancelLabel}>Cancel</Text>
          </TouchableOpacity>
        </>
      ) : (
        <>
          <Text style={styles.panelSectionLabel}>New provider</Text>

          <TextInput
            style={styles.miniInput}
            value={draftName}
            onChangeText={setDraftName}
            placeholder="Name *"
            placeholderTextColor={COLORS.TEXT_MUTED}
            returnKeyType="next"
            autoFocus
          />
          <TextInput
            style={styles.miniInput}
            value={draftSpecialty}
            onChangeText={setDraftSpecialty}
            placeholder="Specialty (e.g. Cardiologist)"
            placeholderTextColor={COLORS.TEXT_MUTED}
            returnKeyType="next"
          />
          <TextInput
            style={styles.miniInput}
            value={draftPhone}
            onChangeText={setDraftPhone}
            placeholder="Phone"
            placeholderTextColor={COLORS.TEXT_MUTED}
            keyboardType="phone-pad"
            returnKeyType="done"
          />

          <View style={styles.newFormActions}>
            <TouchableOpacity
              style={styles.newFormCancelBtn}
              onPress={() => setShowNewForm(false)}
            >
              <Text style={styles.cancelLabel}>Back</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.newFormConfirmBtn, !draftName.trim() && { opacity: 0.4 }]}
              onPress={handleConfirmNew}
              disabled={!draftName.trim()}
            >
              <Ionicons name="checkmark" size={16} color={COLORS.WHITE} />
              <Text style={styles.newFormConfirmText}>Use this provider</Text>
            </TouchableOpacity>
          </View>
        </>
      )}
    </View>
  );

  return (
    <View>
      {!expanded && renderSummary()}
      {expanded && renderExpanded()}
    </View>
  );
}

const styles = StyleSheet.create({
  // Summary (collapsed)
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
  summaryText: { flex: 1, fontSize: FONT.BODY_SM, color: COLORS.TEXT },

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
  selectedAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.PRIMARY,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  selectedAvatarText: { fontSize: FONT.BODY_SM, fontWeight: '800', color: COLORS.WHITE },
  selectedInfo: { flex: 1 },
  selectedName: { fontSize: FONT.BODY_SM, fontWeight: '700', color: COLORS.TEXT },
  selectedSub: { fontSize: FONT.CAPTION, color: COLORS.TEXT_MUTED, marginTop: 1 },
  selectedChangeBtn: {
    paddingHorizontal: SPACING.XS,
    paddingVertical: 4,
  },
  selectedChangeBtnText: { fontSize: FONT.CAPTION, fontWeight: '700', color: COLORS.PRIMARY },
  clearBtn: { padding: 4 },

  // Expanded panel
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
  providerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.MD,
    paddingVertical: SPACING.SM,
    gap: SPACING.SM,
  },
  providerRowSelected: {
    backgroundColor: COLORS.PRIMARY_LIGHT,
  },
  rowAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.BORDER,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  rowAvatarText: { fontSize: FONT.BODY_SM, fontWeight: '700', color: COLORS.TEXT_MUTED },
  rowInfo: { flex: 1 },
  rowName: { fontSize: FONT.BODY_SM, fontWeight: '600', color: COLORS.TEXT },
  rowSub: { fontSize: FONT.CAPTION, color: COLORS.TEXT_MUTED, marginTop: 1 },
  divider: { height: 1, backgroundColor: COLORS.BORDER, marginVertical: SPACING.XS },
  addNewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.MD,
    paddingVertical: SPACING.SM,
    gap: SPACING.SM,
  },
  addNewIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: COLORS.PRIMARY,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  addNewLabel: { fontSize: FONT.BODY_SM, fontWeight: '600', color: COLORS.PRIMARY },
  cancelRow: {
    alignItems: 'center',
    paddingVertical: SPACING.SM,
  },
  cancelLabel: { fontSize: FONT.BODY_SM, color: COLORS.TEXT_MUTED, fontWeight: '600' },

  // New provider mini-form
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
  newFormActions: {
    flexDirection: 'row',
    gap: SPACING.XS,
    marginHorizontal: SPACING.MD,
    marginTop: SPACING.XS,
    marginBottom: SPACING.XS,
  },
  newFormCancelBtn: {
    paddingVertical: 12,
    paddingHorizontal: SPACING.SM,
    alignItems: 'center',
  },
  newFormConfirmBtn: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: COLORS.PRIMARY,
    borderRadius: RADIUS.BUTTON,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  newFormConfirmText: { fontSize: FONT.BODY_SM, fontWeight: '700', color: COLORS.WHITE },
});
