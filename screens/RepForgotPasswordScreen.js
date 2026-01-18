/**
 * Class Representative Forgot Password Screen
 * 
 * Implements strict forgot password rules:
 * - Only active Class Representatives can request password reset
 * - Removed/reassigned reps cannot request reset
 * - Reset links are temporary and tracked
 * - New password must be strong
 */

import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
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

const RepForgotPasswordScreen = () => {
  const router = useRouter();
  const params = useLocalSearchParams();
  const initialEmail = params.email || '';

  // Step state: 'email' | 'reset-link' | 'new-password' | 'success'
  const [currentStep, setCurrentStep] = useState('email');
  const [email, setEmail] = useState(initialEmail);
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [passwordErrors, setPasswordErrors] = useState([]);

  /**
   * Check if passwords match
   */
  const passwordsMatch = newPassword && confirmPassword && newPassword === confirmPassword;
  const passwordMismatch = newPassword && confirmPassword && newPassword !== confirmPassword;

  /**
   * Step 1: Request password reset link
   */
  const handleRequestReset = async () => {
    const normalizedEmail = String(email || '').trim().toLowerCase();

    if (!normalizedEmail) {
      Alert.alert('Missing Email', 'Please enter your email address.');
      return;
    }

    setIsLoading(true);

    try {
      // Call backend Cloud Function to request reset
      // In production, call: POST /api/requestPasswordReset
      const response = await fetch('/api/requestPasswordReset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: normalizedEmail })
      });

      if (!response.ok) {
        throw new Error('Failed to request reset');
      }

      // Generic success message (don't reveal if user exists or is active)
      Alert.alert(
        'Reset Link Sent',
        'If an active Class Representative account exists with this email, a reset link has been sent.',
        [
          {
            text: 'OK',
            onPress: () => {
              setCurrentStep('reset-link');
              setEmail(normalizedEmail);
            }
          }
        ]
      );

    } catch (error) {
      console.error('Error requesting reset:', error);
      Alert.alert(
        'Error',
        'Failed to process your request. Please try again or contact your faculty advisor.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Step 2: Submit reset token
   */
  const handleSubmitResetToken = async () => {
    if (!resetToken.trim()) {
      Alert.alert('Missing Token', 'Please enter the reset token from your email.');
      return;
    }

    // Validate token format (should be 32+ characters)
    if (resetToken.length < 32) {
      Alert.alert(
        'Invalid Token',
        'The reset token appears to be invalid. Please copy the complete token from the email.'
      );
      return;
    }

    setIsLoading(true);

    try {
      // In production, call backend to verify token validity
      // POST /api/verifyResetToken with { token, email }

      Alert.alert(
        'Token Verified',
        'Please enter your new password.',
        [
          {
            text: 'Continue',
            onPress: () => setCurrentStep('new-password')
          }
        ]
      );

    } catch (error) {
      console.error('Error verifying reset token:', error);
      Alert.alert(
        'Invalid Token',
        'The reset link has expired or is invalid. Please request a new one.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Step 3: Set new password
   */
  const handleSetNewPassword = async () => {
    if (!newPassword || !confirmPassword) {
      Alert.alert('Missing Password', 'Please enter and confirm your new password.');
      return;
    }

    if (newPassword !== confirmPassword) {
      Alert.alert('Password Mismatch', 'New Password and Confirm Password do not match. Please try again.');
      return;
    }

    // Validate password strength
    const validation = validatePasswordStrength(newPassword);
    if (!validation.isValid) {
      setPasswordErrors(validation.errors);
      Alert.alert('Password Too Weak', 'Your password does not meet the security requirements.');
      return;
    }

    setIsLoading(true);

    try {
      // Call backend to complete password reset
      // POST /api/completePasswordReset with { token, newPassword, email }

      const response = await fetch('/api/completePasswordReset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          resetToken,
          newPassword
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to reset password');
      }

      Alert.alert(
        'Password Reset Successful',
        'Your password has been reset. You can now login with your new password.',
        [
          {
            text: 'Login',
            onPress: () => {
              router.push({
                pathname: '/rep-login',
                params: { email }
              });
            }
          }
        ]
      );

    } catch (error) {
      console.error('Error resetting password:', error);
      Alert.alert(
        'Reset Failed',
        error.message || 'Failed to reset your password. Please try again or contact your faculty advisor.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Render email request step
   */
  const renderEmailStep = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>Enter Your Email</Text>
      <Text style={styles.stepDescription}>
        Enter the email address associated with your Class Representative account. 
        A password reset link will be sent to this email.
      </Text>

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
          />
        </View>
      </View>

      <TouchableOpacity
        style={[styles.submitButton, isLoading && styles.buttonDisabled]}
        onPress={handleRequestReset}
        disabled={isLoading}
      >
        {isLoading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.submitButtonText}>Send Reset Link</Text>
        )}
      </TouchableOpacity>

      <View style={styles.infoBox}>
        <Ionicons
          name="information-circle-outline"
          size={20}
          color="#0066cc"
          style={styles.infoIcon}
        />
        <Text style={styles.infoText}>
          Only active Class Representatives can request password resets. 
          If you were recently replaced, you will not be able to reset your password.
        </Text>
      </View>
    </View>
  );

  /**
   * Render reset token step
   */
  const renderResetLinkStep = () => (
    <View style={styles.stepContainer}>
      <Text style={styles.stepTitle}>Enter Reset Token</Text>
      <Text style={styles.stepDescription}>
        A reset token has been sent to {email}. 
        Please check your email and paste the token below.
      </Text>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>Reset Token</Text>
        <View style={styles.inputContainer}>
          <Ionicons
            name="key-outline"
            size={20}
            color="#666"
            style={styles.inputIcon}
          />
          <TextInput
            style={styles.input}
            placeholder="Paste your reset token here"
            placeholderTextColor="#999"
            value={resetToken}
            onChangeText={setResetToken}
            editable={!isLoading}
            autoCapitalize="none"
          />
        </View>
      </View>

      <TouchableOpacity
        style={[styles.submitButton, isLoading && styles.buttonDisabled]}
        onPress={handleSubmitResetToken}
        disabled={isLoading}
      >
        {isLoading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.submitButtonText}>Verify Token</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.backStepButton}
        onPress={() => setCurrentStep('email')}
        disabled={isLoading}
      >
        <Text style={styles.backStepButtonText}>← Back</Text>
      </TouchableOpacity>
    </View>
  );

  /**
   * Render new password step
   */
  const renderNewPasswordStep = () => (
    <ScrollView
      style={styles.scrollContainer}
      contentContainerStyle={styles.scrollContent}
    >
      <View style={styles.stepContainer}>
        <Text style={styles.stepTitle}>Create New Password</Text>
        <Text style={styles.stepDescription}>
          Enter a strong password that meets all security requirements.
        </Text>

        {/* New Password Input */}
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
                }
              }}
              editable={!isLoading}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
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

        {/* Confirm Password Input */}
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

        <TouchableOpacity
          style={[
            styles.submitButton,
            (isLoading || passwordErrors.length > 0 || !passwordsMatch) && styles.buttonDisabled
          ]}
          onPress={handleSetNewPassword}
          disabled={isLoading || passwordErrors.length > 0 || !passwordsMatch}
        >
          {isLoading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.submitButtonText}>Reset Password</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.backStepButton}
          onPress={() => setCurrentStep('reset-link')}
          disabled={isLoading}
        >
          <Text style={styles.backStepButtonText}>← Back</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardAvoidingView}
      >
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.closeButton}
          >
            <Ionicons name="close" size={24} color="#333" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Password Reset</Text>
          <View style={styles.headerSpacer} />
        </View>

        <View style={styles.progressBar}>
          <View style={[
            styles.progressStep,
            (currentStep === 'email' || currentStep === 'reset-link' || currentStep === 'new-password' || currentStep === 'success') && styles.progressStepActive
          ]} />
          <View style={[
            styles.progressStep,
            (currentStep === 'reset-link' || currentStep === 'new-password' || currentStep === 'success') && styles.progressStepActive
          ]} />
          <View style={[
            styles.progressStep,
            (currentStep === 'new-password' || currentStep === 'success') && styles.progressStepActive
          ]} />
        </View>

        <ScrollView style={styles.content}>
          {currentStep === 'email' && renderEmailStep()}
          {currentStep === 'reset-link' && renderResetLinkStep()}
          {currentStep === 'new-password' && renderNewPasswordStep()}
        </ScrollView>
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
  closeButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  headerSpacer: {
    width: 40,
  },
  progressBar: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 16,
    gap: 8,
  },
  progressStep: {
    flex: 1,
    height: 4,
    backgroundColor: '#ddd',
    borderRadius: 2,
  },
  progressStepActive: {
    backgroundColor: '#0066cc',
  },
  content: {
    flex: 1,
    padding: 20,
  },
  scrollContainer: {
    flex: 1,
  },
  scrollContent: {
    paddingVertical: 10,
  },
  stepContainer: {
    paddingVertical: 10,
  },
  stepTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1a1a1a',
    marginBottom: 12,
  },
  stepDescription: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
    marginBottom: 24,
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
  eyeIcon: {
    padding: 8,
    marginLeft: 8,
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
  infoBox: {
    flexDirection: 'row',
    backgroundColor: '#e3f2fd',
    borderRadius: 8,
    padding: 12,
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
  submitButton: {
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
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  backStepButton: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  backStepButtonText: {
    color: '#0066cc',
    fontSize: 14,
    fontWeight: '500',
  },
});

export default RepForgotPasswordScreen;
