/**
 * Notifications wrapper that safely handles loading expo-notifications
 * only in development builds, not in Expo Go.
 * 
 * In Expo Go (SDK 53+), push notifications are not supported and will throw errors.
 * This module safely handles the conditional loading.
 */

let Notifications = null;
let isExpoGo = false;

try {
  // Check if we're in Expo Go by looking for the __DEV__ flag and lack of native push support
  // In Expo Go, getDevicePushTokenAsync doesn't exist
  // eslint-disable-next-line global-require, import/no-unresolved
  const NotificationsModule = require('expo-notifications');
  
  // If we got here and have no device push token support, it's Expo Go
  if (NotificationsModule && typeof NotificationsModule.getDevicePushTokenAsync !== 'function') {
    isExpoGo = true;
    console.log('Running in Expo Go - push notifications disabled');
  } else {
    Notifications = NotificationsModule;
  }
} catch (error) {
  // expo-notifications not available
  console.warn('expo-notifications module not available:', error.message);
}

export { Notifications, isExpoGo };
