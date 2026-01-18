/**
 * Faculty Dashboard - Class Representative Management
 * 
 * This component allows faculty to:
 * 1. Assign students as Class Representatives
 * 2. Reassign to new representatives
 * 3. Remove representatives
 * 4. View assignment history and audit logs
 */

import React, { useState, useEffect } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Modal,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { doc, getDoc, getDocs, collection, query, where } from 'firebase/firestore';
import { db, auth } from '../firebase/firebaseConfig';

const FacultyRepManagementScreen = () => {
  const [activeTab, setActiveTab] = useState('assign'); // 'assign' | 'reassign' | 'history'
  const [isLoading, setIsLoading] = useState(false);
  const [assignments, setAssignments] = useState([]);
  
  // Assignment form state
  const [studentEmail, setStudentEmail] = useState('');
  const [collegeId, setCollegeId] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [slot, setSlot] = useState('');
  const [year, setYear] = useState(new Date().getFullYear().toString());
  
  // Reassignment form state
  const [oldRepEmail, setOldRepEmail] = useState('');
  const [newStudentEmail, setNewStudentEmail] = useState('');
  const [reassignCollege, setReassignCollege] = useState('');
  const [reassignDept, setReassignDept] = useState('');
  const [reassignSlot, setReassignSlot] = useState('');
  const [reassignYear, setReassignYear] = useState(new Date().getFullYear().toString());

  useEffect(() => {
    if (activeTab === 'history') {
      loadAssignmentHistory();
    }
  }, [activeTab]);

  /**
   * Load assignment history from Firestore
   */
  const loadAssignmentHistory = async () => {
    try {
      setIsLoading(true);
      const facultyId = auth.currentUser?.uid;
      
      if (!facultyId) {
        Alert.alert('Error', 'Faculty ID not found');
        return;
      }

      const q = query(
        collection(db, 'repAssignments'),
        where('assignedByFacultyId', '==', facultyId)
      );

      const snapshot = await getDocs(q);
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      setAssignments(data.sort((a, b) => 
        new Date(b.assignedAt) - new Date(a.assignedAt)
      ));

    } catch (error) {
      console.error('Error loading history:', error);
      Alert.alert('Error', 'Failed to load assignment history');
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Assign a new Class Representative
   */
  const handleAssignRepresentative = async () => {
    // Validate inputs
    if (!studentEmail || !collegeId || !departmentId || !slot || !year) {
      Alert.alert('Missing Fields', 'Please fill in all required fields');
      return;
    }

    setIsLoading(true);

    try {
      const facultyId = auth.currentUser?.uid;
      if (!facultyId) throw new Error('Faculty not authenticated');

      const token = await auth.currentUser?.getIdToken();

      // Call Cloud Function
      const response = await fetch(
        'https://YOUR_PROJECT.cloudfunctions.net/assignClassRepresentative',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            studentEmail,
            collegeId,
            departmentId,
            slot,
            year: parseInt(year),
            facultyId
          })
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message);
      }

      const result = await response.json();

      Alert.alert(
        'Success',
        `Class Representative assigned successfully.\n\nPassword sent to ${studentEmail}`,
        [
          {
            text: 'OK',
            onPress: () => {
              // Clear form
              setStudentEmail('');
              setCollegeId('');
              setDepartmentId('');
              setSlot('');
              setYear(new Date().getFullYear().toString());
            }
          }
        ]
      );

    } catch (error) {
      console.error('Assignment error:', error);
      Alert.alert('Assignment Failed', error.message || 'Failed to assign representative');
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Reassign Class Representative
   */
  const handleReassignRepresentative = async () => {
    // Validate inputs
    if (!oldRepEmail || !newStudentEmail || !reassignCollege || !reassignDept || !reassignSlot || !reassignYear) {
      Alert.alert('Missing Fields', 'Please fill in all required fields');
      return;
    }

    if (oldRepEmail === newStudentEmail) {
      Alert.alert('Error', 'Old and new rep must be different');
      return;
    }

    Alert.alert(
      'Confirm Reassignment',
      `Are you sure you want to reassign the representative for ${reassignCollege}-${reassignDept} Slot ${reassignSlot}?\n\n` +
      `Old Rep: ${oldRepEmail}\n` +
      `New Rep: ${newStudentEmail}\n\n` +
      `The old rep will lose access immediately.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reassign',
          style: 'destructive',
          onPress: async () => {
            setIsLoading(true);

            try {
              const facultyId = auth.currentUser?.uid;
              if (!facultyId) throw new Error('Faculty not authenticated');

              const token = await auth.currentUser?.getIdToken();

              // First, get the old rep's UID from their email
              const oldRepQuery = query(
                collection(db, 'users'),
                where('email', '==', oldRepEmail.toLowerCase())
              );
              const oldRepSnapshot = await getDocs(oldRepQuery);
              
              if (oldRepSnapshot.empty) {
                throw new Error('Old representative not found');
              }

              const oldRepUid = oldRepSnapshot.docs[0].id;

              // Call Cloud Function
              const response = await fetch(
                'https://YOUR_PROJECT.cloudfunctions.net/reassignClassRepresentative',
                {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                  },
                  body: JSON.stringify({
                    oldRepUid,
                    newStudentEmail,
                    collegeId: reassignCollege,
                    departmentId: reassignDept,
                    slot: reassignSlot,
                    year: parseInt(reassignYear),
                    facultyId
                  })
                }
              );

              if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message);
              }

              Alert.alert(
                'Success',
                `Representative reassigned successfully.\n\n` +
                `New password sent to ${newStudentEmail}\n` +
                `Old rep access revoked immediately`,
                [
                  {
                    text: 'OK',
                    onPress: () => {
                      setOldRepEmail('');
                      setNewStudentEmail('');
                      setReassignCollege('');
                      setReassignDept('');
                      setReassignSlot('');
                      setReassignYear(new Date().getFullYear().toString());
                    }
                  }
                ]
              );

            } catch (error) {
              console.error('Reassignment error:', error);
              Alert.alert('Reassignment Failed', error.message || 'Failed to reassign representative');
            } finally {
              setIsLoading(false);
            }
          }
        }
      ]
    );
  };

  /**
   * Render assignment form
   */
  const renderAssignmentForm = () => (
    <ScrollView style={styles.formContainer}>
      <Text style={styles.sectionTitle}>Assign New Class Representative</Text>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>Student Email *</Text>
        <TextInput
          style={styles.input}
          placeholder="student@college.edu"
          placeholderTextColor="#999"
          value={studentEmail}
          onChangeText={setStudentEmail}
          editable={!isLoading}
          keyboardType="email-address"
          autoCapitalize="none"
        />
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>College ID *</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g., college-1"
          placeholderTextColor="#999"
          value={collegeId}
          onChangeText={setCollegeId}
          editable={!isLoading}
          autoCapitalize="none"
        />
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>Department ID *</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g., dept-cs"
          placeholderTextColor="#999"
          value={departmentId}
          onChangeText={setDepartmentId}
          editable={!isLoading}
          autoCapitalize="none"
        />
      </View>

      <View style={styles.row}>
        <View style={[styles.inputGroup, { flex: 1, marginRight: 10 }]}>
          <Text style={styles.label}>Slot *</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g., slot-a"
            placeholderTextColor="#999"
            value={slot}
            onChangeText={setSlot}
            editable={!isLoading}
            autoCapitalize="none"
          />
        </View>

        <View style={[styles.inputGroup, { flex: 1 }]}>
          <Text style={styles.label}>Year *</Text>
          <TextInput
            style={styles.input}
            placeholder="2024"
            placeholderTextColor="#999"
            value={year}
            onChangeText={setYear}
            editable={!isLoading}
            keyboardType="numeric"
          />
        </View>
      </View>

      <TouchableOpacity
        style={[styles.submitButton, isLoading && styles.submitButtonDisabled]}
        onPress={handleAssignRepresentative}
        disabled={isLoading}
      >
        {isLoading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <>
            <Ionicons name="person-add" size={20} color="#fff" style={styles.buttonIcon} />
            <Text style={styles.submitButtonText}>Assign Representative</Text>
          </>
        )}
      </TouchableOpacity>

      <View style={styles.infoBox}>
        <Ionicons name="information-circle-outline" size={20} color="#0066cc" />
        <Text style={styles.infoText}>
          A secure password will be generated and sent to the student's email. 
          The student will use this password to login as a Class Representative.
        </Text>
      </View>
    </ScrollView>
  );

  /**
   * Render reassignment form
   */
  const renderReassignmentForm = () => (
    <ScrollView style={styles.formContainer}>
      <Text style={styles.sectionTitle}>Reassign Class Representative</Text>

      <View style={styles.warningBox}>
        <Ionicons name="warning" size={20} color="#ff9800" />
        <Text style={styles.warningText}>
          This action will immediately revoke the old representative's access 
          and assign the slot to a new representative.
        </Text>
      </View>

      <Text style={styles.groupLabel}>Current Representative</Text>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>Current Rep Email *</Text>
        <TextInput
          style={styles.input}
          placeholder="old.rep@college.edu"
          placeholderTextColor="#999"
          value={oldRepEmail}
          onChangeText={setOldRepEmail}
          editable={!isLoading}
          keyboardType="email-address"
          autoCapitalize="none"
        />
      </View>

      <Text style={styles.groupLabel}>New Representative</Text>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>New Student Email *</Text>
        <TextInput
          style={styles.input}
          placeholder="new.rep@college.edu"
          placeholderTextColor="#999"
          value={newStudentEmail}
          onChangeText={setNewStudentEmail}
          editable={!isLoading}
          keyboardType="email-address"
          autoCapitalize="none"
        />
      </View>

      <Text style={styles.groupLabel}>Slot Information</Text>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>College ID *</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g., college-1"
          placeholderTextColor="#999"
          value={reassignCollege}
          onChangeText={setReassignCollege}
          editable={!isLoading}
          autoCapitalize="none"
        />
      </View>

      <View style={styles.inputGroup}>
        <Text style={styles.label}>Department ID *</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g., dept-cs"
          placeholderTextColor="#999"
          value={reassignDept}
          onChangeText={setReassignDept}
          editable={!isLoading}
          autoCapitalize="none"
        />
      </View>

      <View style={styles.row}>
        <View style={[styles.inputGroup, { flex: 1, marginRight: 10 }]}>
          <Text style={styles.label}>Slot *</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g., slot-a"
            placeholderTextColor="#999"
            value={reassignSlot}
            onChangeText={setReassignSlot}
            editable={!isLoading}
            autoCapitalize="none"
          />
        </View>

        <View style={[styles.inputGroup, { flex: 1 }]}>
          <Text style={styles.label}>Year *</Text>
          <TextInput
            style={styles.input}
            placeholder="2024"
            placeholderTextColor="#999"
            value={reassignYear}
            onChangeText={setReassignYear}
            editable={!isLoading}
            keyboardType="numeric"
          />
        </View>
      </View>

      <TouchableOpacity
        style={[styles.submitButton, styles.submitButtonDanger, isLoading && styles.submitButtonDisabled]}
        onPress={handleReassignRepresentative}
        disabled={isLoading}
      >
        {isLoading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <>
            <Ionicons name="swap-horizontal" size={20} color="#fff" style={styles.buttonIcon} />
            <Text style={styles.submitButtonText}>Reassign Representative</Text>
          </>
        )}
      </TouchableOpacity>
    </ScrollView>
  );

  /**
   * Render assignment history
   */
  const renderHistoryItem = ({ item }) => (
    <View style={styles.historyItem}>
      <View style={styles.historyHeader}>
        <Text style={styles.historyEmail}>{item.email}</Text>
        <View style={[
          styles.historyBadge,
          item.action === 'assigned' ? styles.badgeAssigned : styles.badgeReassigned
        ]}>
          <Text style={styles.historyAction}>
            {item.action === 'assigned' ? 'Assigned' : 'Reassigned'}
          </Text>
        </View>
      </View>

      <View style={styles.historyDetail}>
        <Text style={styles.historyLabel}>Slot:</Text>
        <Text style={styles.historyValue}>
          {item.departmentId} - {item.slot} ({item.year})
        </Text>
      </View>

      <View style={styles.historyDetail}>
        <Text style={styles.historyLabel}>Password Version:</Text>
        <Text style={styles.historyValue}>{item.passwordVersion}</Text>
      </View>

      <View style={styles.historyDetail}>
        <Text style={styles.historyLabel}>Date:</Text>
        <Text style={styles.historyValue}>
          {new Date(item.assignedAt).toLocaleDateString()}
        </Text>
      </View>
    </View>
  );

  const renderHistoryList = () => (
    <View style={styles.historyContainer}>
      <Text style={styles.sectionTitle}>Assignment History</Text>

      {isLoading ? (
        <ActivityIndicator size="large" color="#0066cc" style={styles.loader} />
      ) : assignments.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="document-outline" size={48} color="#999" />
          <Text style={styles.emptyStateText}>No assignments yet</Text>
        </View>
      ) : (
        <FlatList
          data={assignments}
          renderItem={renderHistoryItem}
          keyExtractor={item => item.id}
          scrollEnabled={false}
        />
      )}
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Rep Management</Text>
      </View>

      {/* Tab Navigation */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'assign' && styles.activeTab]}
          onPress={() => setActiveTab('assign')}
        >
          <Text style={[styles.tabText, activeTab === 'assign' && styles.activeTabText]}>
            Assign
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tab, activeTab === 'reassign' && styles.activeTab]}
          onPress={() => setActiveTab('reassign')}
        >
          <Text style={[styles.tabText, activeTab === 'reassign' && styles.activeTabText]}>
            Reassign
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tab, activeTab === 'history' && styles.activeTab]}
          onPress={() => setActiveTab('history')}
        >
          <Text style={[styles.tabText, activeTab === 'history' && styles.activeTabText]}>
            History
          </Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      {activeTab === 'assign' && renderAssignmentForm()}
      {activeTab === 'reassign' && renderReassignmentForm()}
      {activeTab === 'history' && renderHistoryList()}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1a1a1a',
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  activeTab: {
    borderBottomColor: '#0066cc',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#666',
  },
  activeTabText: {
    color: '#0066cc',
  },
  formContainer: {
    flex: 1,
    padding: 16,
  },
  historyContainer: {
    flex: 1,
    padding: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: 16,
  },
  groupLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginTop: 16,
    marginBottom: 12,
  },
  inputGroup: {
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  label: {
    fontSize: 13,
    fontWeight: '500',
    color: '#333',
    marginBottom: 6,
  },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#333',
  },
  submitButton: {
    backgroundColor: '#0066cc',
    borderRadius: 8,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
    marginBottom: 16,
  },
  submitButtonDanger: {
    backgroundColor: '#ff5252',
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  buttonIcon: {
    marginRight: 4,
  },
  infoBox: {
    flexDirection: 'row',
    backgroundColor: '#e3f2fd',
    borderRadius: 8,
    padding: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#0066cc',
    marginBottom: 16,
  },
  infoText: {
    flex: 1,
    fontSize: 12,
    color: '#0066cc',
    marginLeft: 10,
    lineHeight: 16,
  },
  warningBox: {
    flexDirection: 'row',
    backgroundColor: '#fff3e0',
    borderRadius: 8,
    padding: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#ff9800',
    marginBottom: 16,
  },
  warningText: {
    flex: 1,
    fontSize: 12,
    color: '#ff9800',
    marginLeft: 10,
    lineHeight: 16,
  },
  historyItem: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#0066cc',
  },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  historyEmail: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1a1a1a',
  },
  historyBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  badgeAssigned: {
    backgroundColor: '#e8f5e9',
  },
  badgeReassigned: {
    backgroundColor: '#fff3e0',
  },
  historyAction: {
    fontSize: 11,
    fontWeight: '600',
    color: '#333',
  },
  historyDetail: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  historyLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: '#666',
    width: 100,
  },
  historyValue: {
    flex: 1,
    fontSize: 12,
    color: '#333',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  emptyStateText: {
    fontSize: 14,
    color: '#999',
    marginTop: 10,
  },
  loader: {
    marginVertical: 40,
  },
});

export default FacultyRepManagementScreen;
