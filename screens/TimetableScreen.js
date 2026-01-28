import { Ionicons } from '@expo/vector-icons';
import { Picker } from '@react-native-picker/picker';
import { useFocusEffect } from '@react-navigation/native';
import { useNavigation } from 'expo-router';
import { collection, collectionGroup, deleteDoc, doc, getDoc, getDocs, onSnapshot, query, setDoc, where } from 'firebase/firestore';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  Dimensions,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { auth, db } from '../firebase/firebaseConfig';
import {
  cancelAllScheduledNotificationsAsync,
  requestPermissionsAsync,
  scheduleNotificationAsync,
  setupNotificationHandler
} from '../utils/notificationHelper';

// Setup notification handler
setupNotificationHandler();

// Hyper-defensive string protection
const safe = (val, fallback = '') => {
  if (val === undefined || val === null) return fallback;
  const s = String(val).trim();
  if (s === 'undefined' || s === 'null' || s === '') return fallback;
  return s;
};

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

// Period indices 0-7 (used for mapping to slot arrays)
const PERIOD_INDICES = [0, 1, 2, 3, 4, 5, 6, 7];

const YEAR_OPTIONS = ['Year 1', 'Year 2', 'Year 3', 'Year 4'];

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Responsive Font Size Helper (Global for StyleSheet)
const getResponsiveFontSize = (size) => {
  const scale = SCREEN_WIDTH / 375; // based on standard mobile width
  return Math.round(size * scale);
};

// --- Year 1 Slots (Starts at 8:30) ---
const YEAR1_WEEKDAY_SLOTS = [
  { id: '08_30_09_30', label: '8:30–9:30', startTime: '8:30', endTime: '9:30' },
  { id: '09_30_10_30', label: '9:30–10:30', startTime: '9:30', endTime: '10:30' },
  { id: '10_30_11_30', label: '10:30–11:30', startTime: '10:30', endTime: '11:30' },
  { id: '11_30_12_30', label: '11:30–12:30', startTime: '11:30', endTime: '12:30' }, // Lunch Y1
  { id: '12_30_01_30', label: '12:30–1:30', startTime: '12:30', endTime: '1:30' },
  { id: '01_30_02_30', label: '1:30–2:30', startTime: '1:30', endTime: '2:30' },
  { id: '02_30_03_30', label: '2:30–3:30', startTime: '2:30', endTime: '3:30' },
  { id: '03_30_04_30', label: '3:30–4:30', startTime: '3:30', endTime: '4:30' }
];

const YEAR1_FRIDAY_SLOTS = [
  { id: '08_30_09_30', label: '8:30–9:30', startTime: '8:30', endTime: '9:30' },
  { id: '09_30_10_25', label: '9:30–10:25', startTime: '9:30', endTime: '10:25' },
  { id: '10_25_11_20', label: '10:25–11:20', startTime: '10:25', endTime: '11:20' },
  { id: '11_20_12_15', label: '11:20–12:15', startTime: '11:20', endTime: '12:15' },
  { id: '12_15_02_00', label: '12:15–2:00', startTime: '12:15', endTime: '2:00' }, // Lunch
  { id: '02_00_02_50', label: '2:00–2:50', startTime: '2:00', endTime: '2:50' },
  { id: '02_50_03_40', label: '2:50–3:40', startTime: '2:50', endTime: '3:40' },
  { id: '03_40_04_30', label: '3:40–4:30', startTime: '3:40', endTime: '4:30' }
];

// --- Year 2, 3, 4 Slots (Starts at 9:30) ---
const YEAR24_WEEKDAY_SLOTS = [
  { id: '09_30_10_30', label: '9:30–10:30', startTime: '9:30', endTime: '10:30' },
  { id: '10_30_11_30', label: '10:30–11:30', startTime: '10:30', endTime: '11:30' },
  { id: '11_30_12_30', label: '11:30–12:30', startTime: '11:30', endTime: '12:30' },
  { id: '12_30_01_30', label: '12:30–1:30', startTime: '12:30', endTime: '1:30' }, // Lunch Y2-4
  { id: '01_30_02_30', label: '1:30–2:30', startTime: '1:30', endTime: '2:30' },
  { id: '02_30_03_30', label: '2:30–3:30', startTime: '2:30', endTime: '3:30' },
  { id: '03_30_04_30', label: '3:30–4:30', startTime: '3:30', endTime: '4:30' }
];

const YEAR24_FRIDAY_SLOTS = [
  { id: '09_30_10_25', label: '9:30–10:25', startTime: '9:30', endTime: '10:25' },
  { id: '10_25_11_20', label: '10:25–11:20', startTime: '10:25', endTime: '11:20' },
  { id: '11_20_12_15', label: '11:20–12:15', startTime: '11:20', endTime: '12:15' },
  { id: '12_15_02_00', label: '12:15–2:00', startTime: '12:15', endTime: '2:00' }, // Lunch
  { id: '02_00_02_50', label: '2:00–2:50', startTime: '2:00', endTime: '2:50' },
  { id: '02_50_03_40', label: '2:50–3:40', startTime: '2:50', endTime: '3:40' },
  { id: '03_40_04_30', label: '3:40–4:30', startTime: '3:40', endTime: '4:30' }
];

const getTimeSlotsForDay = (day, year) => {
  const isYear1 = year === 'Year 1';
  if (day === 'Friday') {
    return isYear1 ? YEAR1_FRIDAY_SLOTS : YEAR24_FRIDAY_SLOTS;
  }
  return isYear1 ? YEAR1_WEEKDAY_SLOTS : YEAR24_WEEKDAY_SLOTS;
};

const IS_LUNCH_SLOT = (day, slotId, year) => {
  const isYear1 = year === 'Year 1';
  if (day === 'Friday') return slotId === '12_15_02_00';
  return isYear1 ? slotId === '11_30_12_30' : slotId === '12_30_01_30';
};

const TimetableScreen = () => {
  const navigation = useNavigation();
  const { width: screenWidth } = useWindowDimensions();

  // Responsive Grid Constants
  const DAY_COLUMN_WIDTH = screenWidth * 0.18; // 18% of screen for day names
  const MIN_SLOT_WIDTH = 100; // Minimum width for a time slot
  const GRID_PADDING = 16;
  const AVAILABLE_WIDTH = screenWidth - (GRID_PADDING * 2) - DAY_COLUMN_WIDTH;

  // Calculate slot width based on available space and typical number of slots (7-8)
  const SLOT_WIDTH = Math.max(MIN_SLOT_WIDTH, AVAILABLE_WIDTH / 7);


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
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [editSubject, setEditSubject] = useState(null);
  const [editClass, setEditClass] = useState('Year 1');
  const [userRole, setUserRole] = useState(null);
  const [userClass, setUserClass] = useState(null);
  const [userDepartment, setUserDepartment] = useState(null);
  const [facultyName, setFacultyName] = useState('');
  const [facultyClasses, setFacultyClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [availableDepartments, setAvailableDepartments] = useState([]);
  const listenersRef = useRef([]);

  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [editDepartment, setEditDepartment] = useState(null);
  const [userCollegeId, setUserCollegeId] = useState(null);
  const [showYearDropdown, setShowYearDropdown] = useState(false);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [statusOptions] = useState(['Faculty Arrived', 'Faculty Not Arrived', 'Late']);
  const [todayDateStr, setTodayDateStr] = useState('');

  useEffect(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    setTodayDateStr(`${y}-${m}-${d}`);
  }, []);

  useEffect(() => {
    loadUserRoleAndTimetable();
    return () => {
      if (listenersRef.current) {
        listenersRef.current.forEach(unsub => unsub());
      }
    };
  }, []);

  useEffect(() => {
    console.log(`[Timetable] editClass changed to: "${editClass}", Type: ${typeof editClass}`);
  }, [editClass]);

  const fetchAvailableDepartments = async (collegeId) => {
    if (!collegeId) return;
    try {
      const deptsRef = collection(db, 'colleges', collegeId, 'departments');
      const deptsSnapshot = await getDocs(query(deptsRef, where('isActive', '==', true)));
      const deptsList = deptsSnapshot.docs.map(d => {
        const data = d.data();
        const deptName = safe(data.name || data.departmentName || d.id, 'Unknown');
        return {
          id: d.id,
          name: deptName,
          code: getDepartmentCode(deptName, d.id)
        };
      }).filter(d => d.name !== 'undefined' && d.id !== 'undefined');

      console.log(`[Timetable] Loaded ${deptsList.length} legitimate departments.`);
      setAvailableDepartments(deptsList);
    } catch (error) {
      console.error('Error fetching available departments:', error);
    }
  };

  const getDepartmentCode = (deptName, deptId) => {
    const sName = safe(deptName, null);
    const sId = safe(deptId, null);

    if (!sName) return sId || 'GEN';
    const name = sName.toLowerCase();
    if (name.includes('computer science') || name.includes('cse')) return 'CSE';
    if (name.includes('information technology') || name.includes('it')) return 'IT';
    if (name.includes('electronics') || name.includes('ece') || name.includes('communication')) return 'ECE';
    if (name.includes('electrical') || name.includes('eee')) return 'EEE';
    if (name.includes('mechanical') || name.includes('mech')) return 'MECH';
    if (name.includes('civil')) return 'CIVIL';
    if (name.includes('artificial intelligence') || name.includes('ai')) return 'AI/ML';
    if (name.includes('data science')) return 'DS';
    return sId || sName.split(' ')[0].toUpperCase();
  };

  const normalizeYearName = (year) => {
    if (!year) return null;
    const s = String(year).trim();
    if (s === 'undefined' || s === 'null' || s === '') return null;

    const y = s.toLowerCase().replace(/_/g, ' '); // year_1 -> year 1
    if (y === 'year 1' || y.includes('year 1') || y === '1' || y === 'first year') return 'Year 1';
    if (y === 'year 2' || y.includes('year 2') || y === '2' || y === 'second year') return 'Year 2';
    if (y === 'year 3' || y.includes('year 3') || y === '3' || y === 'third year') return 'Year 3';
    if (y === 'year 4' || y.includes('year 4') || y === '4' || y === 'fourth year') return 'Year 4';

    // Handle 'year1' (no space)
    if (y.includes('year1')) return 'Year 1';
    if (y.includes('year2')) return 'Year 2';
    if (y.includes('year3')) return 'Year 3';
    if (y.includes('year4')) return 'Year 4';

    return null; // Strict: Return null if no match found
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

      const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
      if (userDoc.exists()) {
        const userData = userDoc.data();
        let role = userData.role === 'class_representative' ? 'cr' : 'faculty';
        let year = normalizeYearName(userData.year);
        let name = safe(userData.name, '');
        let collegeId = safe(userData.collegeId, null);
        let yearFromDb = safe(userData.year, null);
        let deptFromDb = safe(userData.departmentName || userData.department, 'GEN');
        let deptIdFromDb = safe(userData.departmentCode || userData.departmentId, 'GEN');

        if (role === 'faculty') {
          const facultyDoc = await getDoc(doc(db, 'faculty', currentUser.uid));
          if (facultyDoc.exists()) {
            const fData = facultyDoc.data();
            deptFromDb = fData.departmentName || fData.department || deptFromDb;
            deptIdFromDb = fData.departmentCode || fData.departmentId || deptIdFromDb;
            name = safe(fData.name, name);
            collegeId = safe(fData.collegeId, collegeId);
          }
        }

        const finalDeptCode = getDepartmentCode(deptFromDb, deptIdFromDb);
        const finalYear = normalizeYearName(yearFromDb);

        console.log(`[Timetable] SANITIZED -> Role: ${role}, Dept: ${finalDeptCode}, Year: ${finalYear}, College: ${collegeId}`);

        if (collegeId) {
          await fetchAvailableDepartments(collegeId);
        } else {
          console.warn('[Timetable] No collegeId found for user. Available departments list will be limited.');
          // Fallback: use user's own department as the only option
          setAvailableDepartments([{ id: 'default', name: finalDeptCode || 'My Department', code: finalDeptCode || 'GEN' }]);
        }

        setUserRole(role);
        setUserDepartment(finalDeptCode);
        setUserClass(finalYear);
        setFacultyName(name);
        setUserCollegeId(collegeId);

        if (role === 'faculty') {
          setFacultyClasses(YEAR_OPTIONS);
          loadFullTimetable(finalDeptCode, YEAR_OPTIONS, 'faculty', currentUser.uid, collegeId);
        } else {
          // STRICT: For CR, if year is missing, we must NOT default to Year 1 silently.
          // However, for the grid to load anything, we need a value.
          const normYear = finalYear || 'Year 1';
          if (!finalYear) {
            console.error('[Timetable] CR year could not be normalized:', yearFromDb);
          }
          setUserClass(normYear);
          // FORCE locked view for CR
          loadFullTimetable(finalDeptCode, [normYear], 'cr', currentUser.uid, collegeId);
        }
        setLoading(false);
        return;
      }
      setLoading(false);
    } catch (error) {
      console.error('Error loading user role:', error);
      Alert.alert('Error', 'Failed to load timetable settings');
      setLoading(false);
    }
  };

  const scheduleNotifications = async (timetableData) => {
    try {
      await cancelAllScheduledNotificationsAsync();
      const { status } = await requestPermissionsAsync();
      if (status !== 'granted') return;

      const weeksToSchedule = 4;
      Object.values(timetableData).forEach(entry => {
        if (entry.facultyId === auth.currentUser.uid && entry.isPrimary) {
          const dayIndex = DAYS.indexOf(entry.day);
          if (dayIndex === -1) return;

          const startTimeVal = entry.startTime;
          if (!startTimeVal) return;

          const [hours, minutes] = startTimeVal.split(':').map(Number);

          for (let week = 0; week < weeksToSchedule; week++) {
            const now = new Date();
            let daysToAdd = (dayIndex + 1) - now.getDay();
            if (daysToAdd <= 0) daysToAdd += 7;
            daysToAdd += (week * 7);

            const targetDate = new Date();
            targetDate.setDate(now.getDate() + daysToAdd);
            targetDate.setHours(hours, minutes - 5, 0, 0);

            if (targetDate > now) {
              const triggerSeconds = Math.floor((targetDate.getTime() - Date.now()) / 1000);
              if (triggerSeconds > 0) {
                scheduleNotificationAsync({
                  content: {
                    title: 'Upcoming Class',
                    body: `You have ${entry.subjectName} in Class ${entry.year} starting at ${startTimeVal}`,
                    data: { ...entry },
                  },
                  trigger: {
                    type: 'timeInterval',
                    seconds: triggerSeconds,
                    repeats: false,
                  },
                });
              }
            }
          }
        }
      });
    } catch (error) {
      console.error('Error scheduling notifications:', error);
    }
  };

  const loadFullTimetable = (department, years, role, uid, collegeId) => {
    try {
      listenersRef.current.forEach(unsub => unsub());
      listenersRef.current = [];

      if (role === 'faculty') {
        const slotsGroupRef = collectionGroup(db, 'slots');

        // Final combined results map
        const resultsRef = { own: {}, placeholders: {} };

        const updateState = () => {
          setTimetable({ ...resultsRef.placeholders, ...resultsRef.own });
        };

        // LISTENER 1: Authoritative - Everything I created (any college/dept)
        // Works even if collegeId/role is missing in old data
        const ownQuery = query(slotsGroupRef, where('facultyId', '==', uid));
        const unsubOwn = onSnapshot(ownQuery, (snapshot) => {
          const combined = {};
          snapshot.docs.forEach(doc => {
            const data = doc.data();
            const slotId = doc.id;
            const pathParts = doc.ref.path.split('/');
            const d = data.day || pathParts[3];
            combined[`${d}-${slotId}`] = {
              ...data,
              day: d,
              slotId,
              year: data.year || pathParts[2],
              department: data.department || pathParts[1]
            };
          });
          resultsRef.own = combined;
          updateState();
        });

        // LISTENER 2: Placeholders - Everything in my college created by Reps
        let unsubPlaceholders = () => { };
        if (collegeId) {
          const placeholderQuery = query(slotsGroupRef, where('collegeId', '==', collegeId));
          unsubPlaceholders = onSnapshot(placeholderQuery, (snapshot) => {
            const combined = {};
            snapshot.docs.forEach(doc => {
              const data = doc.data();
              // Only pull in Rep placeholders here
              if (data.createdByRole === 'rep') {
                const slotId = doc.id;
                const pathParts = doc.ref.path.split('/');
                const d = data.day || pathParts[3];
                combined[`${d}-${slotId}`] = {
                  ...data,
                  day: d,
                  slotId,
                  year: data.year || pathParts[2],
                  department: data.department || pathParts[1]
                };
              }
            });
            resultsRef.placeholders = combined;
            updateState();
          });
        }

        listenersRef.current.push(unsubOwn, unsubPlaceholders);
      } else {
        // --- REPRESENTATIVE VIEW: DUAL STREAM ---
        const streams = { global: {}, private: {} };

        const updateRepState = () => {
          // Merge: Global (Faculty) always overrides Private (Rep)
          const merged = { ...streams.private, ...streams.global };
          setTimetable(merged);
        };

        // STREAM 1: Global Faculty Data (Listen to dept/year/day)
        years.forEach(year => {
          DAYS.forEach(day => {
            const slotsColRef = collection(db, 'timetable', department, year, day, 'slots');
            const unsubGlobal = onSnapshot(slotsColRef, (snapshot) => {
              snapshot.docs.forEach(doc => {
                const slotId = doc.id;
                const data = doc.data();
                streams.global[`${day}-${slotId}`] = {
                  ...data,
                  day,
                  slotId,
                  year,
                  department: department
                };
              });
              updateRepState();
            });
            listenersRef.current.push(unsubGlobal);
          });
        });

        // STREAM 2: Private Representative Data (Listen to personal placeholders)
        const privateRef = collection(db, 'users', uid, 'repPlaceholders');
        const unsubPrivate = onSnapshot(privateRef, (snapshot) => {
          streams.private = {}; // Reset private to handle deletions correctly
          snapshot.docs.forEach(doc => {
            const data = doc.data();
            const slotKey = doc.id; // Format in DB: 'Monday-08_30_09_30'
            streams.private[slotKey] = {
              ...data,
              isPrivate: true // Marker for UI
            };
          });
          updateRepState();
        });
        listenersRef.current.push(unsubPrivate);
      }
    } catch (error) {
      console.error('❌ Error setting up timetable listeners:', error);
    }
  };

  const isSlotValidForYear = (day, slotId, year) => {
    const slots = getTimeSlotsForDay(day, year);
    return slots.some(s => s.id === slotId);
  };

  const handleSlotPress = (day, timeSlot) => {
    const slotKey = `${day}-${timeSlot.id}`;
    const entry = timetable[slotKey];
    const isOwnEntry = entry?.facultyId === auth.currentUser.uid;

    if (userRole === 'cr') {
      // Rep can edit empty slots OR slots created by ANY Representative
      // NEW: Rep can MARK STATUS for faculty entries
      if (entry && entry.subjectName && entry.createdByRole === 'faculty') {
        setSelectedSlot({ day, timeSlot, key: slotKey, entry });
        setShowStatusModal(true);
        return;
      }
    }

    if (userRole === 'faculty') {
      // Faculty can modify ANY slot, including other faculty or rep entries.
      // We removed the previous blocking for other faculty's entries to satisfy "modify data in any slot".
    }

    setSelectedSlot({ day, timeSlot, key: slotKey });

    // Populate Modal


    // Populate Modal
    if (userRole === 'faculty') {
      const isPlaceholder = entry?.createdByRole === 'rep';
      const isFacultyEntry = entry?.createdByRole === 'faculty';
      const isEditMode = (isOwnEntry || isPlaceholder || isFacultyEntry) && entry;

      let nextSubject = '';
      let nextClass = null;
      let nextDept = null;

      if (isEditMode) {
        // Editing existing entry
        nextSubject = entry.subjectName || '';
        // Normalize year to ensure it matches 'Year 1'...'Year 4' options
        // Strict normalization: force null if unknown
        nextClass = normalizeYearName(entry.year) || 'Year 1';

        nextDept = entry.department || null;
      } else {
        // New Entry initialization
        nextSubject = '';
        nextClass = 'Year 1'; // Default to Year 1

        // Auto-select department ONLY if it exists in the admin-enabled list
        const myDeptExists = availableDepartments.find(d => d.code === userDepartment);
        nextDept = myDeptExists ? userDepartment : null;
      }

      setEditSubject(nextSubject);
      setEditClass(nextClass);

      // Strict: Only set dept if we found a match, otherwise null.
      setEditDepartment(nextDept);

      console.log(`[Timetable] MODAL START -> Dept: "${nextDept}", Year: "${nextClass}", Type: ${typeof nextClass}`);
    } else {
      // Rep adding or editing a Representative entry
      setEditSubject(entry?.subjectName || '');
      // STRICT: For a Rep, editClass MUST be their assigned year
      const repYear = userClass || 'Year 1';
      setEditClass(repYear);
      setEditDepartment(userDepartment || 'GEN');
      console.log(`[Timetable] REP MODAL START -> Dept: "${userDepartment}", Year: "${repYear}", Editing: ${!!entry?.subjectName}`);
    }

    setStartTime(timeSlot.startTime);
    setEndTime(timeSlot.endTime);
    setShowEditModal(true);
  };

  const handleSaveSlot = async (forceOverwrite = false) => {
    if (!editSubject || !editSubject.trim()) {
      Alert.alert('Error', 'Please enter subject name');
      return;
    }
    if (!editClass) {
      Alert.alert('Error', 'Please select a class/year');
      return;
    }
    if (!editDepartment) {
      Alert.alert('Error', 'Please select a department');
      return;
    }

    try {
      setLoading(true);
      const slotId = selectedSlot.timeSlot.id; // snake_case like '08_30_09_30'
      const day = selectedSlot.day;
      const year = normalizeYearName(editClass);
      const targetDept = editDepartment.trim().toUpperCase();

      // --- Year-Specific System Rules ---

      // 1. Check if the slot even exists for this year (e.g. 8:30 doesn't exist for Y2-4)
      if (!isSlotValidForYear(day, slotId, year)) {
        setLoading(false);
        Alert.alert('Invalid Time', `${year} classes only start from 9:30 AM.`);
        return;
      }

      // 2. Lunch Break Check (ONLY for non-faculty)
      if (userRole !== 'faculty' && IS_LUNCH_SLOT(day, slotId, year)) {
        setLoading(false);
        Alert.alert('System Rule', `This time slot is reserved for ${year} Lunch Break and cannot be edited.`);
        return;
      }

      // Ensure parent department document exists (MANDATORY for list visibility)
      const deptDocRef = doc(db, 'timetable', targetDept);
      await setDoc(deptDocRef, { name: targetDept, lastUpdated: new Date().toISOString() }, { merge: true });

      // MANDATORY Path: timetable/{dept}/{year}/{day}/slots/{slotId}
      const docRef = doc(db, 'timetable', targetDept, year, day, 'slots', slotId);

      const existingDoc = await getDoc(docRef);
      const existingData = existingDoc.exists() ? existingDoc.data() : null;

      // --- PERMISSION & CONFLICT CHECK ---
      if (existingData) {
        if (userRole === 'cr' && existingData.createdByRole === 'faculty') {
          setLoading(false);
          Alert.alert('Access Denied', 'Year Representatives cannot modify faculty-added entries.');
          return;
        }

        // Faculty can overwrite any slot; conflict alerts are removed per requirement.
      }

      // --- PREPARE DATA ---
      let secondaryEntries = existingData?.secondaryEntries || [];

      // If replacing another faculty's entry, move current primary to secondary
      if (forceOverwrite && existingData && existingData.facultyId !== auth.currentUser.uid) {
        secondaryEntries.push({
          subjectName: existingData.subjectName,
          facultyId: existingData.facultyId,
          facultyName: existingData.facultyName,
          timeSlot: existingData.timeSlot,
          isPrimary: false,
          replacedAt: new Date().toISOString()
        });
      }

      const slotData = {
        subjectName: editSubject.trim(),
        facultyId: userRole === 'faculty' ? auth.currentUser.uid : null,
        facultyName: userRole === 'faculty' ? facultyName : 'Representative (Private)',
        timeSlot: selectedSlot.timeSlot.label,
        isPrimary: true,
        year: year,
        day: day,
        slotId: slotId,
        startTime: selectedSlot.timeSlot.startTime,
        endTime: selectedSlot.timeSlot.endTime,
        createdAt: existingData?.createdAt || new Date().toISOString(),
        lastUpdatedAt: new Date().toISOString(),
        secondaryEntries: secondaryEntries,
        createdByRole: userRole === 'cr' ? 'rep' : 'faculty',
        department: targetDept,
        collegeId: userCollegeId
      };

      if (userRole === 'cr') {
        // Save to PERSONAL path for Representative
        const personalDocRef = doc(db, 'users', auth.currentUser.uid, 'repPlaceholders', `${day}-${slotId}`);
        await setDoc(personalDocRef, slotData);
      } else {
        // Save to GLOBAL path for Faculty
        await setDoc(docRef, slotData);
      }

      setShowEditModal(false);
      setLoading(false);
      Alert.alert('Success', userRole === 'cr' ? 'Personal placeholder added.' : 'Timetable updated successfully.');

      // Sync local state temporarily if needed, though onSnapshot will catch it
      scheduleNotifications({ ...timetable, [selectedSlot.key]: slotData });
    } catch (error) {
      console.error('❌ Error saving slot:', error);
      Alert.alert('Error', 'Failed to save timetable slot.');
      setLoading(false);
    }
  };

  const handleDeleteSlot = () => {
    const { key } = selectedSlot;
    const entry = timetable[key];

    // Permission check for delete
    if (userRole === 'cr' && entry?.createdByRole === 'faculty') {
      Alert.alert('Permission Denied', 'Year Representatives cannot delete Faculty entries.');
      return;
    }

    // Faculty can delete any slot now

    Alert.alert(
      'Delete Entry',
      'Are you sure you want to delete this entry?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          onPress: async () => {
            try {
              setLoading(true);
              const { day, timeSlot } = selectedSlot;
              const slotId = timeSlot.id;
              const year = normalizeYearName(entry?.year);

              if (!year) throw new Error('Year context lost');

              if (userRole === 'cr') {
                // Delete from personal path
                const personalDocRef = doc(db, 'users', auth.currentUser.uid, 'repPlaceholders', `${day}-${slotId}`);
                await deleteDoc(personalDocRef);
              } else {
                // MANDATORY Path: timetable/{dept}/{year}/{day}/slots/{slotId}
                const targetDept = entry?.department || userDepartment;
                const docRef = doc(db, 'timetable', targetDept, year, day, 'slots', slotId);
                await deleteDoc(docRef);
              }

              setShowEditModal(false);
              setLoading(false);
              Alert.alert('Success', 'Entry removed.');
            } catch (error) {
              console.error('❌ Error deleting slot:', error);
              Alert.alert('Error', 'Failed to delete slot.');
              setLoading(false);
            }
          },
          style: 'destructive',
        },
      ]
    );
  };

  const handleSaveStatus = async (status) => {
    try {
      setLoading(true);
      const { day, timeSlot, entry } = selectedSlot;
      const slotId = timeSlot.id;
      const targetDept = entry.department || userDepartment;
      const year = normalizeYearName(entry.year);

      const docRef = doc(db, 'timetable', targetDept, year, day, 'slots', slotId);

      await setDoc(docRef, {
        classStatus: status,
        date: todayDateStr,
        facultyId: entry.facultyId || null,
        department: targetDept,
        year: year,
        time: timeSlot.label,
        statusMarkedAt: new Date().toISOString(),
        statusMarkedBy: auth.currentUser.uid
      }, { merge: true });

      setShowStatusModal(false);
      setLoading(false);
      Alert.alert('Success', `Class status updated to: ${status}`);
    } catch (error) {
      console.error('❌ Error saving status:', error);
      Alert.alert('Error', 'Failed to update class status.');
      setLoading(false);
    }
  };

  const renderDayRow = (day, timeSlots, contextYear, showDayLabel = true) => {
    return (
      <View key={day} style={styles.dataRow}>
        {showDayLabel && (
          <View style={[styles.dayNameCell, { width: DAY_COLUMN_WIDTH }]}>
            <Text style={styles.dayNameText}>{day.substring(0, 3).toUpperCase()}</Text>
          </View>
        )}

        {timeSlots.map((slot) => {
          const slotKey = `${day}-${slot.id}`;
          const rawData = timetable[slotKey];

          // Faculty Isolation: Only see relevant entries (filtered in state)
          const classData = rawData;

          const hasSecondary = classData?.secondaryEntries?.length > 0;

          // Lunch check needs the specific year context
          // Only apply visually for Year Reps
          const isLunch = (userRole === 'cr' && contextYear) ? IS_LUNCH_SLOT(day, slot.id, contextYear) : false;

          return (
            <TouchableOpacity
              key={slotKey}
              activeOpacity={isLunch ? 1 : 0.7}
              style={[
                styles.dataCell,
                { width: SLOT_WIDTH },
                classData && styles.dataCellFilled,
                classData?.isPrimary && styles.dataCellPrimary,
                userRole === 'faculty' && classData && styles.facultyOwnCell,
                isLunch && styles.lunchBreakCell
              ]}
              onPress={() => !isLunch && handleSlotPress(day, slot)}
            >
              {isLunch ? (
                <Text style={styles.lunchBreakText}>Lunch{'\n'}Break</Text>
              ) : (
                <>
                  {userRole === 'faculty' ? (
                    <>
                      {classData?.year && (
                        <Text style={styles.cellYearText}>
                          {classData.year} {classData.createdByRole === 'rep' ? '(P)' : ''}
                        </Text>
                      )}
                      {classData?.subjectName && (
                        <Text style={styles.cellSubjectDisplay} numberOfLines={2}>
                          {classData.subjectName}
                        </Text>
                      )}
                    </>
                  ) : (
                    <>
                      {classData?.subjectName && (
                        <Text style={styles.cellSubjectDisplayRep} numberOfLines={2}>
                          {classData.subjectName}
                        </Text>
                      )}
                      {classData?.facultyName && (
                        <Text style={styles.cellFaculty} numberOfLines={2}>
                          {classData.facultyName}
                        </Text>
                      )}
                      {classData?.classStatus && (
                        <View style={[
                          styles.statusBadge,
                          { backgroundColor: classData.classStatus === 'Faculty Arrived' ? '#10B981' : classData.classStatus === 'Faculty Not Arrived' ? '#EF4444' : '#8B5CF6' }
                        ]}>
                          <Text style={styles.statusBadgeText}>{classData.classStatus}</Text>
                        </View>
                      )}
                    </>
                  )}
                </>
              )}

              {hasSecondary && userRole === 'faculty' && !isLunch && (
                <View style={styles.secondaryIndicator}>
                  <Ionicons name="layers-outline" size={10} color="#6366f1" />
                  <Text style={styles.secondaryText}>+{classData.secondaryEntries.length}</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    );
  };

  const renderTimetableGrid = () => {
    const mondayToThursday = DAYS.slice(0, 4);

    // Determine which slot definitions to use for headers and rows
    let weekdaySlots, fridaySlots, viewerYear;

    if (userRole === 'cr') {
      viewerYear = userClass;
      weekdaySlots = getTimeSlotsForDay('Monday', viewerYear);
      fridaySlots = getTimeSlotsForDay('Friday', viewerYear);
    } else {
      // Faculty view: show all 8 slots from Year 1 range to act as master grid
      viewerYear = 'Year 1';
      weekdaySlots = YEAR1_WEEKDAY_SLOTS;
      fridaySlots = YEAR1_FRIDAY_SLOTS;
    }

    return (
      <View style={styles.timetableContainer}>
        <View style={{ flexDirection: 'row' }}>
          {/* FIXED DAY COLUMN */}
          <View style={{ width: DAY_COLUMN_WIDTH, borderRightWidth: 1, borderRightColor: '#E2E8F0', backgroundColor: '#F8FAFC' }}>
            {/* MON-THU SECTION */}
            <View style={[styles.sectionHeader, { width: DAY_COLUMN_WIDTH, height: 38 }]}>
              <Text style={[styles.sectionHeaderText, { opacity: 0 }]}>FIX</Text>
            </View>
            <View style={[styles.timeRowHeader, { width: DAY_COLUMN_WIDTH, height: 44, borderRightWidth: 0 }]}>
              <View style={[styles.cornerCellBlank, { width: DAY_COLUMN_WIDTH, height: '100%' }]} />
            </View>
            {mondayToThursday.map(day => (
              <View key={`label-${day}`} style={[styles.dayNameCell, { width: DAY_COLUMN_WIDTH, height: 91, borderRightWidth: 0, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' }]}>
                <Text style={styles.dayNameText}>{day.substring(0, 3).toUpperCase()}</Text>
              </View>
            ))}

            {/* FRIDAY SECTION */}
            <View style={[styles.sectionHeader, { width: DAY_COLUMN_WIDTH, height: 38 }]}>
              <Text style={[styles.sectionHeaderText, { opacity: 0 }]}>FIX</Text>
            </View>
            <View style={[styles.timeRowHeader, { width: DAY_COLUMN_WIDTH, height: 44, borderRightWidth: 0 }]}>
              <View style={[styles.cornerCellBlank, { width: DAY_COLUMN_WIDTH, height: '100%' }]} />
            </View>
            <View style={[styles.dayNameCell, { width: DAY_COLUMN_WIDTH, height: 91, borderRightWidth: 0, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' }]}>
              <Text style={styles.dayNameText}>FRI</Text>
            </View>
          </View>

          {/* SCROLLABLE SLOTS */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View>
              {/* MON-THU Section Header */}
              <View style={[styles.sectionHeader, { height: 38 }]}>
                <Text style={styles.sectionHeaderText}>MONDAY – THURSDAY</Text>
              </View>
              <View style={[styles.timeRowHeader, { height: 44 }]}>
                {weekdaySlots.map(slot => (
                  <View key={slot.id} style={[styles.timeHeaderCell, { width: SLOT_WIDTH }]}>
                    <Text style={styles.timeHeaderText}>{slot.label}</Text>
                  </View>
                ))}
              </View>
              {mondayToThursday.map(day => renderDayRow(day, weekdaySlots, viewerYear, false))}

              {/* FRIDAY Section Header */}
              <View style={[styles.sectionHeader, { height: 38 }]}>
                <Text style={styles.sectionHeaderText}>FRIDAY</Text>
              </View>
              <View style={[styles.timeRowHeader, { height: 44 }]}>
                {fridaySlots.map(slot => (
                  <View key={slot.id} style={[styles.timeHeaderCell, { width: SLOT_WIDTH }]}>
                    <Text style={styles.timeHeaderText}>{slot.label}</Text>
                  </View>
                ))}
              </View>
              {renderDayRow('Friday', fridaySlots, viewerYear, false)}
            </View>
          </ScrollView>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={24} color="#0F172A" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Timetable</Text>
        <View style={styles.headerRight}>
          <Text style={styles.deptBadge}>{userRole === 'faculty' ? 'Faculty' : 'Year Rep'}</Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3B82F6" />
          <Text style={styles.loadingText}>Syncing Schedule...</Text>
        </View>
      ) : (
        <>
          <View style={styles.timetableWrapper}>
            {renderTimetableGrid()}
          </View>

          <View style={styles.infoBox}>
            <Ionicons name="information-circle" size={24} color="#3B82F6" />
            <Text style={styles.infoText}>
              {userRole === 'faculty'
                ? 'Authorized Access. You can add or modify subjects in any slot (Faculty or Rep).'
                : 'Showing your locked department schedule. You can add to empty slots or edit Representative entries.'}
            </Text>
          </View>
        </>
      )}

      <Modal visible={showStatusModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Mark Class Status</Text>
              <TouchableOpacity onPress={() => setShowStatusModal(false)}>
                <Ionicons name="close-circle" size={32} color="#64748B" />
              </TouchableOpacity>
            </View>

            <View style={styles.statusInfo}>
              <Text style={styles.statusInfoHeader}>{selectedSlot?.entry?.subjectName}</Text>
              <Text style={styles.statusInfoSub}>{selectedSlot?.entry?.facultyName}</Text>
            </View>

            <Text style={styles.inputLabel}>Select Arrival Status</Text>
            <View style={styles.statusOptionsContainer}>
              {statusOptions.map((status) => (
                <TouchableOpacity
                  key={status}
                  style={[
                    styles.statusOptionButton,
                    selectedSlot?.entry?.classStatus === status && styles.statusOptionButtonSelected
                  ]}
                  onPress={() => handleSaveStatus(status)}
                >
                  <Text style={[
                    styles.statusOptionText,
                    selectedSlot?.entry?.classStatus === status && styles.statusOptionTextSelected
                  ]}>{status}</Text>
                  {selectedSlot?.entry?.classStatus === status && (
                    <Ionicons name="checkmark-circle" size={20} color="#2563EB" />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showEditModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {selectedSlot ? `${selectedSlot.day} - ${selectedSlot.timeSlot.label}` : 'Slot Details'}
              </Text>
              <TouchableOpacity onPress={() => setShowEditModal(false)}>
                <Ionicons name="close-circle" size={32} color="#64748B" />
              </TouchableOpacity>
            </View>

            <Text style={styles.inputLabel}>Subject Name *</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g., Artificial Intelligence"
              value={editSubject || ''}
              onChangeText={setEditSubject}
              placeholderTextColor="#94A3B8"
            />

            {/* Picker Section */}

            <Text style={styles.inputLabel}>Department *</Text>
            <View style={[styles.pickerContainer, userRole === 'cr' && styles.disabledInput]}>
              {userRole === 'faculty' && availableDepartments.length === 0 ? (
                <View style={{ padding: 16 }}>
                  <Text style={{ color: '#94A3B8' }}>Loading departments...</Text>
                </View>
              ) : (
                <Picker
                  selectedValue={editDepartment !== null && availableDepartments.some(d => d.code === editDepartment) ? editDepartment : ""}
                  onValueChange={(itemValue) => {
                    const val = itemValue === "" ? null : itemValue;
                    setEditDepartment(val);
                  }}
                  style={styles.picker}
                  enabled={userRole === 'faculty'}
                >
                  <Picker.Item label={editDepartment ? "Select Department" : "Select Department"} value="" />
                  {availableDepartments.map((dept) => (
                    <Picker.Item key={dept.id} label={safe(dept.name, 'Unknown Dept')} value={dept.code} />
                  ))}
                  {/* Fallback to prevent native picker showing 'undefined' if value is set but not in list */}
                  {editDepartment && !availableDepartments.some(d => d.code === editDepartment) && (
                    <Picker.Item label={safe(editDepartment, 'Unknown')} value={editDepartment} />
                  )}
                </Picker>
              )}
            </View>


            <Text style={styles.inputLabel}>Target Class *</Text>
            {userRole === 'faculty' ? (
              <View style={styles.customDropdownContainer}>
                <TouchableOpacity
                  style={styles.customPickerButton}
                  onPress={() => setShowYearDropdown(!showYearDropdown)}
                  disabled={userRole !== 'faculty'}
                >
                  <Text style={styles.customPickerText}>
                    {editClass || 'Year 1'}
                  </Text>
                  <Ionicons name="chevron-down" size={20} color="#64748B" />
                </TouchableOpacity>

                {showYearDropdown && (
                  <View style={styles.dropdownList}>
                    {YEAR_OPTIONS.map((year) => (
                      <TouchableOpacity
                        key={year}
                        style={[
                          styles.dropdownItem,
                          editClass === year && styles.dropdownItemSelected
                        ]}
                        onPress={() => {
                          setEditClass(year);
                          setShowYearDropdown(false);
                        }}
                      >
                        <Text style={[
                          styles.dropdownItemText,
                          editClass === year && styles.dropdownItemTextSelected
                        ]}>
                          {year}
                        </Text>
                        {editClass === year && (
                          <Ionicons name="checkmark" size={20} color="#2563EB" />
                        )}
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
            ) : (
              <View style={[styles.pickerContainer, styles.disabledInput]}>
                <View style={styles.customPickerButton}>
                  <Text style={styles.customPickerText}>
                    {editClass || userClass || 'N/A'}
                  </Text>
                </View>
              </View>
            )}

            <View style={styles.timeRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.inputLabel}>Start Time *</Text>
                <TextInput
                  style={[styles.input, styles.disabledInput]}
                  placeholder="09:00"
                  value={startTime}
                  editable={false}
                  placeholderTextColor="#94A3B8"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.inputLabel}>End Time *</Text>
                <TextInput
                  style={[styles.input, styles.disabledInput]}
                  placeholder="10:00"
                  value={endTime}
                  editable={false}
                  placeholderTextColor="#94A3B8"
                />
              </View>
            </View>

            <TouchableOpacity
              style={[
                styles.submitButton,
                (!editSubject?.trim() || !editClass || !editDepartment) && { backgroundColor: '#94A3B8' }
              ]}
              onPress={() => handleSaveSlot()}
              disabled={!editSubject?.trim() || !editClass || !editDepartment}
            >
              <Text style={styles.submitButtonText}>Confirm & Save</Text>
            </TouchableOpacity>

            {timetable[selectedSlot?.key] && userRole === 'faculty' && (
              <TouchableOpacity style={styles.deleteButtonModal} onPress={handleDeleteSlot}>
                <Ionicons name="trash-outline" size={22} color="#EF4444" />
                <Text style={styles.deleteButtonText}>Remove Entry</Text>
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
    backgroundColor: '#F8FAFC',
  },
  header: {
    backgroundColor: '#FFFFFF',
    paddingVertical: 18,
    paddingHorizontal: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    elevation: 4,
    shadowColor: '#64748B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.6,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  deptBadge: {
    backgroundColor: '#3B82F6',
    color: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 10,
    fontSize: 12,
    fontWeight: '800',
    overflow: 'hidden',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 15,
    color: '#64748B',
    fontWeight: '600',
  },
  timetableWrapper: {
    flex: 1,
    padding: 16,
  },
  timetableContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  sectionHeader: {
    backgroundColor: '#F1F5F9',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  sectionHeaderText: {
    fontSize: getResponsiveFontSize(11),
    fontWeight: '900',
    color: '#334155',
    letterSpacing: 1,
  },
  timeRowHeader: {
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  cornerCellBlank: {
    borderRightWidth: 1,
    borderRightColor: '#E2E8F0',
  },
  timeHeaderCell: {
    paddingVertical: 10,
    alignItems: 'center',
    borderRightWidth: 1,
    borderRightColor: '#E2E8F0',
    justifyContent: 'center',
  },
  timeHeaderText: {
    fontSize: getResponsiveFontSize(9),
    fontWeight: '800',
    color: '#64748B',
    textAlign: 'center',
  },
  dataRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  dayNameCell: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRightWidth: 1,
    borderRightColor: '#E2E8F0',
  },
  dayNameText: {
    fontSize: getResponsiveFontSize(11),
    fontWeight: '700',
    color: '#475569',
    textAlign: 'center',
  },
  dataCell: {
    height: 90,
    padding: 6,
    borderRightWidth: 1,
    borderRightColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  dataCellFilled: {
    backgroundColor: '#FFFFFF',
  },
  dataCellPrimary: {
    borderLeftWidth: 3,
    borderLeftColor: '#3B82F6',
  },
  facultyOwnCell: {
    backgroundColor: '#EFF6FF',
  },
  cellYearText: {
    fontSize: getResponsiveFontSize(11),
    fontWeight: '900',
    color: '#1E293B',
    marginBottom: 2,
  },
  cellSubjectDisplay: {
    fontSize: getResponsiveFontSize(10),
    fontWeight: '700',
    color: '#1E293B',
    textAlign: 'center',
  },
  cellSubjectDisplayRep: {
    fontSize: getResponsiveFontSize(11),
    fontWeight: '900',
    color: '#1E293B',
    marginBottom: 2,
    textAlign: 'center',
  },
  cellFaculty: {
    fontSize: getResponsiveFontSize(8),
    color: '#64748B',
    textAlign: 'center',
    fontWeight: '600',
  },
  secondaryIndicator: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 4,
  },
  secondaryText: {
    fontSize: 8,
    color: '#4F46E5',
    fontWeight: '700',
    marginLeft: 2,
  },
  lunchBreakCell: {
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
    borderLeftWidth: 4,
    borderLeftColor: '#64748B',
  },
  lunchBreakText: {
    fontSize: getResponsiveFontSize(9),
    fontWeight: '900',
    color: '#64748B',
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  infoBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingVertical: 18,
    paddingHorizontal: 22,
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 30,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  infoText: {
    fontSize: 13,
    color: '#334155',
    marginLeft: 14,
    flex: 1,
    lineHeight: 20,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingTop: 12,
    paddingBottom: 48,
    paddingHorizontal: 28,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 24,
    borderBottomWidth: 1.5,
    borderBottomColor: '#F1F5F9',
    marginBottom: 24,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.8,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '800',
    color: '#334155',
    marginBottom: 10,
    marginTop: 14,
  },
  input: {
    height: 56,
    borderWidth: 2,
    borderColor: '#F1F5F9',
    borderRadius: 14,
    paddingHorizontal: 18,
    fontSize: 16,
    color: '#0F172A',
    backgroundColor: '#F8FAFC',
    fontWeight: '500',
  },
  disabledInput: {
    backgroundColor: '#F1F5F9',
    borderColor: '#F1F5F9',
    color: '#94A3B8',
  },
  pickerContainer: {
    height: 56,
    borderWidth: 2,
    borderColor: '#F1F5F9',
    borderRadius: 14,
    backgroundColor: '#F8FAFC',
    overflow: 'hidden',
    justifyContent: 'center',
  },
  picker: {
    color: '#0F172A',
  },
  timeRow: {
    flexDirection: 'row',
    gap: 18,
    marginTop: 10,
  },
  submitButton: {
    backgroundColor: '#2563EB',
    borderRadius: 16,
    height: 60,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 36,
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 6,
  },
  submitButtonText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  deleteButtonModal: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 28,
    marginTop: 10,
  },
  deleteButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#EF4444',
    marginLeft: 10,
  },
  customDropdownContainer: {
    position: 'relative',
    zIndex: 1000,
  },
  customPickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 16,
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#F1F5F9',
  },
  customPickerText: {
    fontSize: 16,
    color: '#0F172A',
    fontWeight: '500',
  },
  dropdownList: {
    position: 'absolute',
    top: 60,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#E2E8F0',
    maxHeight: 200,
    zIndex: 1000,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  dropdownItemSelected: {
    backgroundColor: '#EFF6FF',
  },
  dropdownItemText: {
    fontSize: 16,
    color: '#0F172A',
    fontWeight: '500',
  },
  dropdownItemTextSelected: {
    color: '#2563EB',
    fontWeight: '700',
  },
  statusBadge: {
    marginTop: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  statusBadgeText: {
    fontSize: 8,
    color: '#FFFFFF',
    fontWeight: '800',
    textAlign: 'center',
  },
  statusInfo: {
    backgroundColor: '#F8FAFC',
    padding: 16,
    borderRadius: 12,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  statusInfoHeader: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  statusInfoSub: {
    fontSize: 14,
    color: '#64748B',
    marginTop: 2,
  },
  statusOptionsContainer: {
    gap: 12,
  },
  statusOptionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#F1F5F9',
  },
  statusOptionButtonSelected: {
    borderColor: '#2563EB',
    backgroundColor: '#EFF6FF',
  },
  statusOptionText: {
    fontSize: 16,
    color: '#334155',
    fontWeight: '600',
  },
  statusOptionTextSelected: {
    color: '#2563EB',
  },
});

export default TimetableScreen;
