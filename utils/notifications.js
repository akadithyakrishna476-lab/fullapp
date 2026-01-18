/**
 * Notifications shim for Expo Go compatibility (SDK 53+)
 * 
 * This module safely wraps expo-notifications and disables it in Expo Go,
 * where push notifications are not supported.
 */

// Check if we're in Expo Go by looking at the __DEV__ and native module availability
const isExpoGo = !global.__DEV_CLIENT__;

// Create a disabled notifications mock if in Expo Go
const disabledNotifications = {
  getPermissionsAsync: async () => ({ status: 'undetermined' }),
  requestPermissionsAsync: async () => ({ status: 'denied' }),
  getExpoPushTokenAsync: async () => {
    throw new Error('Push tokens not available in Expo Go');
  },
  setNotificationChannelAsync: async () => {},
  addNotificationReceivedListener: () => ({ remove: () => {} }),
  addNotificationResponseReceivedListener: () => ({ remove: () => {} }),
  removeNotificationSubscription: () => {},
  AndroidImportance: { DEFAULT: 4 },
};

let notificationsModule = disabledNotifications;

if (!isExpoGo) {
  try {
    // eslint-disable-next-line global-require, import/no-unresolved
    notificationsModule = require('expo-notifications');
  } catch (error) {
    console.warn('Failed to load expo-notifications:', error.message);
  }
}

export default notificationsModule;
