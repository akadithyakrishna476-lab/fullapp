import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, useRouter } from 'expo-router';
import { signOut } from 'firebase/auth';
import { collection, collectionGroup, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { useCallback, useEffect, useState } from 'react';
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
import { getYearDisplayLabel, loadAcademicYear } from '../utils/academicYearManager';

const CRDashboard = () => {
  const router = useRouter();
  const [crData, setCRData] = useState(null);
  const [userName, setUserName] = useState('Class Representative');

  useEffect(() => {
    const init = async () => {
      await loadAcademicYear();
      await loadCRData();
    };
    init();
  }, []);

  // Refresh CR year whenever screen is focused (e.g., after promotion)
  useFocusEffect(
    useCallback(() => {
      const refreshData = async () => {
        const authUid = await AsyncStorage.getItem('authUid') || auth.currentUser?.uid;
        if (authUid) {
          await syncCRProfileWithFirestore(authUid);
        }
      };
      refreshData();
    }, [])
  );

  const loadCRData = async () => {
    try {
      const storedCRData = await AsyncStorage.getItem('crData');
      const authUid = await AsyncStorage.getItem('authUid') || auth.currentUser?.uid;

      if (storedCRData) {
        const data = JSON.parse(storedCRData);
        setCRData(data);
        setUserName(data.name || 'Class Representative');
      }

      // 1. Sync from Profile (Cached Source)
      if (authUid) {
        await syncCRProfileWithFirestore(authUid);
      }

      // 2. ALWAYS verify assignment (Live Source of Truth)
      // This overcomes issues where users doc might be stale after promotion
      const currentData = crData || (storedCRData ? JSON.parse(storedCRData) : null);
      if (currentData?.studentId && currentData?.departmentId) {
        await fetchCurrentYearFromFirestore(currentData.studentId, currentData.departmentId);
      }
    } catch (error) {
      console.error('Error loading CR data:', error);
    }
  };

  /**
   * Syncs the CR profile with the users collection and official student record.
   * This ensures the dashboard always shows the live academic year.
   */
  const syncCRProfileWithFirestore = async (uid) => {
    try {
      const userDocRef = doc(db, 'users', uid);
      const userSnap = await getDoc(userDocRef);

      if (userSnap.exists()) {
        const userData = userSnap.data();
        const email = userData.email?.toLowerCase().trim();

        let liveCurrentYear = parseInt(userData.currentYear || userData.year_level || 1, 10);
        let liveJoiningYear = parseInt(userData.joiningYear, 10);

        // EXTRA SECURITY: Cross-reference with the actual student record (Single Source of Truth)
        if (email) {
          try {
            const studentsRef = collectionGroup(db, 'students');
            const studentQuery = query(studentsRef, where('email', '==', email));
            const studentSnap = await getDocs(studentQuery);

            if (!studentSnap.empty) {
              const studentData = studentSnap.docs[0].data();
              const studentYear = parseInt(studentData.currentYear || studentData.year_level || 0, 10);
              const studentJoiningYear = parseInt(studentData.joiningYear, 10);
              const pathYear = studentSnap.docs[0].ref.path.match(/year(\d)/)?.[1];

              const confirmedYear = studentYear || (pathYear ? parseInt(pathYear, 10) : liveCurrentYear);

              if (confirmedYear && confirmedYear !== liveCurrentYear) {
                console.log(`📡 Academic Year Sync: Student record shows Year ${confirmedYear}, updating profile...`);
                liveCurrentYear = confirmedYear;
              }

              if (studentJoiningYear && !isNaN(studentJoiningYear)) {
                liveJoiningYear = studentJoiningYear;
              }
            }
          } catch (e) {
            console.warn('⚠️ Student record cross-reference failed', e.message);
          }
        }

        const updatedData = {
          name: userData.name,
          email: email,
          currentYear: liveCurrentYear,
          joiningYear: liveJoiningYear || 2023, // Fallback if still missing, or take from user input
          departmentId: userData.departmentId || userData.departmentCode,
          departmentName: userData.departmentName,
          studentId: userData.studentId || userData.linkedStudentId,
        };

        setCRData(updatedData);
        setUserName(userData.name || 'Class Representative');

        // Update AsyncStorage to prevent stale data on next load
        await AsyncStorage.setItem('crData', JSON.stringify(updatedData));
      }
    } catch (error) {
      console.error('Error syncing profile:', error);
    }
  };

  const fetchCurrentYearFromFirestore = async (studentId, departmentId) => {
    if (!studentId || !departmentId) return;
    try {
      // Search for the CR's current record across all year collections
      const years = ['year_1', 'year_2', 'year_3', 'year_4'];

      for (const year of years) {
        try {
          const crRef = collection(db, 'classrepresentative', year, `department_${departmentId}`);
          const q = query(crRef, where('studentId', '==', studentId));
          const snapshot = await getDocs(q);

          if (!snapshot.empty) {
            const crDoc = snapshot.docs[0].data();
            const yearNum = parseInt(year.replace('year_', ''), 10) || 1;

            // Update local state with numeric source
            setCRData(prev => ({ ...prev, currentYear: yearNum }));
            console.log(`✅ Found assignment in ${year} - Syncing to Year ${yearNum}`);
            break;
          }
        } catch (error) {
          continue;
        }
      }
    } catch (error) {
      console.error('Error fetching current year from Firestore:', error);
    }
  };

  const handleLogout = () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout?',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: async () => {
            try {
              await signOut(auth);
              await AsyncStorage.clear();
              router.replace('/role-select');
            } catch (error) {
              console.error('Logout error:', error);
              Alert.alert('Error', 'Failed to logout. Please try again.');
            }
          },
        },
      ]
    );
  };

  const menuItems = [
    {
      id: '1',
      title: 'Student Management',
      icon: 'people',
      color: '#234e63',
      description: 'View class students',
      screen: '/student-management',
    },
    {
      id: '2',
      title: 'Attendance',
      icon: 'checkbox',
      color: '#2f6f44',
      description: 'Mark attendance',
      screen: '/attendance-management',
    },
    {
      id: '3',
      title: 'Timetable',
      icon: 'calendar',
      color: '#5b3f72',
      description: 'View class schedule',
      screen: '/timetable',
    },
    {
      id: '4',
      title: 'Announcements',
      icon: 'megaphone',
      color: '#b56a2b',
      description: 'View announcements',
      screen: { pathname: '/send-announcement', params: { mode: 'view' } },
    },
    {
      id: '5',
      title: 'To-Do List',
      icon: 'checkmark-circle',
      color: '#16a085',
      description: 'Manage tasks',
      screen: '/todo-list',
    },
    {
      id: '6',
      title: 'Staff Advisor Portal',
      icon: 'shield',
      color: '#9b59b6',
      description: 'Communication & Tasks',
      screen: '/staff-advisor',
    },
    {
      id: '7',
      title: 'Password Sharing',
      icon: 'key',
      color: '#1f6feb',
      description: 'Share temp passwords',
      screen: '/password-sharing',
    },
    {
      id: '8',
      title: 'Task Assignments',
      icon: 'clipboard',
      color: '#e67e22',
      description: 'View assigned tasks',
      screen: '/cr-task-assignment',
    },
  ];

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.crBadge}>
            <Ionicons name="shield-checkmark" size={20} color="#ffffff" />
          </View>
          <View style={styles.headerTextContainer}>
            <Text style={styles.headerName}>{userName}</Text>
            <Text style={styles.headerRole}>Class Representative</Text>
          </View>
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity
            style={styles.iconButton}
            onPress={() => router.push('/notifications')}
          >
            <Ionicons name="notifications-outline" size={22} color="#ffffff" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.iconButton}
            onPress={handleLogout}
          >
            <Ionicons name="log-out-outline" size={20} color="#ffffff" />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Profile Card */}
        {crData && (
          <View style={styles.profileCard}>
            <View style={styles.profileHeader}>
              <View style={styles.profileAvatar}>
                <Text style={styles.profileAvatarText}>
                  {crData.name?.charAt(0) || 'C'}
                </Text>
              </View>
              <View style={styles.profileInfo}>
                <Text style={styles.profileName}>{crData.name}</Text>
                <Text style={styles.profileEmail}>{crData.email}</Text>
              </View>
            </View>
            <View style={styles.profileDetails}>
              <View style={styles.profileDetailRow}>
                <Ionicons name="school-outline" size={16} color="#7f8c8d" />
                <Text style={styles.profileDetailText}>
                  Year: {crData.joiningYear ? `${crData.joiningYear} Batch` : (crData.currentYear ? getYearDisplayLabel(crData.currentYear) : 'N/A')}
                </Text>
              </View>
              <View style={styles.profileDetailRow}>
                <Ionicons name="business-outline" size={16} color="#7f8c8d" />
                <Text style={styles.profileDetailText}>
                  Department: {crData.departmentName || crData.departmentId}
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* Menu Grid */}
        <Text style={styles.sectionTitle}>Quick Access</Text>
        <View style={styles.menuGrid}>
          {menuItems.map(item => (
            <TouchableOpacity
              key={item.id}
              style={[styles.card, { borderColor: item.color + '22' }]}
              activeOpacity={0.9}
              onPress={() => router.push(item.screen)}
            >
              <View style={[styles.iconContainer, { backgroundColor: item.color + '15' }]}>
                <Ionicons name={item.icon} size={32} color={item.color} />
              </View>
              <Text style={styles.cardTitle}>{item.title}</Text>
              <Text style={styles.cardDescription}>{item.description}</Text>
              <View style={styles.arrowContainer}>
                <Ionicons name="chevron-forward" size={16} color={item.color} />
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {/* Info Section */}
        <View style={styles.infoSection}>
          <View style={styles.infoCard}>
            <Ionicons name="information-circle" size={24} color="#3498db" />
            <View style={styles.infoTextContainer}>
              <Text style={styles.infoTitle}>Your Responsibilities</Text>
              <Text style={styles.infoText}>
                As a Class Representative, you help coordinate between students and faculty.
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>
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
    shadowColor: '#07292d',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 6,
  },
  headerLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  crBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  headerTextContainer: {
    flex: 1,
  },
  headerName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#ffffff',
  },
  headerRole: {
    fontSize: 11,
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
  profileCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 16,
    marginBottom: 24,
    shadowColor: '#0b2228',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 4,
  },
  profileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  profileAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#0f5f73',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  profileAvatarText: {
    fontSize: 24,
    fontWeight: '700',
    color: '#ffffff',
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#2c3e50',
    marginBottom: 4,
  },
  profileEmail: {
    fontSize: 13,
    color: '#7f8c8d',
  },
  profileDetails: {
    borderTopWidth: 1,
    borderTopColor: '#ecf0f1',
    paddingTop: 12,
  },
  profileDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  profileDetailText: {
    fontSize: 13,
    color: '#2c3e50',
    marginLeft: 8,
    fontWeight: '500',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#2c3e50',
    marginBottom: 16,
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
  infoSection: {
    marginTop: 8,
  },
  infoCard: {
    backgroundColor: '#d6eaf8',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderLeftWidth: 4,
    borderLeftColor: '#3498db',
  },
  infoTextContainer: {
    flex: 1,
    marginLeft: 12,
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#2c3e50',
    marginBottom: 4,
  },
  infoText: {
    fontSize: 12,
    color: '#2c3e50',
    lineHeight: 18,
  },
});

export default CRDashboard;
