import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { addDoc, collection, deleteDoc, doc, getDoc, onSnapshot, serverTimestamp, updateDoc, writeBatch } from 'firebase/firestore';
import { useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Animated,
    Dimensions,
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
import { getCurrentAcademicYear, getYearDisplayLabel } from '../utils/academicYearManager';

const { width } = Dimensions.get('window');

const FacultyTaskAssignmentScreen = () => {
    const router = useRouter();
    const [selectedYear, setSelectedYear] = useState(1);
    const [academicYear, setAcademicYear] = useState(2025);
    const [tasks, setTasks] = useState([]);
    const [loading, setLoading] = useState(false);
    const [studentsLoading, setStudentsLoading] = useState(false);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [taskTitle, setTaskTitle] = useState('');
    const [taskDescription, setTaskDescription] = useState('');
    const [startDate, setStartDate] = useState('');
    const [dueDate, setDueDate] = useState('');
    const [students, setStudents] = useState([]);
    const [departmentId, setDepartmentId] = useState(null);
    const [collegeId, setCollegeId] = useState(null);
    const [expandedTaskId, setExpandedTaskId] = useState(null);
    const [editingTask, setEditingTask] = useState(null);
    const [userRole, setUserRole] = useState(null);

    const scrollRef = useRef(null);
    const scrollAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        loadFacultyData();
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

    // Real-time student fetching
    useEffect(() => {
        let unsubscribeStudents = () => { };

        const fetchStudents = async () => {
            if (!selectedYear || !departmentId) {
                setStudents([]);
                return;
            }

            setStudentsLoading(true);
            const yearId = `year${selectedYear}`;
            const studentsRef = collection(db, 'students', yearId, 'departments', departmentId, 'students');

            unsubscribeStudents = onSnapshot(studentsRef,
                (snapshot) => {
                    const studentsList = snapshot.docs.map(doc => ({
                        id: doc.id,
                        ...doc.data(),
                        completed: false
                    }));

                    setStudents(studentsList.sort((a, b) => {
                        const rollA = parseInt(a.rollNo || a.rollNumber || 0, 10);
                        const rollB = parseInt(b.rollNo || b.rollNumber || 0, 10);
                        return rollA - rollB;
                    }));

                    setStudentsLoading(false);
                },
                (error) => {
                    console.error('❌ Error loading students:', error);
                    setStudents([]);
                    setStudentsLoading(false);
                }
            );
        };

        fetchStudents();

        return () => {
            unsubscribeStudents();
        };
    }, [selectedYear, departmentId]);

    const loadFacultyData = async () => {
        try {
            const currentUser = auth.currentUser;
            if (!currentUser) return;

            const userRef = doc(db, 'users', currentUser.uid);
            const facultyRef = doc(db, 'faculty', currentUser.uid);
            const [userSnap, facultySnap] = await Promise.all([getDoc(userRef), getDoc(facultyRef)]);

            const userData = userSnap.exists() ? userSnap.data() : {};
            const facultyData = facultySnap.exists() ? facultySnap.data() : {};

            const resolvedCollegeId = userData.collegeId || facultyData.collegeId || null;
            let resolvedDepartmentId = userData.departmentId || userData.departmentCode || facultyData.departmentId || facultyData.departmentCode || null;
            const resolvedDepartmentName = userData.departmentName || facultyData.departmentName || '';

            if (resolvedDepartmentId && resolvedDepartmentId.length > 10) {
                if (resolvedDepartmentName.toLowerCase().includes('information technology')) {
                    resolvedDepartmentId = 'IT';
                } else if (resolvedDepartmentName.toLowerCase().includes('computer science')) {
                    resolvedDepartmentId = 'CSE';
                }
            }

            setCollegeId(resolvedCollegeId);
            setDepartmentId(resolvedDepartmentId);
            setUserRole(userData.role || facultyData.role || 'student');
        } catch (error) {
            console.error('Error loading faculty data:', error);
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

    const handleDeleteTask = (task) => {
        if (userRole !== 'faculty') {
            Alert.alert('Permission Denied', 'Only faculty can delete tasks.');
            return;
        }

        Alert.alert(
            'Delete Task',
            'Are you sure you want to delete this task?',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            setLoading(true);
                            const yearId = `year${selectedYear}`;
                            const taskRef = doc(db, 'colleges', collegeId, 'departments', departmentId, 'years', yearId, 'taskAssignments', task.id);
                            await deleteDoc(taskRef);
                            Alert.alert('Success', 'Task deleted successfully');
                        } catch (error) {
                            console.error('Error deleting task:', error);
                            Alert.alert('Error', 'Failed to delete task');
                        } finally {
                            setLoading(false);
                        }
                    }
                }
            ]
        );
    };

    const handleClearAllTasks = () => {
        if (userRole !== 'faculty') {
            Alert.alert('Permission Denied', 'Only faculty can delete tasks.');
            return;
        }

        if (tasks.length === 0) return;

        Alert.alert(
            'Clear All Tasks',
            `Are you sure you want to delete ALL ${tasks.length} tasks for Year ${selectedYear}? This cannot be undone.`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete All',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            setLoading(true);
                            const yearId = `year${selectedYear}`;
                            const batch = writeBatch(db);

                            tasks.forEach(task => {
                                const taskRef = doc(db, 'colleges', collegeId, 'departments', departmentId, 'years', yearId, 'taskAssignments', task.id);
                                batch.delete(taskRef);
                            });

                            await batch.commit();
                            Alert.alert('Success', `All tasks for Year ${selectedYear} have been deleted.`);
                        } catch (error) {
                            console.error('Error clearing tasks:', error);
                            Alert.alert('Error', 'Failed to clear tasks');
                        } finally {
                            setLoading(false);
                        }
                    }
                }
            ]
        );
    };

    const handleEditTask = (task) => {
        if (userRole !== 'faculty') {
            Alert.alert('Permission Denied', 'Only faculty can edit task details.');
            return;
        }
        setTaskTitle(task.title);
        setTaskDescription(task.description || '');
        setStartDate(task.startDate || '');
        setDueDate(task.dueDate || '');
        setExpandedTaskId(null);
        setEditingTask(task);
        setShowCreateModal(true);
    };

    const handleCreateTask = () => {
        setEditingTask(null);
        setTaskTitle('');
        setTaskDescription('');
        setStartDate('');
        setDueDate('');
        setShowCreateModal(true);
    };

    const formatDatePickerInput = (text) => {
        // Strip non-numeric characters
        const cleaned = text.replace(/[^0-9]/g, '');
        let formatted = cleaned;

        if (cleaned.length > 2) {
            formatted = `${cleaned.slice(0, 2)}/${cleaned.slice(2)}`;
        }
        if (cleaned.length > 4) {
            formatted = `${cleaned.slice(0, 2)}/${cleaned.slice(2, 4)}/${cleaned.slice(4, 8)}`;
        }
        return formatted.slice(0, 10); // Limit to DD/MM/YYYY
    };

    const isValidDateStr = (dateStr) => {
        if (!dateStr) return true; // Empty is handled by calling logic
        if (dateStr.length !== 10) return false;

        const [d, m, y] = dateStr.split('/').map(Number);
        if (isNaN(d) || isNaN(m) || isNaN(y)) return false;
        if (m < 1 || m > 12) return false;
        if (d < 1 || d > 31) return false;
        if (y < 2000 || y > 2100) return false;

        // Check actual date validity (e.g. Feb 30)
        const dt = new Date(y, m - 1, d);
        return dt && dt.getMonth() + 1 === m;
    };

    const compareDates = (start, end) => {
        if (!start || !end) return true;
        const [d1, m1, y1] = start.split('/').map(Number);
        const [d2, m2, y2] = end.split('/').map(Number);
        const date1 = new Date(y1, m1 - 1, d1);
        const date2 = new Date(y2, m2 - 1, d2);
        return date2 >= date1;
    };

    const handleSaveTask = async () => {
        try {
            if (!taskTitle.trim()) {
                Alert.alert('Error', 'Please enter a task title');
                return;
            }

            // Date validation
            if ((startDate && !isValidDateStr(startDate)) || (dueDate && !isValidDateStr(dueDate))) {
                Alert.alert('Error', 'Please enter a valid date in DD/MM/YYYY format');
                return;
            }

            if (startDate && dueDate && !compareDates(startDate, dueDate)) {
                Alert.alert('Error', 'Due Date cannot be before Start Date');
                return;
            }

            if (students.length === 0) {
                Alert.alert('No Students', 'No students found in this department. Cannot create task.');
                return;
            }

            setLoading(true);

            const assignedStudentsList = students.map(student => ({
                studentId: student.id,
                rollNumber: student.rollNumber || student.rollNo,
                name: student.name,
                email: student.email,
                completed: false,
                completionDate: null
            }));

            if (editingTask) {
                assignedStudentsList.forEach(newStudent => {
                    const existing = editingTask.students?.find(s => s.studentId === newStudent.studentId);
                    if (existing) {
                        newStudent.completed = existing.completed;
                        newStudent.completionDate = existing.completionDate || null;
                    }
                });
            }

            const allStudentIds = students.map(s => s.id);

            const taskData = {
                title: taskTitle.trim(),
                description: taskDescription.trim() || '',
                startDate: startDate.trim(),
                dueDate: dueDate.trim(),
                createdBy: auth.currentUser.uid,
                updatedAt: serverTimestamp(),
                year: selectedYear,
                departmentId: departmentId,
                assignedTo: allStudentIds,
                students: assignedStudentsList,
                status: 'active'
            };

            const yearId = `year${selectedYear}`;
            const tasksCollectionRef = collection(db, 'colleges', collegeId, 'departments', departmentId, 'years', yearId, 'taskAssignments');

            if (editingTask) {
                const taskDocRef = doc(tasksCollectionRef, editingTask.id);
                await updateDoc(taskDocRef, taskData);
                Alert.alert('Success', 'Task updated successfully');
            } else {
                taskData.createdAt = serverTimestamp();
                await addDoc(tasksCollectionRef, taskData);
                Alert.alert('Success', `Task assigned successfully to all ${students.length} students`);
            }

            setShowCreateModal(false);
            setTaskTitle('');
            setTaskDescription('');
            setStartDate('');
            setDueDate('');
            setEditingTask(null);
        } catch (error) {
            console.error('Error saving task:', error);
            Alert.alert('Error', 'Failed to save task');
        } finally {
            setLoading(false);
        }
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
            Alert.alert('Error', 'Failed to update status');
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
        if (!dueDateStr) return '#16a085'; // Green for no deadline

        try {
            // Parse DD/MM/YYYY to Date object
            const [d, m, y] = dueDateStr.split('/').map(Number);
            const dueDateObj = new Date(y, m - 1, d, 23, 59, 59);
            const completionDateObj = new Date(student.completionDate);

            if (completionDateObj > dueDateObj) return '#f39c12'; // Orange for late
            return '#16a085'; // Green for on time
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
                        <TouchableOpacity onPress={() => handleEditTask(task)} style={styles.iconButtonAction}>
                            <Ionicons name="pencil" size={18} color="#16a085" />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => handleDeleteTask(task)} style={styles.iconButtonAction}>
                            <Ionicons name="trash" size={18} color="#e74c3c" />
                        </TouchableOpacity>
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
                <TouchableOpacity style={styles.headerAddButton} onPress={handleCreateTask}>
                    <Ionicons name="add" size={30} color="#fff" />
                </TouchableOpacity>
            </View>

            <View style={styles.yearTabsContainer}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    {[1, 2, 3, 4].map(year => (
                        <TouchableOpacity
                            key={year}
                            style={[styles.yearTab, selectedYear === year && styles.yearTabActive]}
                            onPress={() => handleYearSelect(year)}
                        >
                            <Text style={[styles.yearTabText, selectedYear === year && styles.yearTabTextActive]}>
                                {getYearDisplayLabel(year)}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </ScrollView>
            </View>

            {tasks.length > 0 && (
                <View style={styles.clearAllContainer}>
                    <TouchableOpacity style={styles.clearAllButton} onPress={handleClearAllTasks}>
                        <Ionicons name="trash-outline" size={16} color="#e74c3c" />
                        <Text style={styles.clearAllText}>Clear All Tasks (Year {selectedYear})</Text>
                    </TouchableOpacity>
                </View>
            )}

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
                        <Text style={styles.emptySubtext}>Tap the + icon in the header to create a new task.</Text>
                    </View>
                ) : (
                    tasks.map(renderTaskItem)
                )}
                <View style={{ height: 40 }} />
            </ScrollView>

            <Modal visible={showCreateModal} animationType="slide" transparent={true}>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>{editingTask ? "Edit Assignment" : "New Assignment"}</Text>
                            <TouchableOpacity onPress={() => setShowCreateModal(false)}>
                                <Ionicons name="close" size={24} color="#666" />
                            </TouchableOpacity>
                        </View>
                        <ScrollView contentContainerStyle={{ padding: 20 }}>
                            <Text style={styles.inputLabel}>Task Title</Text>
                            <TextInput
                                style={styles.textInput}
                                value={taskTitle}
                                onChangeText={setTaskTitle}
                                placeholder="e.g. Assignment 2"
                            />

                            <Text style={styles.inputLabel}>Description (Optional)</Text>
                            <TextInput
                                style={[styles.textInput, { height: 80 }]}
                                value={taskDescription}
                                onChangeText={setTaskDescription}
                                multiline
                                placeholder="Enter details..."
                            />

                            <View style={styles.dateRow}>
                                <View style={{ flex: 1, marginRight: 10 }}>
                                    <Text style={styles.inputLabel}>Start Date</Text>
                                    <TextInput
                                        style={styles.textInput}
                                        value={startDate}
                                        onChangeText={(t) => setStartDate(formatDatePickerInput(t))}
                                        keyboardType="numeric"
                                        placeholder="DD/MM/YYYY"
                                    />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={styles.inputLabel}>Due Date</Text>
                                    <TextInput
                                        style={styles.textInput}
                                        value={dueDate}
                                        onChangeText={(t) => setDueDate(formatDatePickerInput(t))}
                                        keyboardType="numeric"
                                        placeholder="DD/MM/YYYY"
                                    />
                                </View>
                            </View>
                            <Text style={styles.hintText}>Leave dates empty for "No Deadline"</Text>
                        </ScrollView>
                        <View style={styles.modalFooter}>
                            <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowCreateModal(false)}>
                                <Text style={styles.cancelBtnText}>Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.saveBtn} onPress={handleSaveTask}>
                                <Text style={styles.saveBtnText}>{editingTask ? "Update" : "Save Task"}</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
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
    headerTitleSmall: { fontSize: 20, fontWeight: '700', color: '#fff', letterSpacing: 0.5 },
    headerDateText: { color: 'rgba(255,255,255,0.8)', fontSize: 13, marginTop: 2 },
    headerAddButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.2)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    yearTabsContainer: { backgroundColor: '#fff', paddingVertical: 12, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#eee' },
    yearTabsLabel: { fontSize: 13, fontWeight: '600', color: '#888', marginBottom: 8 },
    yearTab: { paddingHorizontal: 20, paddingVertical: 8, borderRadius: 20, backgroundColor: '#f0f0f0', marginRight: 10 },
    yearTabActive: { backgroundColor: '#16a085' },
    yearTabText: { color: '#666', fontWeight: '600', fontSize: 14 },
    yearTabTextActive: { color: '#fff' },
    clearAllContainer: {
        paddingHorizontal: 16,
        paddingTop: 12,
        alignItems: 'flex-end',
    },
    clearAllButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#fff',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#e74c3c',
    },
    clearAllText: {
        color: '#e74c3c',
        fontSize: 12,
        fontWeight: '600',
        marginLeft: 4,
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
    taskHeaderActions: { flexDirection: 'row', alignItems: 'center' },
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
    studentNameText: { fontSize: 15, fontWeight: '500', color: '#2c3e50', marginTop: 2 },
    emptyContainer: { alignItems: 'center', marginTop: 100, paddingHorizontal: 40 },
    emptyText: { fontSize: 20, fontWeight: '700', color: '#bdc3c7', marginTop: 20 },
    emptySubtext: { fontSize: 14, color: '#95a5a6', textAlign: 'center', marginTop: 10, lineHeight: 20 },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    modalContent: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '90%' },
    modalHeader: { padding: 20, borderBottomWidth: 1, borderBottomColor: '#eee', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    modalTitle: { fontSize: 18, fontWeight: '700', color: '#2c3e50' },
    inputLabel: { fontSize: 13, fontWeight: '600', color: '#7f8c8d', marginBottom: 8, marginTop: 5 },
    textInput: { backgroundColor: '#f8f9fa', borderRadius: 12, padding: 12, fontSize: 15, color: '#2c3e50', borderWidth: 1, borderColor: '#ececec', marginBottom: 15 },
    dateRow: { flexDirection: 'row', justifyContent: 'space-between' },
    hintText: { fontSize: 11, color: '#95a5a6', fontStyle: 'italic', marginBottom: 20 },
    modalFooter: { padding: 20, borderTopWidth: 1, borderTopColor: '#eee', flexDirection: 'row', gap: 12 },
    cancelBtn: { flex: 1, padding: 15, borderRadius: 12, backgroundColor: '#f1f1f1', alignItems: 'center' },
    cancelBtnText: { fontWeight: '600', color: '#666' },
    saveBtn: { flex: 2, padding: 15, borderRadius: 12, backgroundColor: '#16a085', alignItems: 'center' },
    saveBtnText: { fontWeight: '700', color: '#fff' },
});

export default FacultyTaskAssignmentScreen;
