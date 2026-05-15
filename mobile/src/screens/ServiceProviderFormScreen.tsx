import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, ScrollView, StyleSheet, TouchableOpacity,
  Platform, KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { RootStackParamList, ServiceProvider } from '../types';
import {
  getServiceProviderById, addServiceProvider, updateServiceProvider,
} from '../storage';
import { COLORS, FONT, SPACING, RADIUS } from '../utils/theme';
import { showAlert } from '../utils/alert';

type RouteParams = RouteProp<RootStackParamList, 'ServiceProviderForm'>;

function makeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export default function ServiceProviderFormScreen() {
  const navigation = useNavigation();
  const route = useRoute<RouteParams>();
  const providerId = route.params?.providerId;
  const isEditing = Boolean(providerId);

  const [name, setName] = useState('');
  const [specialty, setSpecialty] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (providerId) {
      getServiceProviderById(providerId).then(p => {
        if (p) {
          setName(p.name);
          setSpecialty(p.specialty ?? '');
          setPhone(p.phone ?? '');
          setEmail(p.email ?? '');
          setAddress(p.address ?? '');
          setNotes(p.notes ?? '');
        }
      });
    }
  }, [providerId]);

  const handleSave = async () => {
    if (!name.trim()) {
      showAlert('Name is required');
      return;
    }
    setSaving(true);
    try {
      const provider: ServiceProvider = {
        id: providerId ?? makeId(),
        name: name.trim(),
        specialty: specialty.trim() || undefined,
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        address: address.trim() || undefined,
        notes: notes.trim() || undefined,
        createdAt: new Date().toISOString(),
      };

      if (isEditing) {
        await updateServiceProvider(provider);
      } else {
        await addServiceProvider(provider);
      }

      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      navigation.goBack();
    } catch {
      showAlert('Error', 'Could not save provider. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.formTitle}>
            {isEditing ? '✏️ Edit Provider' : '👤 New Provider'}
          </Text>

          <Field label="Name *">
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="e.g. Dr. Sarah Johnson"
              placeholderTextColor={COLORS.TEXT_MUTED}
              returnKeyType="next"
              autoFocus
            />
          </Field>

          <Field label="Specialty / Role">
            <TextInput
              style={styles.input}
              value={specialty}
              onChangeText={setSpecialty}
              placeholder="e.g. Cardiologist, Dentist, Therapist"
              placeholderTextColor={COLORS.TEXT_MUTED}
              returnKeyType="next"
            />
          </Field>

          <Field label="Phone">
            <TextInput
              style={styles.input}
              value={phone}
              onChangeText={setPhone}
              placeholder="e.g. (555) 123-4567"
              placeholderTextColor={COLORS.TEXT_MUTED}
              keyboardType="phone-pad"
              returnKeyType="next"
            />
          </Field>

          <Field label="Email">
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="e.g. office@clinic.com"
              placeholderTextColor={COLORS.TEXT_MUTED}
              keyboardType="email-address"
              autoCapitalize="none"
              returnKeyType="next"
            />
          </Field>

          <Field label="Address">
            <TextInput
              style={styles.input}
              value={address}
              onChangeText={setAddress}
              placeholder="e.g. 123 Main St, Springfield"
              placeholderTextColor={COLORS.TEXT_MUTED}
              returnKeyType="next"
            />
          </Field>

          <Field label="Notes (optional)">
            <TextInput
              style={[styles.input, styles.notesInput]}
              value={notes}
              onChangeText={setNotes}
              placeholder="Any extra details..."
              placeholderTextColor={COLORS.TEXT_MUTED}
              multiline
              numberOfLines={3}
            />
          </Field>

          <TouchableOpacity
            style={[styles.saveBtn, saving && { opacity: 0.6 }]}
            onPress={handleSave}
            disabled={saving}
          >
            <Ionicons name="checkmark-circle" size={24} color={COLORS.WHITE} />
            <Text style={styles.saveBtnText}>{saving ? 'Saving…' : 'Save Provider'}</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.BACKGROUND },
  container: { padding: SPACING.MD, paddingBottom: SPACING.XL },
  formTitle: {
    fontSize: FONT.TITLE_CARD,
    fontWeight: '800',
    color: COLORS.TEXT,
    marginBottom: SPACING.LG,
  },
  field: { marginBottom: SPACING.MD },
  fieldLabel: {
    fontSize: FONT.BODY_SM,
    fontWeight: '700',
    color: COLORS.TEXT,
    marginBottom: SPACING.XS,
  },
  input: {
    backgroundColor: COLORS.WHITE,
    borderWidth: 1.5,
    borderColor: COLORS.BORDER,
    borderRadius: RADIUS.CARD,
    paddingHorizontal: SPACING.MD,
    paddingVertical: SPACING.SM,
    fontSize: FONT.BODY,
    color: COLORS.TEXT,
    minHeight: 56,
  },
  notesInput: { minHeight: 90, textAlignVertical: 'top', paddingTop: SPACING.SM },
  saveBtn: {
    flexDirection: 'row',
    backgroundColor: COLORS.PRIMARY,
    borderRadius: RADIUS.BUTTON,
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING.SM,
    marginTop: SPACING.LG,
  },
  saveBtnText: { fontSize: FONT.BUTTON, fontWeight: '700', color: COLORS.WHITE },
});
