import { Ionicons } from '@expo/vector-icons';
import React, { useState, useCallback } from 'react';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useLocalSearchParams } from 'expo-router';
import { BackHandler } from 'react-native';
import {
  Alert,
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getYearDisplayLabel } from '../constants/academicYear';

const AttendanceManagementScreen = () => {
  const navigation = useNavigation();
  const params = useLocalSearchParams();
  const { classId, year } = params;

  // Format year for display (e.g., Year 1 -> Year 1 – 2025)
  const displayYear = year?.startsWith('Year ')
    ? getYearDisplayLabel(year.replace('Year ', ''))
    : year;

  // Hardware back: go to previous screen if possible
  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        if (navigation?.canGoBack?.()) {
          navigation.goBack();
          return true;
        }
        return false;
      };
      const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
      return () => subscription.remove();
    }, [navigation])
  );

  const [sessions, setSessions] = useState([
    {
      id: '1',
      date: '2025-01-15',
      subject: 'Data Structures',
      attendance: {
        present: 38,
        absent: 5,
        leave: 2,
      },
      status: 'submitted',
      submittedBy: 'Rahul Kumar',
    },
    {
      id: '2',
      date: '2025-01-14',
      subject: 'Algorithms',
      attendance: {
        present: 42,
        absent: 2,
        leave: 1,
      },
      status: 'approved',
      submittedBy: 'Rahul Kumar',
    },
    {
      id: '3',
      date: '2025-01-13',
      subject: 'Database Systems',
      attendance: {
        present: 40,
        absent: 3,
        leave: 2,
      },
      status: 'pending',
      submittedBy: 'Rahul Kumar',
    },
  ]);

  const handleApproveAttendance = (id) => {
    setSessions(
      sessions.map(session =>
        session.id === id ? { ...session, status: 'approved' } : session
      )
    );
    Alert.alert('Success', 'Attendance approved');
  };

  const handleRejectAttendance = (id) => {
    Alert.alert(
      'Reject Attendance',
      'This will send it back to the Class Representative',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reject',
          onPress: () => {
            setSessions(
              sessions.map(session =>
                session.id === id ? { ...session, status: 'submitted' } : session
              )
            );
            Alert.alert('Success', 'Attendance rejected and sent back to rep');
          },
          style: 'destructive',
        },
      ]
    );
  };

  const handleLockAttendance = (id) => {
    Alert.alert(
      'Lock Attendance',
      'Once locked, this record cannot be modified',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Lock',
          onPress: () => {
            setSessions(
              sessions.map(session =>
                session.id === id ? { ...session, status: 'locked' } : session
              )
            );
            Alert.alert('Success', 'Attendance locked');
          },
          style: 'destructive',
        },
      ]
    );
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'pending':
        return '#f39c12';
      case 'submitted':
        return '#3498db';
      case 'approved':
        return '#2ecc71';
      case 'locked':
        return '#e74c3c';
      default:
        return '#7f8c8d';
    }
  };

  const renderSessionItem = ({ item }) => (
    <View style={styles.sessionCard}>
      <View style={styles.sessionHeader}>
        <View>
          <Text style={styles.sessionDate}>{item.date}</Text>
          <Text style={styles.sessionSubject}>{item.subject}</Text>
          <Text style={styles.submittedBy}>By: {item.submittedBy}</Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) + '20' }]}>
          <Text style={[styles.statusText, { color: getStatusColor(item.status) }]}>
            {item.status.toUpperCase()}
          </Text>
        </View>
      </View>

      <View style={styles.attendanceStats}>
        <View style={styles.statItem}>
          <Ionicons name="checkmark-circle" size={16} color="#2ecc71" />
          <Text style={styles.statText}>Present: {item.attendance.present}</Text>
        </View>
        <View style={styles.statItem}>
          <Ionicons name="close-circle" size={16} color="#e74c3c" />
          <Text style={styles.statText}>Absent: {item.attendance.absent}</Text>
        </View>
        <View style={styles.statItem}>
          <Ionicons name="document-text" size={16} color="#f39c12" />
          <Text style={styles.statText}>Leave: {item.attendance.leave}</Text>
        </View>
      </View>

      {item.status === 'pending' || item.status === 'submitted' ? (
        <View style={styles.actionButtons}>
          {item.status === 'submitted' && (
            <>
              <TouchableOpacity
                style={[styles.button, styles.approveButton]}
                onPress={() => handleApproveAttendance(item.id)}
              >
                <Ionicons name="checkmark" size={14} color="#ffffff" />
                <Text style={styles.buttonText}>Approve</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.button, styles.rejectButton]}
                onPress={() => handleRejectAttendance(item.id)}
              >
                <Ionicons name="close" size={14} color="#ffffff" />
                <Text style={styles.buttonText}>Reject</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      ) : null}

      {item.status === 'approved' && (
        <TouchableOpacity
          style={[styles.button, styles.lockButton]}
          onPress={() => handleLockAttendance(item.id)}
        >
          <Ionicons name="lock-closed" size={14} color="#ffffff" />
          <Text style={styles.buttonText}>Lock Record</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={24} color="#2c3e50" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Attendance Management</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.classInfo}>
        <Text style={styles.classInfoText}>{displayYear} - Class {classId}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <FlatList
          data={sessions}
          renderItem={renderSessionItem}
          keyExtractor={item => item.id}
          scrollEnabled={false}
        />

        <View style={styles.infoBox}>
          <Ionicons name="information-circle" size={16} color="#3498db" />
          <Text style={styles.infoText}>
            Review attendance submitted by class representatives, approve/reject or lock after verification
          </Text>
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
    backgroundColor: '#ffffff',
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#ecf0f1',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#2c3e50',
  },
  classInfo: {
    backgroundColor: '#d6eaf8',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#3498db',
  },
  classInfoText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#2c3e50',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  sessionCard: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  sessionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  sessionDate: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2c3e50',
  },
  sessionSubject: {
    fontSize: 11,
    color: '#7f8c8d',
    marginTop: 2,
  },
  submittedBy: {
    fontSize: 10,
    color: '#bdc3c7',
    marginTop: 2,
  },
  statusBadge: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 9,
    fontWeight: '700',
  },
  attendanceStats: {
    backgroundColor: '#f8f9fa',
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 8,
    marginBottom: 12,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  statText: {
    fontSize: 11,
    color: '#2c3e50',
    marginLeft: 6,
    fontWeight: '600',
  },
  actionButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  button: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 6,
    marginHorizontal: 4,
  },
  approveButton: {
    backgroundColor: '#2ecc71',
  },
  rejectButton: {
    backgroundColor: '#e74c3c',
  },
  lockButton: {
    backgroundColor: '#7f8c8d',
  },
  buttonText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#ffffff',
    marginLeft: 4,
  },
  infoBox: {
    backgroundColor: '#d6eaf8',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    marginBottom: 20,
  },
  infoText: {
    fontSize: 11,
    color: '#2c3e50',
    marginLeft: 8,
    flex: 1,
  },
});

export default AttendanceManagementScreen;
