import { Stack } from 'expo-router';
// Layout configuration for the app

export default function RootLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="role-select" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="faculty-task-assignment" />
      <Stack.Screen name="cr-task-assignment" />
    </Stack>
  );
}
