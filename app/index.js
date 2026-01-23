import { useRouter, useSegments } from 'expo-router';
import { onAuthStateChanged } from 'firebase/auth';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { auth } from '../firebase/firebaseConfig';
import { fetchUserRole } from '../utils/authHelpers';

export default function Index() {
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      try {
        if (user) {
          console.log('User is authenticated:', user.uid);
          const { role } = await fetchUserRole(user.uid, user.email);

          if (role === 'faculty') {
            router.replace('/faculty-dashboard');
          } else if (role === 'class_representative') {
            router.replace('/cr-dashboard');
          } else if (role === 'representative') { // Handle potential legacy role name
            router.replace('/rep-dashboard');
          } else {
            // Fallback for unknown roles or new users
            console.log('Unknown role, redirecting to role select');
            router.replace('/role-select');
          }
        } else {
          console.log('User is not authenticated');
          router.replace('/role-select');
        }
      } catch (error) {
        console.error('Auth state change error:', error);
        router.replace('/role-select');
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' }}>
      <ActivityIndicator size="large" color="#0000ff" />
    </View>
  );
}
