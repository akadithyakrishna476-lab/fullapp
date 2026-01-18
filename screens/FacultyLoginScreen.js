import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { sendPasswordResetEmail, signInWithEmailAndPassword, signOut } from 'firebase/auth';
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
import { auth } from '../firebase/firebaseConfig';
import { UNAUTHORIZED_MESSAGE, ensureUserRole } from '../utils/authHelpers';

const FacultyLoginScreen = () => {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  const handleLogin = async () => {
    const normalizedEmail = String(email || '').trim().toLowerCase();
    if (!normalizedEmail) {
      Alert.alert('Missing email', 'Please enter your email address.');
      return;
    }
    if (!password) {
      Alert.alert('Missing password', 'Please enter your password.');
      return;
    }

    setIsLoading(true);
    try {
      const credential = await signInWithEmailAndPassword(auth, normalizedEmail, password);
      const roleCheck = await ensureUserRole({ 
        userId: credential.user?.uid, 
        expectedRole: 'faculty',
        userEmail: normalizedEmail 
      });

      if (!roleCheck.allowed) {
        await signOut(auth).catch(() => {});
        await AsyncStorage.removeItem('userRole').catch(() => {});
        Alert.alert('Unauthorized login', UNAUTHORIZED_MESSAGE);
        return;
      }

      await AsyncStorage.setItem('userRole', 'faculty');
      router.replace('/faculty-dashboard');
    } catch (err) {
      const code = err?.code || '';
      let message = 'Failed to sign in. Please try again.';
      // For credential mismatch show generic message requested by requirements
      if (code === 'auth/user-not-found' || code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
        message = 'Invalid username or password';
      } else if (code === 'auth/invalid-email') {
        message = 'The email address is invalid.';
      } else if (code === 'auth/too-many-requests') {
        message = 'Too many attempts. Try again later.';
      } else if (code === 'auth/network-request-failed') {
        message = 'Network error. Check your connection.';
      }

      Alert.alert('Login error', message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    const normalizedEmail = String(email || '').trim().toLowerCase();
    if (!normalizedEmail) {
      Alert.alert('Enter email', 'Please enter your registered email to receive a reset link.');
      return;
    }

    setIsResetting(true);
    try {
      await sendPasswordResetEmail(auth, normalizedEmail);
      // Show a single clear success alert
      Alert.alert('Reset email sent', `A password reset link has been sent to ${normalizedEmail}. Check your email to set a new password.`);
    } catch (err) {
      const code = err?.code || '';
      let message = 'Failed to send reset email. Please try again.';
      if (code === 'auth/user-not-found') message = `No account found with email "${normalizedEmail}".`;
      else if (code === 'auth/invalid-email') message = 'The email address is invalid.';
      else if (code === 'auth/network-request-failed') message = 'Network error. Check your connection and try again.';

      Alert.alert('Reset error', message);
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Faculty Login</Text>
        <Text style={styles.subtitle}>Sign in to your account</Text>

        <View style={styles.formContainer}>
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
            onPress={() => router.push('/faculty-forgot-password')}
            disabled={isLoading}
            style={styles.forgotButton}
          >
            <Ionicons name="key-outline" size={16} color="#2980b9" />
            <Text style={styles.forgot}>Forgot Password?</Text>
          </TouchableOpacity>

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
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: '#7f8c8d',
    marginBottom: 40,
    textAlign: 'center',
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
    backgroundColor: '#3498db',
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
    alignItems: 'center',
    flexDirection: 'row',
  },
  forgot: {
    color: '#2980b9',
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 6,
  },
});

export default FacultyLoginScreen;
