import "react-native-reanimated";

import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { LogBox } from "react-native";

LogBox.ignoreLogs([
  "expo-notifications",
  "Android Push notifications",
  "projectId",
]);

export default function RootLayout() {
  return (
    <>
      <Stack
        screenOptions={{
          headerShown: false,
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="role-select" options={{ headerShown: false }} />
        <Stack.Screen
          name="faculty-auth"
          options={{ title: "Faculty Portal" }}
        />
        <Stack.Screen
          name="faculty-register"
          options={{ title: "Create Faculty Account" }}
        />
        <Stack.Screen
          name="faculty-login"
          options={{ title: "Faculty Login" }}
        />
        <Stack.Screen
          name="faculty-dashboard"
          options={{ headerShown: false }}
        />
        <Stack.Screen name="faculty-profile" options={{ headerShown: false }} />
        <Stack.Screen name="notifications" options={{ headerShown: false }} />
        <Stack.Screen
          name="student-management"
          options={{ headerShown: false }}
        />
        <Stack.Screen name="spreadsheet" options={{ headerShown: false }} />
        <Stack.Screen name="timetable" options={{ headerShown: false }} />
        <Stack.Screen name="calendar" options={{ headerShown: false }} />
        <Stack.Screen name="todo-list" options={{ headerShown: false }} />
        <Stack.Screen name="staff-advisor" options={{ headerShown: false }} />
        <Stack.Screen
          name="attendance-management"
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="send-announcement"
          options={{ headerShown: false }}
        />
        <Stack.Screen name="chat-with-rep" options={{ headerShown: false }} />
        <Stack.Screen
          name="rep-login"
          options={{ title: "Class Representative Login" }}
        />
        <Stack.Screen name="rep-dashboard" options={{ headerShown: false }} />
      </Stack>
      <StatusBar style="auto" />
    </>
  );
}
