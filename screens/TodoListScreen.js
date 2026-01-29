import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useNavigation } from 'expo-router';
import {
  addDoc,
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where
} from 'firebase/firestore';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, BackHandler, FlatList,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { auth, db } from '../firebase/firebaseConfig';


const TodoListScreen = () => {
  const navigation = useNavigation();
  // Hardware back: go to previous screen if possible
  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        if (navigation.canGoBack()) {
          navigation.goBack();
          return true;
        }
        return false;
      };
      const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
      return () => subscription.remove();
    }, [navigation])
  );
  const [tasks, setTasks] = useState([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [filterStatus, setFilterStatus] = useState('all'); // all, pending, completed
  const [sortBy, setSortBy] = useState('date'); // date

  // Real-time Firestore States
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState(null); // 'faculty' | 'rep'
  const [facultyId, setFacultyId] = useState(null);
  const [advisorJoiningYear, setAdvisorJoiningYear] = useState(null);
  const [advisorName, setAdvisorName] = useState(null);
  const [advisorDept, setAdvisorDept] = useState(null); // Added
  const [myDept, setMyDept] = useState(null); // Added
  const [userData, setUserData] = useState(null);
  const [noAdvisor, setNoAdvisor] = useState(false);
  const [hiddenTaskCount, setHiddenTaskCount] = useState(0);

  // Edit State
  const [editingTask, setEditingTask] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editTaskTitle, setEditTaskTitle] = useState('');

  useEffect(() => {
    loadUserStatus();
  }, []);

  const loadUserStatus = async () => {
    try {
      const user = auth.currentUser;
      if (!user) {
        console.warn('[TodoList] No authenticated user');
        setLoading(false);
        return;
      }

      console.log('[TodoList] Checking status for UID:', user.uid);

      // Check if faculty
      const facultyRef = doc(db, 'faculty', user.uid);
      const facultySnap = await getDoc(facultyRef);

      if (facultySnap.exists()) {
        const data = facultySnap.data();
        console.log('[TodoList] Detected Faculty. isStaffAdvisor:', data.isStaffAdvisor, 'Batch:', data.advisorJoiningYear);
        setUserData(data);
        setUserRole('faculty');
        setFacultyId(user.uid);
        if (data.isStaffAdvisor && data.advisorJoiningYear) {
          setAdvisorJoiningYear(data.advisorJoiningYear);
          setupRealtimeSubscriptions(user.uid, data.advisorJoiningYear);
        } else {
          console.warn('[TodoList] Faculty user is not a Staff Advisor or missing batch year');
          setLoading(false);
        }
      } else {
        // Check if Rep (in users collection)
        const userRef = doc(db, 'users', user.uid);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
          const data = userSnap.data();
          console.log('[TodoList] Detected Student/Rep. Joining Year:', data.joiningYear, 'Dept:', data.department || data.departmentCode);
          setUserData(data);
          setUserRole('rep');

          console.log('[TodoList] User Data Keys:', Object.keys(data));
          const joiningYear = data.joiningYear || data.year || data.batch || data.admissionYear;
          const dept = data.department || data.departmentCode || data.departmentId || data.dept || data.deptCode;

          if (!joiningYear || !dept) {
            console.log('[TodoList] Profile incomplete in users collection. Checking students collection...');

            // Fallback: Check 'students' collection group
            const studentsQuery = query(
              collectionGroup(db, 'students'),
              where('email', '==', user.email)
            );

            const studentsSnap = await getDocs(studentsQuery);
            if (!studentsSnap.empty) {
              const studentData = studentsSnap.docs[0].data();
              console.log('[TodoList] Found data in students collection:', studentData);
              const sYear = studentData.joiningYear || studentData.year || studentData.batch;
              const sDept = studentData.department || studentData.departmentCode || studentData.dept;

              if (sYear && sDept) {
                await findAdvisor(sYear, sDept);
                return;
              }
            }

            console.warn('[TodoList] Rep profile incomplete:', { joiningYear, dept });
            setLoading(false);
            return;
          }

          await findAdvisor(joiningYear, dept);
        } else {
          console.warn('[TodoList] UID not found in faculty or users collections');
          setLoading(false);
        }
      }
    } catch (error) {
      console.error('[TodoList] Error in loadUserStatus:', error);
      setLoading(false);
    }
  };

  const findAdvisor = async (joiningYear, dept) => {
    setMyDept(dept);
    // Find matching advisor
    console.log('[TodoList] Searching for Staff Advisor. Year:', joiningYear, 'Dept:', dept);

    // Try searching by year first (using new 'staffAdvisors' collection)
    const yearQuery = query(
      collection(db, 'staffAdvisors'), // Updated collection
      // where('isStaffAdvisor', '==', true) // Implicit in collection existence
    );

    const yearSnap = await getDocs(yearQuery);
    console.log(`[TodoList] Found ${yearSnap.size} total Staff Advisors. Filtering for Year: ${joiningYear} and Dept: ${dept}`);

    const normalizeDept = (d) => {
      if (!d) return '';
      const s = d.toString().toUpperCase().trim();
      const map = {
        'IT': 'INFORMATION TECHNOLOGY',
        'CSE': 'COMPUTER SCIENCE',
        'CS': 'COMPUTER SCIENCE',
        'ECE': 'ELECTRONICS AND COMMUNICATION',
        'EEE': 'ELECTRICAL AND ELECTRONICS',
        'MECH': 'MECHANICAL ENGINEERING',
        'CIVIL': 'CIVIL ENGINEERING',
        'AIDS': 'ARTIFICIAL INTELLIGENCE'
      };
      return map[s] || s; // Return mapped value or original (uppercase)
    };

    const targetDeptNorm = normalizeDept(dept);

    const matchingAdvisors = yearSnap.docs.filter(doc => {
      const fData = doc.data();
      const fYear = fData.joiningYear; // Updated field name
      const fDept = fData.departmentName || fData.departmentId || fData.department || fData.dept; // Updated field priority

      const yearMatch = fYear && fYear.toString() === joiningYear.toString();

      const fDeptNorm = normalizeDept(fDept);

      // Check exact normalize match OR if one includes the other (fuzzy)
      const deptMatch = fDeptNorm === targetDeptNorm || fDeptNorm.includes(targetDeptNorm) || targetDeptNorm.includes(fDeptNorm);

      if (yearMatch) {
        console.log(`[TodoList] Potential Advisor: ${fData.name}, Dept: ${fDept} (Norm: ${fDeptNorm}), Target: ${dept} (Norm: ${targetDeptNorm}), Match: ${deptMatch}`);
      }

      return yearMatch && deptMatch;
    });

    if (matchingAdvisors.length > 0) {
      const advisorDoc = matchingAdvisors[0];
      const advisorData = advisorDoc.data();

      // Need to fetch Faculty Name separately if not stored in staffAdvisors (assuming it might be stored)
      // Check if name is in advisorData. If not, fetch from 'faculty' collection.
      let advisorName = advisorData.name;
      if (!advisorName) {
        // This is synchronous filter, so async fetch here is tricky. 
        // But we proceed. We will fetch name in setup if needed, or better, user 'faculty' query combined?
        // Actually, let's assume we can fetch it. For now, we set ID.
      }

      console.log('[TodoList] Found advisor ID:', advisorDoc.id);
      setFacultyId(advisorDoc.id);

      // Since name might not be in staffAdvisors, we might need to fetch profile.
      // But for now, let's assume previous structure or fetch it.
      // TODO: Fetch faculty name if missing.

      setAdvisorName(advisorData.name || 'Staff Advisor'); // Fallback
      setAdvisorDept(advisorData.departmentName || advisorData.departmentId || 'Unknown Dept');
      setAdvisorJoiningYear(advisorData.joiningYear);
      setupRealtimeSubscriptions(advisorDoc.id, advisorData.joiningYear);

      // Async fetch name if missing
      if (!advisorData.name) {
        getDoc(doc(db, 'faculty', advisorDoc.id)).then(snap => {
          if (snap.exists()) setAdvisorName(snap.data().name);
        });
      }

      return;
    }

    // Fallback Removed: strict matching only.
    console.warn('[TodoList] match failed. No advisor set.');

    console.warn('[TodoList] No matching Staff Advisor found for this batch.');
    setNoAdvisor(true);
    setLoading(false);
  };

  const setupRealtimeSubscriptions = (fId, year) => {
    console.log('[TodoList] Subscribing to tasks for Advisor:', fId, 'Year:', year);

    // Get department from userData to construct hierarchical path
    const dept = userData?.department || userData?.departmentCode || userData?.departmentId || 'UNKNOWN';
    const deptDoc = `department_${dept}`;
    const yearSubcol = `year_${year}`;

    console.log('[TodoList] Subscribing to todos:', deptDoc, '/', yearSubcol);

    // Query hierarchical structure
    const tasksRef = collection(db, 'todos', deptDoc, yearSubcol);

    const unsubscribe = onSnapshot(tasksRef, (snap) => {
      console.log(`[TodoList] Snapshot received. Found ${snap.size} tasks.`);

      const tasksList = snap.docs
        .map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            ...data,
            completed: data.status === 'completed',
            deptDoc: deptDoc,  // Store for later operations
            yearSubcol: yearSubcol
          };
        });

      console.log(`[TodoList] ${tasksList.length} tasks loaded.`);
      setTasks(tasksList);
      setLoading(false);
    }, (error) => {
      console.error("[TodoList] Task subscription error:", error);
      setLoading(false);
    });

    return unsubscribe;
  };

  const handleAddTask = async () => {
    if (!newTaskTitle.trim()) {
      Alert.alert('Error', 'Please enter task title');
      return;
    }

    try {
      const dept = userData?.department || userData?.departmentCode || userData?.departmentId || 'UNKNOWN';
      const deptDoc = `department_${dept}`;
      const yearSubcol = `year_${advisorJoiningYear}`;

      await addDoc(collection(db, 'todos', deptDoc, yearSubcol), {
        title: newTaskTitle.trim(),
        description: '',
        status: 'pending',
        createdBy: auth.currentUser?.uid,
        completedBy: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      setNewTaskTitle('');
      setShowAddModal(false);
    } catch (error) {
      console.error('Error adding task:', error);
      Alert.alert('Error', 'Failed to add task');
    }
  };

  const handleEditTask = (task) => {
    setEditingTask(task);
    setEditTaskTitle(task.title);
    setShowEditModal(true);
  };

  const handleUpdateTask = async () => {
    if (!editTaskTitle.trim()) {
      Alert.alert('Error', 'Please enter task title');
      return;
    }

    try {
      const taskRef = doc(db, 'todos', editingTask.deptDoc, editingTask.yearSubcol, editingTask.id);
      await updateDoc(taskRef, {
        title: editTaskTitle.trim(),
        updatedAt: serverTimestamp()
      });

      setShowEditModal(false);
      setEditingTask(null);
      Alert.alert('Success', 'Task updated successfully');
    } catch (error) {
      console.error('Error updating task:', error);
      Alert.alert('Error', 'Failed to update task');
    }
  };

  const handleToggleTask = async (task) => {
    // Permission check: Reps cannot untick tasks completed by faculty
    if (userRole === 'rep' && task.completed && task.completedBy === 'faculty') {
      Alert.alert(
        'Permission Denied',
        'This task was marked as completed by your Staff Advisor and cannot be changed.'
      );
      return;
    }

    try {
      const taskRef = doc(db, 'todos', task.deptDoc, task.yearSubcol, task.id);
      const newStatus = task.completed ? 'pending' : 'completed';
      console.log(`[TodoList] Toggling task: ${task.id} to ${newStatus}`);
      await updateDoc(taskRef, {
        status: newStatus,
        completedBy: newStatus === 'completed' ? userRole : null,
        completedAt: newStatus === 'completed' ? serverTimestamp() : null,
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      console.error('Error updating task status:', error);
    }
  };

  const handleDeleteTask = (id) => {
    if (userRole !== 'faculty') {
      Alert.alert('Permission Denied', 'Only Staff Advisors can delete tasks.');
      return;
    }
    Alert.alert(
      'Delete Task',
      'Are you sure you want to delete this task?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          onPress: async () => {
            try {
              await deleteDoc(doc(db, 'todos', editingTask.deptDoc, editingTask.yearSubcol, id));
            } catch (error) {
              console.error('Error deleting task:', error);
              Alert.alert('Error', 'Failed to delete task');
            }
          },
          style: 'destructive',
        },
      ]
    );
  };

  const getFilteredAndSortedTasks = () => {
    let filtered = tasks;

    // Apply filter
    if (filterStatus === 'pending') {
      filtered = filtered.filter(task => !task.completed);
    } else if (filterStatus === 'completed') {
      filtered = filtered.filter(task => task.completed);
    }

    // Apply sort: newest first by createdAt
    const sorted = [...filtered].sort((a, b) => {
      const dateA = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
      const dateB = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
      return dateB - dateA;
    });

    return sorted;
  };

  const renderTaskItem = ({ item }) => (
    <View
      style={[
        styles.taskItemContainer,
        item.completed && styles.taskItemCompleted,
      ]}
    >
      <TouchableOpacity
        style={styles.taskItem}
        onPress={() => handleToggleTask(item)}
      >
        <View style={styles.taskCheckmark}>
          <Ionicons
            name={item.completed ? 'checkmark-circle' : 'ellipse-outline'}
            size={26}
            color={item.completed ? '#2ecc71' : '#bdc3c7'}
          />
        </View>
        <View style={styles.taskContent}>
          <Text
            style={[
              styles.taskTitle,
              item.completed && styles.taskTitleCompleted,
            ]}
          >
            {item.title}
          </Text>
        </View>
      </TouchableOpacity>

      {userRole === 'faculty' && (
        <View style={styles.taskActions}>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => handleEditTask(item)}
          >
            <Ionicons name="create-outline" size={20} color="#3498db" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => handleDeleteTask(item.id)}
          >
            <Ionicons name="trash" size={20} color="#e74c3c" />
          </TouchableOpacity>
        </View>
      )}
    </View>
  );

  const displayTasks = getFilteredAndSortedTasks();
  const pendingCount = tasks.filter(t => !t.completed).length;
  const completedCount = tasks.filter(t => t.completed).length;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.todoHeader}>
        <View style={styles.todoHeaderTop}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="chevron-back" size={24} color="#fff" />
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={styles.todoHeaderIcons}>
              <Ionicons name="people" size={20} color="#fff" />
              <Text style={styles.todoCountText}>{tasks.length}</Text>
            </View>
            {userRole === 'faculty' && (
              <TouchableOpacity
                onPress={() => setShowAddModal(true)}
                style={{ marginLeft: 15 }}
              >
                <Ionicons name="add-circle" size={32} color="#fff" />
              </TouchableOpacity>
            )}
          </View>
        </View>
        <Text style={styles.todoHeaderText}>Todo</Text>
        {userRole === 'rep' && advisorName && (
          <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 4 }}>
            Advisor: {advisorName} ({advisorJoiningYear})
          </Text>
        )}
      </View>

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#f39c12" />
        </View>
      ) : (
        <>
          <View style={styles.todoListContainer}>
            <View style={styles.statsRowRefined}>
              <Text style={styles.statRefinedText}>{pendingCount} Pending • {completedCount} Done</Text>
            </View>

            {/* Tasks List */}
            <ScrollView contentContainerStyle={styles.scrollContent}>
              {displayTasks.length > 0 ? (
                <FlatList
                  data={displayTasks}
                  renderItem={renderTaskItem}
                  keyExtractor={item => item.id}
                  scrollEnabled={false}
                />
              ) : (
                <View style={styles.emptyState}>
                  <Ionicons name="checkmark-done-circle" size={48} color="#bdc3c7" />
                  <Text style={styles.emptyStateText}>
                    {filterStatus === 'completed'
                      ? 'No completed tasks'
                      : filterStatus === 'pending'
                        ? 'No pending tasks'
                        : userRole === 'rep' && noAdvisor
                          ? 'Your class does not have an assigned Staff Advisor yet.'
                          : userRole === 'faculty' && !advisorJoiningYear
                            ? 'Please enroll as a Staff Advisor in the Portal to manage class tasks.'
                            : 'No tasks yet.'}
                    {hiddenTaskCount > 0 && (
                      <Text style={{ color: '#f39c12', marginTop: 10, fontSize: 12 }}>
                        ({hiddenTaskCount} tasks hidden due to Year mismatch)
                      </Text>
                    )}
                  </Text>
                </View>
              )}
            </ScrollView>
          </View>
        </>
      )}

      {/* Add Task Modal */}
      <Modal
        visible={showAddModal}
        transparent={true}
        animationType="slide"
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Create New Task</Text>
              <TouchableOpacity onPress={() => setShowAddModal(false)}>
                <Ionicons name="close" size={24} color="#2c3e50" />
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.input}
              placeholder="Task Title (e.g., Collect Internals)"
              value={newTaskTitle}
              onChangeText={setNewTaskTitle}
              placeholderTextColor="#bdc3c7"
            />

            <TouchableOpacity
              style={styles.submitButton}
              onPress={handleAddTask}
            >
              <Text style={styles.submitButtonText}>Add Task</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Edit Task Modal */}
      <Modal
        visible={showEditModal}
        transparent={true}
        animationType="slide"
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit Task</Text>
              <TouchableOpacity onPress={() => setShowEditModal(false)}>
                <Ionicons name="close" size={24} color="#2c3e50" />
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.input}
              placeholder="Task Title"
              value={editTaskTitle}
              onChangeText={setEditTaskTitle}
              placeholderTextColor="#bdc3c7"
            />

            <TouchableOpacity
              style={styles.submitButton}
              onPress={handleUpdateTask}
            >
              <Text style={styles.submitButtonText}>Update Task</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView >
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#2a837c',
  },
  todoHeader: {
    backgroundColor: '#2a837c',
    paddingTop: 50,
    paddingBottom: 30,
    paddingHorizontal: 20,
  },
  todoHeaderTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  backText: {
    color: '#fff',
    fontSize: 16,
    marginLeft: 4,
  },
  todoHeaderIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  todoCountText: {
    color: '#fff',
    marginLeft: 6,
    fontWeight: '700',
  },
  todoHeaderText: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#fff',
  },
  todoListContainer: {
    flex: 1,
    backgroundColor: '#2a837c',
    paddingHorizontal: 10,
  },
  statsRowRefined: {
    paddingHorizontal: 10,
    paddingBottom: 15,
  },
  statRefinedText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
    fontWeight: '500',
  },
  taskItemContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 8,
    marginBottom: 1,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  taskItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  taskCheckmark: {
    marginRight: 15,
  },
  taskContent: {
    flex: 1,
  },
  taskTitle: {
    fontSize: 16,
    color: '#2c3e50',
    fontWeight: '500',
  },
  taskTitleCompleted: {
    textDecorationLine: 'line-through',
    color: '#bdc3c7',
  },
  taskItemCompleted: {
    backgroundColor: '#f9fbfb',
  },
  taskActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionButton: {
    padding: 8,
    marginLeft: 4,
  },
  fabButton: {
    position: 'absolute',
    bottom: 30,
    right: 30,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#f39c12',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingVertical: 20,
    paddingHorizontal: 16,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#2c3e50',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ecf0f1',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    fontSize: 14,
    color: '#2c3e50',
  },
  submitButton: {
    backgroundColor: '#2a837c',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 12,
  },
  submitButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ffffff',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 100,
  },
  emptyStateText: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.6)',
    marginTop: 12,
    textAlign: 'center',
  },
  centerContainer: {
    flex: 1,
    backgroundColor: '#2a837c',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    paddingBottom: 100,
  },
});

export default TodoListScreen;
