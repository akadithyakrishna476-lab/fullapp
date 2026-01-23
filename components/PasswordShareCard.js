import React from 'react';
import { Alert, Platform, Pressable, StyleSheet, View } from 'react-native';
import * as Linking from 'expo-linking';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { FontAwesome, MaterialCommunityIcons } from '@expo/vector-icons';

function encode(text) {
  return encodeURIComponent(text);
}

function buildMessage(password, label) {
  const who = label ? `${label}` : 'your account';
  return `Temporary password for ${who}: ${password}\nThis password is auto-generated and time-limited.`;
}

async function openUrlWithFallback(primaryUrl, fallbackUrl) {
  try {
    const canOpen = await Linking.canOpenURL(primaryUrl);
    if (canOpen) {
      await Linking.openURL(primaryUrl);
      return;
    }
  } catch {}
  if (fallbackUrl) {
    try {
      await Linking.openURL(fallbackUrl);
      return;
    } catch {}
  }
  Alert.alert('Unable to open app', 'Please ensure the app is installed.');
}

export default function PasswordShareCard({ password, label, expiresIn }) {
  const message = buildMessage(password, label);

  const onShareWhatsApp = () => {
    const text = encode(message);
    const primary = Platform.OS === 'web' ? `https://wa.me/?text=${text}` : `whatsapp://send?text=${text}`;
    const fallback = `https://wa.me/?text=${text}`;
    openUrlWithFallback(primary, fallback);
  };

  const onShareEmail = () => {
    const subject = encode('Temporary Password');
    const body = encode(message);
    const mailto = `mailto:?subject=${subject}&body=${body}`;
    openUrlWithFallback(mailto);
  };

  const onShareSMS = () => {
    const body = encode(message);
    // iOS supports body, Android varies; try body param and let OS decide.
    const primary = Platform.OS === 'android' ? `sms:?body=${body}` : `sms:&body=${body}`;
    const fallback = Platform.OS === 'web' ? undefined : `sms:`; // minimal fallback
    openUrlWithFallback(primary, fallback);
  };

  const onShareTelegram = () => {
    const text = encode(message);
    const primary = Platform.OS === 'web' ? `https://t.me/share/url?url=&text=${text}` : `tg://msg?text=${text}`;
    const fallback = `https://t.me/share/url?url=&text=${text}`;
    openUrlWithFallback(primary, fallback);
  };

  return (
    <ThemedView style={styles.card}>
      <View style={styles.rowHeader}>
        <ThemedText type="subtitle" style={styles.label}>
          {label || 'Account'}
        </ThemedText>
        {expiresIn ? (
          <ThemedText style={styles.expiry}>Expires in {expiresIn}</ThemedText>
        ) : null}
      </View>
      <ThemedText style={styles.password}>
        {password}
      </ThemedText>

      <View style={styles.actions}>
        <Pressable accessibilityRole="button" style={[styles.actionBtn, styles.whatsapp]} onPress={onShareWhatsApp}>
          <FontAwesome name="whatsapp" size={20} color="#fff" />
          <ThemedText style={styles.actionLabel}>WhatsApp</ThemedText>
        </Pressable>

        <Pressable accessibilityRole="button" style={[styles.actionBtn, styles.email]} onPress={onShareEmail}>
          <MaterialCommunityIcons name="email" size={20} color="#fff" />
          <ThemedText style={styles.actionLabel}>Email</ThemedText>
        </Pressable>

        <Pressable accessibilityRole="button" style={[styles.actionBtn, styles.sms]} onPress={onShareSMS}>
          <MaterialCommunityIcons name="message-text" size={20} color="#fff" />
          <ThemedText style={styles.actionLabel}>SMS</ThemedText>
        </Pressable>

        <Pressable accessibilityRole="button" style={[styles.actionBtn, styles.telegram]} onPress={onShareTelegram}>
          <MaterialCommunityIcons name="telegram" size={20} color="#fff" />
          <ThemedText style={styles.actionLabel}>Telegram</ThemedText>
        </Pressable>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    padding: 16,
    marginVertical: 8,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  rowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  label: {
    fontWeight: '600',
  },
  expiry: {
    opacity: 0.8,
    fontSize: 12,
  },
  password: {
    marginTop: 8,
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
    fontSize: 18,
    letterSpacing: 0.5,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 16,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    minWidth: 90,
    justifyContent: 'center',
  },
  actionLabel: {
    color: '#fff',
    fontWeight: '600',
  },
  whatsapp: { backgroundColor: '#25D366' },
  email: { backgroundColor: '#1f6feb' },
  sms: { backgroundColor: '#0b9c36' },
  telegram: { backgroundColor: '#229ED9' },
});
