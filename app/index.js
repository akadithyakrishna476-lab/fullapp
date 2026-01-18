import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { onAuthStateChanged } from 'firebase/auth';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { auth } from '../firebase/firebaseConfig';

export default function Index() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        await AsyncStorage.clear().catch(() => {});
        router.replace('/role-select');
      } else {
        // Check user role and redirect appropriately
        const userRole = await AsyncStorage.getItem('userRole');
        if (userRole === 'faculty') {
          router.replace('/faculty-dashboard');
        } else if (userRole === 'rep') {
          router.replace('/rep-dashboard');
        } else {
          router.replace('/role-select');
        }
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#3498db" />
      </View>
    );
  }

  return null;
}
