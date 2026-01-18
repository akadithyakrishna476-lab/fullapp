/**
 * Secure Class Representative Login Screen
 * 
 * Implements strict login rules:
 * - Only faculty-assigned reps can login
 * - Role and isActiveRep must be validated in Firestore
 * - Old passwords must not work after reassignment
 * - Removed/reassigned reps are locked out
 */

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
import { loginAsRepresentative, logoutRepresentative } from '../utils/repAuthService';

const SecureRepLoginScreen = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const router = useRouter();

  /**
   * Handle login with strict validation
   */
  const handleLogin = async () => {
    const normalizedEmail = String(email || '').trim().toLowerCase();

    if (!normalizedEmail) {
      Alert.alert('Missing Email', 'Please enter your email address.');
      return;
    }

    if (!password) {
      Alert.alert('Missing Password', 'Please enter your password.');
      return;
    }

    setIsLoading(true);

    try {
      // Call secure login service
      const result = await loginAsRepresentative(normalizedEmail, password);

      if (result.success) {
        // Store user data locally
        await AsyncStorage.setItem('repUser', JSON.stringify(result.user));
        await AsyncStorage.setItem('repUid', result.uid);
        await AsyncStorage.setItem('lastLogin', new Date().toISOString());

        console.log('✅ Login successful, navigating to rep dashboard...');

        // Navigate to rep dashboard
        router.push('/rep-dashboard');
      }

    } catch (error) {
      console.error('Login error:', error);

      let errorTitle = 'Login Failed';
      let errorMessage = 'An unexpected error occurred. Please try again.';

      // Handle specific error codes
      if (error.code === 'AUTH_ERROR') {
        errorTitle = 'Authentication Error';
        errorMessage = 'Invalid email or password. Please check your credentials and try again.';
      } else if (error.code === 'USER_NOT_FOUND') {
        errorTitle = 'Account Not Found';
        errorMessage = error.message;
      } else if (error.code === 'INVALID_ROLE') {
        errorTitle = 'Access Denied';
        errorMessage = error.message;
      } else if (error.code === 'NOT_ACTIVE_REP') {
        errorTitle = 'Access Revoked';
        errorMessage = error.message;
      } else if (error.message) {
        errorMessage = error.message;
      }

      Alert.alert(errorTitle, errorMessage);

    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Navigate to forgot password screen
   */
  const handleForgotPassword = () => {
    router.push({
      pathname: '/rep-forgot-password',
      params: { email: email || '' }
    });
  };

  /**
   * Navigate to role selection
   */
  const handleBackToRoleSelect = () => {
    router.push('/role-select');
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Class Representative Login</Text>
          <Text style={styles.subtitle}>
            Secure authentication system for faculty-assigned representatives
          </Text>
        </View>

        {/* Login Form */}
        <View style={styles.form}>
          {/* Email Input */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Email Address</Text>
            <View style={styles.inputContainer}>
              <Ionicons
                name="mail-outline"
                size={20}
                color="#666"
                style={styles.inputIcon}
              />
              <TextInput
                style={styles.input}
                placeholder="your.email@domain.com"
                placeholderTextColor="#999"
                value={email}
                onChangeText={setEmail}
                editable={!isLoading}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
              />
            </View>
          </View>

          {/* Password Input */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Password</Text>
            <View style={styles.inputContainer}>
              <Ionicons
                name="lock-closed-outline"
                size={20}
                color="#666"
                style={styles.inputIcon}
              />
              <TextInput
                style={styles.input}
                placeholder="Enter your password"
                placeholderTextColor="#999"
                value={password}
                onChangeText={setPassword}
                editable={!isLoading}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoComplete="password"
              />
              <TouchableOpacity
                onPress={() => setShowPassword(!showPassword)}
                style={styles.eyeIcon}
                disabled={isLoading}
              >
                <Ionicons
                  name={showPassword ? 'eye-outline' : 'eye-off-outline'}
                  size={20}
                  color="#666"
                />
              </TouchableOpacity>
            </View>
          </View>

          {/* Forgot Password Link */}
          <TouchableOpacity
            onPress={handleForgotPassword}
            disabled={isLoading}
            style={styles.forgotPasswordButton}
          >
            <Text style={styles.forgotPasswordText}>Forgot Password?</Text>
          </TouchableOpacity>

          {/* Login Button */}
          <TouchableOpacity
            style={[styles.loginButton, isLoading && styles.loginButtonDisabled]}
            onPress={handleLogin}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.loginButtonText}>Login as Class Representative</Text>
            )}
          </TouchableOpacity>

          {/* Information Box */}
          <View style={styles.infoBox}>
            <Ionicons
              name="information-circle-outline"
              size={20}
              color="#0066cc"
              style={styles.infoIcon}
            />
            <Text style={styles.infoText}>
              Your login credentials are generated and managed by your faculty advisor. 
              If you've been reassigned, your previous password will no longer work.
            </Text>
          </View>

          {/* Security Notes */}
          <View style={styles.securityBox}>
            <Text style={styles.securityTitle}>🔒 Security Features</Text>
            <Text style={styles.securityNote}>
              • Only faculty-assigned representatives can login
            </Text>
            <Text style={styles.securityNote}>
              • Old passwords are invalidated after reassignment
            </Text>
            <Text style={styles.securityNote}>
              • Password resets are tracked and verified
            </Text>
            <Text style={styles.securityNote}>
              • Your access is revoked if you are replaced as rep
            </Text>
          </View>
        </View>

        {/* Back Button */}
        <TouchableOpacity
          style={styles.backButton}
          onPress={handleBackToRoleSelect}
          disabled={isLoading}
        >
          <Ionicons name="chevron-back" size={20} color="#0066cc" />
          <Text style={styles.backButtonText}>Back to Role Selection</Text>
        </TouchableOpacity>
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
    padding: 20,
    justifyContent: 'space-between',
  },
  header: {
    marginBottom: 30,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1a1a1a',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  form: {
    flex: 1,
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    paddingHorizontal: 12,
    height: 48,
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: '#333',
    padding: 0,
  },
  eyeIcon: {
    padding: 8,
    marginLeft: 8,
  },
  forgotPasswordButton: {
    alignSelf: 'flex-end',
    marginBottom: 20,
  },
  forgotPasswordText: {
    color: '#0066cc',
    fontSize: 14,
    fontWeight: '500',
  },
  loginButton: {
    backgroundColor: '#0066cc',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  loginButtonDisabled: {
    backgroundColor: '#999',
  },
  loginButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  infoBox: {
    flexDirection: 'row',
    backgroundColor: '#e3f2fd',
    borderRadius: 8,
    padding: 12,
    marginBottom: 20,
    borderLeftWidth: 4,
    borderLeftColor: '#0066cc',
  },
  infoIcon: {
    marginRight: 10,
    marginTop: 2,
  },
  infoText: {
    flex: 1,
    fontSize: 12,
    color: '#0066cc',
    lineHeight: 18,
  },
  securityBox: {
    backgroundColor: '#f0f8f0',
    borderRadius: 8,
    padding: 14,
    borderLeftWidth: 4,
    borderLeftColor: '#28a745',
  },
  securityTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#28a745',
    marginBottom: 10,
  },
  securityNote: {
    fontSize: 12,
    color: '#28a745',
    marginBottom: 6,
    lineHeight: 16,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    marginTop: 20,
  },
  backButtonText: {
    color: '#0066cc',
    fontSize: 14,
    fontWeight: '500',
    marginLeft: 6,
  },
});

export default SecureRepLoginScreen;
