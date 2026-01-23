import Constants from 'expo-constants';

// Check if running in Expo Go
const isExpoGo = Constants.appOwnership === 'expo';

let notificationModule = null;

// Suppress Expo Go push notification warnings
if (isExpoGo) {
  // Store original console.error
  const originalError = console.error;
  
  // Temporarily suppress the specific Expo Go warning
  console.error = (...args) => {
    const message = args[0]?.toString() || '';
    if (
      message.includes('expo-notifications') && 
      message.includes('Expo Go') &&
      message.includes('development build')
    ) {
      // Silently ignore this warning
      return;
    }
    originalError(...args);
  };
  
  // Import notifications (warning will be suppressed)
  import('expo-notifications').then(module => {
    notificationModule = module;
    // Restore original console.error after a brief delay
    setTimeout(() => {
      console.error = originalError;
    }, 1000);
  });
  
} else {
  // Not in Expo Go, import normally
  import('expo-notifications').then(module => {
    notificationModule = module;
  });
}

// Wait for module to load
const getNotifications = async () => {
  if (notificationModule) return notificationModule;
  
  // Wait up to 3 seconds for module to load
  for (let i = 0; i < 30; i++) {
    await new Promise(resolve => setTimeout(resolve, 100));
    if (notificationModule) return notificationModule;
  }
  
  // Fallback: import directly
  notificationModule = await import('expo-notifications');
  return notificationModule;
};

// Initialize notification handler
export const setupNotificationHandler = async () => {
  const Notifications = await getNotifications();
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
};

// Export notification functions
export const requestPermissionsAsync = async () => {
  const Notifications = await getNotifications();
  return Notifications.requestPermissionsAsync();
};

export const cancelAllScheduledNotificationsAsync = async () => {
  const Notifications = await getNotifications();
  return Notifications.cancelAllScheduledNotificationsAsync();
};

export const scheduleNotificationAsync = async (config) => {
  const Notifications = await getNotifications();
  return Notifications.scheduleNotificationAsync(config);
};

export const getSchedulableTriggerInputTypes = async () => {
  const Notifications = await getNotifications();
  return Notifications.SchedulableTriggerInputTypes;
};
