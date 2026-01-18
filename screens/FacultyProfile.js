import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect, useRouter } from 'expo-router';
import { sendPasswordResetEmail, signOut } from 'firebase/auth';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { getDownloadURL, getStorage, ref, uploadBytes } from 'firebase/storage';
import React, { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Image,
    Keyboard,
    KeyboardAvoidingView,
    Modal,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    TouchableWithoutFeedback,
    View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { auth, db } from '../firebase/firebaseConfig';

const FacultyProfile = () => {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState({});
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingFields, setEditingFields] = useState({});
  const [saving, setSaving] = useState(false);
  const [profileImageModalVisible, setProfileImageModalVisible] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    let mounted = true;
    const loadProfile = async () => {
      try {
        const user = auth.currentUser;
        if (user) {
          const ref = doc(db, 'faculty', user.uid);
          const snap = await getDoc(ref);
          if (mounted) {
            if (snap.exists()) {
              const data = snap.data();
              setProfile(data);
              setEditingFields({
                mobile: data.mobile || '',
                designation: data.designation || '',
                collegeName: data.collegeName || '',
                departmentName: data.departmentName || '',
              });
            } else {
              setProfile({ name: user.displayName || '', email: user.email || '' });
              setEditingFields({ mobile: '', designation: '', collegeName: '', departmentName: '' });
            }
          }
        }
      } catch (e) {
        console.warn('Failed to load profile', e);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    loadProfile();
    return () => { mounted = false; };
  }, []);

  // Refresh profile when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      let mounted = true;
      const refreshProfile = async () => {
        try {
          const user = auth.currentUser;
          if (user) {
            const ref = doc(db, 'faculty', user.uid);
            const snap = await getDoc(ref);
            if (mounted && snap.exists()) {
              const data = snap.data();
              setProfile(data);
              setEditingFields({
                mobile: data.mobile || '',
                designation: data.designation || '',
                collegeName: data.collegeName || '',
                departmentName: data.departmentName || '',
              });
            }
          }
        } catch (e) {
          console.warn('Failed to refresh profile', e);
        }
      };
      refreshProfile();
      return () => { mounted = false; };
    }, [])
  );

  const handleChangePassword = () => {
    Alert.alert(
      'Change Password',
      'Do you want to proceed with changing your password?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Continue',
          onPress: async () => {
            try {
              const user = auth.currentUser;
              if (!user || !user.email) {
                Alert.alert('Error', 'No email available for password reset.');
                return;
              }
              await sendPasswordResetEmail(auth, user.email);
              Alert.alert('Password Reset', 'A password reset email was sent to your address.');
            } catch (e) {
              console.warn('Password reset failed', e);
              Alert.alert('Error', 'Failed to send password reset email.');
            }
          },
        },
      ]
    );
  };

  const handleEditProfile = () => {
    setEditModalVisible(true);
  };

  const handleSaveProfile = async () => {
    try {
      setSaving(true);
      const user = auth.currentUser;
      if (!user) return;

      const ref = doc(db, 'faculty', user.uid);
      await updateDoc(ref, {
        mobile: editingFields.mobile || '',
        designation: editingFields.designation || '',
        collegeName: editingFields.collegeName || '',
        departmentName: editingFields.departmentName || '',
      });

      // Update local profile
      setProfile(prev => ({
        ...prev,
        mobile: editingFields.mobile || '',
        designation: editingFields.designation || '',
        collegeName: editingFields.collegeName || '',
        departmentName: editingFields.departmentName || '',
      }));

      setEditModalVisible(false);
    } catch (e) {
      console.warn('Failed to save profile', e);
      Alert.alert('Error', 'Failed to save profile changes.');
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: async () => {
            try {
              await signOut(auth);
              try { await AsyncStorage.clear(); } catch (e) { /* ignore */ }
              router.replace('/role-select');
            } catch (e) {
              Alert.alert('Error', 'Failed to logout.');
            }
          },
        },
      ]
    );
  };

  const handleChangeProfileImage = () => {
    Alert.alert(
      'Change Profile Picture',
      'How would you like to add a photo?',
      [
        {
          text: 'Take Photo',
          onPress: async () => {
            const result = await ImagePicker.launchCameraAsync({
              allowsEditing: true,
              aspect: [1, 1],
              quality: 0.8,
            });
            if (!result.cancelled && result.assets && result.assets[0]) {
              uploadProfileImage(result.assets[0].uri);
            }
          },
        },
        {
          text: 'Choose from Gallery',
          onPress: async () => {
            const result = await ImagePicker.launchImageLibraryAsync({
              allowsEditing: true,
              aspect: [1, 1],
              quality: 0.8,
            });
            if (!result.cancelled && result.assets && result.assets[0]) {
              uploadProfileImage(result.assets[0].uri);
            }
          },
        },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  const uploadProfileImage = async (imageUri) => {
    try {
      setUploading(true);
      const user = auth.currentUser;
      if (!user) return;

      // Fetch image as blob
      const response = await fetch(imageUri);
      const blob = await response.blob();

      // Upload to Firebase Storage
      const storage = getStorage();
      const storageRef = ref(storage, `faculty-profiles/${user.uid}/profile-picture`);
      
      await uploadBytes(storageRef, blob);
      const downloadURL = await getDownloadURL(storageRef);

      // Update Firestore with image URL
      const docRef = doc(db, 'faculty', user.uid);
      await updateDoc(docRef, {
        profileImage: downloadURL,
      });

      // Update local state
      setProfile(prev => ({
        ...prev,
        profileImage: downloadURL,
      }));

      setProfileImageModalVisible(false);
      Alert.alert('Success', 'Profile picture updated successfully.');
    } catch (e) {
      console.warn('Failed to upload profile image', e);
      Alert.alert('Error', 'Failed to upload profile picture.');
    } finally {
      setUploading(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator size="large" color="#2c3e50" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header with Edit Icon */}
      <View style={styles.headerContainer}>
        <View style={styles.header}>
          <TouchableOpacity 
            style={styles.profileImageWrapper}
            onPress={handleChangeProfileImage}
            activeOpacity={0.7}
          >
            {profile.profileImage ? (
              <Image 
                source={{ uri: profile.profileImage }} 
                style={styles.profileImage}
              />
            ) : (
              <Ionicons name="person-circle" size={64} color="#2c3e50" />
            )}
            <View style={styles.cameraIconBadge}>
              {uploading ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Ionicons name="camera" size={14} color="#ffffff" />
              )}
            </View>
          </TouchableOpacity>
          <View style={styles.headerText}>
            <Text style={styles.name}>{profile.name || profile.displayName || ''}</Text>
            <Text style={styles.sub}>{profile.designation || profile.department || ''}</Text>
          </View>
        </View>
        <TouchableOpacity 
          style={styles.editIconBtn} 
          onPress={handleEditProfile}
          activeOpacity={0.7}
        >
          <Ionicons name="pencil" size={20} color="#2c3e50" />
        </TouchableOpacity>
      </View>

      {/* Profile Card */}
      <View style={styles.card}>
        <Text style={styles.label}>Name</Text>
        <Text style={styles.value}>{profile.name || '-'}</Text>

        <Text style={styles.label}>Mobile</Text>
        <Text style={styles.value}>{profile.mobile || '-'}</Text>

        <Text style={styles.label}>Designation</Text>
        <Text style={styles.value}>{profile.designation || '-'}</Text>

        <Text style={styles.label}>College</Text>
        <Text style={styles.value}>{profile.collegeName || profile.college || '-'}</Text>

        <Text style={styles.label}>Department</Text>
        <Text style={styles.value}>{profile.departmentName || profile.department || '-'}</Text>
      </View>

      {/* Action Buttons */}
      <View style={styles.actions}>
        <TouchableOpacity 
          style={styles.actionBtn} 
          onPress={handleChangePassword}
          activeOpacity={0.7}
        >
          <Text style={styles.actionText}>Change Password</Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={styles.logoutBtn} 
          onPress={handleLogout}
          activeOpacity={0.7}
        >
          <Ionicons name="log-out" size={22} color="#e74c3c" />
        </TouchableOpacity>
      </View>

      {/* Edit Profile Modal */}
      <Modal
        visible={editModalVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => !saving && setEditModalVisible(false)}
      >
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
          style={styles.modalContainer}
        >
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <TouchableOpacity 
                  onPress={() => !saving && setEditModalVisible(false)}
                  disabled={saving}
                >
                  <Text style={styles.modalCloseText}>Cancel</Text>
                </TouchableOpacity>
                <Text style={styles.modalTitle}>Edit Profile</Text>
                <TouchableOpacity 
                  onPress={handleSaveProfile}
                  disabled={saving}
                >
                  {saving ? (
                    <ActivityIndicator size="small" color="#27ae60" />
                  ) : (
                    <Text style={styles.modalSaveText}>Save</Text>
                  )}
                </TouchableOpacity>
              </View>

              <ScrollView 
                style={styles.modalForm}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                {/* Mobile */}
                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>Mobile</Text>
                  <TextInput
                    style={styles.formInput}
                    placeholder="Enter mobile number"
                    placeholderTextColor="#bdc3c7"
                    value={editingFields.mobile}
                    onChangeText={(text) => setEditingFields(prev => ({ ...prev, mobile: text }))}
                    keyboardType="phone-pad"
                    editable={!saving}
                  />
                </View>

                {/* Designation */}
                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>Designation</Text>
                  <TextInput
                    style={styles.formInput}
                    placeholder="e.g., Assistant Professor"
                    placeholderTextColor="#bdc3c7"
                    value={editingFields.designation}
                    onChangeText={(text) => setEditingFields(prev => ({ ...prev, designation: text }))}
                    editable={!saving}
                  />
                </View>

                {/* College Name */}
                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>College</Text>
                  <TextInput
                    style={styles.formInput}
                    placeholder="College name"
                    placeholderTextColor="#bdc3c7"
                    value={editingFields.collegeName}
                    onChangeText={(text) => setEditingFields(prev => ({ ...prev, collegeName: text }))}
                    editable={false}
                  />
                </View>

                {/* Department Name */}
                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>Department</Text>
                  <TextInput
                    style={styles.formInput}
                    placeholder="Department name"
                    placeholderTextColor="#bdc3c7"
                    value={editingFields.departmentName}
                    onChangeText={(text) => setEditingFields(prev => ({ ...prev, departmentName: text }))}
                    editable={false}
                  />
                </View>
              </ScrollView>
            </View>
          </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa', padding: 16 },
  
  // Header Styles
  headerContainer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
  header: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  headerText: { marginLeft: 12 },
  name: { fontSize: 18, fontWeight: '700', color: '#2c3e50' },
  sub: { fontSize: 13, color: '#7f8c8d', marginTop: 4 },
  editIconBtn: { padding: 8, marginRight: -8 },
  profileImageWrapper: { position: 'relative' },
  profileImage: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#e0e0e0' },
  cameraIconBadge: { 
    position: 'absolute', 
    bottom: 0, 
    right: 0, 
    width: 28, 
    height: 28, 
    borderRadius: 14, 
    backgroundColor: '#27ae60', 
    alignItems: 'center', 
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#ffffff',
  },

  // Card Styles
  card: { 
    backgroundColor: '#fff', 
    borderRadius: 12, 
    padding: 16, 
    shadowColor: '#000', 
    shadowOffset: { width: 0, height: 1 }, 
    shadowOpacity: 0.06, 
    shadowRadius: 6, 
    elevation: 2,
    marginBottom: 20,
  },
  label: { fontSize: 12, color: '#95a5a6', marginTop: 12, fontWeight: '500' },
  value: { fontSize: 14, color: '#2c3e50', marginTop: 4, fontWeight: '500' },

  // Action Buttons
  actions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 },
  actionBtn: { 
    flex: 1, 
    paddingVertical: 12, 
    borderRadius: 10, 
    backgroundColor: '#ffffff', 
    alignItems: 'center', 
    marginRight: 8, 
    borderWidth: 1, 
    borderColor: '#eef1f4' 
  },
  actionText: { color: '#2c3e50', fontWeight: '600', fontSize: 14 },
  logoutBtn: { 
    width: 48,
    height: 48,
    borderRadius: 10,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#ffe0e0',
  },

  // Modal Styles
  modalContainer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  modalContent: { flex: 1, backgroundColor: '#f8f9fa', marginTop: 40, borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  modalHeader: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    paddingVertical: 16, 
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eef1f4',
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#2c3e50' },
  modalCloseText: { fontSize: 14, color: '#3498db', fontWeight: '600' },
  modalSaveText: { fontSize: 14, color: '#27ae60', fontWeight: '600' },
  modalForm: { padding: 16, flex: 1 },
  
  // Form Styles
  formGroup: { marginBottom: 16 },
  formLabel: { fontSize: 13, fontWeight: '600', color: '#2c3e50', marginBottom: 8 },
  formInput: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    backgroundColor: '#ffffff',
    color: '#2c3e50',
  },
});

export default FacultyProfile;
