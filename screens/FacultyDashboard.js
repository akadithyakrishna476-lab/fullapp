import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { sendPasswordResetEmail, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { auth, db } from '../firebase/firebaseConfig';

const menuItems = [
  {
    id: '1',
    title: 'Student Management',
    icon: 'people',
    color: '#234e63', // muted navy-teal
    description: 'Manage students & classes',
    screen: 'StudentManagement',
  },
  {
    id: '2',
    title: 'Timetable',
    icon: 'calendar',
    color: '#2f6f44', // academic green
    description: 'View & edit schedule',
    screen: 'Timetable',
  },
  {
    id: '3',
    title: 'Calendar',
    icon: 'calendar-outline',
    color: '#5b3f72', // plum
    description: 'Academic calendar & events',
    screen: 'Calendar',
  },
  {
    id: '5',
    title: 'Class Status',
    icon: 'stats-chart',
    color: '#16a085', // turquoise
    description: 'View daily class arrival status',
    screen: 'ClassStatus',
  },
  {
    id: '6',
    title: 'Staff Advisor',
    icon: 'shield',
    color: '#9b59b6', // plum
    description: 'Portal for Staff Advisors',
    screen: 'StaffAdvisor',
  },
];

const FacultyDashboard = () => {
  const router = useRouter();
  const [facultyData, setFacultyData] = useState(null);
  const [isStaffAdvisor, setIsStaffAdvisor] = useState(false);
  const [userName, setUserName] = useState('Faculty');

  const [profileData, setProfileData] = useState({
    name: '',
    mobile: '',
    designation: '',
    college: '',
    department: '',
  });
  const [showYearSelector, setShowYearSelector] = useState(false);

  const YEARS = [
    { id: '1', label: 'Year 1' },
    { id: '2', label: 'Year 2' },
    { id: '3', label: 'Year 3' },
    { id: '4', label: 'Year 4' },
  ];

  useEffect(() => {
    // Wait for auth to be ready and user to be authenticated
    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (user) {
        loadFacultyData();
      } else {
        setUserName('Faculty');
      }
    });
    return unsubscribe;
  }, []);

  // Load full profile from Firestore and populate header/profile fields
  const loadFacultyData = async () => {
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        console.warn('No authenticated user found');
        return;
      }
      const ref = doc(db, 'faculty', currentUser.uid);
      const snap = await getDoc(ref);
      if (snap && snap.exists()) {
        const data = snap.data();
        setProfileData({
          name: data.name || currentUser.displayName || '',
          mobile: data.mobile || '',
          designation: data.designation || '',
          college: data.college || '',
          department: data.department || '',
        });
        setUserName(data.name || currentUser.displayName || currentUser.email?.split('@')[0] || 'Faculty');
        setFacultyData(data);
        setIsStaffAdvisor(!!data.isStaffAdvisor);
      } else {
        // Fallback to displayName/email
        setUserName(currentUser.displayName || currentUser.email?.split('@')[0] || 'Faculty');
      }
    } catch (error) {
      if (error.code === 'permission-denied') {
        console.error('Permission denied when loading faculty data:', error);
      } else if (error.message?.includes('offline')) {
        console.warn('Firestore offline when loading faculty data. Data will retry automatically.');
      } else {
        console.error('Error loading faculty data:', error);
      }
    }
  };

  // Notifications are disabled in Expo Go (SDK 53+)
  // Push notifications will be available in a development build
  useEffect(() => {
    // TODO: Implement push notifications in development build
    // For now, just return without initializing anything
    // This prevents Expo Go from throwing errors about missing projectId
  }, []);


  const handleLogout = () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout?',
      [
        {
          text: 'Cancel',
          onPress: () => { },
          style: 'cancel',
        },
        {
          text: 'Logout',
          onPress: async () => {
            try {
              await signOut(auth);
              try { await AsyncStorage.clear(); } catch (e) { /* ignore */ }
              router.replace('/role-select');
            } catch (error) {
              Alert.alert('Error', 'Failed to logout. Please try again.');
            }
          },
          style: 'destructive',
        },
      ],
      { cancelable: false }
    );
  };

  const handleModulePress = (screen) => {
    const map = {
      StudentManagement: 'student-management',
      Timetable: 'timetable',
      Calendar: 'calendar',
      TodoList: 'todo-list',
      StaffAdvisor: 'staff-advisor',
      Announcements: 'send-announcement',
      ClassStatus: 'class-status',
    };
    const path = map[screen] || screen.toLowerCase();
    router.push(`/${path}`);
  };

  const handleCreateSpreadsheet = (year) => {
    setShowYearSelector(false);
    router.push({
      pathname: '/spreadsheet',
      params: { year },
    });
  };



  const handleChangePassword = async () => {
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
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerName}>{userName}</Text>
          {profileData.designation ? <Text style={styles.headerSub}>{profileData.designation}</Text> : null}
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity
            style={styles.iconButton}
            onPress={() => router.push('/notifications')}
            accessibilityLabel="Notifications"
          >
            <Ionicons name="notifications-outline" size={22} color="#ffffff" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.iconButton}
            onPress={() => router.push('/faculty-profile')}
            accessibilityLabel="Profile"
          >
            <Ionicons name="person-circle-outline" size={24} color="#ffffff" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.iconButton}
            onPress={handleLogout}
            accessibilityLabel="Logout"
          >
            <Ionicons name="log-out-outline" size={20} color="#ffffff" />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.menuGrid}>
          {menuItems.map(item => (
            <TouchableOpacity
              key={item.id}
              style={[styles.card, { borderColor: item.color + '22' }]}
              activeOpacity={0.9}
              onPress={() => handleModulePress(item.screen)}
            >
              <View style={[styles.iconContainer, { backgroundColor: item.color + '15' }]}>
                <Ionicons name={item.icon} size={32} color={item.color} />
              </View>
              <Text style={[styles.cardTitle, { color: '#12232b' }]}>{item.title}</Text>
              <Text style={[styles.cardDescription, { color: '#576b70' }]}>{item.description}</Text>
              <View style={styles.arrowContainer}>
                <Ionicons name="chevron-forward" size={16} color={item.color} />
              </View>
            </TouchableOpacity>
          ))}
        </View>


      </ScrollView>

      {/* Year Selector Modal */}
      {showYearSelector && (
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Select Year</Text>
            {YEARS.map(y => (
              <TouchableOpacity
                key={y.id}
                style={styles.modalOption}
                onPress={() => handleCreateSpreadsheet(y.id)}
              >
                <Text style={styles.modalOptionText}>{y.label}</Text>
                <Ionicons name="chevron-forward" size={18} color="#0f5f73" />
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              style={[styles.modalOption, styles.cancelButton]}
              onPress={() => setShowYearSelector(false)}
            >
              <Text style={[styles.modalOptionText, styles.cancelText]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Profile is handled on a separate screen `FacultyProfile` */}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  header: {
    backgroundColor: '#0f5f73',
    paddingVertical: 14,
    paddingHorizontal: 18,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 0,
    shadowColor: '#07292d',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 6,
  },
  headerLeft: {
    flex: 1,
  },
  headerName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#ffffff',
  },
  headerSub: {
    fontSize: 12,
    color: '#e6f0f4',
    marginTop: 2,
    fontWeight: '600',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconButton: {
    marginLeft: 12,
    padding: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingVertical: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#2c3e50',
    marginBottom: 16,
    marginTop: 0,
  },
  topMargin: {
    marginTop: 24,
  },
  menuGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  card: {
    width: '48%',
    backgroundColor: '#ffffff',
    borderRadius: 14,
    paddingVertical: 18,
    paddingHorizontal: 12,
    marginBottom: 16,
    alignItems: 'center',
    borderWidth: 1,
    shadowColor: '#0b2228',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 4,
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#2c3e50',
    marginBottom: 6,
    textAlign: 'center',
  },
  cardDescription: {
    fontSize: 11,
    color: '#7f8c8d',
    textAlign: 'center',
    marginBottom: 10,
  },
  arrowContainer: {
    marginTop: 4,
  },
  largeCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 16,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
  },
  staffAdvisorCard: {
    borderLeftWidth: 4,
    borderLeftColor: '#9b59b6',
  },
  spreadsheetCard: {
    borderLeftWidth: 4,
    borderLeftColor: '#16a085',
  },
  largeCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  largeCardText: {
    marginLeft: 16,
    flex: 1,
  },
  largeCardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#2c3e50',
    marginBottom: 2,
  },
  largeCardDescription: {
    fontSize: 11,
    color: '#7f8c8d',
  },
  infoSection: {
    marginTop: 24,
    marginBottom: 20,
  },
  infoCard: {
    backgroundColor: '#d6eaf8',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    borderLeftWidth: 4,
    borderLeftColor: '#3498db',
  },
  infoText: {
    fontSize: 11,
    color: '#2c3e50',
    marginLeft: 12,
    flex: 1,
  },
  /* Bottom sheet styles */
  sheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 28,
    minHeight: 320,
  },
  sheetHandle: {
    width: 56,
    height: 6,
    backgroundColor: '#e6e9ee',
    borderRadius: 4,
    alignSelf: 'center',
    marginBottom: 12,
  },
  sheetContent: {
    paddingBottom: 8,
  },
  sheetTitle: { fontSize: 18, fontWeight: '700', color: '#2c3e50', marginBottom: 12 },
  fieldLabel: { fontSize: 12, color: '#95a5a6', marginTop: 8 },
  input: { backgroundColor: '#f7f8fa', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, marginTop: 6, color: '#2c3e50' },
  inputReadOnly: { backgroundColor: '#ffffff' },
  sheetActions: { marginTop: 16, flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap' },
  sheetButton: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#eef1f4', marginRight: 8, marginTop: 8 },
  sheetButtonText: { color: '#2c3e50', fontWeight: '600' },
  saveButton: { backgroundColor: '#2c3e50', borderColor: '#2c3e50' },
  saveText: { color: '#ffffff' },
  altButton: {},
  closeButton: { backgroundColor: '#ffffff' },
  closeText: { color: '#2c3e50' },
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 999,
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 20,
    width: '80%',
    maxWidth: 320,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 10,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#2c3e50',
    marginBottom: 16,
  },
  modalOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 8,
    backgroundColor: '#f8f9fa',
  },
  modalOptionText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2c3e50',
  },
  cancelButton: {
    marginTop: 8,
    backgroundColor: '#ecf0f1',
  },
  cancelText: {
    color: '#e74c3c',
  },
});

export default FacultyDashboard;
