import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { signInWithEmailAndPassword, sendPasswordResetEmail, signOut } from 'firebase/auth';
import { collection, collectionGroup, getDocs, query, where } from 'firebase/firestore';
import { auth, db } from '../firebase/firebaseConfig';

const RepLoginScreen = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const router = useRouter();

  const normalizeEmail = (value) => String(value || '').trim().toLowerCase();

  const safeSignOut = async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.log('ℹ️ Sign-out skipped:', err?.message || err);
    }
  };

  const findClassRep = async (normalizedEmail, yearId) => {
    try {
      console.log('🔎 Step 2: Looking up Class Representative for year:', yearId);
      // Use collectionGroup to search across all departments for this year
      const allCRsRef = collectionGroup(db, 'classRepresentatives');
      const repQuery = query(
        allCRsRef, 
        where('email', '==', normalizedEmail),
        where('year', '==', yearId)
      );
      const snap = await getDocs(repQuery);

      if (snap.empty) {
        console.log('   ❌ Not a Class Representative for year', yearId);
        return { found: false };
      }

      const docSnap = snap.docs[0];
      const repData = docSnap.data() || {};
      console.log('   ✅ Found Class Rep:', repData.name);
      console.log('      Active:', repData.active);
      console.log('      Year:', repData.year);
      console.log('      Department:', repData.departmentId);

      return {
        found: true,
        repData,
        repUid: docSnap.id,
      };
    } catch (err) {
      console.error('   ❌ Error looking up Class Rep:', err);
      throw err;
    }
  };

  const handleLogin = async () => {
    const normalizedEmail = normalizeEmail(email);

    if (!normalizedEmail) {
      Alert.alert('Missing Email', 'Please enter your email address.');
      return;
    }
    if (!password) {
      Alert.alert('Missing Password', 'Please enter your password.');
      return;
    }

    setIsLoading(true);
    console.log('==========================================');
    console.log('🔐 CLASS REPRESENTATIVE LOGIN');
    console.log('Email:', normalizedEmail);
    console.log('==========================================');

    try {
      console.log('🔑 Step 1: Firebase Authentication...');
      const userCredential = await signInWithEmailAndPassword(auth, normalizedEmail, password);
      console.log('   ✅ Firebase Auth successful. UID:', userCredential.user.uid);

      console.log('🔒 Step 2: Checking Class Representative status...');
      // Try all years to find which year this rep belongs to
      let repFound = false;
      let repData = null;
      const years = ['year1', 'year2', 'year3', 'year4'];

      for (const year of years) {
        const { found, repData: data } = await findClassRep(normalizedEmail, year);
        if (found) {
          repFound = true;
          repData = data;
          break;
        }
      }

      if (!repFound) {
        await safeSignOut();
        Alert.alert(
          'Not Authorized',
          'You are not registered as a Class Representative. Please contact your faculty advisor.'
        );
        return;
      }

      // Verify rep is active
      if (repData.active !== true) {
        await safeSignOut();
        Alert.alert(
          'Access Denied',
          'Your Class Representative account has been deactivated. Please contact your faculty advisor.'
        );
        return;
      }

      console.log('💾 Step 3: Saving session and navigating to dashboard...');
      await AsyncStorage.setItem('userRole', 'rep');
      await AsyncStorage.setItem('userEmail', normalizedEmail);
      await AsyncStorage.setItem('userId', userCredential.user.uid);

      console.log('✅ LOGIN SUCCESSFUL - Navigating to CR Dashboard');
      console.log('==========================================\n');
      router.replace('/rep-dashboard');
    } catch (err) {
      console.error('❌ Unexpected error during login:', err);
      let message = 'Unable to log in. Please try again.';

      if (
        err?.code === 'auth/wrong-password' ||
        err?.code === 'auth/user-not-found' ||
        err?.code === 'auth/invalid-credential'
      ) {
        message = 'Invalid email or password. Please try again.';
      } else if (err?.code === 'auth/too-many-requests') {
        message = 'Too many attempts. Please wait a moment and try again.';
      } else if (err?.code === 'auth/invalid-email') {
        message = 'Please enter a valid email address.';
      }

      Alert.alert('Login Failed', message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    const normalizedEmail = normalizeEmail(email);

    if (!normalizedEmail) {
      Alert.alert('Email Required', 'Enter your email to receive a reset link.');
      return;
    }

    setIsLoading(true);
    try {
      console.log('🔒 Checking Class Representative credentials...');
      // Try all years to find rep
      let repFound = false;
      let repData = null;
      const years = ['year1', 'year2', 'year3', 'year4'];

      for (const year of years) {
        const { found, repData: data } = await findClassRep(normalizedEmail, year);
        if (found) {
          repFound = true;
          repData = data;
          break;
        }
      }

      if (!repFound) {
        Alert.alert(
          'Not Authorized',
          'Only Class Representatives can reset their password. Please contact your faculty advisor.'
        );
        return;
      }

      // Verify rep is still active before allowing password reset
      if (repData.active !== true) {
        Alert.alert(
          'Access Denied',
          'Your Class Representative account is not active. Please contact your faculty advisor.'
        );
        return;
      }

      await sendPasswordResetEmail(auth, normalizedEmail);
      Alert.alert('Password Reset Sent', 'Check your email for the password reset link.');
    } catch (err) {
      console.error('❌ Error sending password reset:', err);

      let message = 'Unable to send reset email. Please try again.';
      if (err?.code === 'auth/user-not-found') {
        message = 'This email is not registered. Contact your faculty advisor.';
      } else if (err?.code === 'auth/invalid-email') {
        message = 'Please enter a valid email address.';
      } else if (err?.code === 'auth/too-many-requests') {
        message = 'Too many requests. Please wait and try again.';
      }

      Alert.alert('Password Reset', message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Class Representative</Text>
        <Text style={styles.subtitle}>Login</Text>

        <View style={styles.noteContainer}>
          <Text style={styles.noteIcon}>ℹ️</Text>
          <Text style={styles.noteText}>
            Use the email and password shared by your faculty. If you were told to reset your password, tap "Forgot Password".
          </Text>
        </View>

        <View style={styles.formContainer}>
          {/* Email */}
          <View style={styles.formGroup}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              placeholder="name@example.com"
              placeholderTextColor="#bdc3c7"
              value={email}
              onChangeText={(t) => setEmail(t.toLowerCase())}
              keyboardType="email-address"
              autoCapitalize="none"
              textContentType="emailAddress"
            />
          </View>

          {/* Password */}
          <View style={styles.formGroup}>
            <Text style={styles.label}>Password</Text>
            <View style={styles.passwordContainer}>
              <TextInput
                style={styles.passwordInput}
                placeholder="Enter your password"
                placeholderTextColor="#bdc3c7"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
              />
              <TouchableOpacity
                style={styles.eyeIcon}
                onPress={() => setShowPassword(!showPassword)}
              >
                <Ionicons
                  name={showPassword ? 'eye' : 'eye-off'}
                  size={20}
                  color="#7f8c8d"
                />
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity
            onPress={handleForgotPassword}
            style={styles.forgotButton}
          >
            <Text style={styles.forgot}>Forgot Password?</Text>
          </TouchableOpacity>

          {/* Login Button */}
          <TouchableOpacity
            style={[styles.loginButton, isLoading && styles.loginButtonDisabled]}
            onPress={handleLogin}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator size="large" color="#ffffff" />
            ) : (
              <Text style={styles.loginButtonText}>Login</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#2c3e50',
    marginBottom: 4,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: '#7f8c8d',
    marginBottom: 30,
    textAlign: 'center',
  },
  noteContainer: {
    flexDirection: 'row',
    backgroundColor: '#e8f4f8',
    borderLeftWidth: 4,
    borderLeftColor: '#3498db',
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginBottom: 30,
    borderRadius: 4,
    alignItems: 'center',
  },
  noteIcon: {
    fontSize: 18,
    marginRight: 10,
  },
  noteText: {
    fontSize: 13,
    color: '#2c5aa0',
    flex: 1,
  },
  formContainer: {
    width: '100%',
  },
  formGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2c3e50',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#bdc3c7',
    borderRadius: 6,
    paddingVertical: 12,
    paddingHorizontal: 12,
    fontSize: 14,
    backgroundColor: '#ffffff',
    color: '#2c3e50',
  },
  passwordContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#bdc3c7',
    borderRadius: 6,
    backgroundColor: '#ffffff',
  },
  passwordInput: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 12,
    fontSize: 14,
    color: '#2c3e50',
  },
  eyeIcon: {
    paddingRight: 12,
    paddingLeft: 8,
    paddingVertical: 12,
  },
  loginButton: {
    marginTop: 24,
    paddingVertical: 14,
    backgroundColor: '#9b59b6',
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
  },
  loginButtonDisabled: {
    opacity: 0.6,
  },
  loginButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
  forgotButton: {
    marginTop: 12,
    marginBottom: 8,
    minHeight: 20,
    justifyContent: 'center',
  },
  forgot: {
    color: '#7d3c98',
    textAlign: 'right',
    fontSize: 13,
    fontWeight: '600',
  },
});

export default RepLoginScreen;
