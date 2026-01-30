import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { collection, doc, getDoc, onSnapshot, serverTimestamp, updateDoc } from 'firebase/firestore';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { auth, db } from '../firebase/firebaseConfig';
import { getCurrentAcademicYear, getYearDisplayLabel } from '../utils/academicYearManager';

const { width } = Dimensions.get('window');

const CRTaskAssignmentScreen = () => {
  const router = useRouter();
  const [selectedYear, setSelectedYear] = useState(1);
  const [academicYear, setAcademicYear] = useState(2025);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [students, setStudents] = useState([]);
  const [departmentId, setDepartmentId] = useState(null);
  const [collegeId, setCollegeId] = useState(null);
  const [expandedTaskId, setExpandedTaskId] = useState(null);
  const [userRole, setUserRole] = useState(null);

  const scrollRef = useRef(null);
  const scrollAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    loadCRData();
    const currentYear = getCurrentAcademicYear();
    setAcademicYear(currentYear);
  }, []);

  useEffect(() => {
    if (selectedYear && departmentId && collegeId) {
      const unsubscribe = loadTasks();
      return unsubscribe;
    }
    return undefined;
  }, [selectedYear, departmentId, collegeId]);

  const loadCRData = async () => {
    try {
      const authUid = auth.currentUser?.uid;
      if (!authUid) return;

      const userDocRef = doc(db, 'users', authUid);
      const userSnap = await getDoc(userDocRef);

      if (!userSnap.exists()) return;

      const userData = userSnap.data();
      const currentYear = parseInt(userData.currentYear || userData.year_level || 1, 10);

      setCollegeId(userData.collegeId || null);
      setDepartmentId(userData.departmentId || userData.departmentCode || null);
      setSelectedYear(currentYear);
      setUserRole(userData.role || 'representative');
    } catch (error) {
      console.error('Error loading CR data:', error);
    }
  };

  const loadTasks = () => {
    if (!selectedYear || !departmentId || !collegeId) return;

    setLoading(true);
    const yearId = `year${selectedYear}`;
    const tasksRef = collection(db, 'colleges', collegeId, 'departments', departmentId, 'years', yearId, 'taskAssignments');

    const unsubscribe = onSnapshot(tasksRef,
      (snapshot) => {
        const tasksData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setTasks(tasksData.sort((a, b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0)));
        setLoading(false);
      },
      (error) => {
        console.error('Error loading tasks:', error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  };

  const handleYearSelect = (year) => {
    setSelectedYear(year);
    setTasks([]);
  };

  const handleToggleStudentStatus = async (task, studentId) => {
    try {
      const studentIndex = task.students.findIndex(s => s.studentId === studentId);
      if (studentIndex === -1) return;

      const updatedStudents = [...task.students];
      const newStatus = !updatedStudents[studentIndex].completed;

      updatedStudents[studentIndex] = {
        ...updatedStudents[studentIndex],
        completed: newStatus,
        completionDate: newStatus ? new Date().toISOString() : null
      };

      const yearId = `year${selectedYear}`;
      const taskRef = doc(db, 'colleges', collegeId, 'departments', departmentId, 'years', yearId, 'taskAssignments', task.id);

      await updateDoc(taskRef, {
        students: updatedStudents,
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      console.error('Error updating status:', error);
      Alert.alert('Error', 'Failed to update student status');
    }
  };

  const handleSelectAll = async (task, shouldComplete) => {
    try {
      const updatedStudents = task.students.map(s => ({
        ...s,
        completed: shouldComplete,
        completionDate: shouldComplete ? new Date().toISOString() : null
      }));

      const yearId = `year${selectedYear}`;
      const taskRef = doc(db, 'colleges', collegeId, 'departments', departmentId, 'years', yearId, 'taskAssignments', task.id);

      await updateDoc(taskRef, {
        students: updatedStudents,
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      console.error('Error updating all status:', error);
      Alert.alert('Error', 'Failed to update all students');
    }
  };

  const getCheckboxColor = (student, dueDateStr) => {
    if (!student.completed) return '#ccc';
    if (!dueDateStr) return '#16a085';

    try {
      const [d, m, y] = dueDateStr.split('/').map(Number);
      const dueDateObj = new Date(y, m - 1, d, 23, 59, 59);
      const completionDateObj = new Date(student.completionDate);

      if (completionDateObj > dueDateObj) return '#f39c12';
      return '#16a085';
    } catch (e) {
      return '#16a085';
    }
  };

  const renderTaskItem = (task) => {
    const isExpanded = expandedTaskId === task.id;
    const completedCount = task.students?.filter(s => s.completed).length || 0;
    const totalCount = task.students?.length || 0;
    const allSelected = totalCount > 0 && completedCount === totalCount;

    return (
      <View key={task.id} style={styles.taskCard}>
        <View style={styles.taskHeaderRow}>
          <TouchableOpacity style={styles.taskHeaderLeftSection} onPress={() => setExpandedTaskId(isExpanded ? null : task.id)}>
            <View style={styles.taskHeaderLeft}>
              <View style={styles.taskIconContainer}>
                <Ionicons name="clipboard" size={22} color="#fff" />
              </View>
              <View style={styles.taskHeaderText}>
                <Text style={styles.taskTitle}>{task.title}</Text>
                <Text style={styles.taskStats}>{completedCount} of {totalCount} completed</Text>
                <Text style={styles.taskDatesText}>
                  {task.startDate || task.dueDate ?
                    `${task.startDate || 'No start'} | ${task.dueDate || 'No deadline'}` :
                    "No deadline"
                  }
                </Text>
              </View>
            </View>
          </TouchableOpacity>
          <View style={styles.taskHeaderActions}>
            <TouchableOpacity onPress={() => setExpandedTaskId(isExpanded ? null : task.id)} style={styles.iconButtonAction}>
              <Ionicons name={isExpanded ? "chevron-up" : "chevron-down"} size={22} color="#666" />
            </TouchableOpacity>
          </View>
        </View>

        {isExpanded && (
          <View style={styles.taskDetails}>
            {task.description ? <Text style={styles.taskDescription}>{task.description}</Text> : null}

            <View style={styles.progressBarContainer}>
              <View style={[styles.progressFill, { width: `${totalCount > 0 ? (completedCount / totalCount) * 100 : 0}%` }]} />
            </View>

            <View style={styles.selectAllRow}>
              <Text style={styles.selectAllLabel}>Mark All Completed</Text>
              <TouchableOpacity onPress={() => handleSelectAll(task, !allSelected)}>
                <Ionicons name={allSelected ? "checkbox" : "square-outline"} size={26} color={allSelected ? "#16a085" : "#ccc"} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.studentsList} nestedScrollEnabled={true}>
              {task.students?.map((student, index) => (
                <View key={student.studentId || index} style={styles.studentItem}>
                  <View style={styles.studentInfo}>
                    <Text style={styles.studentRollNo}>{student.rollNumber || student.rollNo}</Text>
                    <Text style={styles.studentNameText}>{student.name}</Text>
                  </View>
                  <TouchableOpacity onPress={() => handleToggleStudentStatus(task, student.studentId)}>
                    <Ionicons
                      name={student.completed ? "checkbox" : "square-outline"}
                      size={28}
                      color={getCheckboxColor(student, task.dueDate)}
                    />
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
          </View>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.coloredHeader}>
        <View style={styles.headerLeftContainer}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#fff" />
          </TouchableOpacity>
          <View style={styles.headerContent}>
            <Text style={styles.headerTitleSmall}>Task Assignment</Text>
            <Text style={styles.headerDateText}>{new Date().toISOString().split('T')[0]}</Text>
          </View>
        </View>
      </View>

      <View style={styles.yearIndicatorContainer}>
        <View style={styles.yearBadge}>
          <Text style={styles.yearBadgeText}>
            {getYearDisplayLabel(selectedYear)}
          </Text>
        </View>
        <Text style={styles.yearIndicatorSubtitle}>Tasks assigned to your year</Text>
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.contentScroll}
        contentContainerStyle={styles.contentPadding}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollAnim } } }], { useNativeDriver: false })}
      >
        {loading && tasks.length === 0 ? (
          <ActivityIndicator size="large" color="#16a085" style={{ marginTop: 50 }} />
        ) : tasks.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="clipboard-outline" size={80} color="#ddd" />
            <Text style={styles.emptyText}>No Tasks Found</Text>
            <Text style={styles.emptySubtext}>Tasks assigned by your faculty will appear here.</Text>
          </View>
        ) : (
          tasks.map(renderTaskItem)
        )}
        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9f9f9' },
  coloredHeader: {
    backgroundColor: '#0f5f73',
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  headerLeftContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  backButton: { marginRight: 15 },
  headerContent: { flex: 1 },
  headerTitleSmall: { fontSize: 20, fontWeight: '700', color: '#fff' },
  headerDateText: { color: 'rgba(255,255,255,0.8)', fontSize: 13, marginTop: 2 },
  yearIndicatorContainer: {
    backgroundColor: '#fff',
    paddingVertical: 15,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  yearBadge: {
    backgroundColor: '#0f5f73',
    paddingHorizontal: 15,
    paddingVertical: 6,
    borderRadius: 20,
  },
  yearBadgeText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
  yearIndicatorSubtitle: {
    fontSize: 12,
    color: '#7f8c8d',
    fontWeight: '500',
  },
  contentScroll: { flex: 1 },
  contentPadding: { padding: 16 },
  taskCard: { backgroundColor: '#fff', borderRadius: 16, marginBottom: 16, padding: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 10, elevation: 3 },
  taskHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  taskHeaderLeftSection: { flex: 1 },
  taskHeaderLeft: { flexDirection: 'row', alignItems: 'center' },
  taskIconContainer: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#234e63', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  taskHeaderText: { flex: 1 },
  taskTitle: { fontSize: 17, fontWeight: '700', color: '#2c3e50' },
  taskStats: { fontSize: 13, color: '#7f8c8d', marginTop: 2 },
  taskDatesText: { fontSize: 11, color: '#16a085', fontWeight: '600', marginTop: 4 },
  taskHeaderActions: { flexDirection: 'row' },
  iconButtonAction: { padding: 6, marginLeft: 6 },
  taskDetails: { marginTop: 16, borderTopWidth: 1, borderTopColor: '#f1f1f1', paddingTop: 16 },
  taskDescription: { fontSize: 14, color: '#576574', marginBottom: 15, lineHeight: 20 },
  progressBarContainer: { height: 6, backgroundColor: '#f0f0f0', borderRadius: 3, overflow: 'hidden', marginBottom: 15 },
  progressFill: { height: '100%', backgroundColor: '#16a085', borderRadius: 3 },
  selectAllRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f1f1f1', marginBottom: 5 },
  selectAllLabel: { fontSize: 14, fontWeight: '700', color: '#34495e' },
  studentsList: { maxHeight: 350 },
  studentItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#fafafa' },
  studentInfo: { flex: 1 },
  studentRollNo: { fontSize: 11, color: '#95a5a6', fontWeight: '600' },
  studentNameText: { fontSize: 14, fontWeight: '500', color: '#2c3e50', marginTop: 2 },
  emptyContainer: { alignItems: 'center', marginTop: 100, paddingHorizontal: 40 },
  emptyText: { fontSize: 20, fontWeight: '700', color: '#bdc3c7', marginTop: 20 },
  emptySubtext: { fontSize: 14, color: '#95a5a6', textAlign: 'center', marginTop: 10 },
});

export default CRTaskAssignmentScreen;
