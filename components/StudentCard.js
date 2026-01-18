import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';

const Badge = ({ label, color = '#2f6f44', backgroundColor = '#d5f4e6' }) => (
  <View style={[styles.badge, { backgroundColor }]}>
    <Text style={[styles.badgeText, { color }]}>{label}</Text>
  </View>
);

export default function StudentCard({
  student,
  isEditing = false,
  onEdit,
  onChange,
  onSave,
  onCancel,
  onDelete,
}) {
  const [local, setLocal] = useState(() => ({
    rollNumber: student.rollNumber || student.rollNo || '',
    name: student.name || '',
    email: student.email || '',
    phone: student.phone || student.mobile || '',
  }));

  const initials = useMemo(() => {
    const n = (local.name || student.name || '').trim();
    if (!n) return '?';
    const parts = n.split(' ').filter(Boolean);
    return (parts[0]?.[0] || '') + (parts[1]?.[0] || '');
  }, [local.name, student.name]);

  const handleChange = (key, value) => {
    const next = { ...local, [key]: value };
    setLocal(next);
    onChange && onChange(next);
  };

  // Render edit mode with keyboard handling
  if (isEditing) {
    return (
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={90}
        style={styles.keyboardAvoidContainer}
      >
        <ScrollView
          scrollEnabled={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.card}
        >
          {/* Header Section */}
          <View style={styles.headerRow}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initials.toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <TextInput
                style={styles.nameInput}
                placeholder="Student Name"
                value={local.name}
                onChangeText={(t) => handleChange('name', t)}
                placeholderTextColor="#b0b7bd"
                returnKeyType="next"
              />
              <View style={styles.metaRow}>
                <TextInput
                  style={styles.rollInput}
                  placeholder="Roll No"
                  value={String(local.rollNumber || '')}
                  onChangeText={(t) => handleChange('rollNumber', t)}
                  placeholderTextColor="#b0b7bd"
                  returnKeyType="next"
                />
                <Badge label="Active" />
              </View>
            </View>
          </View>

          {/* Body Section - Input Fields */}
          <View style={styles.body}>
            {/* Email Field */}
            <View style={styles.fieldRow}>
              <Ionicons name="mail-outline" size={16} color="#7f8c8d" style={{ marginTop: 8 }} />
              <TextInput
                style={styles.input}
                placeholder="Email"
                keyboardType="email-address"
                autoCapitalize="none"
                value={local.email}
                onChangeText={(t) => handleChange('email', t)}
                placeholderTextColor="#b0b7bd"
                returnKeyType="next"
              />
            </View>

            {/* Phone Field */}
            <View style={styles.fieldRow}>
              <Ionicons name="call-outline" size={16} color="#7f8c8d" style={{ marginTop: 8 }} />
              <TextInput
                style={styles.input}
                placeholder="Phone"
                keyboardType="phone-pad"
                value={local.phone}
                onChangeText={(t) => handleChange('phone', t)}
                placeholderTextColor="#b0b7bd"
                returnKeyType="done"
              />
            </View>
          </View>

          {/* Footer Action Buttons */}
          <View style={styles.footerRow}>
            <TouchableOpacity
              style={[styles.footerBtn, styles.cancelBtn]}
              onPress={onCancel}
              accessibilityLabel="Cancel edit"
            >
              <Ionicons name="close" size={16} color="#2c3e50" />
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.footerBtn, styles.saveBtn]}
              onPress={() => onSave && onSave(local)}
              accessibilityLabel="Save changes"
            >
              <Ionicons name="save-outline" size={16} color="#fff" />
              <Text style={styles.saveText}>Save</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  // View mode (non-editing)
  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials.toUpperCase()}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.nameText} numberOfLines={1}>
            {student.name || local.name || 'Unnamed'}
          </Text>
          <View style={styles.metaRow}>
            <Text style={styles.rollText}>
              Roll: <Text style={styles.rollHighlight}>{student.rollNumber || local.rollNumber || '-'}</Text>
            </Text>
            <Badge label="Active" />
          </View>
        </View>
        <View style={styles.iconActions}>
          <TouchableOpacity style={styles.iconBtn} onPress={onEdit} accessibilityLabel="Edit">
            <Ionicons name="create-outline" size={18} color="#0f5f73" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconBtn} onPress={onDelete} accessibilityLabel="Delete">
            <Ionicons name="trash-outline" size={18} color="#e74c3c" />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.body}>
        <View style={styles.fieldRow}>
          <Ionicons name="mail-outline" size={16} color="#7f8c8d" style={{ marginTop: 2 }} />
          <Text style={styles.fieldText}>{student.email || local.email || '—'}</Text>
        </View>
        <View style={styles.fieldRow}>
          <Ionicons name="call-outline" size={16} color="#7f8c8d" style={{ marginTop: 2 }} />
          <Text style={styles.fieldText}>{student.phone || local.phone || '—'}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  keyboardAvoidContainer: {
    flex: 1,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#eef1f4',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#0f5f73',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  nameText: { fontSize: 16, fontWeight: '700', color: '#2c3e50' },
  nameInput: {
    fontSize: 16,
    fontWeight: '700',
    color: '#2c3e50',
    paddingVertical: 6,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#eef1f4',
  },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  rollText: { fontSize: 12, color: '#7f8c8d' },
  rollHighlight: { fontWeight: '800', color: '#0f5f73' },
  rollInput: {
    fontSize: 12,
    color: '#2c3e50',
    paddingVertical: 4,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#eef1f4',
    flex: 1,
  },
  iconActions: { flexDirection: 'row', alignItems: 'center', gap: 6, marginLeft: 8 },
  iconBtn: { padding: 8, borderRadius: 8, backgroundColor: '#f5f7f9' },
  body: { marginTop: 12, gap: 12 },
  fieldRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: {
    flex: 1,
    fontSize: 13,
    color: '#2c3e50',
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#eef1f4',
  },
  fieldText: { fontSize: 13, color: '#2c3e50', flex: 1 },
  footerRow: { flexDirection: 'row', gap: 8, marginTop: 16 },
  footerBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 10,
  },
  cancelBtn: { backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#eef1f4' },
  saveBtn: { backgroundColor: '#0f5f73' },
  cancelText: { color: '#2c3e50', fontWeight: '700', marginLeft: 4 },
  saveText: { color: '#fff', fontWeight: '700', marginLeft: 4 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  badgeText: { fontSize: 11, fontWeight: '700' },
});
