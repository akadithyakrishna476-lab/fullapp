import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, useRouter } from 'expo-router';
import { signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
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
    title: 'Mark Attendance',
    icon: '✓',
    description: 'Record class attendance',
  },
  {
    id: '2',
    title: 'View Announcements',
    icon: '📢',
    description: 'Check latest announcements',
  },
];

const RepDashboard = () => {
  const router = useRouter();
  const [userEmail, setUserEmail] = useState(null);
  const [repInfo, setRepInfo] = useState(null);
  const [loading, setLoading] = useState(true);

  // Load rep assignment data when dashboard is focused
  useFocusEffect(
    useCallback(() => {
      loadRepData();
    }, [])
  );

  const loadRepData = async () => {
    try {
      setLoading(true);
      const email = await AsyncStorage.getItem('userEmail');
      const userId = await AsyncStorage.getItem('userId') || auth.currentUser?.uid;
      setUserEmail(email);

      if (!email && !userId) {
        console.log('⚠️ No user identifier found');
        setRepInfo(null);
        setLoading(false);
        return;
      }

      // STEP 1: Sync from Users collection (Source of Truth)
      if (userId) {
        const userDoc = await getDoc(doc(db, 'users', userId));
        if (userDoc.exists()) {
          const userData = userDoc.data();
          if (userData.role === 'cr' || userData.isCR) {
            setRepInfo({
              slot: userData.crPosition === 1 ? 'CR-1' : 'CR-2',
              year: userData.crYear || `year_${userData.currentYear}`,
              departmentId: userData.departmentCode || userData.departmentId,
              name: userData.name,
              ...userData
            });
            setLoading(false);
            return;
          }
        }
      }

      // STEP 2: Fallback to Class Representatives lookups
      const emailDocId = String(email || '').toLowerCase().replace(/[@.]/g, '_');
      const repRef = doc(db, 'classRepresentatives', emailDocId);
      const repSnap = await getDoc(repRef);

      if (repSnap.exists()) {
        console.log('✅ Rep assignment found:', repSnap.data());
        setRepInfo(repSnap.data());
      } else {
        // STEP 3: Last resort - search across all year collections
        console.log('🔍 Searching all years for CR assignment...');
        const years = ['year_1', 'year_2', 'year_3', 'year_4'];
        let found = false;

        for (const year of years) {
          const deptQuery = email ? query(collectionGroup(db, 'department_' + year), where('email', '==', email)) : null;
          // This part is complex due to nested structure, so we rely on User Profile mostly
        }

        setRepInfo(null);
      }
    } catch (error) {
      console.error('Error loading rep data:', error);
      setRepInfo(null);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      await AsyncStorage.clear().catch(() => { });
    } finally {
      router.replace('/role-select');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Class Representative</Text>
          {userEmail && <Text style={styles.headerEmail}>{userEmail}</Text>}
        </View>
        <TouchableOpacity
          style={styles.logoutButton}
          onPress={handleLogout}
        >
          <Text style={styles.logoutButtonText}>Logout</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#9b59b6" />
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {!repInfo && (
            <View style={styles.infoBox}>
              <Text style={styles.infoIcon}>ℹ️</Text>
              <Text style={styles.infoText}>
                Assignment details will appear once your faculty advisor assigns you a class.
              </Text>
            </View>
          )}

          {repInfo && (
            <View style={styles.assignmentBox}>
              <Text style={styles.infoTitle}>Your Assignment</Text>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Slot:</Text>
                <Text style={styles.infoValue}>{repInfo.slot}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Year:</Text>
                <Text style={styles.infoValue}>{repInfo.currentYear ? getYearDisplayLabel(repInfo.currentYear) : (repInfo.year || 'N/A')}</Text>
              </View>
              {repInfo.departmentId && (
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Department:</Text>
                  <Text style={styles.infoValue}>{repInfo.departmentId}</Text>
                </View>
              )}
            </View>
          )}

          <Text style={styles.sectionTitle}>Your Tasks</Text>

          <View style={styles.menuContainer}>
            {menuItems.map(item => (
              <TouchableOpacity
                key={item.id}
                style={styles.card}
                activeOpacity={0.7}
              >
                <View style={styles.cardContent}>
                  <Text style={styles.cardIcon}>{item.icon}</Text>
                  <View style={styles.cardTextContainer}>
                    <Text style={styles.cardTitle}>{item.title}</Text>
                    <Text style={styles.cardDescription}>{item.description}</Text>
                  </View>
                </View>
                <Text style={styles.cardArrow}>›</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#7f8c8d',
  },
  header: {
    backgroundColor: '#9b59b6',
    paddingVertical: 16,
    paddingHorizontal: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#ffffff',
  },
  headerEmail: {
    fontSize: 12,
    color: '#ecf0f1',
    marginTop: 4,
  },
  logoutButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: '#e74c3c',
    borderRadius: 6,
  },
  logoutButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#ffffff',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingVertical: 20,
  },
  infoBox: {
    backgroundColor: '#e3f2fd',
    borderLeftColor: '#2196f3',
    borderLeftWidth: 4,
    padding: 16,
    borderRadius: 6,
    marginBottom: 20,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  infoIcon: {
    fontSize: 20,
    marginRight: 12,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    color: '#1565c0',
    lineHeight: 20,
  },
  warningBox: {
    backgroundColor: '#fff3cd',
    borderLeftColor: '#ff9800',
    borderLeftWidth: 4,
    padding: 16,
    borderRadius: 6,
    marginBottom: 20,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  warningIcon: {
    fontSize: 20,
    marginRight: 12,
  },
  warningText: {
    flex: 1,
    fontSize: 14,
    color: '#856404',
    lineHeight: 20,
  },
  assignmentBox: {
    backgroundColor: '#e8f5e9',
    borderLeftColor: '#4caf50',
    borderLeftWidth: 4,
    padding: 16,
    borderRadius: 6,
    marginBottom: 20,
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#2e7d32',
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomColor: '#c8e6c9',
    borderBottomWidth: 1,
  },
  infoLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#558b2f',
  },
  infoValue: {
    fontSize: 13,
    color: '#2e7d32',
    fontWeight: '500',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#2c3e50',
    marginBottom: 16,
  },
  menuContainer: {
    gap: 12,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    paddingVertical: 16,
    paddingHorizontal: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  cardIcon: {
    fontSize: 32,
    marginRight: 16,
  },
  cardTextContainer: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2c3e50',
    marginBottom: 4,
  },
  cardDescription: {
    fontSize: 12,
    color: '#7f8c8d',
  },
  cardArrow: {
    fontSize: 24,
    color: '#9b59b6',
  },
});

export default RepDashboard;
