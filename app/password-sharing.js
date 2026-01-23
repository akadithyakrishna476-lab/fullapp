import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import PasswordShareCard from '@/components/PasswordShareCard';

function generateTempPassword(length = 10) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
  let out = '';
  for (let i = 0; i < length; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

export default function PasswordSharingScreen() {
  const sampleItems = useMemo(() => (
    [
      { label: 'Student: Ananya', password: generateTempPassword(), expiresIn: '15 min' },
      { label: 'Student: Vikram', password: generateTempPassword(), expiresIn: '15 min' },
      { label: 'Rep: CR Team', password: generateTempPassword(), expiresIn: '30 min' },
    ]
  ), []);

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <ThemedText type="title" style={styles.title}>Share Temporary Passwords</ThemedText>
        <ThemedText style={styles.subtitle}>Tap a platform to share instantly.</ThemedText>

        <View style={styles.list}>
          {sampleItems.map((item, idx) => (
            <PasswordShareCard key={idx} label={item.label} password={item.password} expiresIn={item.expiresIn} />
          ))}
        </View>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16 },
  title: { marginBottom: 4 },
  subtitle: { opacity: 0.8, marginBottom: 16 },
  list: { marginTop: 8 },
});
