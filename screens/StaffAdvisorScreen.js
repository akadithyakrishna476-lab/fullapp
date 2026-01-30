import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import {
  addDoc,
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where
} from 'firebase/firestore';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
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

const StaffAdvisorScreen = () => {
  const navigation = useNavigation();
  const router = useRouter();
  const { role: paramRole } = useLocalSearchParams();

  // State
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState(paramRole || 'faculty');
  const [userData, setUserData] = useState(null);
  const [facultyId, setFacultyId] = useState(null);
  const [isStaffAdvisor, setIsStaffAdvisor] = useState(false);
  const [advisorJoiningYear, setAdvisorJoiningYear] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');

  // Enrollment State
  const [showPrompt, setShowPrompt] = useState(false);
  const [showNoAdvisorMsg, setShowNoAdvisorMsg] = useState(false);
  const [showYearInput, setShowYearInput] = useState(false);
  const [joiningYear, setJoiningYear] = useState('');

  // Linked Rep Data
  // Linked Reps Data (Auto-Connection)
  const [connectedReps, setConnectedReps] = useState([]);
  const [connectionStatus, setConnectionStatus] = useState('connecting'); // 'connecting' | 'connected' | 'awaiting'
  const [showConnectModal, setShowConnectModal] = useState(false); // Kept for legacy prop compatibility if needed, but unused in logic

  // Tasks State
  const [tasks, setTasks] = useState([]);
  const [showAddTaskModal, setShowAddTaskModal] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDescription, setNewTaskDescription] = useState('');

  // Edit Task State
  const [editingTask, setEditingTask] = useState(null);
  const [showEditTaskModal, setShowEditTaskModal] = useState(false);
  const [editTaskTitle, setEditTaskTitle] = useState('');
  const [editTaskDescription, setEditTaskDescription] = useState('');

  // Chat State
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const flatListRef = useRef(null);



  useEffect(() => {
    loadUserStatus();
  }, []);

  const loadUserStatus = async () => {
    try {
      const user = auth.currentUser;
      if (!user) {
        setLoading(false);
        return;
      }

      // Check if faculty
      const facultyRef = doc(db, 'faculty', user.uid);
      const facultySnap = await getDoc(facultyRef);

      if (facultySnap.exists()) {
        const data = facultySnap.data();
        setUserData(data);
        setUserRole('faculty');
        setFacultyId(user.uid);
        if (data.isStaffAdvisor) {
          // LEGACY CHECK: If faculty doc has isStaffAdvisor=true, we might need to migrate or just use it.
          // For now, we prioritize the new 'staffAdvisors' collection check below.
        }

        // CHECK FACULTY COLLECTION for advisor status (Single Source of Truth)
        if (data.isStaffAdvisor) {
          console.log('[StaffAdvisor] Found Advisor Status in Faculty Doc:', data);

          setIsStaffAdvisor(true);
          const joiningYear = data.advisorJoiningYear || data.joiningYear;
          setAdvisorJoiningYear(joiningYear);

          // Auto-connect logic
          const deptCode = data.departmentId || data.department || data.departmentCode || data.dept;
          autoConnectReps(joiningYear, deptCode);
        } else {
          // If not marked in faculty doc, prompt to enroll
          console.log('[StaffAdvisor] Not marked as Staff Advisor.');
          setShowPrompt(true);
        }
      } else {
        // Check if Rep (in users collection)
        const userRef = doc(db, 'users', user.uid);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
          const data = userSnap.data();
          if (!data.isRepresentative) {
            Alert.alert('Access Denied', 'Only Class Representatives can access this portal.');
            navigation.goBack();
            return;
          }
          setUserData(data);
          setUserRole('rep');

          // Rep/Student/Official Rep needs to find their Staff Advisor
          const joiningYear = data.joiningYear;
          const dept = data.department || data.departmentCode || data.departmentId;

          console.log('[StaffAdvisor] Rep looking for advisor:', { joiningYear, dept });

          if (!joiningYear || !dept) {
            console.warn('[StaffAdvisor] Rep profile incomplete:', { joiningYear, dept });
            Alert.alert('Configuration Issue', 'Your profile is missing department or joining year information.');
            navigation.goBack();
            return;
          }

          const advisorQuery = query(
            collection(db, 'faculty'),
            where('isStaffAdvisor', '==', true),
            where('advisorJoiningYear', '==', joiningYear),
            where('department', '==', dept),
            limit(1)
          );

          console.log('[StaffAdvisor] Fetching advisor document...');
          const advisorSnap = await getDocs(advisorQuery);
          if (!advisorSnap.empty) {
            const advisorDoc = advisorSnap.docs[0];
            const advisorData = advisorDoc.data();
            console.log('[StaffAdvisor] Found Advisor:', advisorData.name);
            setFacultyId(advisorDoc.id);
            setIsStaffAdvisor(true);
            setAdvisorJoiningYear(joiningYear);
            setupRealtimeSubscriptions(advisorDoc.id, joiningYear);
            setConnectedRep({ id: user.uid, name: data.name, joiningYear: data.joiningYear });
            setUserData(prev => ({ ...prev, advisorName: advisorData.name }));
          } else {
            console.warn('[StaffAdvisor] No advisor found for:', { joiningYear, dept });
            Alert.alert('No Advisor', 'Your class does not have an assigned Staff Advisor yet.');
            navigation.goBack();
          }
        }
      }
    } catch (error) {
      console.error('Error loading user status:', error);
      Alert.alert('Error', 'Failed to load status');
    } finally {
      setLoading(false);
    }
  };

  const autoConnectReps = async (year, department) => {
    if (!year || !department) return;

    try {
      setConnectionStatus('connecting');
      const targetYear = parseInt(year) || year;
      const targetDept = department?.toString().toUpperCase();
      console.log(`[StaffAdvisor] Auto-connecting reps for Year: ${targetYear}, Dept: ${targetDept}`);

      let foundRepsList = [];
      const usersRef = collection(db, 'users');
      const years = ['year_1', 'year_2', 'year_3', 'year_4'];
      const deptId = targetDept === 'INFORMATION TECHNOLOGY' ? 'IT' : targetDept;

      for (const y of years) {
        const crRef = collection(db, 'classrepresentative', y, `department_${deptId}`);
        const crSnap = await getDocs(crRef);

        for (const doc of crSnap.docs) {
          const crData = doc.data();
          if (crData.active === false) continue;

          let isMatch = false;
          let repData = null;
          const email = crData.email?.toLowerCase().trim();

          if (email) {
            const emailQ = query(usersRef, where('email', '==', email));
            const userSnap = await getDocs(emailQ);

            if (!userSnap.empty) {
              const userData = userSnap.docs[0].data();
              const rawUserYear = userData.joiningYear;
              const rawCrYear = crData.joiningYear;
              const userJoiningYear = parseInt(rawUserYear) || rawUserYear || parseInt(rawCrYear) || rawCrYear;

              if (userJoiningYear == targetYear) {
                isMatch = true;
                repData = { id: userSnap.docs[0].id, ...userData };

                // PERSIST LINK: Update User Document
                const userDocRef = doc(db, 'users', userSnap.docs[0].id);
                updateDoc(userDocRef, {
                  linkedStaffAdvisorId: auth.currentUser?.uid,
                  linkedStaffAdvisorName: userData?.name || 'Staff Advisor',
                  advisorJoiningYear: targetYear.toString(),
                  advisorDepartment: targetDept
                }).catch(e => console.error('Error linking advisor to user doc:', e));
              }
            } else {
              const crJoiningYear = parseInt(crData.joiningYear) || crData.joiningYear || targetYear;
              if (crJoiningYear == targetYear) {
                isMatch = true;
                repData = {
                  id: doc.id,
                  ...crData,
                  joiningYear: targetYear,
                  department: targetDept
                };
              }
            }
          }

          if (isMatch && repData) {
            if (!foundRepsList.some(r => r.email === repData.email)) {
              foundRepsList.push(repData);
            }
          }
        }
      }

      // --- STAGE 2: Direct Student Profile Check (User Request) ---
      console.log(`[StaffAdvisor] 🔍 Discovery Stage 2: Checking 'students' collection for Year ${targetYear}`);

      const studentsQuery = query(
        collectionGroup(db, 'students'),
        where('isRepresentative', '==', true),
        where('joiningYear', '==', targetYear)
      );

      const studentsSnap = await getDocs(studentsQuery);
      console.log(`[StaffAdvisor] Found ${studentsSnap.size} student reps for year ${targetYear}`);

      studentsSnap.forEach(doc => {
        const data = doc.data();
        const repDept = (data.departmentName || data.department || data.dept)?.toString().toUpperCase();

        console.log(`[StaffAdvisor] Checking Student Rep: ${data.name}, Dept: ${repDept}`);

        if (repDept && (repDept === targetDept || repDept.includes(targetDept) || targetDept.includes(repDept))) {
          const repData = { id: doc.id, ...data };

          if (!foundRepsList.some(r => r.email === repData.email)) {
            console.log(`[StaffAdvisor] ✅ Linked Rep from Students: ${repData.name}`);
            foundRepsList.push(repData);

            // PERSIST LINK: Update Student Document
            const studentRef = doc(db, 'students', doc.id);
            updateDoc(studentRef, {
              linkedStaffAdvisorId: auth.currentUser?.uid,
              linkedStaffAdvisorName: userData?.name || 'Staff Advisor',
              advisorJoiningYear: targetYear.toString(),
              advisorDepartment: targetDept
            }).catch(e => console.error('Error linking advisor to student doc:', e));
          }
        }
      });

      setConnectedReps(foundRepsList);

      if (foundRepsList.length > 0) {
        setConnectionStatus('connected');
        const user = auth.currentUser;
        // Pass department to ensure correct path
        setupRealtimeSubscriptions(user.uid, targetYear, targetDept);
      } else {
        setConnectionStatus('awaiting');
      }

    } catch (error) {
      console.error('[StaffAdvisor] Error in auto-connection:', error);
      setConnectionStatus('awaiting');
    }
  };


  const setupRealtimeSubscriptions = (fId, year, deptParam) => {
    if (!fId || !year) {
      console.warn('Cannot setup subscriptions: missing facultyId or year', { fId, year });
      return () => { };
    }

    const targetYear = year.toString();

    // Use passed department or fallback to userData - prioritize departmentId
    const deptCode = deptParam || userData?.departmentId || userData?.department || userData?.departmentCode || 'UNKNOWN';
    const deptDoc = `department_${deptCode}`;
    const yearSubcol = `year_${targetYear}`;

    console.log('[StaffAdvisor] Subscribing to todos:', deptDoc, '/', yearSubcol);

    // Subscribe to Tasks using new hierarchical structure
    const tasksRef = collection(db, 'todos', deptDoc, yearSubcol);

    const unsubTasks = onSnapshot(tasksRef, (snap) => {
      const tasksList = snap.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        deptDoc: deptDoc,
        yearSubcol: yearSubcol
      }));
      // Sort desc by createdAt
      tasksList.sort((a, b) => {
        const tA = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
        const tB = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
        return tB - tA;
      });
      setTasks(tasksList);
    }, (error) => {
      console.error('[StaffAdvisor] Tasks subscription error:', error);
    });

    // Subscribe to Chat (Client-side sorting to avoid index)
    const chatQuery = query(
      collection(db, 'staffAdvisorChats'),
      where('facultyId', '==', fId),
      where('advisorJoiningYear', '==', targetYear)
    );

    const unsubChat = onSnapshot(chatQuery, (snap) => {
      const chatList = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      // Sort asc by timestamp
      chatList.sort((a, b) => {
        const tA = a.timestamp?.toMillis ? a.timestamp.toMillis() : 0;
        const tB = b.timestamp?.toMillis ? b.timestamp.toMillis() : 0;
        return tA - tB;
      });
      setMessages(chatList);
    });

    return () => {
      unsubTasks();
      unsubChat();
    };
  };

  const handleEnrollConfirm = async () => {
    if (!joiningYear || joiningYear.length !== 4 || isNaN(joiningYear)) {
      Alert.alert('Error', 'Please enter a valid 4-digit joining year');
      return;
    }

    try {
      setLoading(true);
      const user = auth.currentUser;
      const facultyRef = doc(db, 'faculty', user.uid);

      const deptCode = userData?.departmentId || userData?.department || userData?.departmentCode || userData?.departmentName || 'UNKNOWN';
      const deptName = userData?.departmentName || deptCode;

      // Update FACULTY document directly
      const updateData = {
        isStaffAdvisor: true,
        advisorJoiningYear: joiningYear.toString(), // Standardize field name
        departmentId: deptCode,
        departmentName: deptName,
        updatedAt: serverTimestamp()
      };

      await updateDoc(facultyRef, updateData);

      setIsStaffAdvisor(true);
      setAdvisorJoiningYear(joiningYear);
      setShowYearInput(false);
      setFacultyId(user.uid);

      autoConnectReps(joiningYear, deptCode);
      setupRealtimeSubscriptions(user.uid, joiningYear, deptCode);

      Alert.alert('Success', `You are now connected as Staff Advisor for the ${joiningYear} batch.`);
    } catch (error) {
      console.error('Enrollment error:', error);
      Alert.alert('Error', 'Failed to confirm enrollment');
    } finally {
      setLoading(false);
    }
  };

  const handleAddTask = async () => {
    if (!newTaskTitle.trim()) {
      Alert.alert('Error', 'Task title is required');
      return;
    }

    try {
      const deptCode = userData?.departmentId || userData?.department || userData?.departmentCode || 'UNKNOWN';
      const deptDoc = `department_${deptCode}`;
      const yearSubcol = `year_${advisorJoiningYear}`;

      await addDoc(collection(db, 'todos', deptDoc, yearSubcol), {
        title: newTaskTitle.trim(),
        // Description field removed per request
        status: 'pending',
        createdBy: auth.currentUser?.uid,
        completedBy: null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      setNewTaskTitle('');
      setNewTaskDescription('');
      setShowAddTaskModal(false);
    } catch (error) {
      console.error('Error adding task:', error);
      Alert.alert('Error', 'Failed to add task');
    }
  };

  const handleEditTask = (task) => {
    setEditingTask(task);
    setEditTaskTitle(task.title);
    setShowEditTaskModal(true);
  };

  const handleUpdateTask = async () => {
    if (!editTaskTitle.trim()) {
      Alert.alert('Error', 'Task title is required');
      return;
    }

    try {
      const deptCode = userData?.departmentId || userData?.department || userData?.departmentCode || 'UNKNOWN';
      const deptDoc = `department_${deptCode}`;
      const yearSubcol = `year_${advisorJoiningYear}`;

      const taskRef = doc(db, 'todos', deptDoc, yearSubcol, editingTask.id);
      await updateDoc(taskRef, {
        title: editTaskTitle.trim(),
        // Description field removed
        updatedAt: serverTimestamp()
      });

      setShowEditTaskModal(false);
      setEditingTask(null);
      Alert.alert('Success', 'Task updated successfully');
    } catch (error) {
      console.error('Error updating task:', error);
      Alert.alert('Error', 'Failed to update task');
    }
  };

  const handleDeleteTask = (taskId) => {
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
              const deptCode = userData?.departmentId || userData?.department || userData?.departmentCode || 'UNKNOWN';
              const deptDoc = `department_${deptCode}`;
              const yearSubcol = `year_${advisorJoiningYear}`;

              await deleteDoc(doc(db, 'todos', deptDoc, yearSubcol, taskId));
            } catch (error) {
              console.error('Error deleting task:', error);
              Alert.alert('Error', 'Failed to delete task');
            }
          },
          style: 'destructive'
        }
      ]
    );
  };

  const handleToggleTaskStatus = async (task) => {
    try {
      const deptCode = userData?.departmentId || userData?.department || userData?.departmentCode || 'UNKNOWN';
      const deptDoc = task.deptDoc || `department_${deptCode}`;
      const yearSubcol = task.yearSubcol || `year_${advisorJoiningYear}`;

      const taskRef = doc(db, 'todos', deptDoc, yearSubcol, task.id);
      const newStatus = task.status === 'completed' ? 'pending' : 'completed';
      await updateDoc(taskRef, {
        status: newStatus,
        completedBy: newStatus === 'completed' ? 'faculty' : null,
        completedAt: newStatus === 'completed' ? serverTimestamp() : null,
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      console.error('Error updating task status:', error);
    }
  };

  const handleSendMessage = async () => {
    if (!inputMessage.trim()) return;

    try {
      await addDoc(collection(db, 'staffAdvisorChats'), {
        facultyId: facultyId,
        advisorJoiningYear: advisorJoiningYear,
        sender: userRole,
        senderName: userData.name,
        message: inputMessage.trim(),
        timestamp: serverTimestamp()
      });
      setInputMessage('');
    } catch (error) {
      console.error('Error sending message:', error);
    }
  };

  const renderOverviewTab = () => (
    <View style={styles.tabContent}>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Advisor Information</Text>
        <View style={styles.infoRow}>
          <Text style={styles.label}>Assigned Joining Year:</Text>
          <Text style={styles.value}>{advisorJoiningYear}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.label}>Department:</Text>
          <Text style={styles.value}>{(userData?.department || userData?.departmentName || 'N/A').toUpperCase()}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.label}>{userRole === 'faculty' ? 'Connected Rep:' : 'Staff Advisor:'}</Text>
          <View style={{ flex: 1, alignItems: 'flex-end' }}>
            {userRole === 'faculty' ? (
              connectedReps.length > 0 ? (
                <View>
                  {connectedReps.map((rep, idx) => (
                    <Text key={idx} style={[styles.value, { textAlign: 'right', marginTop: idx > 0 ? 4 : 0 }]}>
                      {rep.name} ({rep.joiningYear} Batch)
                    </Text>
                  ))}
                </View>
              ) : (
                <Text style={[styles.value, { color: connectionStatus === 'connecting' ? '#f39c12' : '#e74c3c' }]}>
                  {connectionStatus === 'connecting' ? 'Searching...' : 'No Reps Linked'}
                </Text>
              )
            ) : (
              <Text style={styles.value}>{userData?.advisorName || 'Staff Advisor'}</Text>
            )}
          </View>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Quick Stats</Text>
        <View style={styles.statGrid}>
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>{tasks.length}</Text>
            <Text style={styles.statLabel}>Total Tasks</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={[styles.statNumber, styles.statGood]}>
              {tasks.filter(t => t.status === 'completed').length}
            </Text>
            <Text style={styles.statLabel}>Completed</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={[styles.statNumber, styles.statWarning]}>
              {tasks.filter(t => t.status === 'pending').length}
            </Text>
            <Text style={styles.statLabel}>Pending</Text>
          </View>
        </View>
      </View>
    </View>
  );

  const renderTasksTab = () => (
    <View style={{ flex: 1 }}>
      <View style={styles.todoHeader}>
        <View style={styles.todoHeaderTop}>
          <TouchableOpacity onPress={() => setActiveTab('overview')} style={styles.backButton}>
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
                onPress={() => setShowAddTaskModal(true)}
                style={{ marginLeft: 15 }}
              >
                <Ionicons name="add-circle" size={32} color="#fff" />
              </TouchableOpacity>
            )}
          </View>
        </View>
        <Text style={styles.todoHeaderText}>To-Do Tasks</Text>
      </View>

      <View style={styles.todoListContainer}>
        <FlatList
          data={tasks}
          keyExtractor={item => item.id}
          scrollEnabled={false}
          renderItem={({ item }) => (
            <View style={[styles.taskItemContainer, item.status === 'completed' && styles.taskItemCompleted]}>
              <TouchableOpacity
                style={styles.taskItem}
                onPress={() => handleToggleTaskStatus(item)}
              >
                <View style={styles.taskCheckmark}>
                  <Ionicons
                    name={item.status === 'completed' ? 'checkmark-circle' : 'ellipse-outline'}
                    size={26}
                    color={item.status === 'completed' ? '#2ecc71' : '#bdc3c7'}
                  />
                </View>
                <View style={styles.taskInfo}>
                  <Text style={[styles.taskTitle, item.status === 'completed' && styles.taskTitleCompleted]}>
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
                    <Ionicons name="create-outline" size={18} color="#3498db" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.actionButton}
                    onPress={() => handleDeleteTask(item.id)}
                  >
                    <Ionicons name="trash-outline" size={18} color="#e74c3c" />
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}
        />
      </View>
    </View>
  );


  const renderCommunicationTab = () => (
    <View style={[styles.tabContent, { height: 400 }]}>
      <FlatList
        ref={flatListRef}
        data={messages}
        renderItem={({ item }) => (
          <View style={[
            styles.messageContainer,
            item.sender === userRole ? styles.messageRight : styles.messageLeft
          ]}>
            <View style={[
              styles.messageBubble,
              item.sender === userRole ? styles.bubbleRight : styles.bubbleLeft
            ]}>
              <Text style={[styles.senderName, item.sender === userRole && { color: '#eee' }]}>
                {item.sender === userRole ? 'You' : item.senderName}
              </Text>
              <Text style={[styles.messageText, item.sender === userRole && { color: '#fff' }]}>
                {item.message}
              </Text>
            </View>
          </View>
        )}
        keyExtractor={item => item.id}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd()}
      />
      <View style={styles.inputBar}>
        <TextInput
          style={styles.chatInput}
          placeholder="Type a message..."
          value={inputMessage}
          onChangeText={setInputMessage}
        />
        <TouchableOpacity style={styles.sendButtonChat} onPress={handleSendMessage}>
          <Ionicons name="send" size={20} color="#ffffff" />
        </TouchableOpacity>
      </View>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#9b59b6" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={24} color="#2c3e50" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Staff Advisor Portal</Text>
        <View style={{ width: 24 }} />
      </View>

      {isStaffAdvisor && (
        <>
          <View style={styles.tabBar}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12 }}>
              {[
                { id: 'overview', label: 'Overview', icon: 'home', enabled: true },
                { id: 'tasks', label: 'To-Do Management', icon: 'list', enabled: true },
                { id: 'chat', label: 'Communication', icon: 'chatbubbles', enabled: true }
              ].map(tab => (
                <TouchableOpacity
                  key={tab.id}
                  style={[
                    styles.tab,
                    activeTab === tab.id && styles.tabActive,
                    !tab.enabled && { opacity: 0.4 }
                  ]}
                  onPress={() => {
                    if (tab.enabled) {
                      setActiveTab(tab.id);
                    } else {
                      Alert.alert('Not Connected', 'Please connect with the Class Representative to enable this feature.');
                    }
                  }}
                >
                  <Ionicons
                    name={tab.icon}
                    size={16}
                    color={activeTab === tab.id ? '#9b59b6' : '#7f8c8d'}
                  />
                  <Text style={[styles.tabLabel, activeTab === tab.id && styles.tabLabelActive]}>
                    {tab.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          <ScrollView contentContainerStyle={styles.scrollContent}>
            {activeTab === 'overview' && renderOverviewTab()}
            {activeTab === 'tasks' && renderTasksTab()}
            {activeTab === 'chat' && renderCommunicationTab()}
          </ScrollView>
        </>
      )}

      {/* Enrollment Prompt 1 */}
      <Modal visible={showPrompt} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.enrollModal}>
            <Text style={styles.modalTitle}>Staff Advisor Portal</Text>
            <Text style={styles.modalMessage}>Are you a Staff Advisor?</Text>
            <View style={styles.enrollButtons}>
              <TouchableOpacity
                style={[styles.enrollBtn, styles.btnYes]}
                onPress={() => {
                  setShowPrompt(false);
                  setShowYearInput(true);
                }}
              >
                <Text style={styles.btnTextWhite}>Yes</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.enrollBtn, styles.btnNo]}
                onPress={() => {
                  setShowPrompt(false);
                  setShowNoAdvisorMsg(true);
                }}
              >
                <Text style={styles.btnTextDark}>No</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* No Advisor Message */}
      <Modal visible={showNoAdvisorMsg} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.enrollModal}>
            <Text style={styles.modalMessage}>
              This section is accessible only to Staff Advisors.{"\n"}
              You may return if you are assigned later.
            </Text>
            <TouchableOpacity
              style={styles.confirmBtn}
              onPress={() => {
                setShowNoAdvisorMsg(false);
                navigation.goBack();
              }}
            >
              <Text style={styles.confirmText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Year Input Modal */}
      <Modal visible={showYearInput} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.enrollModal}>
            <Text style={styles.modalTitle}>Advisor Batch Details</Text>
            <Text style={styles.modalMessage}>
              Enter the joining year of the batch you are advising.
            </Text>

            <TextInput
              style={styles.input}
              placeholder="e.g., 2022"
              value={joiningYear}
              onChangeText={(text) => setJoiningYear(text.replace(/[^0-9]/g, '').slice(0, 4))}
              keyboardType="numeric"
              maxLength={4}
            />

            <TouchableOpacity
              style={styles.confirmBtn}
              onPress={handleEnrollConfirm}
            >
              <Text style={styles.confirmText}>Confirm & Continue</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={{ marginTop: 15, alignItems: 'center' }}
              onPress={() => {
                setShowYearInput(false);
                setShowPrompt(true);
              }}
            >
              <Text style={{ color: '#7f8c8d' }}>Back</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>


      {/* Add Task Modal */}
      <Modal visible={showAddTaskModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.taskModal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Task for Class</Text>
              <TouchableOpacity onPress={() => setShowAddTaskModal(false)}>
                <Ionicons name="close" size={24} color="#2c3e50" />
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.input}
              placeholder="Task Title (e.g., Collect Internals)"
              value={newTaskTitle}
              onChangeText={setNewTaskTitle}
            />



            <TouchableOpacity style={styles.submitBtn} onPress={handleAddTask}>
              <Text style={styles.submitBtnText}>Create Task</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Edit Task Modal */}
      <Modal visible={showEditTaskModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.taskModal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit Task</Text>
              <TouchableOpacity onPress={() => setShowEditTaskModal(false)}>
                <Ionicons name="close" size={24} color="#2c3e50" />
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.input}
              placeholder="Task Title"
              value={editTaskTitle}
              onChangeText={setEditTaskTitle}
            />



            <TouchableOpacity style={styles.submitBtn} onPress={handleUpdateTask}>
              <Text style={styles.submitBtnText}>Update Task</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};


const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f6fa',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2c3e50',
  },
  tabBar: {
    backgroundColor: '#fff',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
    backgroundColor: '#f1f2f6',
  },
  tabActive: {
    backgroundColor: '#e8f0fe',
  },
  tabLabel: {
    marginLeft: 6,
    color: '#7f8c8d',
    fontWeight: '600',
  },
  tabLabelActive: {
    color: '#9b59b6',
  },
  scrollContent: {
    paddingBottom: 20,
  },
  tabContent: {
    padding: 16,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#2c3e50',
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  label: {
    color: '#7f8c8d',
    fontSize: 14,
  },
  value: {
    color: '#2c3e50',
    fontSize: 14,
    fontWeight: '600',
  },
  statGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statNumber: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#2c3e50',
  },
  statLabel: {
    fontSize: 12,
    color: '#7f8c8d',
  },
  statGood: {
    color: '#2ecc71',
  },
  statWarning: {
    color: '#f39c12',
  },
  todoHeader: {
    backgroundColor: '#9b59b6',
    padding: 20,
    paddingTop: 40,
  },
  todoHeaderTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  backText: {
    color: '#fff',
    marginLeft: 4,
  },
  todoHeaderIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  todoCountText: {
    color: '#fff',
    marginLeft: 6,
    fontWeight: 'bold',
  },
  todoHeaderText: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
    marginTop: 10,
  },
  todoListContainer: {
    padding: 16,
  },
  taskItemContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  taskItemCompleted: {
    opacity: 0.6,
  },
  taskItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  taskCheckmark: {
    marginRight: 12,
  },
  taskInfo: {
    flex: 1,
  },
  taskTitle: {
    color: '#2c3e50',
    fontSize: 16,
  },
  taskTitleCompleted: {
    textDecorationLine: 'line-through',
    color: '#95a5a6',
  },
  taskActions: {
    flexDirection: 'row',
  },
  actionButton: {
    padding: 8,
  },
  messageContainer: {
    marginBottom: 10,
    flexDirection: 'row',
  },
  messageRight: {
    justifyContent: 'flex-end',
  },
  messageLeft: {
    justifyContent: 'flex-start',
  },
  messageBubble: {
    maxWidth: '80%',
    padding: 12,
    borderRadius: 16,
  },
  bubbleRight: {
    backgroundColor: '#9b59b6',
    borderBottomRightRadius: 4,
  },
  bubbleLeft: {
    backgroundColor: '#fff',
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: '#eee',
  },
  senderName: {
    fontSize: 10,
    color: '#7f8c8d',
    marginBottom: 2,
  },
  messageText: {
    color: '#2c3e50',
  },
  inputBar: {
    flexDirection: 'row',
    padding: 10,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#eee',
    alignItems: 'center',
  },
  chatInput: {
    flex: 1,
    backgroundColor: '#f1f2f6',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginRight: 10,
    color: '#2c3e50',
  },
  sendButtonChat: {
    backgroundColor: '#9b59b6',
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  enrollModal: {
    width: '85%',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#2c3e50',
    marginBottom: 10,
  },
  modalMessage: {
    color: '#7f8c8d',
    textAlign: 'center',
    marginBottom: 20,
  },
  enrollButtons: {
    flexDirection: 'row',
    width: '100%',
    justifyContent: 'space-between',
  },
  enrollBtn: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginHorizontal: 5,
  },
  btnYes: {
    backgroundColor: '#9b59b6',
  },
  btnNo: {
    backgroundColor: '#ecf0f1',
  },
  btnTextWhite: {
    color: '#fff',
    fontWeight: 'bold',
  },
  btnTextDark: {
    color: '#2c3e50',
    fontWeight: 'bold',
  },
  confirmBtn: {
    backgroundColor: '#9b59b6',
    paddingVertical: 12,
    paddingHorizontal: 30,
    borderRadius: 25,
    marginTop: 10,
    width: '100%',
    alignItems: 'center',
  },
  confirmText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  input: {
    width: '100%',
    backgroundColor: '#f9f9f9',
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 8,
    padding: 12,
    marginBottom: 15,
  },
  taskModal: {
    width: '90%',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  submitBtn: {
    backgroundColor: '#9b59b6',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 10,
  },
  submitBtnText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
});

export default StaffAdvisorScreen;
