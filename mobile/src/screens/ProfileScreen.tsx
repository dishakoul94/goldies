import React, { useState, useCallback } from 'react';
import {
  View, Text, TextInput, ScrollView, StyleSheet, TouchableOpacity, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { format, parseISO } from 'date-fns';
import DateTimePickerCompat from '../components/DateTimePickerCompat';
import { RootStackParamList, UserProfile, ServiceProvider } from '../types';
import {
  loadUserProfile, saveUserProfile, loadServiceProviders, deleteServiceProvider,
} from '../storage';
import { COLORS, FONT, SPACING, RADIUS } from '../utils/theme';
import { showAlert, showConfirm } from '../utils/alert';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export default function ProfileScreen() {
  const navigation = useNavigation<Nav>();
  const [profile, setProfile] = useState<UserProfile>({ firstName: '', lastName: '' });
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<UserProfile>({ firstName: '', lastName: '' });
  const [showDobPicker, setShowDobPicker] = useState(false);
  const [providers, setProviders] = useState<ServiceProvider[]>([]);
  const [saving, setSaving] = useState(false);

  useFocusEffect(
    useCallback(() => {
      loadUserProfile().then(p => {
        if (p) { setProfile(p); setDraft(p); }
      });
      loadServiceProviders().then(setProviders);
    }, []),
  );

  const startEdit = () => {
    setDraft(profile);
    setEditing(true);
  };

  const cancelEdit = () => {
    setDraft(profile);
    setEditing(false);
    setShowDobPicker(false);
  };

  const handleSaveProfile = async () => {
    if (!draft.firstName.trim()) {
      showAlert('First name is required');
      return;
    }
    setSaving(true);
    try {
      const updated: UserProfile = {
        firstName: draft.firstName.trim(),
        lastName: draft.lastName.trim(),
        dateOfBirth: draft.dateOfBirth,
        email: draft.email?.trim() || undefined,
      };
      await saveUserProfile(updated);
      setProfile(updated);
      setEditing(false);
      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteProvider = (provider: ServiceProvider) => {
    showConfirm(
      'Remove Provider',
      `Remove ${provider.name} from your contacts?`,
      async () => {
        if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        await deleteServiceProvider(provider.id);
        setProviders(prev => prev.filter(p => p.id !== provider.id));
      },
      'Remove',
    );
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── User Profile ── */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>My Profile</Text>
          {!editing && (
            <TouchableOpacity style={styles.actionBtn} onPress={startEdit}>
              <Ionicons name="pencil-outline" size={16} color={COLORS.PRIMARY} />
              <Text style={styles.actionBtnText}>Edit</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.card}>
          {editing ? (
            <>
              <Field label="First Name">
                <TextInput
                  style={styles.input}
                  value={draft.firstName}
                  onChangeText={v => setDraft(d => ({ ...d, firstName: v }))}
                  placeholder="First name"
                  placeholderTextColor={COLORS.TEXT_MUTED}
                  returnKeyType="next"
                  autoFocus
                />
              </Field>
              <Field label="Last Name">
                <TextInput
                  style={styles.input}
                  value={draft.lastName}
                  onChangeText={v => setDraft(d => ({ ...d, lastName: v }))}
                  placeholder="Last name"
                  placeholderTextColor={COLORS.TEXT_MUTED}
                  returnKeyType="next"
                />
              </Field>
              <Field label="Date of Birth">
                <TouchableOpacity style={styles.pickerBtn} onPress={() => setShowDobPicker(true)}>
                  <Ionicons name="calendar-outline" size={20} color={COLORS.PRIMARY} />
                  <Text style={styles.pickerBtnText}>
                    {draft.dateOfBirth
                      ? format(parseISO(draft.dateOfBirth), 'MMMM d, yyyy')
                      : 'Select date of birth'}
                  </Text>
                </TouchableOpacity>
                {showDobPicker && (
                  <DateTimePickerCompat
                    value={draft.dateOfBirth ? parseISO(draft.dateOfBirth) : new Date()}
                    mode="date"
                    onChange={d => setDraft(prev => ({ ...prev, dateOfBirth: format(d, 'yyyy-MM-dd') }))}
                    onClose={() => setShowDobPicker(false)}
                  />
                )}
              </Field>
              <Field label="Email">
                <TextInput
                  style={styles.input}
                  value={draft.email ?? ''}
                  onChangeText={v => setDraft(d => ({ ...d, email: v }))}
                  placeholder="email@example.com"
                  placeholderTextColor={COLORS.TEXT_MUTED}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  returnKeyType="done"
                />
              </Field>
              <View style={styles.editActions}>
                <TouchableOpacity style={styles.cancelBtn} onPress={cancelEdit}>
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.saveProfileBtn, saving && { opacity: 0.6 }]}
                  onPress={handleSaveProfile}
                  disabled={saving}
                >
                  <Ionicons name="checkmark" size={18} color={COLORS.WHITE} />
                  <Text style={styles.saveProfileBtnText}>{saving ? 'Saving…' : 'Save'}</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <>
              <ProfileRow
                icon="person-outline"
                label="Name"
                value={[profile.firstName, profile.lastName].filter(Boolean).join(' ') || '—'}
              />
              <ProfileRow
                icon="calendar-outline"
                label="Date of Birth"
                value={profile.dateOfBirth ? format(parseISO(profile.dateOfBirth), 'MMMM d, yyyy') : '—'}
              />
              <ProfileRow
                icon="mail-outline"
                label="Email"
                value={profile.email || '—'}
                last
              />
            </>
          )}
        </View>

        {/* ── Service Providers ── */}
        <View style={[styles.sectionHeader, { marginTop: SPACING.LG }]}>
          <Text style={styles.sectionTitle}>Service Providers</Text>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => navigation.navigate('ServiceProviderForm', {})}
          >
            <Ionicons name="add" size={18} color={COLORS.PRIMARY} />
            <Text style={styles.actionBtnText}>Add</Text>
          </TouchableOpacity>
        </View>

        {providers.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="people-outline" size={40} color={COLORS.TEXT_MUTED} />
            <Text style={styles.emptyTitle}>No service providers yet</Text>
            <Text style={styles.emptySubtext}>Add doctors, therapists, and other contacts</Text>
          </View>
        ) : (
          providers.map(provider => (
            <ProviderCard
              key={provider.id}
              provider={provider}
              onEdit={() => navigation.navigate('ServiceProviderForm', { providerId: provider.id })}
              onDelete={() => handleDeleteProvider(provider)}
            />
          ))
        )}

        <View style={{ height: SPACING.XL }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

function ProfileRow({
  icon, label, value, last,
}: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string; last?: boolean }) {
  return (
    <View style={[styles.profileRow, !last && styles.profileRowBorder]}>
      <Ionicons name={icon} size={20} color={COLORS.PRIMARY} style={styles.profileRowIcon} />
      <View style={styles.profileRowText}>
        <Text style={styles.profileRowLabel}>{label}</Text>
        <Text style={styles.profileRowValue}>{value}</Text>
      </View>
    </View>
  );
}

function ProviderCard({
  provider, onEdit, onDelete,
}: { provider: ServiceProvider; onEdit: () => void; onDelete: () => void }) {
  return (
    <View style={styles.providerCard}>
      <View style={styles.providerCardLeft}>
        <View style={styles.providerAvatar}>
          <Text style={styles.providerAvatarText}>
            {provider.name.charAt(0).toUpperCase()}
          </Text>
        </View>
        <View style={styles.providerInfo}>
          <Text style={styles.providerName}>{provider.name}</Text>
          {provider.specialty ? (
            <Text style={styles.providerSpecialty}>{provider.specialty}</Text>
          ) : null}
          {provider.phone ? (
            <View style={styles.providerDetailRow}>
              <Ionicons name="call-outline" size={13} color={COLORS.TEXT_MUTED} />
              <Text style={styles.providerDetail}>{provider.phone}</Text>
            </View>
          ) : null}
          {provider.email ? (
            <View style={styles.providerDetailRow}>
              <Ionicons name="mail-outline" size={13} color={COLORS.TEXT_MUTED} />
              <Text style={styles.providerDetail}>{provider.email}</Text>
            </View>
          ) : null}
          {provider.address ? (
            <View style={styles.providerDetailRow}>
              <Ionicons name="location-outline" size={13} color={COLORS.TEXT_MUTED} />
              <Text style={styles.providerDetail}>{provider.address}</Text>
            </View>
          ) : null}
        </View>
      </View>
      <View style={styles.providerCardActions}>
        <TouchableOpacity style={styles.providerActionBtn} onPress={onEdit}>
          <Ionicons name="pencil-outline" size={18} color={COLORS.PRIMARY} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.providerActionBtn} onPress={onDelete}>
          <Ionicons name="trash-outline" size={18} color={COLORS.DANGER} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.BACKGROUND },
  scroll: { flex: 1 },
  container: { padding: SPACING.MD, paddingTop: SPACING.LG },

  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.SM,
  },
  sectionTitle: {
    fontSize: FONT.TITLE_CARD,
    fontWeight: '800',
    color: COLORS.TEXT,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: COLORS.PRIMARY_LIGHT,
    paddingHorizontal: SPACING.SM,
    paddingVertical: 6,
    borderRadius: RADIUS.CHIP,
  },
  actionBtnText: { fontSize: FONT.CAPTION, fontWeight: '700', color: COLORS.PRIMARY },

  card: {
    backgroundColor: COLORS.CARD,
    borderRadius: RADIUS.CARD,
    paddingHorizontal: SPACING.MD,
    paddingVertical: SPACING.SM,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },

  // Profile view rows
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.SM,
  },
  profileRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: COLORS.BORDER,
  },
  profileRowIcon: { marginRight: SPACING.SM },
  profileRowText: { flex: 1 },
  profileRowLabel: {
    fontSize: FONT.CAPTION,
    fontWeight: '600',
    color: COLORS.TEXT_MUTED,
    marginBottom: 2,
  },
  profileRowValue: { fontSize: FONT.BODY_SM, fontWeight: '500', color: COLORS.TEXT },

  // Edit form
  field: { marginBottom: SPACING.SM },
  fieldLabel: {
    fontSize: FONT.CAPTION,
    fontWeight: '700',
    color: COLORS.TEXT,
    marginBottom: 6,
  },
  input: {
    backgroundColor: COLORS.BACKGROUND,
    borderWidth: 1.5,
    borderColor: COLORS.BORDER,
    borderRadius: RADIUS.CARD,
    paddingHorizontal: SPACING.MD,
    paddingVertical: SPACING.SM,
    fontSize: FONT.BODY_SM,
    color: COLORS.TEXT,
    minHeight: 52,
  },
  pickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.BACKGROUND,
    borderWidth: 1.5,
    borderColor: COLORS.BORDER,
    borderRadius: RADIUS.CARD,
    paddingHorizontal: SPACING.MD,
    paddingVertical: SPACING.SM,
    gap: SPACING.SM,
    minHeight: 52,
  },
  pickerBtnText: { fontSize: FONT.BODY_SM, color: COLORS.TEXT },
  editActions: {
    flexDirection: 'row',
    gap: SPACING.SM,
    marginTop: SPACING.SM,
    paddingTop: SPACING.SM,
    borderTopWidth: 1,
    borderTopColor: COLORS.BORDER,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: RADIUS.BUTTON,
    borderWidth: 1.5,
    borderColor: COLORS.BORDER,
    alignItems: 'center',
  },
  cancelBtnText: { fontSize: FONT.BODY_SM, fontWeight: '600', color: COLORS.TEXT_SECONDARY },
  saveProfileBtn: {
    flex: 2,
    flexDirection: 'row',
    backgroundColor: COLORS.PRIMARY,
    borderRadius: RADIUS.BUTTON,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  saveProfileBtnText: { fontSize: FONT.BODY_SM, fontWeight: '700', color: COLORS.WHITE },

  // Empty state
  emptyCard: {
    backgroundColor: COLORS.CARD,
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

  // Provider card
  providerCard: {
    backgroundColor: COLORS.CARD,
    borderRadius: RADIUS.CARD,
    padding: SPACING.MD,
    marginBottom: SPACING.SM,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  providerCardLeft: { flexDirection: 'row', flex: 1, gap: SPACING.SM },
  providerAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.PRIMARY_LIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  providerAvatarText: {
    fontSize: FONT.BODY,
    fontWeight: '800',
    color: COLORS.PRIMARY,
  },
  providerInfo: { flex: 1 },
  providerName: { fontSize: FONT.BODY_SM, fontWeight: '700', color: COLORS.TEXT },
  providerSpecialty: {
    fontSize: FONT.CAPTION,
    fontWeight: '600',
    color: COLORS.PRIMARY,
    marginTop: 2,
    marginBottom: 4,
  },
  providerDetailRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  providerDetail: { fontSize: FONT.CAPTION, color: COLORS.TEXT_SECONDARY },
  providerCardActions: { flexDirection: 'row', gap: SPACING.XS, marginLeft: SPACING.SM },
  providerActionBtn: { padding: SPACING.XS },
});
