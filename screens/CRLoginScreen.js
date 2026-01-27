import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { useState } from 'react';
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
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { auth, db } from '../firebase/firebaseConfig';

const CRLoginScreen = () => {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  /**
   * Validate CR access after Firebase authentication
   * Checks if user has an active CR record in Firestore
   */
  const validateCRAccess = async (userEmail, userUid) => {
    try {
      const normalizedEmail = userEmail.toLowerCase().trim();
      console.log('🔍 Validating CR access for:', normalizedEmail);
      console.log('   Auth UID:', userUid);

      // STEP 1: Check users collection for CR metadata (fastest path)
      console.log('📋 Checking users collection for CR metadata...');
      const userDocRef = doc(db, 'users', userUid);
      const userSnap = await getDoc(userDocRef);

      let userData = null;
      if (userSnap.exists()) {
        userData = userSnap.data();
        console.log('✅ Found user record by UID');
      } else {
        console.log('⚠️ No record found by UID, attempting email query fallback...');
        const usersRef = collection(db, 'users');
        const emailQuery = query(usersRef, where('email', '==', normalizedEmail));
        const emailSnap = await getDocs(emailQuery);

        if (!emailSnap.empty) {
          userData = emailSnap.docs[0].data();
          console.log('✅ Found user record by Email');
        }
      }

      if (userData) {
        console.log('📊 Found User Data fields:', {
          role: userData.role,
          role_level: userData.role_level,
          isCR: userData.isCR,
          active: userData.active
        });

        const roleStr = String(userData.role || '').toLowerCase();
        const isCRFlag = !!userData.isCR;
        const roleLevel = String(userData.role_level || '').toLowerCase();
        const isCRRole = roleStr === 'cr' || roleStr.indexOf('cr') > -1 || roleStr.indexOf('class_representative') > -1 || roleLevel === 'cr';

        console.log('📊 CR Validation Checks:', {
          roleStr,
          isCRFlag,
          roleLevel,
          isCRRole,
          finalResult: isCRFlag || isCRRole
        });

        if (isCRFlag || isCRRole) {
          const crData = {
            id: userUid,
            name: userData.name || userEmail || '',
            email: normalizedEmail || '',
            year: userData.year || 'year_1',
            currentYear: parseInt(userData.currentYear || userData.year_level || 1, 10),
            departmentName: userData.crDepartment || userData.departmentName || '',
            departmentId: userData.departmentCode || userData.departmentId || '',
            isCR: true,
            role: 'cr',
            studentId: userData.studentId || userData.rollNo || userData.rollNumber || ''
          };

          console.log('✅ CR VALIDATION SUCCESS:', {
            name: crData.name,
            year: crData.year,
            department: crData.departmentName
          });

          return {
            isValid: true,
            crData,
            message: 'Valid CR access'
          };
        }

        // Not a CR under simple rules
        return {
          isValid: false,
          crData: null,
          message: 'You are not a Class Representative'
        };
      } else {
        console.log('❌ User record not found in users collection after all attempts');
        return {
          isValid: false,
          crData: null,
          message: 'User account not properly configured'
        };
      }

    } catch (error) {
      console.error('❌ Error validating CR access:', error);
      return {
        isValid: false,
        crData: null,
        message: `Validation error: ${error.message}`
      };
    }
  };

  const handleLogin = async () => {
    // Validate inputs
    if (!email.trim()) {
      Alert.alert('Missing Email', 'Please enter your email address');
      return;
    }

    if (!password.trim()) {
      Alert.alert('Missing Password', 'Please enter your password');
      return;
    }

    try {
      setLoading(true);

      // Step 1: Firebase Authentication
      console.log('🔐 Attempting Firebase login...');
      const userCredential = await signInWithEmailAndPassword(
        auth,
        email.toLowerCase().trim(),
        password
      );

      const user = userCredential.user;
      console.log('✅ Firebase auth successful:', user.email, 'UID:', user.uid);

      // Step 2: Firestore Validation (CRITICAL)
      console.log('🔍 Validating CR access in Firestore...');
      const validation = await validateCRAccess(user.email, user.uid);

      if (!validation.isValid) {
        // Access denied - logout immediately
        console.error('❌ CR access denied:', validation.message);
        await signOut(auth);

        Alert.alert(
          'Access Denied',
          validation.message + '\n\nYou must be an active Class Representative to access this portal.'
        );
        setLoading(false);
        return;
      }

      // Step 3: Access granted - store CR data
      console.log('✅ CR access validated successfully');

      const crData = validation.crData;

      // Store CR session data
      await AsyncStorage.setItem('userRole', 'class_representative');
      await AsyncStorage.setItem('crData', JSON.stringify(crData));
      await AsyncStorage.setItem('year', String(crData.year || 'year_1'));
      await AsyncStorage.setItem('departmentCode', String(crData.departmentId || crData.departmentCode || ''));
      await AsyncStorage.setItem('departmentName', String(crData.departmentName || ''));
      await AsyncStorage.setItem('studentId', String(crData.studentId || ''));
      await AsyncStorage.setItem('authUid', String(user.uid || ''));

      console.log('✅ Session stored:', {
        name: crData.name,
        year: crData.year,
        department: crData.departmentName,
        uid: user.uid
      });

      Alert.alert(
        'Login Successful',
        `Welcome ${crData.name}!\n\nYear: ${crData.year}\nDepartment: ${crData.departmentName}`,
        [
          {
            text: 'Continue',
            onPress: () => {
              setLoading(false);
              router.replace('/cr-dashboard');
            }
          }
        ]
      );

    } catch (error) {
      console.error('Login error:', error);

      let errorMessage = 'Login failed. Please try again.';

      if (error.code === 'auth/invalid-credential' || error.code === 'auth/wrong-password') {
        errorMessage = 'Invalid email or password.\n\nIf your password was recently changed, use the new credentials provided by your faculty.';
      } else if (error.code === 'auth/user-not-found') {
        errorMessage = 'No account found with this email.\n\nPlease contact your faculty advisor.';
      } else if (error.code === 'auth/too-many-requests') {
        errorMessage = 'Too many failed attempts. Please try again later.';
      } else if (error.code === 'auth/network-request-failed') {
        errorMessage = 'Network error. Please check your internet connection.';
      } else if (error.message) {
        errorMessage = error.message;
      }

      Alert.alert('Login Failed', errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity
              onPress={() => router.back()}
              style={styles.backButton}
            >
              <Ionicons name="chevron-back" size={24} color="#0f5f73" />
            </TouchableOpacity>
          </View>

          {/* Logo/Icon */}
          <View style={styles.logoContainer}>
            <View style={styles.iconCircle}>
              <Ionicons name="shield-checkmark" size={48} color="#0f5f73" />
            </View>
            <Text style={styles.title}>Class Representative</Text>
            <Text style={styles.subtitle}>Login to your CR portal</Text>
          </View>

          {/* Login Form */}
          <View style={styles.formContainer}>
            {/* Email Input */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Email Address</Text>
              <View style={styles.inputWrapper}>
                <Ionicons name="mail-outline" size={20} color="#7f8c8d" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="your.email@example.com"
                  placeholderTextColor="#95a5a6"
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  autoComplete="email"
                  editable={!loading}
                />
              </View>
            </View>

            {/* Password Input */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Password</Text>
              <View style={styles.inputWrapper}>
                <Ionicons name="lock-closed-outline" size={20} color="#7f8c8d" style={styles.inputIcon} />
                <TextInput
                  style={styles.input}
                  placeholder="Enter your password"
                  placeholderTextColor="#95a5a6"
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  editable={!loading}
                />
                <TouchableOpacity
                  onPress={() => setShowPassword(!showPassword)}
                  style={styles.eyeIcon}
                >
                  <Ionicons
                    name={showPassword ? "eye-outline" : "eye-off-outline"}
                    size={20}
                    color="#7f8c8d"
                  />
                </TouchableOpacity>
              </View>
            </View>

            {/* Info Box */}
            <View style={styles.infoBox}>
              <Ionicons name="information-circle-outline" size={20} color="#3498db" />
              <Text style={styles.infoText}>
                Use the credentials provided by your faculty advisor
              </Text>
            </View>

            {/* Login Button */}
            <TouchableOpacity
              style={[styles.loginButton, loading && styles.loginButtonDisabled]}
              onPress={handleLogin}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#ffffff" size="small" />
              ) : (
                <>
                  <Text style={styles.loginButtonText}>Login</Text>
                  <Ionicons name="arrow-forward" size={20} color="#ffffff" />
                </>
              )}
            </TouchableOpacity>

            {/* Forgot Password Link */}
            <TouchableOpacity
              onPress={() => router.push('/cr-forgot-password')}
              disabled={loading}
              style={styles.forgotPasswordLink}
            >
              <Ionicons name="key-outline" size={16} color="#0f5f73" style={styles.forgotIcon} />
              <Text style={styles.forgotPasswordText}>Forgot Password?</Text>
            </TouchableOpacity>
          </View>

          {/* Security Notice */}
          <View style={styles.securityNotice}>
            <Ionicons name="shield-checkmark-outline" size={16} color="#2f6f44" />
            <Text style={styles.securityText}>
              Secure access - Only active CRs can login
            </Text>
          </View>

          {/* Help Text */}
          <View style={styles.helpContainer}>
            <Text style={styles.helpText}>
              Need help? Contact your faculty advisor
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
  },
  header: {
    paddingVertical: 16,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  logoContainer: {
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 40,
  },
  iconCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#e8f4f8',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: '#2c3e50',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#7f8c8d',
    fontWeight: '500',
  },
  formContainer: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
  },
  inputGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#2c3e50',
    marginBottom: 8,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f7f8fa',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e6e9ee',
    paddingHorizontal: 12,
  },
  inputIcon: {
    marginRight: 8,
  },
  input: {
    flex: 1,
    height: 48,
    fontSize: 14,
    color: '#2c3e50',
  },
  eyeIcon: {
    padding: 8,
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#d6eaf8',
    borderRadius: 8,
    padding: 12,
    marginBottom: 24,
    borderLeftWidth: 3,
    borderLeftColor: '#3498db',
  },
  infoText: {
    flex: 1,
    fontSize: 12,
    color: '#2c3e50',
    marginLeft: 8,
    lineHeight: 18,
  },
  loginButton: {
    backgroundColor: '#0f5f73',
    borderRadius: 12,
    height: 52,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#0f5f73',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  loginButtonDisabled: {
    backgroundColor: '#95a5a6',
  },
  loginButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
    marginRight: 8,
  },
  forgotPasswordLink: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 16,
    paddingVertical: 10,
  },
  forgotIcon: {
    marginRight: 6,
  },
  forgotPasswordText: {
    fontSize: 14,
    color: '#0f5f73',
    fontWeight: '600',
  },
  securityNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 24,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#d5f4e6',
    borderRadius: 8,
  },
  securityText: {
    fontSize: 12,
    color: '#2f6f44',
    fontWeight: '600',
    marginLeft: 8,
  },
  helpContainer: {
    alignItems: 'center',
    marginTop: 24,
    marginBottom: 24,
  },
  helpText: {
    fontSize: 13,
    color: '#7f8c8d',
    textAlign: 'center',
  },
});

export default CRLoginScreen;
