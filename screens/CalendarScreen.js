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

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 
                'July', 'August', 'September', 'October', 'November', 'December'];
const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const CalendarScreen = () => {
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
  const [currentDate, setCurrentDate] = useState(new Date(2025, 0, 1));
  const [events, setEvents] = useState({
    '2025-01-15': [
      { id: '1', title: 'Semester Starts', type: 'admin', description: 'KTU Academic Calendar' },
      { id: '2', title: 'My Class Review', type: 'personal', description: 'Course content review' },
    ],
    '2025-01-20': [
      { id: '3', title: 'Assignment Deadline', type: 'admin', description: 'All students' },
    ],
  });
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedDate, setSelectedDate] = useState(null);
  const [eventTitle, setEventTitle] = useState('');
  const [eventDescription, setEventDescription] = useState('');
  const [viewMode, setViewMode] = useState('month'); // month or agenda

  const getDaysInMonth = (date) => {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (date) => {
    return new Date(date.getFullYear(), date.getMonth(), 1).getDay();
  };

  const formatDate = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const handleDateSelect = (day) => {
    const newDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
    setSelectedDate(newDate);
    setEventTitle('');
    setEventDescription('');
    setShowAddModal(true);
  };

  const handleAddEvent = () => {
    if (!eventTitle.trim()) {
      Alert.alert('Error', 'Please enter event title');
      return;
    }
    const dateKey = formatDate(selectedDate);
    const newEvent = {
      id: String(Date.now()),
      title: eventTitle,
      type: 'personal',
      description: eventDescription || '',
    };

    const newEvents = { ...events };
    if (!newEvents[dateKey]) {
      newEvents[dateKey] = [];
    }
    newEvents[dateKey].push(newEvent);
    setEvents(newEvents);
    setShowAddModal(false);
    setEventTitle('');
    setEventDescription('');
    Alert.alert('Success', 'Event added successfully');
  };

  const handleDeleteEvent = (dateKey, eventId) => {
    Alert.alert(
      'Delete Event',
      'Are you sure you want to delete this event?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          onPress: () => {
            const newEvents = { ...events };
            newEvents[dateKey] = newEvents[dateKey].filter(e => e.id !== eventId);
            if (newEvents[dateKey].length === 0) {
              delete newEvents[dateKey];
            }
            setEvents(newEvents);
            Alert.alert('Success', 'Event deleted');
          },
          style: 'destructive',
        },
      ]
    );
  };

  const renderMonthView = () => {
    const daysInMonth = getDaysInMonth(currentDate);
    const firstDay = getFirstDayOfMonth(currentDate);
    const days = [];

    // Empty cells for days before month starts
    for (let i = 0; i < firstDay; i++) {
      days.push(null);
    }

    // Days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      days.push(day);
    }

    const dateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`;

    return (
      <>
        <View style={styles.monthHeader}>
          <Text style={styles.monthTitle}>
            {MONTHS[currentDate.getMonth()]} {currentDate.getFullYear()}
          </Text>
        </View>

        <View style={styles.weekDaysRow}>
          {DAYS_SHORT.map(day => (
            <View key={day} style={styles.weekDayCell}>
              <Text style={styles.weekDayText}>{day}</Text>
            </View>
          ))}
        </View>

        <View style={styles.calendarGrid}>
          {days.map((day, index) => {
            const dateKey = day ? `${dateStr}-${String(day).padStart(2, '0')}` : null;
            const dayEvents = dateKey ? events[dateKey] || [] : [];
            const isToday =
              day &&
              day === new Date().getDate() &&
              currentDate.getMonth() === new Date().getMonth() &&
              currentDate.getFullYear() === new Date().getFullYear();

            return (
              <TouchableOpacity
                key={index}
                style={[
                  styles.calendarDay,
                  !day && styles.calendarDayEmpty,
                  isToday && styles.calendarDayToday,
                ]}
                onPress={() => day && handleDateSelect(day)}
              >
                {day && (
                  <>
                    <Text
                      style={[
                        styles.dayNumber,
                        isToday && styles.dayNumberToday,
                      ]}
                    >
                      {day}
                    </Text>
                    {dayEvents.length > 0 && (
                      <View style={styles.eventDots}>
                        {dayEvents.slice(0, 3).map((_, i) => (
                          <View
                            key={i}
                            style={[
                              styles.eventDot,
                              dayEvents[i].type === 'admin' && styles.eventDotAdmin,
                            ]}
                          />
                        ))}
                      </View>
                    )}
                  </>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </>
    );
  };

  const getAllEvents = () => {
    const allEventsArray = [];
    Object.entries(events).forEach(([dateKey, dayEvents]) => {
      dayEvents.forEach(event => {
        allEventsArray.push({
          ...event,
          dateKey,
          dateDisplay: new Date(dateKey + 'T00:00:00').toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
          }),
        });
      });
    });
    return allEventsArray.sort((a, b) => new Date(a.dateKey) - new Date(b.dateKey));
  };

  const renderAgendaView = () => {
    const allEvents = getAllEvents();

    return (
      <FlatList
        data={allEvents}
        keyExtractor={item => item.id}
        scrollEnabled={false}
        renderItem={({ item }) => (
          <View style={styles.agendaItem}>
            <View style={styles.agendaDate}>
              <Text style={styles.agendaDateText}>{item.dateDisplay}</Text>
            </View>
            <View
              style={[
                styles.agendaEventCard,
                item.type === 'admin' && styles.agendaEventCardAdmin,
              ]}
            >
              <View style={styles.agendaEventHeader}>
                <Text style={styles.agendaEventTitle}>{item.title}</Text>
                {item.type === 'admin' && (
                  <View style={styles.adminBadge}>
                    <Text style={styles.adminBadgeText}>Admin</Text>
                  </View>
                )}
              </View>
              {item.description && (
                <Text style={styles.agendaEventDesc}>{item.description}</Text>
              )}
              {item.type === 'personal' && (
                <TouchableOpacity
                  style={styles.agendaDeleteButton}
                  onPress={() => handleDeleteEvent(item.dateKey, item.id)}
                >
                  <Ionicons name="trash" size={14} color="#e74c3c" />
                  <Text style={styles.agendaDeleteText}>Delete</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.emptyAgenda}>
            <Ionicons name="calendar" size={48} color="#bdc3c7" />
            <Text style={styles.emptyAgendaText}>No events scheduled</Text>
          </View>
        }
      />
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={24} color="#2c3e50" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Academic Calendar</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.controls}>
        <TouchableOpacity
          onPress={() =>
            setCurrentDate(
              new Date(currentDate.getFullYear(), currentDate.getMonth() - 1)
            )
          }
          style={styles.navButton}
        >
          <Ionicons name="chevron-back" size={20} color="#3498db" />
        </TouchableOpacity>

        <View style={styles.viewToggle}>
          <TouchableOpacity
            style={[styles.toggleButton, viewMode === 'month' && styles.toggleButtonActive]}
            onPress={() => setViewMode('month')}
          >
            <Ionicons name="grid" size={16} color={viewMode === 'month' ? '#3498db' : '#7f8c8d'} />
            <Text style={[styles.toggleText, viewMode === 'month' && styles.toggleTextActive]}>Month</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toggleButton, viewMode === 'agenda' && styles.toggleButtonActive]}
            onPress={() => setViewMode('agenda')}
          >
            <Ionicons name="list" size={16} color={viewMode === 'agenda' ? '#3498db' : '#7f8c8d'} />
            <Text style={[styles.toggleText, viewMode === 'agenda' && styles.toggleTextActive]}>Agenda</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          onPress={() =>
            setCurrentDate(
              new Date(currentDate.getFullYear(), currentDate.getMonth() + 1)
            )
          }
          style={styles.navButton}
        >
          <Ionicons name="chevron-forward" size={20} color="#3498db" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {viewMode === 'month' ? renderMonthView() : renderAgendaView()}

        <View style={styles.legendSection}>
          <Text style={styles.legendTitle}>Legend</Text>
          <View style={styles.legendItem}>
            <View style={[styles.eventDot, styles.eventDotPersonal]} />
            <Text style={styles.legendText}>Personal Events (Editable)</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.eventDot, styles.eventDotAdmin]} />
            <Text style={styles.legendText}>Admin Events (Read-only)</Text>
          </View>
        </View>
      </ScrollView>

      {viewMode === 'month' && (
        <TouchableOpacity
          style={styles.fabButton}
          onPress={() => {
            const today = new Date();
            setSelectedDate(today);
            setEventTitle('');
            setEventDescription('');
            setShowAddModal(true);
          }}
        >
          <Ionicons name="add" size={28} color="#ffffff" />
        </TouchableOpacity>
      )}

      {/* Add Event Modal */}
      <Modal
        visible={showAddModal}
        transparent={true}
        animationType="slide"
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Event</Text>
              <TouchableOpacity onPress={() => setShowAddModal(false)}>
                <Ionicons name="close" size={24} color="#2c3e50" />
              </TouchableOpacity>
            </View>

            {selectedDate && (
              <Text style={styles.selectedDateText}>
                {selectedDate.toLocaleDateString('en-US', {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </Text>
            )}

            <TextInput
              style={styles.input}
              placeholder="Event Title"
              value={eventTitle}
              onChangeText={setEventTitle}
              placeholderTextColor="#bdc3c7"
            />
            <TextInput
              style={[styles.input, styles.inputMultiline]}
              placeholder="Description (optional)"
              value={eventDescription}
              onChangeText={setEventDescription}
              placeholderTextColor="#bdc3c7"
              multiline={true}
              numberOfLines={3}
            />

            <TouchableOpacity
              style={styles.submitButton}
              onPress={handleAddEvent}
            >
              <Text style={styles.submitButtonText}>Add Event</Text>
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
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#ffffff',
  },
  navButton: {
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  viewToggle: {
    flexDirection: 'row',
    backgroundColor: '#ecf0f1',
    borderRadius: 6,
    padding: 3,
  },
  toggleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 4,
  },
  toggleButtonActive: {
    backgroundColor: '#d6eaf8',
  },
  toggleText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#7f8c8d',
    marginLeft: 3,
  },
  toggleTextActive: {
    color: '#3498db',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  monthHeader: {
    alignItems: 'center',
    marginBottom: 12,
  },
  monthTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#2c3e50',
  },
  weekDaysRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  weekDayCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
  },
  weekDayText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#7f8c8d',
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 16,
  },
  calendarDay: {
    width: '14.28%',
    aspectRatio: 1,
    backgroundColor: '#ffffff',
    borderRadius: 6,
    marginBottom: 6,
    marginRight: '0.4%',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ecf0f1',
  },
  calendarDayEmpty: {
    backgroundColor: 'transparent',
    borderWidth: 0,
  },
  calendarDayToday: {
    backgroundColor: '#d6eaf8',
    borderColor: '#3498db',
  },
  dayNumber: {
    fontSize: 12,
    fontWeight: '600',
    color: '#2c3e50',
  },
  dayNumberToday: {
    color: '#3498db',
    fontWeight: '700',
  },
  eventDots: {
    flexDirection: 'row',
    marginTop: 2,
  },
  eventDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#2ecc71',
    marginHorizontal: 1,
  },
  eventDotPersonal: {
    backgroundColor: '#2ecc71',
  },
  eventDotAdmin: {
    backgroundColor: '#e74c3c',
  },
  agendaItem: {
    marginBottom: 16,
  },
  agendaDate: {
    paddingVertical: 8,
    paddingHorizontal: 8,
    backgroundColor: '#ecf0f1',
    borderRadius: 4,
    marginBottom: 8,
  },
  agendaDateText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#2c3e50',
  },
  agendaEventCard: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#2ecc71',
  },
  agendaEventCardAdmin: {
    borderLeftColor: '#e74c3c',
  },
  agendaEventHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  agendaEventTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#2c3e50',
    flex: 1,
  },
  adminBadge: {
    backgroundColor: '#ffe6e6',
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 3,
    marginLeft: 8,
  },
  adminBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#e74c3c',
  },
  agendaEventDesc: {
    fontSize: 11,
    color: '#7f8c8d',
  },
  agendaDeleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    paddingVertical: 4,
  },
  agendaDeleteText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#e74c3c',
    marginLeft: 4,
  },
  emptyAgenda: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  emptyAgendaText: {
    fontSize: 14,
    color: '#bdc3c7',
    marginTop: 12,
  },
  legendSection: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginTop: 16,
    marginBottom: 20,
  },
  legendTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2c3e50',
    marginBottom: 8,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  legendText: {
    fontSize: 11,
    color: '#7f8c8d',
    marginLeft: 8,
  },
  fabButton: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#3498db',
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
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#2c3e50',
  },
  selectedDateText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#3498db',
    marginBottom: 12,
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
  submitButton: {
    backgroundColor: '#3498db',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  submitButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#ffffff',
  },
});

export default CalendarScreen;
