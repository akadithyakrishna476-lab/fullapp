/**
 * Class Representative Password Change Screen
 * 
 * Allows reps to optionally change their password after first login
 * Password change is NOT forced, it's completely optional
 */

import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { validatePasswordStrength } from '../utils/passwordGenerator';

const RepPasswordChangeScreen = () => {
  const router = useRouter();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [passwordErrors, setPasswordErrors] = useState([]);

  /**
   * Check if passwords match
   */
  const passwordsMatch = newPassword && confirmPassword && newPassword === confirmPassword;
  const passwordMismatch = newPassword && confirmPassword && newPassword !== confirmPassword;

  /**
   * Handle password change
   */
  const handleChangePassword = async () => {
    if (!currentPassword) {
      Alert.alert('Missing Current Password', 'Please enter your current password.');
      return;
    }

    if (!newPassword || !confirmPassword) {
      Alert.alert('Missing New Password', 'Please enter and confirm your new password.');
      return;
    }

    if (currentPassword === newPassword) {
      Alert.alert(
        'Same Password',
        'Your new password must be different from your current password.'
      );
      return;
    }

    if (newPassword !== confirmPassword) {
      Alert.alert('Password Mismatch', 'New Password and Confirm Password do not match. Please try again.');
      return;
    }

    // Validate new password strength
    const validation = validatePasswordStrength(newPassword);
    if (!validation.isValid) {
      setPasswordErrors(validation.errors);
      Alert.alert('Password Too Weak', 'Your password does not meet the security requirements.');
      return;
    }

    setIsLoading(true);

    try {
      // Get auth token
      const token = await getAuthToken();

      if (!token) {
        throw new Error('No authentication token found');
      }

      // Call backend Cloud Function to change password
      // The function will:
      // 1. Verify user is still active rep
      // 2. Update password in Firebase Auth
      // 3. Update last password change timestamp in Firestore

      const response = await fetch('/.netlify/functions/changePassword', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          currentPassword,
          newPassword
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to change password');
      }

      Alert.alert(
        'Password Changed',
        'Your password has been successfully changed.',
        [
          {
            text: 'OK',
            onPress: () => router.push('/rep-dashboard')
          }
        ]
      );

    } catch (error) {
      console.error('Error changing password:', error);
      Alert.alert(
        'Change Failed',
        error.message || 'Failed to change your password. Please try again.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Skip password change (go back to dashboard)
   */
  const handleSkip = () => {
    Alert.alert(
      'Skip Password Change',
      'You can change your password anytime from your profile settings.',
      [
        {
          text: 'Cancel',
          style: 'cancel'
        },
        {
          text: 'Skip',
          onPress: () => router.push('/rep-dashboard'),
          style: 'destructive'
        }
      ]
    );
  };

  /**
   * Get auth token from storage
   */
  const getAuthToken = async () => {
    try {
      // In a real app, you'd get the Firebase Auth token using:
      // const token = await auth.currentUser.getIdToken();
      // For now, we'll use a placeholder
      return await AsyncStorage.getItem('authToken');
    } catch (error) {
      console.error('Error getting auth token:', error);
      return null;
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardAvoidingView}
      >
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Change Password</Text>
          <Text style={styles.headerSubtitle}>Optional - You can do this anytime</Text>
        </View>

        <ScrollView style={styles.content}>
          {/* Intro Section */}
          <View style={styles.infoBox}>
            <Ionicons
              name="information-circle-outline"
              size={20}
              color="#0066cc"
              style={styles.infoIcon}
            />
            <Text style={styles.infoText}>
              Changing your password is completely optional. 
              You can skip this step and change it later from your profile settings.
            </Text>
          </View>

          {/* Current Password */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Current Password</Text>
            <View style={styles.inputContainer}>
              <Ionicons
                name="lock-closed-outline"
                size={20}
                color="#666"
                style={styles.inputIcon}
              />
              <TextInput
                style={styles.input}
                placeholder="Enter your current password"
                placeholderTextColor="#999"
                value={currentPassword}
                onChangeText={setCurrentPassword}
                editable={!isLoading}
                secureTextEntry={!showCurrentPassword}
                autoCapitalize="none"
              />
              <TouchableOpacity
                onPress={() => setShowCurrentPassword(!showCurrentPassword)}
                style={styles.eyeIcon}
                disabled={isLoading}
              >
                <Ionicons
                  name={showCurrentPassword ? 'eye-outline' : 'eye-off-outline'}
                  size={20}
                  color="#666"
                />
              </TouchableOpacity>
            </View>
          </View>

          {/* New Password */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>New Password</Text>
            <View style={styles.inputContainer}>
              <Ionicons
                name="lock-closed-outline"
                size={20}
                color="#666"
                style={styles.inputIcon}
              />
              <TextInput
                style={styles.input}
                placeholder="Enter new password"
                placeholderTextColor="#999"
                value={newPassword}
                onChangeText={(text) => {
                  setNewPassword(text);
                  if (text) {
                    const validation = validatePasswordStrength(text);
                    setPasswordErrors(validation.errors);
                  } else {
                    setPasswordErrors([]);
                  }
                }}
                editable={!isLoading}
                secureTextEntry={!showNewPassword}
                autoCapitalize="none"
              />
              <TouchableOpacity
                onPress={() => setShowNewPassword(!showNewPassword)}
                style={styles.eyeIcon}
                disabled={isLoading}
              >
                <Ionicons
                  name={showNewPassword ? 'eye-outline' : 'eye-off-outline'}
                  size={20}
                  color="#666"
                />
              </TouchableOpacity>
            </View>
          </View>

          {/* Password Requirements */}
          <View style={styles.requirementsBox}>
            <Text style={styles.requirementsTitle}>Password Requirements:</Text>
            <Text style={[
              styles.requirement,
              newPassword.length >= 8 ? styles.requirementMet : styles.requirementUnmet
            ]}>
              {newPassword.length >= 8 ? '✓' : '○'} At least 8 characters
            </Text>
            <Text style={[
              styles.requirement,
              /[A-Z]/.test(newPassword) ? styles.requirementMet : styles.requirementUnmet
            ]}>
              {/[A-Z]/.test(newPassword) ? '✓' : '○'} One uppercase letter
            </Text>
            <Text style={[
              styles.requirement,
              /[a-z]/.test(newPassword) ? styles.requirementMet : styles.requirementUnmet
            ]}>
              {/[a-z]/.test(newPassword) ? '✓' : '○'} One lowercase letter
            </Text>
            <Text style={[
              styles.requirement,
              /[0-9]/.test(newPassword) ? styles.requirementMet : styles.requirementUnmet
            ]}>
              {/[0-9]/.test(newPassword) ? '✓' : '○'} One number
            </Text>
            <Text style={[
              styles.requirement,
              /[!@#$%&*+]/.test(newPassword) ? styles.requirementMet : styles.requirementUnmet
            ]}>
              {/[!@#$%&*+]/.test(newPassword) ? '✓' : '○'} One special character (!@#$%&*+)
            </Text>
          </View>

          {/* Confirm Password */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Confirm Password</Text>
            <View style={[
              styles.inputContainer,
              passwordMismatch && styles.inputContainerError,
              passwordsMatch && styles.inputContainerSuccess
            ]}>
              <Ionicons
                name="lock-closed-outline"
                size={20}
                color={passwordMismatch ? '#d32f2f' : passwordsMatch ? '#28a745' : '#666'}
                style={styles.inputIcon}
              />
              <TextInput
                style={styles.input}
                placeholder="Confirm your password"
                placeholderTextColor="#999"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                editable={!isLoading}
                secureTextEntry={!showConfirmPassword}
                autoCapitalize="none"
              />
              <TouchableOpacity
                onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                style={styles.eyeIcon}
                disabled={isLoading}
              >
                <Ionicons
                  name={showConfirmPassword ? 'eye-outline' : 'eye-off-outline'}
                  size={20}
                  color={passwordMismatch ? '#d32f2f' : passwordsMatch ? '#28a745' : '#666'}
                />
              </TouchableOpacity>
              {confirmPassword && (
                <View style={styles.statusIcon}>
                  <Ionicons
                    name={passwordsMatch ? 'checkmark-circle' : 'close-circle'}
                    size={20}
                    color={passwordsMatch ? '#28a745' : '#d32f2f'}
                  />
                </View>
              )}
            </View>
            {passwordMismatch && (
              <Text style={styles.matchErrorText}>Passwords do not match</Text>
            )}
            {passwordsMatch && (
              <Text style={styles.matchSuccessText}>Passwords match ✓</Text>
            )}
          </View>

          {/* Error Messages */}
          {passwordErrors.length > 0 && (
            <View style={styles.errorBox}>
              {passwordErrors.map((error, index) => (
                <Text key={index} style={styles.errorText}>
                  • {error}
                </Text>
              ))}
            </View>
          )}

          {/* Security Tips */}
          <View style={styles.tipsBox}>
            <Text style={styles.tipsTitle}>💡 Password Tips</Text>
            <Text style={styles.tip}>• Use a mix of letters, numbers, and symbols</Text>
            <Text style={styles.tip}>• Avoid using easily guessable information</Text>
            <Text style={styles.tip}>• Don't reuse passwords from other accounts</Text>
            <Text style={styles.tip}>• Store your password in a secure location</Text>
          </View>
        </ScrollView>

        {/* Action Buttons */}
        <View style={styles.footer}>
          <TouchableOpacity
            style={[
              styles.changeButton,
              (isLoading || passwordErrors.length > 0 || !currentPassword || !newPassword || !passwordsMatch) && styles.buttonDisabled
            ]}
            onPress={handleChangePassword}
            disabled={isLoading || passwordErrors.length > 0 || !currentPassword || !newPassword || !passwordsMatch}
          >
            {isLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.changeButtonText}>Change Password</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.skipButton}
            onPress={handleSkip}
            disabled={isLoading}
          >
            <Text style={styles.skipButtonText}>Skip for Now</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  keyboardAvoidingView: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1a1a1a',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#666',
  },
  content: {
    flex: 1,
    padding: 20,
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
    fontSize: 13,
    color: '#0066cc',
    lineHeight: 18,
  },
  inputGroup: {
    marginBottom: 16,
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
  inputContainerError: {
    borderColor: '#d32f2f',
    borderWidth: 2,
    backgroundColor: '#fff5f5',
  },
  inputContainerSuccess: {
    borderColor: '#28a745',
    borderWidth: 2,
    backgroundColor: '#f5fff5',
  },
  inputIcon: {
    marginRight: 10,
  },
  statusIcon: {
    marginLeft: 8,
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
  matchErrorText: {
    color: '#d32f2f',
    fontSize: 12,
    marginTop: 6,
    fontWeight: '500',
  },
  matchSuccessText: {
    color: '#28a745',
    fontSize: 12,
    marginTop: 6,
    fontWeight: '500',
  },
  matchText: {
    fontSize: 12,
    color: '#28a745',
    marginTop: 4,
    fontWeight: '500',
  },
  mismatchText: {
    fontSize: 12,
    color: '#d32f2f',
    marginTop: 4,
    fontWeight: '500',
  },
  requirementsBox: {
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#0066cc',
  },
  requirementsTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  requirement: {
    fontSize: 13,
    marginBottom: 6,
    fontWeight: '500',
  },
  requirementMet: {
    color: '#28a745',
  },
  requirementUnmet: {
    color: '#999',
  },
  errorBox: {
    backgroundColor: '#fee',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#d32f2f',
  },
  errorText: {
    fontSize: 13,
    color: '#d32f2f',
    marginBottom: 4,
  },
  tipsBox: {
    backgroundColor: '#f0f8f0',
    borderRadius: 8,
    padding: 14,
    borderLeftWidth: 4,
    borderLeftColor: '#28a745',
    marginBottom: 20,
  },
  tipsTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#28a745',
    marginBottom: 10,
  },
  tip: {
    fontSize: 12,
    color: '#28a745',
    marginBottom: 6,
    lineHeight: 16,
  },
  footer: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  changeButton: {
    backgroundColor: '#0066cc',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  buttonDisabled: {
    backgroundColor: '#999',
  },
  changeButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  skipButton: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  skipButtonText: {
    color: '#0066cc',
    fontSize: 14,
    fontWeight: '500',
  },
});

export default RepPasswordChangeScreen;
