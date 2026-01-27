import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { collection, doc, getDocs, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import { validateFacultyPassword } from '../utils/facultyPasswordValidator';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { auth, db } from '../firebase/firebaseConfig';

const FacultyRegisterScreen = () => {
  const router = useRouter();
  const [facultyName, setFacultyName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [designation, setDesignation] = useState('');
  const [selectedCollege, setSelectedCollege] = useState(null);
  const [selectedCollegeName, setSelectedCollegeName] = useState('');
  const [selectedDepartment, setSelectedDepartment] = useState(null);
  const [selectedDepartmentName, setSelectedDepartmentName] = useState('');
  const [colleges, setColleges] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [departmentsLoading, setDepartmentsLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [collegeQuery, setCollegeQuery] = useState('');
  const [departmentQuery, setDepartmentQuery] = useState('');
  const [showCollegeSuggestions, setShowCollegeSuggestions] = useState(false);
  const [showDepartmentSuggestions, setShowDepartmentSuggestions] = useState(false);
  const [errors, setErrors] = useState({});
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [confirmPasswordVisible, setConfirmPasswordVisible] = useState(false);
  const [focusedField, setFocusedField] = useState(null);
  const [passwordError, setPasswordError] = useState('');
  const [confirmPasswordError, setConfirmPasswordError] = useState('');
  const [facultyNameError, setFacultyNameError] = useState('');
  const [emailError, setEmailError] = useState('');

  // Validation helper functions
  const isValidFacultyName = (name) => {
    if (!name.trim()) return false;
    if (name.trim().length < 3) return false;
    // Allow only letters and spaces
    return /^[a-zA-Z\s]+$/.test(name);
  };

  const isValidEmail = (email) => {
    if (!email.trim()) return false;

    const trimmedEmail = email.trim().toLowerCase();

    // Strict email validation (RFC 5322 compliant)
    // Format: localpart@domain
    const emailRegex = /^[a-zA-Z0-9._%-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

    if (!emailRegex.test(trimmedEmail)) return false;

    // Additional validation rules
    const [localPart, domain] = trimmedEmail.split('@');

    // Local part validations
    if (localPart.length === 0 || localPart.length > 64) return false; // RFC 5321
    if (localPart.startsWith('.') || localPart.endsWith('.')) return false;
    if (localPart.includes('..')) return false;

    // Domain validations
    if (domain.length === 0 || domain.length > 255) return false; // RFC 5321
    if (domain.startsWith('.') || domain.endsWith('.')) return false;
    if (domain.includes('..')) return false;
    if (!domain.includes('.')) return false;

    // Domain must have valid TLD (at least 2 characters, at least 1 letter)
    const domainParts = domain.split('.');
    const tld = domainParts[domainParts.length - 1];
    if (tld.length < 2 || !/[a-zA-Z]/.test(tld)) return false;

    // Each domain label must not start or end with hyphen
    if (domainParts.some(part => part.startsWith('-') || part.endsWith('-'))) return false;

    return true;
  };

  useEffect(() => {
    const fetchColleges = async () => {
      try {
        setLoadingData(true);

        const collegesQuery = query(
          collection(db, 'colleges'),
          where('isActive', '==', true)
        );
        const collegesSnapshot = await getDocs(collegesQuery);
        const collegesList = collegesSnapshot.docs.map(d => ({
          id: d.id,
          name: d.data().name,
        }));
        setColleges(collegesList);
      } catch (error) {
        console.error('Error fetching colleges:', error);
        Alert.alert('Error', 'Failed to load colleges. Please check your connection.');
      } finally {
        setLoadingData(false);
      }
    };

    fetchColleges();
  }, []);

  // Fetch departments for a specific college (subcollection: colleges/{collegeId}/departments)
  const fetchDepartments = async (collegeId) => {
    setDepartments([]);
    if (!collegeId) return;
    try {
      setDepartmentsLoading(true);
      const deptsRef = collection(db, 'colleges', collegeId, 'departments');
      const deptsSnapshot = await getDocs(query(deptsRef, where('isActive', '==', true)));
      const deptsList = deptsSnapshot.docs.map(d => ({ id: d.id, name: d.data().name }));
      setDepartments(deptsList);
    } catch (error) {
      console.error('Error fetching departments:', error);
      Alert.alert('Error', 'Failed to load departments for the selected college.');
    } finally {
      setDepartmentsLoading(false);
    }
  };

  const getCollegeName = () => {
    const college = colleges.find(c => c.id === selectedCollege);
    return college ? college.name : 'Select College';
  };

  const getDepartmentName = () => {
    const department = departments.find(d => d.id === selectedDepartment);
    return department ? department.name : 'Select Department';
  };

  // Validation function
  const validateForm = () => {
    const newErrors = {};

    if (!facultyName.trim()) {
      newErrors.facultyName = 'Name is required';
    } else if (!isValidFacultyName(facultyName)) {
      newErrors.facultyName = 'Invalid name format';
    }

    if (!email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!isValidEmail(email)) {
      newErrors.email = 'Invalid email address';
    }

    if (!password.trim()) {
      newErrors.password = 'Password is required';
    } else {
      // Validate faculty password format
      const passwordValidation = validateFacultyPassword(password, facultyName);
      if (!passwordValidation.isValid) {
        newErrors.password = passwordValidation.error;
      }
    }
    
    if (!confirmPassword.trim()) {
      newErrors.confirmPassword = 'Please confirm your password';
    } else if (password !== confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
    }
    
    if (!designation.trim()) newErrors.designation = 'Designation is required';
    if (!selectedCollege) newErrors.college = 'College is required';
    if (!selectedDepartment) newErrors.department = 'Department is required';

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Faculty Name - allow only letters and spaces, minimum 3 characters
  const handleFacultyNameChange = (text) => {
    // Filter to allow only letters and spaces
    const filteredText = text
      .split('')
      .filter(char => /[a-zA-Z\s]/.test(char))
      .join('');

    setFacultyName(filteredText);
    setErrors(prev => ({ ...prev, facultyName: undefined }));

    // Show helper text if input contains invalid characters
    if (filteredText !== text) {
      setFacultyNameError('Letters and spaces only');
      setTimeout(() => setFacultyNameError(''), 3000);
    } else {
      setFacultyNameError('');
    }
  };

  // Email validation - show helper text
  const handleEmailChange = (text) => {
    const lowerText = text.toLowerCase();
    setEmail(lowerText);
    setErrors(prev => ({ ...prev, email: undefined }));

    // Clear helper text
    setEmailError('');
  };

  // Password validation - only allow letters, numbers, and special characters (no spaces/emojis)
  const isValidPasswordChar = (text) => {
    // Allow: A-Z, a-z, 0-9, and special chars: !@#$%^&*()_+-=
    const validPattern = /^[A-Za-z0-9!@#$%^&*()_+\-=]*$/;
    return validPattern.test(text);
  };

  const handlePasswordChange = (text) => {
    // Filter out invalid characters
    const filteredText = text
      .split('')
      .filter(char => isValidPasswordChar(char))
      .join('');

    setPassword(filteredText);

    // Show error message if user tried to enter invalid characters
    if (filteredText !== text) {
      setPasswordError('Password can contain only letters, numbers, and special characters');
      setTimeout(() => setPasswordError(''), 3000);
    } else {
      setPasswordError('');
    }

    setErrors(prev => ({ ...prev, password: undefined }));
  };

  const handleConfirmPasswordChange = (text) => {
    // Filter out invalid characters
    const filteredText = text
      .split('')
      .filter(char => isValidPasswordChar(char))
      .join('');

    setConfirmPassword(filteredText);

    // Show error message if user tried to enter invalid characters
    if (filteredText !== text) {
      setConfirmPasswordError('Password can contain only letters, numbers, and special characters');
      setTimeout(() => setConfirmPasswordError(''), 3000);
    } else {
      setConfirmPasswordError('');
    }

    setErrors(prev => ({ ...prev, confirmPassword: undefined }));
  };

  // Register handler
  const handleRegister = async () => {
    if (!validateForm()) {
      return;
    }

    try {
      setLoading(true);

      // Create user with email and password
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        email.trim().toLowerCase(),
        password
      );

      const user = userCredential.user;

      // Save common user profile first
      const userDocRef = doc(db, 'users', user.uid);
      await setDoc(userDocRef, {
        name: facultyName.trim(),
        email: email.trim().toLowerCase(),
        role: 'faculty',
        collegeId: selectedCollege,
        departmentId: selectedDepartment,
        designation: designation.trim(),
        createdAt: serverTimestamp(),
      });

      // Then save faculty-specific details to faculty collection
      try {
        const facultyDocRef = doc(db, 'faculty', user.uid);
        await setDoc(facultyDocRef, {
          name: facultyName.trim(),
          email: email.trim().toLowerCase(),
          role: 'faculty',
          collegeId: selectedCollege,
          departmentId: selectedDepartment,
          designation: designation.trim(),
          collegeName: selectedCollegeName || null,
          departmentName: selectedDepartmentName || null,
          createdAt: serverTimestamp(),
        });
      } catch (facultyErr) {
        console.error('Failed to write faculty profile:', facultyErr);
        throw facultyErr;
      }

      Alert.alert(
        'Success',
        'Account created successfully! You can now login.',
        [
          {
            text: 'OK',
            onPress: () => {
              // Clear form
              setFacultyName('');
              setEmail('');
              setPassword('');
              setConfirmPassword('');
              setDesignation('');
              setSelectedCollege(null);
              setSelectedCollegeName('');
              setSelectedDepartment(null);
              setSelectedDepartmentName('');
              // Navigate to login
              router.push('/faculty-login');
            },
          },
        ]
      );
    } catch (error) {
      let errorMessage = 'An error occurred during registration';

      if (error.code === 'auth/email-already-in-use') {
        errorMessage = 'This email is already registered. Please use a different email or try logging in.';
      } else if (error.code === 'auth/invalid-email') {
        errorMessage = 'The email address is invalid.';
      } else if (error.code === 'auth/weak-password') {
        errorMessage = 'The password is too weak. Please use a stronger password.';
      } else if (error.code === 'auth/operation-not-allowed') {
        errorMessage = 'Email/password accounts are not enabled.';
      } else if (error.code === 'auth/too-many-requests') {
        errorMessage = 'Too many failed login attempts. Please try again later.';
      }

      Alert.alert('Registration Error', errorMessage);
      console.error('Registration error:', error);
    } finally {
      setLoading(false);
    }
  };

  // Filter colleges based on query
  const filteredColleges = colleges.filter(c =>
    c.name.toLowerCase().includes(collegeQuery.toLowerCase())
  );

  // Filter departments based on query
  const filteredDepartments = departments.filter(d =>
    d.name.toLowerCase().includes(departmentQuery.toLowerCase())
  );

  if (loadingData) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#27ae60" />
          <Text style={styles.loadingText}>Loading colleges and departments...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <TouchableWithoutFeedback onPress={() => {
          Keyboard.dismiss();
          setShowCollegeSuggestions(false);
          setShowDepartmentSuggestions(false);
        }}>
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.title}>Faculty Registration</Text>

            <View style={styles.formContainer}>
              {/* Faculty Name */}
              <View style={styles.formGroup}>
                <Text style={styles.label}>Faculty Name</Text>
                <TextInput
                  style={[
                    styles.input,
                    focusedField === 'facultyName' && styles.focusedInput,
                    errors.facultyName && styles.errorInput
                  ]}
                  placeholder="Enter your full name"
                  placeholderTextColor="#bdc3c7"
                  value={facultyName}
                  onChangeText={handleFacultyNameChange}
                  editable={!loading}
                  onFocus={() => setFocusedField('facultyName')}
                  onBlur={() => setFocusedField(null)}
                />
                {facultyNameError && <Text style={styles.helperText}>{facultyNameError}</Text>}
                {errors.facultyName && <Text style={styles.errorText}>{errors.facultyName}</Text>}
              </View>

              {/* Email - Auto Lowercase */}
              <View style={styles.formGroup}>
                <Text style={styles.label}>Email</Text>
                <TextInput
                  style={[
                    styles.input,
                    focusedField === 'email' && styles.focusedInput,
                    errors.email && styles.errorInput
                  ]}
                  placeholder="Enter your email address"
                  placeholderTextColor="#bdc3c7"
                  value={email}
                  onChangeText={handleEmailChange}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  editable={!loading}
                  onFocus={() => setFocusedField('email')}
                  onBlur={() => setFocusedField(null)}
                />
                {emailError && <Text style={styles.helperText}>{emailError}</Text>}
                {!emailError && !errors.email && <Text style={styles.helperText}>Use a valid email address</Text>}
                {errors.email && <Text style={styles.errorText}>{errors.email}</Text>}
              </View>

              {/* Password with Eye Icon */}
              <View style={styles.formGroup}>
                <Text style={styles.label}>Password</Text>
                <View style={styles.inputWithIcon}>
                  <TextInput
                    style={[
                      styles.input,
                      { paddingRight: 44 },
                      focusedField === 'password' && styles.focusedInput,
                      errors.password && styles.errorInput
                    ]}
                    placeholder="Enter password (min 6 characters)"
                    placeholderTextColor="#bdc3c7"
                    value={password}
                    onChangeText={handlePasswordChange}
                    secureTextEntry={!passwordVisible}
                    editable={!loading}
                    autoCapitalize="none"
                    onFocus={() => setFocusedField('password')}
                    onBlur={() => setFocusedField(null)}
                  />
                  <TouchableOpacity
                    style={styles.iconStyle}
                    onPress={() => setPasswordVisible(v => !v)}
                  >
                    <Ionicons name={passwordVisible ? 'eye' : 'eye-off'} size={20} color="#7f8c8d" />
                  </TouchableOpacity>
                </View>
                {passwordError && <Text style={styles.inlineWarning}>{passwordError}</Text>}
                {errors.password && <Text style={styles.errorText}>{errors.password}</Text>}
              </View>

              {/* Confirm Password with Eye Icon */}
              <View style={styles.formGroup}>
                <Text style={styles.label}>Confirm Password</Text>
                <View style={styles.inputWithIcon}>
                  <TextInput
                    style={[
                      styles.input,
                      { paddingRight: 44 },
                      focusedField === 'confirmPassword' && styles.focusedInput,
                      errors.confirmPassword && styles.errorInput
                    ]}
                    placeholder="Confirm your password"
                    placeholderTextColor="#bdc3c7"
                    value={confirmPassword}
                    onChangeText={handleConfirmPasswordChange}
                    secureTextEntry={!confirmPasswordVisible}
                    editable={!loading}
                    autoCapitalize="none"
                    onFocus={() => setFocusedField('confirmPassword')}
                    onBlur={() => setFocusedField(null)}
                  />
                  <TouchableOpacity
                    style={styles.iconStyle}
                    onPress={() => setConfirmPasswordVisible(v => !v)}
                  >
                    <Ionicons name={confirmPasswordVisible ? 'eye' : 'eye-off'} size={20} color="#7f8c8d" />
                  </TouchableOpacity>
                </View>
                {confirmPasswordError && <Text style={styles.inlineWarning}>{confirmPasswordError}</Text>}
                {errors.confirmPassword && <Text style={styles.errorText}>{errors.confirmPassword}</Text>}
              </View>

              {/* Designation */}
              <View style={styles.formGroup}>
                <Text style={styles.label}>Designation</Text>
                <TextInput
                  style={[
                    styles.input,
                    focusedField === 'designation' && styles.focusedInput,
                    errors.designation && styles.errorInput
                  ]}
                  placeholder="e.g., Assistant Professor, Lecturer"
                  placeholderTextColor="#bdc3c7"
                  value={designation}
                  onChangeText={text => {
                    setDesignation(text);
                    setErrors(prev => ({ ...prev, designation: undefined }));
                  }}
                  editable={!loading}
                  onFocus={() => setFocusedField('designation')}
                  onBlur={() => setFocusedField(null)}
                />
                {errors.designation && <Text style={styles.errorText}>{errors.designation}</Text>}
              </View>

              {/* College Field - Touch + Type */}
              <View style={styles.formGroup}>
                <Text style={styles.label}>College</Text>
                <TextInput
                  style={[
                    styles.input,
                    focusedField === 'college' && styles.focusedInput,
                    errors.college && styles.errorInput
                  ]}
                  placeholder="Type to search or tap to select"
                  placeholderTextColor="#bdc3c7"
                  value={collegeQuery || selectedCollegeName}
                  onChangeText={text => {
                    setCollegeQuery(text);
                    if (text.length > 0) {
                      setShowCollegeSuggestions(true);
                    }
                    setErrors(prev => ({ ...prev, college: undefined }));
                  }}
                  onFocus={() => {
                    setFocusedField('college');
                    setShowCollegeSuggestions(true);
                    if (selectedCollege) {
                      setCollegeQuery('');
                    }
                  }}
                  onBlur={() => {
                    setFocusedField(null);
                    // Keep dropdown open if query is active
                    if (collegeQuery.length === 0) {
                      setTimeout(() => setShowCollegeSuggestions(false), 200);
                    }
                  }}
                  editable={!loading}
                />

                {/* College Suggestions - using map() NO FlatList */}
                {showCollegeSuggestions && (collegeQuery.length > 0 || !selectedCollege) && (
                  <View style={styles.suggestionsContainer}>
                    {colleges.filter(c => c.name.toLowerCase().includes(collegeQuery.toLowerCase())).length > 0 ? (
                      colleges
                        .filter(c => c.name.toLowerCase().includes(collegeQuery.toLowerCase()))
                        .map(college => (
                          <TouchableOpacity
                            key={college.id}
                            style={styles.suggestionItem}
                            onPress={() => {
                              setSelectedCollege(college.id);
                              setSelectedCollegeName(college.name);
                              setCollegeQuery('');
                              setShowCollegeSuggestions(false);
                              setFocusedField(null);
                              setSelectedDepartment(null);
                              setSelectedDepartmentName('');
                              setDepartmentQuery('');
                              setShowDepartmentSuggestions(false);
                              fetchDepartments(college.id);
                              setErrors(prev => ({ ...prev, college: undefined }));
                              Keyboard.dismiss();
                            }}
                          >
                            <Text style={styles.suggestionText}>{college.name}</Text>
                          </TouchableOpacity>
                        ))
                    ) : (
                      <View style={styles.suggestionItem}>
                        <Text style={[styles.suggestionText, { color: '#7f8c8d' }]}>No colleges found</Text>
                      </View>
                    )}
                  </View>
                )}
                {errors.college && <Text style={styles.errorText}>{errors.college}</Text>}
              </View>

              {/* Department Field - Conditional */}
              <View style={styles.formGroup}>
                <Text style={styles.label}>Department</Text>
                <TextInput
                  style={[
                    styles.input,
                    !selectedCollege && styles.disabledInput,
                    focusedField === 'department' && selectedCollege && styles.focusedInput,
                    errors.department && styles.errorInput
                  ]}
                  placeholder={selectedCollege ? 'Type to search or tap to select' : 'Select a college first'}
                  placeholderTextColor="#bdc3c7"
                  value={departmentQuery || selectedDepartmentName}
                  onChangeText={text => {
                    if (!selectedCollege) return;
                    setDepartmentQuery(text);
                    if (text.length > 0) {
                      setShowDepartmentSuggestions(true);
                    }
                    setErrors(prev => ({ ...prev, department: undefined }));
                  }}
                  onFocus={() => {
                    if (!selectedCollege) {
                      setErrors(prev => ({ ...prev, department: 'Please select a college first' }));
                      Keyboard.dismiss();
                      return;
                    }
                    setFocusedField('department');
                    setShowDepartmentSuggestions(true);
                    if (selectedDepartment) {
                      setDepartmentQuery('');
                    }
                  }}
                  onBlur={() => {
                    setFocusedField(null);
                    // Keep dropdown open if query is active
                    if (departmentQuery.length === 0 && selectedCollege) {
                      setTimeout(() => setShowDepartmentSuggestions(false), 200);
                    }
                  }}
                  editable={!!selectedCollege && !loading}
                />

                {/* Department Suggestions - using map() NO FlatList */}
                {showDepartmentSuggestions && selectedCollege && (departmentQuery.length > 0 || !selectedDepartment) && (
                  <View style={styles.suggestionsContainer}>
                    {departmentsLoading ? (
                      <View style={{ padding: 12, alignItems: 'center' }}>
                        <ActivityIndicator size="small" color="#27ae60" />
                      </View>
                    ) : departments.filter(d => d.name.toLowerCase().includes(departmentQuery.toLowerCase())).length > 0 ? (
                      departments
                        .filter(d => d.name.toLowerCase().includes(departmentQuery.toLowerCase()))
                        .map(dept => (
                          <TouchableOpacity
                            key={dept.id}
                            style={styles.suggestionItem}
                            onPress={() => {
                              setSelectedDepartment(dept.id);
                              setSelectedDepartmentName(dept.name);
                              setDepartmentQuery('');
                              setShowDepartmentSuggestions(false);
                              setFocusedField(null);
                              setErrors(prev => ({ ...prev, department: undefined }));
                              Keyboard.dismiss();
                            }}
                          >
                            <Text style={styles.suggestionText}>{dept.name}</Text>
                          </TouchableOpacity>
                        ))
                    ) : (
                      <View style={styles.suggestionItem}>
                        <Text style={[styles.suggestionText, { color: '#7f8c8d' }]}>No departments found</Text>
                      </View>
                    )}
                  </View>
                )}
                {errors.department && <Text style={styles.errorText}>{errors.department}</Text>}
              </View>

              {/* Register Button */}
              <TouchableOpacity
                style={[styles.registerButton, loading && styles.disabledButton]}
                onPress={handleRegister}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Text style={styles.registerButtonText}>Register</Text>
                )}
              </TouchableOpacity>

              {/* Login Link */}
              <TouchableOpacity
                style={styles.loginLinkContainer}
                onPress={() => router.push('/faculty-login')}
                disabled={loading}
              >
                <Text style={styles.loginLinkText}>
                  Already have an account?{' '}
                  <Text style={styles.loginLink}>Login</Text>
                </Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 14,
    color: '#7f8c8d',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingVertical: 20,
    paddingBottom: 30,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#2c3e50',
    marginBottom: 30,
    textAlign: 'center',
  },
  formContainer: {
    marginBottom: 30,
  },
  formGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2c3e50',
    marginBottom: 8,
  },
  input: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontSize: 14,
    borderWidth: 1.5,
    borderColor: '#e0e0e0',
    borderRadius: 6,
    backgroundColor: '#ffffff',
    color: '#2c3e50',
  },
  focusedInput: {
    borderColor: '#27ae60',
    borderWidth: 2,
    backgroundColor: '#fafafa',
  },
  errorInput: {
    borderColor: '#e74c3c',
    borderWidth: 1.5,
    backgroundColor: '#fff5f5',
  },
  inputWithIcon: {
    position: 'relative',
    justifyContent: 'center',
  },
  iconStyle: {
    position: 'absolute',
    right: 12,
    top: 12,
    height: 24,
    width: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  suggestionsContainer: {
    maxHeight: 220,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderTopWidth: 0,
    borderBottomLeftRadius: 6,
    borderBottomRightRadius: 6,
    backgroundColor: '#ffffff',
    marginTop: -4,
    zIndex: 10,
  },
  suggestionItem: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 0.5,
    borderBottomColor: '#f0f0f0',
  },
  suggestionText: {
    fontSize: 14,
    color: '#2c3e50',
  },
  errorText: {
    marginTop: 6,
    color: '#e74c3c',
    fontSize: 12,
    fontWeight: '500',
  },
  helperText: {
    marginTop: 6,
    color: '#7f8c8d',
    fontSize: 12,
    fontWeight: '400',
  },
  inlineWarning: {
    marginTop: 6,
    color: '#f39c12',
    fontSize: 12,
    fontWeight: '500',
  },
  disabledInput: {
    backgroundColor: '#f5f5f5',
    color: '#bdc3c7',
    opacity: 0.6,
  },
  registerButton: {
    marginTop: 30,
    paddingVertical: 14,
    backgroundColor: '#27ae60',
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
  },
  registerButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
  loginLinkContainer: {
    marginTop: 16,
    paddingVertical: 8,
  },
  loginLinkText: {
    fontSize: 14,
    color: '#7f8c8d',
    textAlign: 'center',
  },
  loginLink: {
    color: '#3498db',
    fontWeight: '600',
  },
  disabledButton: {
    opacity: 0.6,
  },
});

export default FacultyRegisterScreen;
