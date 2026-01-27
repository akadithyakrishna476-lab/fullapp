import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Picker } from '@react-native-picker/picker';
import { useFocusEffect } from '@react-navigation/native';
import { useNavigation } from 'expo-router';
import { collection, doc, getDoc, getDocs, onSnapshot, query, setDoc, where } from 'firebase/firestore';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  Modal,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { auth, db } from '../firebase/firebaseConfig';
import { getCurrentAcademicYear, getYearDisplayLabel } from '../constants/academicYear';
import {
  cancelAllScheduledNotificationsAsync,
  requestPermissionsAsync,
  scheduleNotificationAsync,
  setupNotificationHandler
} from '../utils/notificationHelper';

// Setup notification handler
setupNotificationHandler();

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const PERIODS = [1, 2, 3, 4, 5, 6];
const PERIOD_TIMES = {
  1: '09:00 - 10:00',
  2: '10:00 - 11:00',
  3: '11:00 - 12:00',
  4: '12:00 - 01:00',
  5: '01:00 - 02:00',
  6: '02:00 - 03:00',
};

const YEAR_MAP = [
  { id: 'Year 1', label: getYearDisplayLabel(1) },
  { id: 'Year 2', label: getYearDisplayLabel(2) },
  { id: 'Year 3', label: getYearDisplayLabel(3) },
  { id: 'Year 4', label: getYearDisplayLabel(4) },
];

const TimetableScreen = () => {
  const navigation = useNavigation();

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

  const [timetable, setTimetable] = useState({});
  const [originalTimetable, setOriginalTimetable] = useState({});
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [editSubject, setEditSubject] = useState('');
  const [editClass, setEditClass] = useState('');
  const [editCrPermission, setEditCrPermission] = useState(false);
  const [editStatus, setEditStatus] = useState('scheduled');
  const [isEditMode, setIsEditMode] = useState(false);
  const [userRole, setUserRole] = useState(null);
  const [userClass, setUserClass] = useState(null);
  const [facultyClasses, setFacultyClasses] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadUserRoleAndTimetable();
  }, []);

  const fetchYearsFromCRAssignments = async () => {
    // Return internal IDs for logic use
    return ['Year 1', 'Year 2', 'Year 3', 'Year 4'];
  };

  const getCRIdForYear = async (year) => {
    try {
      const crAssignmentsRef = collection(db, 'crAssignments');
      const q = query(crAssignmentsRef, where('year', '==', year));
      const snapshot = await getDocs(q);

      if (!snapshot.empty) {
        const crData = snapshot.docs[0].data();
        const fetchedCrId = crData.crId || null;
        console.log(`CR ID for ${year}:`, fetchedCrId);
        return fetchedCrId;
      }
      console.log(`No CR assigned to year: ${year}`);
      return null;
    } catch (error) {
      console.error(`Error fetching CR for year ${year}:`, error);
      return null;
    }
  };

  const loadUserRoleAndTimetable = async () => {
    try {
      setLoading(true);
      const currentUser = auth.currentUser;
      if (!currentUser) {
        Alert.alert('Error', 'Please login to view timetable');
        setLoading(false);
        return;
      }

      const facultyDoc = await getDoc(doc(db, 'faculty', currentUser.uid));
      if (facultyDoc.exists()) {
        const data = facultyDoc.data();
        setUserRole('faculty');

        // Fetch years from CR assignments (years that have CRs)
        const yearsWithCRs = await fetchYearsFromCRAssignments();
        setFacultyClasses(yearsWithCRs);
        await loadFacultyTimetable(yearsWithCRs);
        setLoading(false);
        return;
      }

      const crData = await AsyncStorage.getItem('crData');
      if (crData) {
        const data = JSON.parse(crData);
        setUserRole('cr');
        setUserClass(data.class || data.classSection);
        await loadCRTimetable(data.class || data.classSection);
        setLoading(false);
        return;
      }

      Alert.alert('Error', 'Unable to determine user role');
      setLoading(false);
    } catch (error) {
      console.error('Error loading user role:', error);
      Alert.alert('Error', 'Failed to load timetable');
      setLoading(false);
    }
  };

  const scheduleNotifications = async (timetableData) => {
    try {
      // Cancel all existing notifications
      await cancelAllScheduledNotificationsAsync();

      const { status } = await requestPermissionsAsync();
      if (status !== 'granted') return;

      // Schedule notifications for the next 4 weeks (Android doesn't support calendar repeating triggers)
      const weeksToSchedule = 4;

      Object.values(timetableData).forEach(entry => {
        if (entry.facultyId === auth.currentUser.uid) {
          const dayIndex = DAYS.indexOf(entry.day);
          if (dayIndex === -1) return;

          const startTime = entry.time.split(' - ')[0];
          const [hours, minutes] = startTime.split(':').map(Number);

          // Schedule for the next 4 weeks
          for (let week = 0; week < weeksToSchedule; week++) {
            const now = new Date();
            let daysToAdd = (dayIndex + 1) - now.getDay();
            if (daysToAdd <= 0) daysToAdd += 7;

            // Add the week offset
            daysToAdd += (week * 7);

            const targetDate = new Date();
            targetDate.setDate(now.getDate() + daysToAdd);
            targetDate.setHours(hours, minutes - 5, 0, 0); // 5 minutes before class

            // Only schedule if the date is in the future
            if (targetDate > now) {
              scheduleNotificationAsync({
                content: {
                  title: 'Upcoming Class',
                  body: `You have ${entry.subject} in Class ${entry.class} starting at ${startTime}`,
                  data: { ...entry },
                },
                trigger: targetDate,
              });
            }
          }
        }
      });
      console.log('Notifications scheduled successfully');
    } catch (error) {
      console.error('Error scheduling notifications:', error);
    }
  };

  const loadFacultyTimetable = async (classes) => {
    try {
      const allTimetableData = {};
      // Fetch timetables for all years
      const allYears = ['Year 1', 'Year 2', 'Year 3', 'Year 4'];
      for (const year of allYears) {
        const timetableDoc = await getDoc(doc(db, 'timetables', year));
        if (timetableDoc.exists()) {
          const data = timetableDoc.data();
          Object.assign(allTimetableData, data.schedule || {});
        }
      }
      setTimetable(allTimetableData);
      setOriginalTimetable(JSON.parse(JSON.stringify(allTimetableData)));

      // Schedule notifications for faculty
      scheduleNotifications(allTimetableData);
    } catch (error) {
      console.error('Error loading faculty timetable:', error);
    }
  };

  const loadCRTimetable = async (classSection) => {
    try {
      if (!classSection) return;

      // Get CR ID from AsyncStorage
      const crData = await AsyncStorage.getItem('crData');
      let crId = null;
      if (crData) {
        const data = JSON.parse(crData);
        crId = data.crId || data.uid;
      }

      if (!crId) {
        console.warn('No CR ID found for CR:', classSection);
        setTimetable({});
        return;
      }

      console.log('=== Loading CR Timetable ===');
      console.log('Year:', classSection);
      console.log('CR ID:', crId);

      // Listen to timetable updates for this year
      const timetableRef = doc(db, 'timetables', classSection);
      const unsubscribe = onSnapshot(timetableRef, (docSnap) => {
        console.log('Timetable snapshot received for year:', classSection);
        if (docSnap.exists()) {
          const data = docSnap.data();
          const schedule = data.schedule || {};

          console.log('Total entries in year timetable:', Object.keys(schedule).length);

          // Filter entries for this CR
          const crTimetable = {};
          Object.keys(schedule).forEach(key => {
            const entry = schedule[key];

            // Check if entry belongs to this CR
            const entryBelongsToCR = entry.crId === crId;
            const entryIsUnassigned = !entry.crId;

            // Normalize year formats for comparison
            // Faculty saves as "Year 1", "Year 2", etc.
            // CR classSection might be "year1", "Year1", "Year 1", etc.
            const normalizeYear = (yearStr) => {
              if (!yearStr) return '';
              // Convert to lowercase, remove spaces, extract number
              const normalized = yearStr.toLowerCase().replace(/\s+/g, '');
              return normalized;
            };

            const entryYearNormalized = normalizeYear(entry.year || entry.class);
            const crYearNormalized = normalizeYear(classSection);

            // Show entry if normalized years match
            const entryYearMatches = entryYearNormalized === crYearNormalized ||
              entryYearNormalized.includes(crYearNormalized) ||
              crYearNormalized.includes(entryYearNormalized);

            if (entryYearMatches) {
              crTimetable[key] = entry;
              console.log(`✓ Including ${key}:`, entry.subject, `(Entry year: ${entry.year}, CR year: ${classSection})`);
            } else {
              console.log(`✗ Excluding ${key}: Year Mismatch (Entry: ${entry.year}, CR: ${classSection}, Normalized: ${entryYearNormalized} vs ${crYearNormalized})`);
            }
          });

          console.log('Filtered entries for this CR:', Object.keys(crTimetable).length);
          setTimetable(crTimetable);
        } else {
          console.log('No timetable document found for year:', classSection);
          setTimetable({});
        }
      }, (error) => {
        console.error('Error listening to timetable updates:', error);
      });

      // Return unsubscribe function to clean up listener if needed
      return unsubscribe;
    } catch (error) {
      console.error('Error loading CR timetable:', error);
    }
  };

  const handleEditToggle = () => {
    if (isEditMode) {
      Alert.alert(
        'Cancel Changes',
        'Are you sure you want to discard all changes?',
        [
          { text: 'Continue Editing', style: 'cancel' },
          {
            text: 'Discard',
            style: 'destructive',
            onPress: () => {
              setTimetable(JSON.parse(JSON.stringify(originalTimetable)));
              setIsEditMode(false);
            }
          }
        ]
      );
    } else {
      setOriginalTimetable(JSON.parse(JSON.stringify(timetable)));
      setIsEditMode(true);
    }
  };

  const handleSaveTimetable = async () => {
    try {
      Alert.alert(
        'Save Timetable',
        'This will update the timetable for all affected years. Continue?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Save',
            onPress: async () => {
              setLoading(true);
              const yearTimetables = {};

              // Organize entries by year
              Object.keys(timetable).forEach(key => {
                const entry = timetable[key];
                if (entry && entry.year) {
                  if (!yearTimetables[entry.year]) {
                    yearTimetables[entry.year] = {};
                  }
                  yearTimetables[entry.year][key] = entry;
                }
              });

              console.log('Saving timetable to years:', Object.keys(yearTimetables));

              // Save each year's timetable
              for (const [year, schedule] of Object.entries(yearTimetables)) {
                console.log(`Saving ${Object.keys(schedule).length} entries for year: ${year}`);
                const timetableRef = doc(db, 'timetables', year);
                await setDoc(timetableRef, {
                  year: year,
                  schedule,
                  lastUpdated: new Date().toISOString(),
                  updatedBy: auth.currentUser.uid,
                }, { merge: true });
                console.log(`Successfully saved timetable for year: ${year}`);
              }

              setOriginalTimetable(JSON.parse(JSON.stringify(timetable)));
              setIsEditMode(false);
              setLoading(false);
              Alert.alert('Success', 'Timetable updated successfully');
            }
          }
        ]
      );
    } catch (error) {
      console.error('Error saving timetable:', error);
      Alert.alert('Error', 'Failed to save timetable');
      setLoading(false);
    }
  };

  const handleSlotPress = (day, period) => {
    const slotKey = `${day}-Period${period}`;
    const existing = timetable[slotKey];

    // Faculty can always edit in edit mode
    // CR can view details and perform actions if allowed
    const isFacultyEdit = userRole === 'faculty' && isEditMode;
    const isCRView = userRole === 'cr';

    if (!isFacultyEdit && !isCRView) return;

    setSelectedSlot({ day, period, key: slotKey });
    setEditSubject(existing?.subject || '');
    setEditClass(existing?.class || existing?.year || '');
    setEditCrPermission(existing?.crCanEdit || false);
    setEditStatus(existing?.status || 'scheduled');
    setShowEditModal(true);
  };

  const handleSaveSlot = async () => {
    if (!editSubject.trim()) {
      Alert.alert('Error', 'Please enter subject name');
      return;
    }
    if (!editClass || !editClass.trim()) {
      Alert.alert('Error', 'Please select a class/year');
      return;
    }

    // Faculty can select any of the 4 years
    const validYears = ['Year 1', 'Year 2', 'Year 3', 'Year 4'];
    if (!validYears.includes(editClass.trim())) {
      Alert.alert('Error', 'Please select a valid year');
      return;
    }

    const selectedYear = editClass.trim();

    // Determine CR ID
    let crId = timetable[selectedSlot.key]?.crId;
    // Only re-fetch if faculty is editing, to avoid overwriting if CR is just updating status
    if (userRole === 'faculty') {
      crId = await getCRIdForYear(selectedYear);
    }

    const newEntry = {
      ...timetable[selectedSlot.key],
      subject: editSubject.trim(),
      year: selectedYear,
      day: selectedSlot.day,
      period: selectedSlot.period,
      time: PERIOD_TIMES[selectedSlot.period],
      facultyId: userRole === 'faculty' ? auth.currentUser.uid : (timetable[selectedSlot.key]?.facultyId || auth.currentUser.uid),
      crId: crId,
      crCanEdit: editCrPermission,
      status: editStatus,
      lastUpdatedBy: userRole,
    };

    const newTimetable = { ...timetable };
    newTimetable[selectedSlot.key] = newEntry;
    setTimetable(newTimetable);
    setShowEditModal(false);

    // If CR is saving, perform immediate save to Firestore
    if (userRole === 'cr') {
      saveSingleSlot(newEntry);
    } else {
      // Schedule local notifications if faculty saves
      scheduleNotifications(newTimetable);
    }
  };

  const saveSingleSlot = async (entry) => {
    try {
      const timetableRef = doc(db, 'timetables', entry.year);
      const updateData = {};
      updateData[`schedule.${selectedSlot.key}`] = entry;
      updateData['lastUpdated'] = new Date().toISOString();

      await setDoc(timetableRef, updateData, { merge: true });
      Alert.alert('Success', 'Status updated successfully');
    } catch (error) {
      console.error('Error saving slot:', error);
      Alert.alert('Error', 'Failed to save update');
    }
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
          },
          style: 'destructive',
        },
      ]
    );
  };

  const renderTimetableGrid = () => {
    return (
      <View style={styles.timetableContainer}>
        {/* Header Row: Day/Period + Period Headers */}
        <View style={styles.headerRow}>
          <View style={styles.cornerCell}>
            <Text style={styles.cornerText}>Day / Period</Text>
          </View>
          {PERIODS.map(period => (
            <View key={period} style={styles.periodHeaderCell}>
              <Text style={styles.periodHeaderText}>P{period}</Text>
            </View>
          ))}
        </View>

        {/* Data Rows: Day Name + Period Cells */}
        {DAYS.map(day => (
          <View key={day} style={styles.dataRow}>
            <View style={styles.dayNameCell}>
              <Text style={styles.dayNameText}>{day}</Text>
            </View>
            {PERIODS.map(period => {
              const slotKey = `${day}-Period${period}`;
              const classData = timetable[slotKey];
              const isEditable = userRole === 'faculty' && isEditMode;

              return (
                <TouchableOpacity
                  key={slotKey}
                  style={[
                    styles.dataCell,
                    classData && styles.dataCellFilled,
                    classData?.status === 'arrived' && styles.dataCellArrived,
                    classData?.status === 'not_arrived' && styles.dataCellNotArrived,
                    classData?.status === 'free' && styles.dataCellFree,
                    isEditable && styles.dataCellEditable,
                  ]}
                  onPress={() => handleSlotPress(day, period)}
                  disabled={!isEditable && userRole !== 'cr'}
                >
                  <Text style={styles.cellSubject} numberOfLines={2}>
                    {classData?.subject || ''}
                  </Text>
                  {classData?.class && (
                    <Text style={styles.cellClass} numberOfLines={1}>
                      {YEAR_MAP.find(y => y.id === classData.class)?.label || classData.class}
                    </Text>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={24} color="#2c3e50" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>
          {userRole === 'faculty' ? 'My Timetable' : 'Class Timetable'}
        </Text>
        <View style={{ width: 24 }} />
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3498db" />
          <Text style={styles.loadingText}>Loading timetable...</Text>
        </View>
      ) : (
        <>
          {userRole === 'faculty' && (
            <View style={styles.editControls}>
              {!isEditMode ? (
                <TouchableOpacity style={styles.editButton} onPress={handleEditToggle}>
                  <Ionicons name="create-outline" size={18} color="#fff" />
                  <Text style={styles.editButtonText}>Edit Timetable</Text>
                </TouchableOpacity>
              ) : (
                <View style={styles.editActionsRow}>
                  <TouchableOpacity style={styles.cancelButton} onPress={handleEditToggle}>
                    <Ionicons name="close-circle-outline" size={18} color="#e74c3c" />
                    <Text style={styles.cancelButtonText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.saveButton} onPress={handleSaveTimetable}>
                    <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
                    <Text style={styles.saveButtonText}>Save Changes</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}

          <View style={styles.timetableWrapper}>
            {renderTimetableGrid()}
          </View>

          <View style={styles.infoBox}>
            <Ionicons name="information-circle" size={16} color="#3498db" />
            <Text style={styles.infoText}>
              {userRole === 'faculty'
                ? (isEditMode
                  ? 'Tap any slot to add or edit a class. Click Save when done.'
                  : 'Click "Edit Timetable" to modify your schedule.')
                : 'Your timetable will update automatically when faculty makes changes.'}
            </Text>
          </View>
        </>
      )}

      <Modal visible={showEditModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {selectedSlot ? `${selectedSlot.day} - Period ${selectedSlot.period}` : 'Edit Class'}
              </Text>
              <TouchableOpacity onPress={() => setShowEditModal(false)}>
                <Ionicons name="close" size={24} color="#2c3e50" />
              </TouchableOpacity>
            </View>

            <Text style={styles.inputLabel}>Subject / Course Name *</Text>
            <TextInput
              style={[styles.input, userRole === 'cr' && !editCrPermission && styles.disabledInput]}
              placeholder="e.g., Data Structures, Mathematics"
              value={editSubject}
              onChangeText={setEditSubject}
              placeholderTextColor="#bdc3c7"
              editable={userRole === 'faculty' || (userRole === 'cr' && editCrPermission)}
            />

            <Text style={styles.inputLabel}>Class / Year *</Text>
            <View style={[styles.pickerContainer, userRole === 'cr' && !editCrPermission && styles.disabledInput]}>
              <Picker
                selectedValue={editClass}
                onValueChange={(itemValue) => setEditClass(itemValue)}
                style={styles.picker}
                enabled={userRole === 'faculty' || (userRole === 'cr' && editCrPermission)}
              >
                <Picker.Item label="-- Select Year --" value="" />
                {YEAR_MAP.map((y) => (
                  <Picker.Item key={y.id} label={y.label} value={y.id} />
                ))}
                {/* If CR, simply show option for their current class since they might not have list of all years */}
                {userRole === 'cr' && (
                  <Picker.Item
                    label={YEAR_MAP.find(y => y.id === userClass)?.label || userClass || editClass}
                    value={userClass || editClass}
                  />
                )}
              </Picker>
            </View>

            {/* FACULTY: Allow CR Edit Permission */}
            {userRole === 'faculty' && (
              <View style={styles.switchContainer}>
                <Text style={styles.switchLabel}>Allow CR to Edit?</Text>
                <Switch
                  value={editCrPermission}
                  onValueChange={setEditCrPermission}
                  trackColor={{ false: "#767577", true: "#3498db" }}
                  thumbColor={editCrPermission ? "#f4f3f4" : "#f4f3f4"}
                />
              </View>
            )}

            {/* CR: Status Updates */}
            {userRole === 'cr' && (
              <View style={styles.statusContainer}>
                <Text style={styles.statusTitle}>Faculty Arrival Status</Text>
                <View style={styles.statusButtonsRow}>
                  <TouchableOpacity
                    style={[
                      styles.statusButton,
                      editStatus === 'arrived' && styles.statusButtonActive,
                      { backgroundColor: editStatus === 'arrived' ? '#27ae60' : '#ecf0f1' }
                    ]}
                    onPress={() => setEditStatus('arrived')}
                  >
                    <Text style={[styles.statusButtonText, editStatus === 'arrived' && { color: '#fff' }]}>Arrived</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.statusButton,
                      editStatus === 'not_arrived' && styles.statusButtonActive,
                      { backgroundColor: editStatus === 'not_arrived' ? '#e74c3c' : '#ecf0f1' }
                    ]}
                    onPress={() => setEditStatus('not_arrived')}
                  >
                    <Text style={[styles.statusButtonText, editStatus === 'not_arrived' && { color: '#fff' }]}>Not Arrived</Text>
                  </TouchableOpacity>
                </View>

                {/* Mark as Free Option */}
                {editStatus === 'not_arrived' && (
                  <TouchableOpacity
                    style={[styles.markFreeButton, editStatus === 'free' && styles.markFreeButtonActive]}
                    onPress={() => setEditStatus('free')}
                  >
                    <Ionicons name="notifications-off-outline" size={18} color="#fff" />
                    <Text style={styles.markFreeButtonText}>Mark Class as Free</Text>
                  </TouchableOpacity>
                )}
                {editStatus === 'free' && (
                  <View style={styles.freeStatusInfo}>
                    <Ionicons name="checkmark-circle" size={18} color="#27ae60" />
                    <Text style={styles.freeStatusText}>Class marked as Free</Text>
                  </View>
                )}
              </View>
            )}

            <TouchableOpacity style={styles.submitButton} onPress={handleSaveSlot}>
              <Text style={styles.submitButtonText}>
                {userRole === 'cr' ? 'Save Status' : 'Save Class'}
              </Text>
            </TouchableOpacity>

            {facultyClasses.length === 0 && (
              <View style={styles.classesHint}>
                <Text style={styles.classesHintText}>
                  No classes assigned to you. Please contact administrator.
                </Text>
              </View>
            )}



            {timetable[selectedSlot?.key] && (
              <TouchableOpacity style={styles.deleteButtonModal} onPress={handleDeleteSlot}>
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
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#7f8c8d',
  },
  editControls: {
    backgroundColor: '#ffffff',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#ecf0f1',
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#3498db',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  editButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ffffff',
    marginLeft: 8,
  },
  editActionsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#e74c3c',
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#e74c3c',
    marginLeft: 6,
  },
  saveButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#27ae60',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  saveButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ffffff',
    marginLeft: 6,
  },
  timetableWrapper: {
    flex: 1,
    padding: 12,
    justifyContent: 'center',
  },
  timetableContainer: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#bdc3c7',
    borderRadius: 8,
    overflow: 'hidden',
  },
  headerRow: {
    flexDirection: 'row',
    borderBottomWidth: 2,
    borderBottomColor: '#34495e',
  },
  cornerCell: {
    flex: 1.2,
    backgroundColor: '#34495e',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 8,
    borderRightWidth: 1,
    borderRightColor: '#ffffff',
  },
  cornerText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#ffffff',
    textAlign: 'center',
  },
  periodHeaderCell: {
    flex: 1,
    backgroundColor: '#34495e',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 8,
    borderRightWidth: 1,
    borderRightColor: '#ffffff',
  },
  periodHeaderText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#ffffff',
    textAlign: 'center',
  },
  dataRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#bdc3c7',
  },
  dayNameCell: {
    flex: 1.2,
    backgroundColor: '#ecf0f1',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 12,
    borderRightWidth: 1,
    borderRightColor: '#bdc3c7',
  },
  dayNameText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#2c3e50',
    textAlign: 'center',
  },
  dataCell: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 2,
    borderRightWidth: 1,
    borderRightColor: '#bdc3c7',
    backgroundColor: '#ffffff',
    minHeight: 60,
  },
  dataCellFilled: {
    backgroundColor: '#e8f4f8',
  },
  dataCellEditable: {
    borderColor: '#3498db',
    borderWidth: 1,
  },
  cellSubject: {
    fontSize: 9,
    fontWeight: '700',
    color: '#2c3e50',
    textAlign: 'center',
  },
  cellClass: {
    fontSize: 8,
    fontWeight: '600',
    color: '#7f8c8d',
    textAlign: 'center',
    marginTop: 2,
  },
  infoBox: {
    backgroundColor: '#d6eaf8',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginVertical: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  infoText: {
    fontSize: 11,
    color: '#2c3e50',
    marginLeft: 8,
    flex: 1,
    lineHeight: 16,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingVertical: 24,
    paddingHorizontal: 20,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#2c3e50',
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#2c3e50',
    marginBottom: 6,
    marginTop: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ecf0f1',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 12,
    fontSize: 14,
    color: '#2c3e50',
    backgroundColor: '#f8f9fa',
  },
  pickerContainer: {
    borderWidth: 1,
    borderColor: '#ecf0f1',
    borderRadius: 8,
    marginBottom: 12,
    backgroundColor: '#f8f9fa',
    overflow: 'hidden',
  },
  picker: {
    height: 50,
    width: '100%',
    color: '#2c3e50',
  },
  classesHint: {
    backgroundColor: '#fff3cd',
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  classesHintText: {
    fontSize: 11,
    color: '#856404',
    fontWeight: '500',
  },
  submitButton: {
    backgroundColor: '#3498db',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  submitButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#ffffff',
  },
  deleteButtonModal: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 14,
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#ecf0f1',
  },
  deleteButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#e74c3c',
    marginLeft: 6,
  },
  switchContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingVertical: 8,
    backgroundColor: '#f8f9fa',
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  switchLabel: {
    fontSize: 14,
    color: '#2c3e50',
    fontWeight: '600',
  },
  statusContainer: {
    marginTop: 8,
    marginBottom: 16,
  },
  statusTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#2c3e50',
    marginBottom: 10,
  },
  statusButtonsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  statusButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ecf0f1',
  },
  statusButtonActive: {
    // Background logic in inline style
  },
  statusButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#7f8c8d',
  },
  markFreeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#9b59b6',
    paddingVertical: 12,
    borderRadius: 8,
    gap: 8,
  },
  markFreeButtonActive: {
    backgroundColor: '#8e44ad',
  },
  markFreeButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  freeStatusInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    backgroundColor: '#edf9f0',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2ecc7130',
  },
  freeStatusText: {
    color: '#27ae60',
    fontWeight: '600',
    fontSize: 14,
  },
  dataCellArrived: {
    backgroundColor: '#eafaf1',
    borderLeftWidth: 3,
    borderLeftColor: '#27ae60',
  },
  dataCellNotArrived: {
    backgroundColor: '#fadbd8',
    borderLeftWidth: 3,
    borderLeftColor: '#e74c3c',
  },
  dataCellFree: {
    backgroundColor: '#f4f6f7',
    opacity: 0.7,
  },
});

export default TimetableScreen;
