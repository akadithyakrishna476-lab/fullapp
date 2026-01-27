/**
 * Faculty Password Change Screen
 * 
 * Allows faculty members to change their password.
 * New password must follow the strict faculty format: name@1234
 */

import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { updatePassword, reauthenticateWithCredential, EmailAuthProvider } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
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
import { auth, db } from '../firebase/firebaseConfig';
import { validateFacultyPassword } from '../utils/facultyPasswordValidator';

const FacultyPasswordChangeScreen = () => {
  const router = useRouter();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [facultyName, setFacultyName] = useState('');
  const [facultyEmail, setFacultyEmail] = useState('');
  const [passwordError, setPasswordError] = useState('');

  // Load faculty profile on mount
  useEffect(() => {
    const loadFacultyProfile = async () => {
      try {
        const user = auth.currentUser;
        if (user) {
          const facultyDocRef = doc(db, 'faculty', user.uid);
          const facultyDoc = await getDoc(facultyDocRef);
          if (facultyDoc.exists()) {
            const data = facultyDoc.data();
            setFacultyName(data.name || '');
            setFacultyEmail(user.email || '');
          }
        }
      } catch (error) {
        console.error('Error loading faculty profile:', error);
      }
    };

    loadFacultyProfile();
  }, []);

  /**
   * Check if passwords match
   */
  const passwordsMatch = newPassword && confirmPassword && newPassword === confirmPassword;
  const passwordMismatch = newPassword && confirmPassword && newPassword !== confirmPassword;

  /**
   * Validate new password format
   */
  const validateNewPassword = (password) => {
    if (!password) {
      return { isValid: false, error: 'New password is required' };
    }

    if (!facultyName) {
      return { isValid: false, error: 'Faculty name not found' };
    }

    // Validate faculty password format
    const validation = validateFacultyPassword(password, facultyName);
    return validation;
  };

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

    // Validate new password format for faculty
    const newPasswordValidation = validateNewPassword(newPassword);
    if (!newPasswordValidation.isValid) {
      Alert.alert('Invalid Password Format', newPasswordValidation.error);
      return;
    }

    setIsLoading(true);

    try {
      const user = auth.currentUser;
      if (!user) {
        throw new Error('No authenticated user found');
      }

      // Reauthenticate user with current password
      const credential = EmailAuthProvider.credential(user.email, currentPassword);
      await reauthenticateWithCredential(user, credential);

      // Update password
      await updatePassword(user, newPassword);

      Alert.alert(
        'Success',
        'Your password has been successfully changed.',
        [
          {
            text: 'OK',
            onPress: () => router.back()
          }
        ]
      );

    } catch (error) {
      console.error('Error changing password:', error);
      let errorMessage = 'Failed to change password. Please try again.';

      if (error.code === 'auth/wrong-password') {
        errorMessage = 'Current password is incorrect. Please try again.';
      } else if (error.code === 'auth/weak-password') {
        errorMessage = 'The password is too weak. Please use a stronger password.';
      } else if (error.code === 'auth/requires-recent-login') {
        errorMessage = 'Please log in again before changing your password.';
      }

      Alert.alert('Error', errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardAvoidingView}
      >
        <View style={styles.header}>
          <TouchableOpacity 
            onPress={() => router.back()}
            style={styles.backButton}
          >
            <Ionicons name="chevron-back" size={24} color="#0f5f73" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Change Password</Text>
          <View style={styles.backButton} />
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {/* Info Box */}
          <View style={styles.infoBox}>
            <Ionicons
              name="information-circle-outline"
              size={20}
              color="#0066cc"
              style={styles.infoIcon}
            />
            <Text style={styles.infoText}>
              Your password must follow the faculty format:
              <Text style={styles.formatBold}> {facultyName ? facultyName.toLowerCase().replace(/\s+/g, '') : 'name'}@1234</Text>
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
                placeholder={facultyName ? `${facultyName.toLowerCase().replace(/\s+/g, '')}@1234` : 'Format: name@1234'}
                placeholderTextColor="#999"
                value={newPassword}
                onChangeText={(text) => {
                  setNewPassword(text);
                  const validation = validateNewPassword(text);
                  if (!validation.isValid && text.length > 0) {
                    setPasswordError(validation.error);
                  } else {
                    setPasswordError('');
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
            {passwordError && <Text style={styles.errorText}>{passwordError}</Text>}
          </View>

          {/* Password Format Requirements */}
          <View style={styles.requirementsBox}>
            <Text style={styles.requirementsTitle}>Faculty Password Format:</Text>
            <Text style={[
              styles.requirement,
              newPassword.toLowerCase().startsWith(facultyName ? facultyName.toLowerCase().replace(/\s+/g, '') : '') ? styles.requirementMet : styles.requirementUnmet
            ]}>
              {newPassword.toLowerCase().startsWith(facultyName ? facultyName.toLowerCase().replace(/\s+/g, '') : '') ? '✓' : '○'} Starts with your name (lowercase, no spaces)
            </Text>
            <Text style={[
              styles.requirement,
              newPassword.includes('@') ? styles.requirementMet : styles.requirementUnmet
            ]}>
              {newPassword.includes('@') ? '✓' : '○'} Contains @ symbol
            </Text>
            <Text style={[
              styles.requirement,
              /\d{4}$/.test(newPassword) ? styles.requirementMet : styles.requirementUnmet
            ]}>
              {/\d{4}$/.test(newPassword) ? '✓' : '○'} Ends with exactly 4 digits
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
                placeholder="Confirm your new password"
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

          {/* Security Tips */}
          <View style={styles.tipsBox}>
            <Text style={styles.tipsTitle}>💡 Tips</Text>
            <Text style={styles.tip}>• Your password must follow the faculty format: name@1234</Text>
            <Text style={styles.tip}>• Example: anu@2321, anitha@1023</Text>
            <Text style={styles.tip}>• Use lowercase name without spaces</Text>
          </View>
        </ScrollView>

        {/* Action Buttons */}
        <View style={styles.footer}>
          <TouchableOpacity
            style={[
              styles.changeButton,
              (isLoading || passwordError || !currentPassword || !newPassword || !passwordsMatch) && styles.buttonDisabled
            ]}
            onPress={handleChangePassword}
            disabled={isLoading || !!passwordError || !currentPassword || !newPassword || !passwordsMatch}
          >
            {isLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.changeButtonText}>Change Password</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.cancelButton}
            onPress={() => router.back()}
            disabled={isLoading}
          >
            <Text style={styles.cancelButtonText}>Cancel</Text>
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  backButton: {
    padding: 8,
    width: 40,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#2c3e50',
  },
  content: {
    flex: 1,
    padding: 16,
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
  formatBold: {
    fontWeight: '600',
    color: '#0066cc',
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
  errorText: {
    color: '#d32f2f',
    fontSize: 12,
    marginTop: 6,
    fontWeight: '500',
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
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  changeButton: {
    backgroundColor: '#0f5f73',
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
  cancelButton: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#0f5f73',
    fontSize: 14,
    fontWeight: '500',
  },
});

export default FacultyPasswordChangeScreen;
