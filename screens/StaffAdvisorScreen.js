import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from 'expo-router';
import React, { useState } from 'react';
import {
    Alert,
    FlatList,
    Modal,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const StaffAdvisorScreen = () => {
  const navigation = useNavigation();
  const [activeTab, setActiveTab] = useState('overview');
  const [classInfo, setClassInfo] = useState({
    name: 'Class A (Year 1)',
    strength: 45,
    representative: 'Rahul Kumar',
    repContact: 'rahul@example.com',
  });

  const [tasks, setTasks] = useState([
    { id: '1', title: 'Submit Syllabus', assignedTo: 'Class Rep', dueDate: '2025-01-20', status: 'pending' },
    { id: '2', title: 'Schedule Class Meeting', assignedTo: 'Class Rep', dueDate: '2025-01-18', status: 'completed' },
  ]);

  const [announcements, setAnnouncements] = useState([
    { id: '1', title: 'Mid-Semester Exam Schedule', date: '2025-01-10', message: 'Exams scheduled for Jan 25-28' },
    { id: '2', title: 'New Academic Calendar', date: '2025-01-05', message: 'Updated calendar released by KTU' },
  ]);

  const [attendanceStats, setAttendanceStats] = useState({
    totalClasses: 15,
    averageAttendance: 88,
    lowAttendanceStudents: 5,
  });

  const [syllabusProgress, setSyllabusProgress] = useState([
    { id: '1', unit: 'Unit 1: Introduction', coverage: 100, status: 'Completed' },
    { id: '2', unit: 'Unit 2: Core Concepts', coverage: 75, status: 'In Progress' },
    { id: '3', unit: 'Unit 3: Advanced Topics', coverage: 0, status: 'Not Started' },
  ]);

  const [studentProgress, setStudentProgress] = useState([
    { id: '1', name: 'Alice Johnson', grades: 'A', status: 'Excellent' },
    { id: '2', name: 'Bob Smith', grades: 'B', status: 'Good' },
    { id: '3', name: 'Charlie Brown', grades: 'C', status: 'Average' },
  ]);

  const [showAddTaskModal, setShowAddTaskModal] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDueDate, setNewTaskDueDate] = useState('');

  const handleAddTask = () => {
    if (!newTaskTitle.trim() || !newTaskDueDate.trim()) {
      Alert.alert('Error', 'Please fill all fields');
      return;
    }

    const newTask = {
      id: String(Date.now()),
      title: newTaskTitle,
      assignedTo: 'Class Rep',
      dueDate: newTaskDueDate,
      status: 'pending',
    };

    setTasks([...tasks, newTask]);
    setNewTaskTitle('');
    setNewTaskDueDate('');
    setShowAddTaskModal(false);
    Alert.alert('Success', 'Task assigned successfully');
  };

  const handleChatWithRep = () => {
    Alert.alert('Chat', `Start conversation with ${classInfo.representative}`);
  };

  const renderOverviewTab = () => (
    <View style={styles.tabContent}>
      {/* Class Info Card */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Class Information</Text>
        <View style={styles.infoRow}>
          <Text style={styles.label}>Class:</Text>
          <Text style={styles.value}>{classInfo.name}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.label}>Strength:</Text>
          <Text style={styles.value}>{classInfo.strength} students</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.label}>Class Rep:</Text>
          <Text style={styles.value}>{classInfo.representative}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.label}>Rep Contact:</Text>
          <Text style={styles.value}>{classInfo.repContact}</Text>
        </View>

        <TouchableOpacity
          style={styles.chatButton}
          onPress={handleChatWithRep}
        >
          <Ionicons name="chatbubble" size={16} color="#ffffff" />
          <Text style={styles.chatButtonText}>Chat with Class Rep</Text>
        </TouchableOpacity>
      </View>

      {/* Attendance Overview */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Attendance Overview</Text>
        <View style={styles.statGrid}>
          <View style={styles.statItem}>
            <Text style={styles.statNumber}>{attendanceStats.totalClasses}</Text>
            <Text style={styles.statLabel}>Total Classes</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={[styles.statNumber, styles.statGood]}>{attendanceStats.averageAttendance}%</Text>
            <Text style={styles.statLabel}>Avg Attendance</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={[styles.statNumber, styles.statWarning]}>{attendanceStats.lowAttendanceStudents}</Text>
            <Text style={styles.statLabel}>Low Attendance</Text>
          </View>
        </View>
        <TouchableOpacity style={styles.viewButton}>
          <Text style={styles.viewButtonText}>View Detailed Report</Text>
          <Ionicons name="chevron-forward" size={14} color="#3498db" />
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderTasksTab = () => (
    <View style={styles.tabContent}>
      <View style={styles.card}>
        <View style={styles.cardHeaderWithButton}>
          <Text style={styles.cardTitle}>Assigned Tasks</Text>
          <TouchableOpacity
            style={styles.smallButton}
            onPress={() => setShowAddTaskModal(true)}
          >
            <Ionicons name="add" size={16} color="#3498db" />
          </TouchableOpacity>
        </View>
        <FlatList
          data={tasks}
          keyExtractor={item => item.id}
          scrollEnabled={false}
          renderItem={({ item }) => (
            <View style={[styles.taskItem, item.status === 'completed' && styles.taskItemCompleted]}>
              <View style={styles.taskCheckmark}>
                <Ionicons
                  name={item.status === 'completed' ? 'checkbox' : 'square-outline'}
                  size={20}
                  color={item.status === 'completed' ? '#2ecc71' : '#bdc3c7'}
                />
              </View>
              <View style={styles.taskInfo}>
                <Text style={[styles.taskTitle, item.status === 'completed' && styles.taskTitleCompleted]}>
                  {item.title}
                </Text>
                <View style={styles.taskMeta}>
                  <Ionicons name="person-circle" size={12} color="#7f8c8d" />
                  <Text style={styles.taskMetaText}>{item.assignedTo}</Text>
                  <Ionicons name="calendar" size={12} color="#7f8c8d" style={styles.metaIcon} />
                  <Text style={styles.taskMetaText}>{item.dueDate}</Text>
                </View>
              </View>
              <View style={[styles.statusBadge, item.status === 'completed' && styles.statusBadgeCompleted]}>
                <Text style={styles.statusText}>{item.status}</Text>
              </View>
            </View>
          )}
        />
      </View>
    </View>
  );

  const renderSyllabusTab = () => (
    <View style={styles.tabContent}>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Syllabus Coverage</Text>
        <FlatList
          data={syllabusProgress}
          keyExtractor={item => item.id}
          scrollEnabled={false}
          renderItem={({ item }) => (
            <View style={styles.progressItem}>
              <View style={styles.progressHeader}>
                <Text style={styles.progressTitle}>{item.unit}</Text>
                <Text style={[styles.progressPercent, { color: item.coverage === 100 ? '#2ecc71' : '#f39c12' }]}>
                  {item.coverage}%
                </Text>
              </View>
              <View style={styles.progressBar}>
                <View
                  style={[
                    styles.progressFill,
                    { width: `${item.coverage}%`, backgroundColor: item.coverage === 100 ? '#2ecc71' : '#f39c12' },
                  ]}
                />
              </View>
              <Text style={styles.progressStatus}>{item.status}</Text>
            </View>
          )}
        />
      </View>
    </View>
  );

  const renderAnnouncementsTab = () => (
    <View style={styles.tabContent}>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Academic Announcements</Text>
        <FlatList
          data={announcements}
          keyExtractor={item => item.id}
          scrollEnabled={false}
          renderItem={({ item }) => (
            <View style={styles.announcementItem}>
              <View style={styles.announcementIcon}>
                <Ionicons name="megaphone" size={20} color="#3498db" />
              </View>
              <View style={styles.announcementContent}>
                <Text style={styles.announcementTitle}>{item.title}</Text>
                <Text style={styles.announcementMessage}>{item.message}</Text>
                <Text style={styles.announcementDate}>{item.date}</Text>
              </View>
            </View>
          )}
        />
      </View>
    </View>
  );

  const renderStudentProgressTab = () => (
    <View style={styles.tabContent}>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Student Academic Progress</Text>
        <FlatList
          data={studentProgress}
          keyExtractor={item => item.id}
          scrollEnabled={false}
          renderItem={({ item }) => (
            <View style={styles.studentProgressItem}>
              <View style={styles.studentAvatar}>
                <Text style={styles.avatarText}>{item.name.charAt(0)}</Text>
              </View>
              <View style={styles.studentProgressInfo}>
                <Text style={styles.studentName}>{item.name}</Text>
                <Text style={styles.studentStatus}>{item.status}</Text>
              </View>
              <View style={styles.gradeCard}>
                <Text style={styles.gradeText}>{item.grades}</Text>
              </View>
            </View>
          )}
        />
      </View>
    </View>
  );

  const renderClassTodoTab = () => (
    <View style={styles.tabContent}>
      <View style={styles.card}>
        <View style={styles.cardHeaderWithButton}>
          <Text style={styles.cardTitle}>Class To-Do List</Text>
          <TouchableOpacity style={styles.smallButton}>
            <Ionicons name="add" size={16} color="#2ecc71" />
          </TouchableOpacity>
        </View>
        <View style={styles.todoItem}>
          <Ionicons name="checkmark-circle" size={20} color="#2ecc71" />
          <Text style={styles.todoText}>Prepare class materials for next session</Text>
        </View>
        <View style={styles.todoItem}>
          <Ionicons name="square-outline" size={20} color="#bdc3c7" />
          <Text style={styles.todoText}>Review student assignments</Text>
        </View>
        <View style={styles.todoItem}>
          <Ionicons name="square-outline" size={20} color="#bdc3c7" />
          <Text style={styles.todoText}>Plan lab session activities</Text>
        </View>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={24} color="#2c3e50" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Staff Advisor Portal</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.tabBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {[
            { id: 'overview', label: 'Overview', icon: 'home' },
            { id: 'tasks', label: 'Tasks', icon: 'clipboard' },
            { id: 'syllabus', label: 'Syllabus', icon: 'book' },
            { id: 'announcements', label: 'Announce', icon: 'megaphone' },
            { id: 'progress', label: 'Progress', icon: 'trending-up' },
            { id: 'todo', label: 'Class To-Do', icon: 'list' },
          ].map(tab => (
            <TouchableOpacity
              key={tab.id}
              style={[styles.tab, activeTab === tab.id && styles.tabActive]}
              onPress={() => setActiveTab(tab.id)}
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
        {activeTab === 'syllabus' && renderSyllabusTab()}
        {activeTab === 'announcements' && renderAnnouncementsTab()}
        {activeTab === 'progress' && renderStudentProgressTab()}
        {activeTab === 'todo' && renderClassTodoTab()}
      </ScrollView>

      {/* Add Task Modal */}
      <Modal visible={showAddTaskModal} transparent={true} animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Assign Task to Class Rep</Text>
              <TouchableOpacity onPress={() => setShowAddTaskModal(false)}>
                <Ionicons name="close" size={24} color="#2c3e50" />
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.input}
              placeholder="Task Title"
              value={newTaskTitle}
              onChangeText={setNewTaskTitle}
              placeholderTextColor="#bdc3c7"
            />
            <TextInput
              style={styles.input}
              placeholder="Due Date (YYYY-MM-DD)"
              value={newTaskDueDate}
              onChangeText={setNewTaskDueDate}
              placeholderTextColor="#bdc3c7"
            />

            <TouchableOpacity
              style={styles.submitButton}
              onPress={handleAddTask}
            >
              <Text style={styles.submitButtonText}>Assign Task</Text>
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
  tabBar: {
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#ecf0f1',
    paddingVertical: 8,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginHorizontal: 4,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: '#9b59b6',
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#7f8c8d',
    marginLeft: 4,
  },
  tabLabelActive: {
    color: '#9b59b6',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  tabContent: {
    marginBottom: 20,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    paddingVertical: 14,
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#2c3e50',
    marginBottom: 12,
  },
  cardHeaderWithButton: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#ecf0f1',
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
    color: '#7f8c8d',
  },
  value: {
    fontSize: 11,
    fontWeight: '600',
    color: '#2c3e50',
  },
  chatButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#9b59b6',
    borderRadius: 6,
    paddingVertical: 10,
    marginTop: 12,
  },
  chatButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#ffffff',
    marginLeft: 6,
  },
  statGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    backgroundColor: '#f8f9fa',
    borderRadius: 6,
    marginHorizontal: 3,
  },
  statNumber: {
    fontSize: 18,
    fontWeight: '700',
    color: '#2c3e50',
  },
  statGood: {
    color: '#2ecc71',
  },
  statWarning: {
    color: '#e74c3c',
  },
  statLabel: {
    fontSize: 9,
    color: '#7f8c8d',
    marginTop: 4,
  },
  viewButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#ecf0f1',
    marginTop: 12,
  },
  viewButtonText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#3498db',
    marginRight: 4,
  },
  smallButton: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 4,
    backgroundColor: '#f0f8ff',
  },
  taskItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#ecf0f1',
  },
  taskItemCompleted: {
    opacity: 0.6,
  },
  taskCheckmark: {
    marginRight: 10,
  },
  taskInfo: {
    flex: 1,
  },
  taskTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#2c3e50',
  },
  taskTitleCompleted: {
    textDecorationLine: 'line-through',
    color: '#bdc3c7',
  },
  taskMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  taskMetaText: {
    fontSize: 9,
    color: '#7f8c8d',
    marginLeft: 2,
  },
  metaIcon: {
    marginLeft: 6,
  },
  statusBadge: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    backgroundColor: '#fff3cd',
    borderRadius: 3,
  },
  statusBadgeCompleted: {
    backgroundColor: '#d4edda',
  },
  statusText: {
    fontSize: 9,
    fontWeight: '600',
    color: '#856404',
  },
  progressItem: {
    marginBottom: 14,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  progressTitle: {
    fontSize: 11,
    fontWeight: '600',
    color: '#2c3e50',
  },
  progressPercent: {
    fontSize: 11,
    fontWeight: '700',
  },
  progressBar: {
    height: 6,
    backgroundColor: '#ecf0f1',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 4,
  },
  progressFill: {
    height: '100%',
  },
  progressStatus: {
    fontSize: 10,
    color: '#7f8c8d',
  },
  announcementItem: {
    flexDirection: 'row',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#ecf0f1',
  },
  announcementIcon: {
    marginRight: 10,
    justifyContent: 'center',
  },
  announcementContent: {
    flex: 1,
  },
  announcementTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#2c3e50',
  },
  announcementMessage: {
    fontSize: 11,
    color: '#7f8c8d',
    marginTop: 2,
  },
  announcementDate: {
    fontSize: 9,
    color: '#bdc3c7',
    marginTop: 4,
  },
  studentProgressItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#ecf0f1',
  },
  studentAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#3498db',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  avatarText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ffffff',
  },
  studentProgressInfo: {
    flex: 1,
  },
  studentName: {
    fontSize: 12,
    fontWeight: '600',
    color: '#2c3e50',
  },
  studentStatus: {
    fontSize: 10,
    color: '#7f8c8d',
    marginTop: 1,
  },
  gradeCard: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    backgroundColor: '#d6eaf8',
    borderRadius: 4,
  },
  gradeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#3498db',
  },
  todoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#ecf0f1',
  },
  todoText: {
    fontSize: 12,
    color: '#2c3e50',
    marginLeft: 10,
    flex: 1,
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
    fontSize: 16,
    fontWeight: '700',
    color: '#2c3e50',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ecf0f1',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginBottom: 12,
    fontSize: 13,
    color: '#2c3e50',
  },
  submitButton: {
    backgroundColor: '#9b59b6',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 12,
  },
  submitButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#ffffff',
  },
});

export default StaffAdvisorScreen;
