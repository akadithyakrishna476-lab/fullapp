import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { BackHandler } from 'react-native';
import React, { useState, useCallback } from 'react';
import {
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

const PRIORITIES = ['High', 'Medium', 'Low'];

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
  const [tasks, setTasks] = useState([
    {
      id: '1',
      title: 'Prepare lecture notes',
      description: 'Chapter 3-5 for next week',
      dueDate: '2025-01-15',
      priority: 'High',
      completed: false,
    },
    {
      id: '2',
      title: 'Review assignments',
      description: 'Student submissions from last week',
      dueDate: '2025-01-12',
      priority: 'Medium',
      completed: true,
    },
  ]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDescription, setNewTaskDescription] = useState('');
  const [newTaskDueDate, setNewTaskDueDate] = useState('');
  const [newTaskPriority, setNewTaskPriority] = useState('Medium');
  const [filterStatus, setFilterStatus] = useState('all'); // all, pending, completed
  const [sortBy, setSortBy] = useState('duedate'); // duedate, priority

  const handleAddTask = () => {
    if (!newTaskTitle.trim()) {
      Alert.alert('Error', 'Please enter task title');
      return;
    }
    if (!newTaskDueDate.trim()) {
      Alert.alert('Error', 'Please select due date');
      return;
    }

    const newTask = {
      id: String(Date.now()),
      title: newTaskTitle.trim(),
      description: newTaskDescription.trim(),
      dueDate: newTaskDueDate,
      priority: newTaskPriority,
      completed: false,
    };

    setTasks([...tasks, newTask]);
    setNewTaskTitle('');
    setNewTaskDescription('');
    setNewTaskDueDate('');
    setNewTaskPriority('Medium');
    setShowAddModal(false);
    Alert.alert('Success', 'Task added successfully');
  };

  const handleToggleTask = (id) => {
    setTasks(
      tasks.map(task =>
        task.id === id ? { ...task, completed: !task.completed } : task
      )
    );
  };

  const handleDeleteTask = (id) => {
    Alert.alert(
      'Delete Task',
      'Are you sure you want to delete this task?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          onPress: () => {
            setTasks(tasks.filter(task => task.id !== id));
            Alert.alert('Success', 'Task deleted');
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

    // Apply sort
    const sorted = [...filtered].sort((a, b) => {
      if (sortBy === 'duedate') {
        return new Date(a.dueDate) - new Date(b.dueDate);
      } else if (sortBy === 'priority') {
        const priorityOrder = { High: 0, Medium: 1, Low: 2 };
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      }
      return 0;
    });

    return sorted;
  };

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'High':
        return '#e74c3c';
      case 'Medium':
        return '#f39c12';
      case 'Low':
        return '#2ecc71';
      default:
        return '#3498db';
    }
  };

  const getPriorityIcon = (priority) => {
    switch (priority) {
      case 'High':
        return 'alert-circle';
      case 'Medium':
        return 'ellipse';
      case 'Low':
        return 'checkmark-circle';
      default:
        return 'help-circle';
    }
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString + 'T00:00:00');
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (date.toDateString() === today.toDateString()) {
      return 'Today';
    } else if (date.toDateString() === tomorrow.toDateString()) {
      return 'Tomorrow';
    } else {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
  };

  const isOverdue = (dueDate, completed) => {
    if (completed) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(dueDate + 'T00:00:00');
    return due < today;
  };

  const renderTaskItem = ({ item }) => (
    <View
      style={[
        styles.taskCard,
        item.completed && styles.taskCardCompleted,
        isOverdue(item.dueDate, item.completed) && styles.taskCardOverdue,
      ]}
    >
      <TouchableOpacity
        style={styles.taskCheckbox}
        onPress={() => handleToggleTask(item.id)}
      >
        <Ionicons
          name={item.completed ? 'checkbox' : 'square-outline'}
          size={24}
          color={item.completed ? '#2ecc71' : '#bdc3c7'}
        />
      </TouchableOpacity>

      <View style={styles.taskContent}>
        <View style={styles.taskHeader}>
          <Text
            style={[
              styles.taskTitle,
              item.completed && styles.taskTitleCompleted,
            ]}
            numberOfLines={1}
          >
            {item.title}
          </Text>
          <View style={[styles.priorityBadge, { backgroundColor: getPriorityColor(item.priority) + '20' }]}>
            <Ionicons
              name={getPriorityIcon(item.priority)}
              size={12}
              color={getPriorityColor(item.priority)}
            />
            <Text style={[styles.priorityText, { color: getPriorityColor(item.priority) }]}>
              {item.priority}
            </Text>
          </View>
        </View>

        {item.description && (
          <Text style={styles.taskDescription} numberOfLines={1}>
            {item.description}
          </Text>
        )}

        <View style={styles.taskFooter}>
          <View style={styles.dueDate}>
            <Ionicons
              name="calendar"
              size={12}
              color={isOverdue(item.dueDate, item.completed) ? '#e74c3c' : '#7f8c8d'}
            />
            <Text
              style={[
                styles.dueDateText,
                isOverdue(item.dueDate, item.completed) && styles.dueDateOverdue,
              ]}
            >
              {formatDate(item.dueDate)}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.deleteTaskButton}
            onPress={() => handleDeleteTask(item.id)}
          >
            <Ionicons name="trash" size={14} color="#bdc3c7" />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

  const displayTasks = getFilteredAndSortedTasks();
  const pendingCount = tasks.filter(t => !t.completed).length;
  const completedCount = tasks.filter(t => t.completed).length;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={24} color="#2c3e50" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>To-Do List</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Stats */}
      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{pendingCount}</Text>
          <Text style={styles.statLabel}>Pending</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{completedCount}</Text>
          <Text style={styles.statLabel}>Completed</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statNumber}>{tasks.length}</Text>
          <Text style={styles.statLabel}>Total</Text>
        </View>
      </View>

      {/* Filter and Sort */}
      <View style={styles.controlsSection}>
        <View style={styles.filterSection}>
          <Text style={styles.controlLabel}>Filter:</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll}>
            {['all', 'pending', 'completed'].map(status => (
              <TouchableOpacity
                key={status}
                style={[
                  styles.filterButton,
                  filterStatus === status && styles.filterButtonActive,
                ]}
                onPress={() => setFilterStatus(status)}
              >
                <Text
                  style={[
                    styles.filterButtonText,
                    filterStatus === status && styles.filterButtonTextActive,
                  ]}
                >
                  {status.charAt(0).toUpperCase() + status.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        <View style={styles.sortSection}>
          <Text style={styles.controlLabel}>Sort:</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.sortScroll}>
            {[
              { key: 'duedate', label: 'Due Date' },
              { key: 'priority', label: 'Priority' },
            ].map(sort => (
              <TouchableOpacity
                key={sort.key}
                style={[
                  styles.sortButton,
                  sortBy === sort.key && styles.sortButtonActive,
                ]}
                onPress={() => setSortBy(sort.key)}
              >
                <Text
                  style={[
                    styles.sortButtonText,
                    sortBy === sort.key && styles.sortButtonTextActive,
                  ]}
                >
                  {sort.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
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
                  : 'No tasks yet. Add one to get started!'}
            </Text>
          </View>
        )}
      </ScrollView>

      {/* FAB */}
      <TouchableOpacity
        style={styles.fabButton}
        onPress={() => setShowAddModal(true)}
      >
        <Ionicons name="add" size={28} color="#ffffff" />
      </TouchableOpacity>

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
              placeholder="Task Title"
              value={newTaskTitle}
              onChangeText={setNewTaskTitle}
              placeholderTextColor="#bdc3c7"
            />

            <TextInput
              style={[styles.input, styles.inputMultiline]}
              placeholder="Description (optional)"
              value={newTaskDescription}
              onChangeText={setNewTaskDescription}
              placeholderTextColor="#bdc3c7"
              multiline={true}
              numberOfLines={3}
            />

            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Due Date</Text>
              <TextInput
                style={styles.input}
                placeholder="YYYY-MM-DD"
                value={newTaskDueDate}
                onChangeText={setNewTaskDueDate}
                placeholderTextColor="#bdc3c7"
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Priority</Text>
              <View style={styles.prioritySelector}>
                {PRIORITIES.map(priority => (
                  <TouchableOpacity
                    key={priority}
                    style={[
                      styles.priorityOption,
                      newTaskPriority === priority && styles.priorityOptionActive,
                    ]}
                    onPress={() => setNewTaskPriority(priority)}
                  >
                    <Text
                      style={[
                        styles.priorityOptionText,
                        newTaskPriority === priority && styles.priorityOptionTextActive,
                      ]}
                    >
                      {priority}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <TouchableOpacity
              style={styles.submitButton}
              onPress={handleAddTask}
            >
              <Text style={styles.submitButtonText}>Add Task</Text>
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
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    justifyContent: 'space-between',
  },
  statCard: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: 'center',
    marginHorizontal: 4,
  },
  statNumber: {
    fontSize: 20,
    fontWeight: '700',
    color: '#3498db',
  },
  statLabel: {
    fontSize: 10,
    color: '#7f8c8d',
    marginTop: 4,
  },
  controlsSection: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#ecf0f1',
  },
  controlLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#2c3e50',
    marginBottom: 6,
  },
  filterSection: {
    marginBottom: 12,
  },
  filterScroll: {
    marginHorizontal: -16,
    paddingHorizontal: 16,
  },
  filterButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: '#ecf0f1',
    marginRight: 8,
  },
  filterButtonActive: {
    backgroundColor: '#3498db',
  },
  filterButtonText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#7f8c8d',
  },
  filterButtonTextActive: {
    color: '#ffffff',
  },
  sortSection: {},
  sortScroll: {
    marginHorizontal: -16,
    paddingHorizontal: 16,
  },
  sortButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: '#ecf0f1',
    marginRight: 8,
  },
  sortButtonActive: {
    backgroundColor: '#2ecc71',
  },
  sortButtonText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#7f8c8d',
  },
  sortButtonTextActive: {
    color: '#ffffff',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  taskCard: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  taskCardCompleted: {
    backgroundColor: '#f0fdf4',
  },
  taskCardOverdue: {
    backgroundColor: '#fef2f2',
    borderLeftWidth: 3,
    borderLeftColor: '#e74c3c',
  },
  taskCheckbox: {
    marginRight: 12,
    marginTop: 2,
  },
  taskContent: {
    flex: 1,
  },
  taskHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  taskTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#2c3e50',
    flex: 1,
  },
  taskTitleCompleted: {
    textDecorationLine: 'line-through',
    color: '#bdc3c7',
  },
  priorityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 4,
    marginLeft: 8,
  },
  priorityText: {
    fontSize: 9,
    fontWeight: '600',
    marginLeft: 2,
  },
  taskDescription: {
    fontSize: 11,
    color: '#7f8c8d',
    marginBottom: 8,
  },
  taskFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dueDate: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dueDateText: {
    fontSize: 10,
    color: '#7f8c8d',
    marginLeft: 4,
  },
  dueDateOverdue: {
    color: '#e74c3c',
    fontWeight: '600',
  },
  deleteTaskButton: {
    padding: 4,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  emptyStateText: {
    fontSize: 14,
    color: '#bdc3c7',
    marginTop: 12,
    textAlign: 'center',
  },
  fabButton: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#f39c12',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 8,
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
  inputMultiline: {
    textAlignVertical: 'top',
    minHeight: 80,
  },
  formGroup: {
    marginBottom: 12,
  },
  formLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#2c3e50',
    marginBottom: 6,
  },
  prioritySelector: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  priorityOption: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: '#ecf0f1',
    borderRadius: 6,
    marginHorizontal: 4,
    alignItems: 'center',
  },
  priorityOptionActive: {
    backgroundColor: '#3498db',
    borderColor: '#3498db',
  },
  priorityOptionText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#7f8c8d',
  },
  priorityOptionTextActive: {
    color: '#ffffff',
  },
  submitButton: {
    backgroundColor: '#f39c12',
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

export default TodoListScreen;
