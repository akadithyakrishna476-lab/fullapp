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
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const TIME_SLOTS = [
  '09:00 - 10:00',
  '10:00 - 11:00',
  '11:00 - 12:00',
  '12:00 - 01:00',
  '01:00 - 02:00',
  '02:00 - 03:00',
];

const TimetableScreen = () => {
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
  const [timetable, setTimetable] = useState({
    'Monday-09:00': { subject: 'Data Structures', room: 'A101' },
    'Tuesday-10:00': { subject: 'Algorithms', room: 'B202' },
    'Wednesday-11:00': { subject: 'Database Systems', room: 'C303' },
  });
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [editSubject, setEditSubject] = useState('');
  const [editRoom, setEditRoom] = useState('');
  const [viewMode, setViewMode] = useState('week'); // week or daily

  const handleSlotPress = (day, time) => {
    const slotKey = `${day}-${time}`;
    const existing = timetable[slotKey];
    setSelectedSlot({ day, time, key: slotKey });
    setEditSubject(existing?.subject || '');
    setEditRoom(existing?.room || '');
    setShowEditModal(true);
  };

  const handleSaveSlot = () => {
    if (!editSubject.trim()) {
      Alert.alert('Error', 'Please enter subject name');
      return;
    }
    const newTimetable = { ...timetable };
    if (editSubject.trim()) {
      newTimetable[selectedSlot.key] = {
        subject: editSubject.trim(),
        room: editRoom.trim() || 'TBA',
      };
    } else {
      delete newTimetable[selectedSlot.key];
    }
    setTimetable(newTimetable);
    setShowEditModal(false);
    Alert.alert('Success', 'Timetable updated');
  };

  const handleDeleteSlot = () => {
    Alert.alert(
      'Delete Class',
      'Are you sure you want to delete this class?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          onPress: () => {
            const newTimetable = { ...timetable };
            delete newTimetable[selectedSlot.key];
            setTimetable(newTimetable);
            setShowEditModal(false);
            Alert.alert('Success', 'Class deleted');
          },
          style: 'destructive',
        },
      ]
    );
  };

  const renderWeekView = () => (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View>
        <View style={styles.timeColumn}>
          <View style={styles.timeSlot}>
            <Text style={styles.timeText}></Text>
          </View>
          {TIME_SLOTS.map(time => (
            <View key={time} style={styles.timeSlot}>
              <Text style={styles.timeText}>{time}</Text>
            </View>
          ))}
        </View>
        <View style={styles.daysRow}>
          {DAYS.map(day => (
            <View key={day} style={styles.dayColumn}>
              <View style={styles.dayHeader}>
                <Text style={styles.dayText}>{day.substring(0, 3)}</Text>
              </View>
              {TIME_SLOTS.map(time => {
                const slotKey = `${day}-${time}`;
                const classData = timetable[slotKey];
                return (
                  <TouchableOpacity
                    key={slotKey}
                    style={[
                      styles.classSlot,
                      classData && styles.classSlotFilled,
                    ]}
                    onPress={() => handleSlotPress(day, time)}
                  >
                    {classData ? (
                      <View style={styles.classContent}>
                        <Text style={styles.subjectText} numberOfLines={2}>
                          {classData.subject}
                        </Text>
                        <Text style={styles.roomText}>{classData.room}</Text>
                      </View>
                    ) : (
                      <Ionicons name="add" size={20} color="#bdc3c7" />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}
        </View>
      </View>
    </ScrollView>
  );

  const getDaySchedule = (day) => {
    return TIME_SLOTS
      .map(time => {
        const slotKey = `${day}-${time}`;
        return {
          time,
          key: slotKey,
          ...timetable[slotKey],
        };
      })
      .filter(slot => slot.subject);
  };

  const renderDailyView = () => {
    const schedules = DAYS.map(day => ({
      day,
      classes: getDaySchedule(day),
    }));

    return (
      <FlatList
        data={schedules}
        keyExtractor={item => item.day}
        scrollEnabled={false}
        renderItem={({ item }) => (
          <View style={styles.daySection}>
            <Text style={styles.daySectionTitle}>{item.day}</Text>
            {item.classes.length > 0 ? (
              item.classes.map(classItem => (
                <TouchableOpacity
                  key={classItem.key}
                  style={styles.dailyClassCard}
                  onPress={() => {
                    const [day, time] = classItem.key.split('-');
                    handleSlotPress(day, time);
                  }}
                >
                  <View style={styles.dailyTimeBlock}>
                    <Ionicons name="time" size={16} color="#3498db" />
                    <Text style={styles.dailyTime}>{classItem.time}</Text>
                  </View>
                  <View style={styles.dailyClassInfo}>
                    <Text style={styles.dailySubject}>{classItem.subject}</Text>
                    <Text style={styles.dailyRoom}>{classItem.room}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color="#bdc3c7" />
                </TouchableOpacity>
              ))
            ) : (
              <View style={styles.emptyDay}>
                <Text style={styles.emptyDayText}>No classes scheduled</Text>
              </View>
            )}
          </View>
        )}
      />
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={24} color="#2c3e50" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Timetable</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.viewToggle}>
        <TouchableOpacity
          style={[styles.toggleButton, viewMode === 'week' && styles.toggleButtonActive]}
          onPress={() => setViewMode('week')}
        >
          <Ionicons name="grid" size={16} color={viewMode === 'week' ? '#3498db' : '#7f8c8d'} />
          <Text style={[styles.toggleText, viewMode === 'week' && styles.toggleTextActive]}>Week</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.toggleButton, viewMode === 'daily' && styles.toggleButtonActive]}
          onPress={() => setViewMode('daily')}
        >
          <Ionicons name="list" size={16} color={viewMode === 'daily' ? '#3498db' : '#7f8c8d'} />
          <Text style={[styles.toggleText, viewMode === 'daily' && styles.toggleTextActive]}>Daily</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {viewMode === 'week' ? renderWeekView() : renderDailyView()}

        <View style={styles.infoBox}>
          <Ionicons name="information-circle" size={16} color="#3498db" />
          <Text style={styles.infoText}>Tap any slot to add, edit, or delete a class</Text>
        </View>
      </ScrollView>

      {/* Edit Modal */}
      <Modal
        visible={showEditModal}
        transparent={true}
        animationType="slide"
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {selectedSlot ? `${selectedSlot.day} - ${selectedSlot.time}` : 'Edit Class'}
              </Text>
              <TouchableOpacity onPress={() => setShowEditModal(false)}>
                <Ionicons name="close" size={24} color="#2c3e50" />
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.input}
              placeholder="Subject / Course Name"
              value={editSubject}
              onChangeText={setEditSubject}
              placeholderTextColor="#bdc3c7"
            />
            <TextInput
              style={styles.input}
              placeholder="Room / Location"
              value={editRoom}
              onChangeText={setEditRoom}
              placeholderTextColor="#bdc3c7"
            />

            <TouchableOpacity
              style={styles.submitButton}
              onPress={handleSaveSlot}
            >
              <Text style={styles.submitButtonText}>Save Class</Text>
            </TouchableOpacity>

            {timetable[selectedSlot?.key] && (
              <TouchableOpacity
                style={styles.deleteButtonModal}
                onPress={handleDeleteSlot}
              >
                <Ionicons name="trash" size={16} color="#e74c3c" />
                <Text style={styles.deleteButtonText}>Delete Class</Text>
              </TouchableOpacity>
            )}
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
  viewToggle: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    marginHorizontal: 16,
    marginVertical: 12,
    borderRadius: 8,
    padding: 4,
  },
  toggleButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 6,
  },
  toggleButtonActive: {
    backgroundColor: '#d6eaf8',
  },
  toggleText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#7f8c8d',
    marginLeft: 4,
  },
  toggleTextActive: {
    color: '#3498db',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  timeColumn: {
    width: 70,
    backgroundColor: '#ecf0f1',
  },
  timeSlot: {
    height: 70,
    justifyContent: 'center',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#bdc3c7',
    paddingVertical: 4,
  },
  timeText: {
    fontSize: 9,
    fontWeight: '600',
    color: '#2c3e50',
    textAlign: 'center',
  },
  daysRow: {
    flexDirection: 'row',
  },
  dayColumn: {
    width: 100,
  },
  dayHeader: {
    height: 50,
    backgroundColor: '#3498db',
    justifyContent: 'center',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#2980b9',
  },
  dayText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#ffffff',
  },
  classSlot: {
    height: 70,
    borderBottomWidth: 1,
    borderRightWidth: 1,
    borderColor: '#bdc3c7',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#ffffff',
  },
  classSlotFilled: {
    backgroundColor: '#d6eaf8',
    padding: 4,
  },
  classContent: {
    width: '100%',
    paddingHorizontal: 4,
  },
  subjectText: {
    fontSize: 9,
    fontWeight: '600',
    color: '#2c3e50',
  },
  roomText: {
    fontSize: 8,
    color: '#7f8c8d',
    marginTop: 2,
  },
  daySection: {
    marginBottom: 20,
  },
  daySectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#2c3e50',
    marginBottom: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#ecf0f1',
    borderRadius: 6,
  },
  dailyClassCard: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    borderLeftWidth: 4,
    borderLeftColor: '#3498db',
  },
  dailyTimeBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 12,
  },
  dailyTime: {
    fontSize: 11,
    fontWeight: '600',
    color: '#3498db',
    marginLeft: 4,
  },
  dailyClassInfo: {
    flex: 1,
  },
  dailySubject: {
    fontSize: 13,
    fontWeight: '600',
    color: '#2c3e50',
  },
  dailyRoom: {
    fontSize: 10,
    color: '#7f8c8d',
    marginTop: 2,
  },
  emptyDay: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  emptyDayText: {
    fontSize: 12,
    color: '#bdc3c7',
    fontStyle: 'italic',
  },
  infoBox: {
    backgroundColor: '#d6eaf8',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 20,
  },
  infoText: {
    fontSize: 11,
    color: '#2c3e50',
    marginLeft: 8,
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
    backgroundColor: '#3498db',
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
  deleteButtonModal: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 12,
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#ecf0f1',
  },
  deleteButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#e74c3c',
    marginLeft: 6,
  },
});

export default TimetableScreen;
