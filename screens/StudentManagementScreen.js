import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { useNavigation, useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { createUserWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import { collection, deleteField, doc, getDoc, getDocs, query, serverTimestamp, setDoc, where, writeBatch } from 'firebase/firestore';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import StudentCard from '../components/StudentCard';
import { auth, db, getSecondaryAuth } from '../firebase/firebaseConfig';
import { getCurrentAcademicYear, getStudentDistribution, getYearDisplayLabel, loadAcademicYear, promoteAcademicYear } from '../utils/academicYearManager';
import { generateCRPassword } from '../utils/crManagement';

const computeCurrentYear = (joiningYear) => {
  const base = getCurrentAcademicYear();
  return Math.max(1, base - Number(joiningYear) + 1);
};

const buildYearId = (currentYear) => `year${currentYear}`;

const getYearMeta = (currentYear, globalAcademicYear = 2025) => {
  const numericYear = Number(currentYear);
  const correspondingAcademicYear = globalAcademicYear - numericYear + 1;
  return {
    currentYear: numericYear,
    yearId: buildYearId(numericYear),
    label: `Year ${numericYear}`,
    academicYear: correspondingAcademicYear, // This is the batch/joining year
    fullLabel: getYearDisplayLabel(numericYear),
  };
};

const buildYearOptions = (globalAcademicYear) => [
  getYearMeta(1, globalAcademicYear),
  getYearMeta(2, globalAcademicYear),
  getYearMeta(3, globalAcademicYear),
  getYearMeta(4, globalAcademicYear),
];

const YEAR_OPTIONS = buildYearOptions(2025); // Default fallback to new mapping base

const StudentManagementScreen = () => {
  const router = useRouter();
  const navigation = useNavigation();
  const [selectedYear, setSelectedYear] = useState(1); // Year 1, 2, 3, or 4
  const [students, setStudents] = useState([]);
  const [classRepresentatives, setClassRepresentatives] = useState({ cr1: null, cr2: null });
  const [crSelection, setCrSelection] = useState({ cr1: null, cr2: null }); // For CR Management tab
  const [loading, setLoading] = useState(false);
  const [showStudentView, setShowStudentView] = useState(false);
  const [showCRView, setShowCRView] = useState(false);
  const [showSubMenu, setShowSubMenu] = useState(true); // New: track if showing sub-menu
  const [searchQuery, setSearchQuery] = useState('');
  const [sortKey, setSortKey] = useState('roll'); // 'roll' | 'name'
  const [sortOrder, setSortOrder] = useState('asc'); // 'asc' | 'desc'
  const [editingMap, setEditingMap] = useState({}); // { [id]: { rollNumber, name, email, phone, original } }
  const [savedCredentials, setSavedCredentials] = useState([]);
  const [credentialsModalVisible, setCredentialsModalVisible] = useState(false);
  const [credentialsYearLabel, setCredentialsYearLabel] = useState('');
  const [academicYear, setAcademicYear] = useState(2027);
  const [promoting, setPromoting] = useState(false);

  // Calculate academic year for each year level dynamically
  // Formula: Year N students belong to batch (currentAcademicYear - N + 1)
  // Example: If currentAcademicYear = 2025:
  //   Year 1 → 2025 (current year freshers)
  //   Year 2 → 2024 (joined last year)
  //   Year 3 → 2023 (joined 2 years ago)
  //   Year 4 → 2022 (joined 3 years ago)
  const getAcademicYearForLevel = useCallback((yearLevel) => {
    return academicYear - yearLevel + 1;
  }, [academicYear]);

  const yearOptions = useMemo(() => buildYearOptions(academicYear), [academicYear]);
  const selectedYearMeta = useMemo(() => getYearMeta(selectedYear, academicYear), [selectedYear, academicYear]);
  const getYearTitle = useCallback((year) => getYearMeta(year, academicYear).fullLabel, [academicYear]);


  // Faculty department info
  const [collegeId, setCollegeId] = useState(null);
  const [departmentId, setDepartmentId] = useState(null);
  const [departmentCode, setDepartmentCode] = useState(null);
  const [departmentName, setDepartmentName] = useState('');

  // Spreadsheet state (integrated from SpreadsheetScreen)
  const CELL_WIDTH = 120;
  const CELL_HEIGHT = 50;
  const COLUMN_COUNT = 4;
  const INITIAL_ROWS = 100;
  const ROW_NUMBER_WIDTH = 50;

  const [spreadsheetGridData, setSpreadsheetGridData] = useState([]);
  const [savingSpreadsheet, setSavingSpreadsheet] = useState(false);
  const [editingCell, setEditingCell] = useState(null);


  const mainScrollRef = useRef(null);
  const headerScrollRef = useRef(null);

  const spreadsheetColumns = ['Roll No', 'Name', 'Email', 'Phone'];
  const spreadsheetColumnKeys = ['rollNo', 'name', 'email', 'phone'];

  const autoSaveTimerRef = useRef(null);
  const suppressAutoSaveRef = useRef(false);
  const gridInitializedRef = useRef(false);

  const facultyId = auth.currentUser?.uid;

  const getActiveDepartmentCode = () => departmentCode || departmentId;
  const buildDeptPaths = (year = selectedYear) => {
    const dept = getActiveDepartmentCode();
    const yearId = buildYearId(year);
    return {
      students: `students/${yearId}/departments/${dept}/students`,
      reps: `classrepresentative/year_${year}/department_${dept}`,
    };
  };
  const cacheKeyFor = (year = selectedYear) => `${buildYearId(year)}::${getActiveDepartmentCode() || 'unknown'}`;

  // Load faculty department info on mount
  useEffect(() => {
    loadFacultyDepartmentInfo();
    initAcademicYear();
  }, [facultyId]);

  const initAcademicYear = async () => {
    const year = await loadAcademicYear();
    setAcademicYear(year);
  };

  const loadFacultyDepartmentInfo = async () => {
    if (!facultyId) {
      console.warn('Faculty ID not available yet');
      return;
    }
    try {
      const userDocRef = doc(db, 'users', facultyId);
      const facultyDocRef = doc(db, 'faculty', facultyId);

      const [userSnap, facultySnap] = await Promise.all([
        getDoc(userDocRef),
        getDoc(facultyDocRef).catch((err) => {
          console.warn('Faculty profile lookup failed (faculty collection)', err?.message || err);
          return null;
        })
      ]);

      const userData = userSnap.exists() ? userSnap.data() : {};
      const facultyData = facultySnap && facultySnap.exists() ? facultySnap.data() : {};

      const resolvedCollegeId = userData.collegeId || facultyData.collegeId || null;
      let resolvedDepartmentCode = userData.departmentCode || userData.departmentId || facultyData.departmentCode || facultyData.departmentId || null;
      const resolvedDepartmentName = userData.departmentName || facultyData.departmentName || '';

      // Extract short code from department name if we only have a document ID
      if (resolvedDepartmentCode && resolvedDepartmentCode.length > 10) {
        // Looks like a document ID, try to extract code from name
        if (resolvedDepartmentName.toLowerCase().includes('information technology')) {
          resolvedDepartmentCode = 'IT';
        } else if (resolvedDepartmentName.toLowerCase().includes('computer science')) {
          resolvedDepartmentCode = 'CSE';
        } else if (resolvedDepartmentName.toLowerCase().includes('electronics')) {
          resolvedDepartmentCode = 'ECE';
        } else if (resolvedDepartmentName.toLowerCase().includes('electrical')) {
          resolvedDepartmentCode = 'EEE';
        } else if (resolvedDepartmentName.toLowerCase().includes('mechanical')) {
          resolvedDepartmentCode = 'MECH';
        } else if (resolvedDepartmentName.toLowerCase().includes('civil')) {
          resolvedDepartmentCode = 'CIVIL';
        }
        console.log('📝 Extracted department code:', resolvedDepartmentCode, 'from:', resolvedDepartmentName);
      }

      if (!resolvedDepartmentCode) {
        console.error('❌ Department code missing in faculty profile');
        Alert.alert('Error', 'Department is not configured for your account. Please contact administrator.');
        return;
      }

      console.log('🏫 Faculty Department Info:', {
        facultyId,
        collegeId: resolvedCollegeId,
        departmentCode: resolvedDepartmentCode,
        departmentName: resolvedDepartmentName || '(not provided)',
        name: userData.name || facultyData.name,
      });

      setCollegeId(resolvedCollegeId);
      setDepartmentId(resolvedDepartmentCode);
      setDepartmentCode(resolvedDepartmentCode);
      setDepartmentName(resolvedDepartmentName || resolvedDepartmentCode);
    } catch (error) {
      if (error.code === 'permission-denied') {
        console.error('Permission denied when loading faculty info:', error);
      } else if (error.message?.includes('offline')) {
        console.warn('Firestore offline when loading faculty info. Will retry when online.');
      } else {
        console.error('Error loading faculty info:', error);
      }
      // Alert only for non-offline errors
      if (!error.message?.includes('offline')) {
        Alert.alert('Error', 'Failed to load faculty information');
      }
    }
  };

  const handlePromoteAcademicYear = async () => {
    try {
      // Get distribution first
      const distribution = await getStudentDistribution();
      const year4 = distribution.find(d => d.currentYear === 4);
      const year4Count = year4?.studentCount || 0;

      const summaryLines = distribution
        .filter(d => d.studentCount > 0)
        .map(d => `• ${d.label}: ${d.studentCount} students`)
        .join('\n');

      Alert.alert(
        '🎓 Promote Academic Year',
        `This will:\n\n` +
        `✓ Increment academic year: ${academicYear} → ${academicYear + 1}\n` +
        `✓ Migrate students: Year 3→4, Year 2→3, Year 1→2\n` +
        `✓ Archive ${year4Count} graduating (Year 4) students\n` +
        `✓ Preserve each student's joining year\n\n` +
        `Current Distribution:\n${summaryLines}\n\n` +
        `⚠️ This action cannot be undone. Continue?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Promote',
            style: 'destructive',
            onPress: async () => {
              setPromoting(true);
              try {
                const result = await promoteAcademicYear(auth.currentUser?.uid);

                if (result.success) {
                  setAcademicYear(result.newYear);
                  Alert.alert(
                    '✅ Promotion Complete',
                    result.message +
                    `\n\nNew Academic Year: ${result.newYear}\n` +
                    `Students Migrated: ${result.migratedCount || 0}\n` +
                    `Students Graduated: ${result.archivedCount || 0}\n\n` +
                    `All students have been migrated to their next year.`
                  );
                } else {
                  Alert.alert('Error', result.message);
                }
              } catch (error) {
                Alert.alert('Error', `Promotion failed: ${error.message}`);
              } finally {
                setPromoting(false);
              }
            }
          }
        ]
      );
    } catch (error) {
      Alert.alert('Error', `Failed to load student data: ${error.message}`);
    }
  };

  const buildEmptyRow = (index) => ({
    id: `row_${index}`,
    rollNo: '',
    name: '',
    email: '',
    phone: '',
  });

  const findLastFilledIndex = (rows) => {
    for (let i = rows.length - 1; i >= 0; i -= 1) {
      const row = rows[i];
      if (row && (row.rollNo || row.name || row.email || row.phone)) {
        return i;
      }
    }
    return -1;
  };

  const ensureBufferRows = (rows) => {
    const lastFilledIndex = findLastFilledIndex(rows);
    const targetLength = Math.max(INITIAL_ROWS, (lastFilledIndex + 1) + 50);
    if (rows.length >= targetLength) return rows;
    const extraCount = targetLength - rows.length;
    const extraRows = Array.from({ length: extraCount }, (_, idx) => buildEmptyRow(rows.length + idx));
    return [...rows, ...extraRows];
  };

  const normalizeEmail = (value) => String(value || '').trim().toLowerCase();
  const buildEmailDocId = (email) => normalizeEmail(email).replace(/[@.]/g, '_');

  const lookupUserIdByEmail = async (email) => {
    const normalized = normalizeEmail(email);
    try {
      const userQuery = query(collection(db, 'users'), where('email', '==', normalized));
      const snap = await getDocs(userQuery);
      if (!snap.empty) {
        return snap.docs[0].id;
      }
    } catch (err) {
      console.warn('Lookup user by email failed', err);
    }
    return null;
  };

  const sanitizeGridRows = (gridRows) => {
    const nonEmpty = gridRows.filter(r => r && (r.rollNo || r.name || r.email || r.phone));
    const mapped = nonEmpty.map((row, idx) => ({
      id: row.id || `row_${idx}`,
      rollNo: (row.rollNo || '').trim(),
      name: (row.name || '').trim(),
      email: (row.email || '').trim(),
      phone: (row.phone || '').trim(),
      role: row.role || 'student',
      isClassRepresentative: !!row.isClassRepresentative,
    }));

    mapped.sort((a, b) => {
      const aNum = parseInt(a.rollNo, 10) || 0;
      const bNum = parseInt(b.rollNo, 10) || 0;
      return aNum - bNum;
    });
    return mapped;
  };

  const buildGridFromRows = (sortedRows) => {
    const totalRows = Math.max(INITIAL_ROWS, sortedRows.length + 50);
    const grid = Array.from({ length: totalRows }, (_, i) => {
      if (i < sortedRows.length) return sortedRows[i];
      return buildEmptyRow(i);
    });
    return grid;
  };

  // Cache per-year data to avoid repeated DB reads
  const cacheRef = useRef({}); // { yearId: { students, classRepresentatives, ts } }

  // Load students and CR for current year/class
  useEffect(() => {
    if (collegeId && getActiveDepartmentCode()) {
      // Clear cache and data immediately on year switch/department switch to prevent cross contamination
      cacheRef.current[cacheKeyFor(selectedYear)] = null;
      setStudents([]);
      setClassRepresentatives({ cr1: null, cr2: null });
      setSpreadsheetGridData([]);
      // Force reload from Firestore (single source of truth)
      loadStudentsAndCR(true);
    }
  }, [selectedYear, collegeId, departmentId, departmentCode]);

  const loadStudentsAndCR = async (forceReload = false) => {
    const dept = getActiveDepartmentCode();
    if (!collegeId || !dept) return;
    const yearKey = selectedYear;
    const cacheKey = cacheKeyFor(yearKey);
    try {
      // Use cached data if available and not forcing reload
      if (!forceReload && cacheRef.current[cacheKey]) {
        const cached = cacheRef.current[cacheKey];
        setStudents(cached.students || []);
        setClassRepresentatives(cached.classRepresentatives || { cr1: null, cr2: null });
        // Still refresh in background to keep cache fresh
        setTimeout(() => loadStudentsAndCR(true), 0);
        return;
      }

      setLoading(true);

      // Load students from year + department specific collection
      const { students: deptStudentsPath, reps: deptCRPath } = buildDeptPaths(selectedYear);
      const deptStudentsRef = collection(db, deptStudentsPath);
      const snapshot = await getDocs(deptStudentsRef);



      // Filter students to only show those with the correct academic_year
      const studentsList = snapshot.docs
        .map(d => ({ id: d.id, ...d.data() }));

      // Sort students by Roll Number

      studentsList.sort((a, b) => {
        const rollA = parseInt(a.rollNo || a.rollNumber || 0, 10) || 0;
        const rollB = parseInt(b.rollNo || b.rollNumber || 0, 10) || 0;
        return rollA - rollB;
      });
      setStudents(studentsList);

      // Load CRs from year + department specific collection
      const deptCRRef = collection(db, deptCRPath);
      const crSnap = await getDocs(deptCRRef);
      const crObj = { cr1: null, cr2: null };

      // Get all active reps and assign to cr1 and cr2
      const activeReps = crSnap.docs.filter(d => d.data().active === true);

      activeReps.forEach(doc => {
        const data = doc.data();
        // Use ID or slot field for accurate mapping
        if (doc.id === 'cr_1' || data.slot === 'CR-1') {
          crObj.cr1 = { id: doc.id, ...data };
        } else if (doc.id === 'cr_2' || data.slot === 'CR-2') {
          crObj.cr2 = { id: doc.id, ...data };
        } else if (!crObj.cr1) {
          // Fallback for legacy records without fixed IDs/slots
          crObj.cr1 = { id: doc.id, ...data };
        } else if (!crObj.cr2) {
          crObj.cr2 = { id: doc.id, ...data };
        }
      });

      setClassRepresentatives(crObj);

      // cache results
      cacheRef.current[cacheKey] = { students: studentsList, classRepresentatives: crObj, ts: Date.now() };
    } catch (error) {
      console.error('Error loading data:', error);
      Alert.alert('Error', 'Failed to load students');
    } finally {
      setLoading(false);
    }
  };

  // Load spreadsheet data when student view is shown
  useEffect(() => {
    if (showStudentView && collegeId && getActiveDepartmentCode()) {
      loadSpreadsheetData();
    }
  }, [showStudentView, selectedYear, collegeId, departmentId, departmentCode]);

  // Fetch fresh year-wise student data when CR view is shown (single source of truth from Firestore)
  useEffect(() => {
    if (showCRView && collegeId && getActiveDepartmentCode()) {
      // Force fresh data load from Firestore for the selected year
      cacheRef.current[cacheKeyFor(selectedYear)] = null;
      loadStudentsAndCR(true);
    }
  }, [showCRView, selectedYear, collegeId, departmentId, departmentCode]);

  const loadSpreadsheetData = async () => {
    const dept = getActiveDepartmentCode();
    if (!collegeId || !dept || !selectedYear) {
      // Initialize with empty rows
      const emptyRows = Array.from({ length: INITIAL_ROWS }, (_, i) => ({
        id: `row_${i}`,
        rollNo: '',
        name: '',
        email: '',
        phone: '',
      }));
      setSpreadsheetGridData(emptyRows);
      return;
    }

    try {
      setLoading(true);
      console.log('📂 Loading students from year:', selectedYear, 'department:', dept);
      const { students: deptStudentsPath } = buildDeptPaths(selectedYear);
      const deptStudentsRef = collection(db, deptStudentsPath);
      const snapshot = await getDocs(deptStudentsRef);
      console.log('📊 Found', snapshot.docs.length, 'student documents for year', selectedYear);

      const existingStudents = snapshot.docs.map(d => ({
        id: d.id,
        rollNo: d.data().rollNo || d.data().rollNumber || '',
        name: d.data().name || '',
        email: d.data().email || '',
        phone: d.data().phone || d.data().mobile || '',
        isRepresentative: !!d.data().isRepresentative,
      }));

      console.log('Loaded students from Firestore:', existingStudents.length);

      const sortedRows = sanitizeGridRows(existingStudents);
      const grid = buildGridFromRows(sortedRows);

      suppressAutoSaveRef.current = true;
      setSpreadsheetGridData(grid);
      gridInitializedRef.current = true;

      // Also update the students state for consistency
      const studentsList = existingStudents.map(s => ({
        id: s.id,
        rollNumber: s.rollNo,
        name: s.name,
        email: s.email,
        phone: s.phone,
        isRepresentative: s.isRepresentative,
      }));
      setStudents(studentsList);
    } catch (error) {
      console.error('Error loading spreadsheet data:', error);
      Alert.alert('Error', 'Failed to load student data');
      const emptyRows = Array.from({ length: INITIAL_ROWS }, (_, i) => ({
        id: `row_${i}`,
        rollNo: '',
        name: '',
        email: '',
        phone: '',
      }));
      suppressAutoSaveRef.current = true;
      setSpreadsheetGridData(emptyRows);
      gridInitializedRef.current = true;
    } finally {
      setLoading(false);
    }
  };

  // Helpers for card UI
  const normalizeStudentFields = (s) => ({
    id: s.id,
    rollNumber: s.rollNumber || s.rollNo || '',
    name: s.name || '',
    email: (s.email || '').toLowerCase(),
    phone: s.phone || s.mobile || '',
  });

  const getVisibleStudents = () => {
    const q = (searchQuery || '').trim().toLowerCase();
    let list = students.map(normalizeStudentFields);
    if (q) {
      list = list.filter((s) =>
        (s.name || '').toLowerCase().includes(q) ||
        String(s.rollNumber || '').toLowerCase().includes(q)
      );
    }
    list.sort((a, b) => {
      let av, bv;
      if (sortKey === 'name') {
        av = (a.name || '').toLowerCase();
        bv = (b.name || '').toLowerCase();
      } else {
        av = parseInt(a.rollNumber, 10) || 0;
        bv = parseInt(b.rollNumber, 10) || 0;
      }
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortOrder === 'asc' ? cmp : -cmp;
    });
    return list;
  };

  const handleAddStudentCard = () => {
    const tempId = `temp_${Date.now()}`;
    const draft = { id: tempId, rollNumber: '', name: '', email: '', phone: '' };
    setStudents((prev) => [{ ...draft, isNew: true }, ...prev]);
    setEditingMap((prev) => ({ ...prev, [tempId]: { ...draft, original: null } }));
  };

  const handleEditCard = (id) => {
    const current = students.find((s) => s.id === id);
    if (!current) return;
    const norm = normalizeStudentFields(current);
    setEditingMap((prev) => ({ ...prev, [id]: { ...norm, original: norm } }));
  };

  const handleChangeCard = (id, next) => {
    setEditingMap((prev) => ({
      ...prev,
      [id]: { ...(prev[id] || {}), ...next },
    }));
  };

  const handleCancelCard = (id) => {
    const isTemp = String(id).startsWith('temp_');
    if (isTemp) {
      setStudents((prev) => prev.filter((s) => s.id !== id));
    }
    setEditingMap((prev) => {
      const copy = { ...prev };
      delete copy[id];
      return copy;
    });
  };

  const validateStudentDraft = (draft, { excludeId } = {}) => {
    const errors = [];
    const roll = String(draft.rollNumber || '').trim();
    const name = String(draft.name || '').trim();
    const email = String(draft.email || '').trim().toLowerCase();
    if (!roll) errors.push('Roll Number is required');
    if (!name) errors.push('Name is required');
    if (!email) errors.push('Email is required');
    // duplicates
    const rolled = new Set();
    const emailed = new Set();
    students.forEach((s) => {
      if (s.id === excludeId) return; // ignore self
      const r = String(s.rollNumber || s.rollNo || '').trim();
      const e = String(s.email || '').trim().toLowerCase();
      if (r) rolled.add(r);
      if (e) emailed.add(e);
    });
    if (roll && rolled.has(roll)) errors.push(`Roll number ${roll} already exists`);
    if (email && emailed.has(email)) errors.push(`Email ${email} already exists`);
    return errors;
  };

  const saveStudentToFirestore = async (draft, originalId) => {
    const dept = getActiveDepartmentCode();
    if (!collegeId || !dept || !selectedYear) {
      throw new Error('Missing department/year context');
    }
    const { students: deptStudentPath } = buildDeptPaths(selectedYear);
    const id = originalId && !String(originalId).startsWith('temp_')
      ? originalId
      : `student_${String(draft.rollNumber).toLowerCase().replace(/\s+/g, '_')}`;
    const ref = doc(db, deptStudentPath, id);

    // name split
    const nameParts = (draft.name || '').split(' ').filter(Boolean);
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ');
    const joiningYear = getCurrentAcademicYear() - selectedYear + 1; // Calculate joining year from current year

    // Calculate academic_year for this year level
    // This represents the batch year (when students at this level originally joined)
    const academicYear = getAcademicYearForLevel(selectedYear);

    await setDoc(ref, {
      studentId: id,
      rollNo: draft.rollNumber,
      rollNumber: draft.rollNumber,
      name: draft.name,
      firstName,
      lastName,
      email: (draft.email || '').toLowerCase(),
      phone: draft.phone || '',
      joiningYear,
      currentYear: selectedYear,
      year_level: selectedYear, // Explicitly store year level
      academic_year: academicYear,
      currentAcademicYear: getCurrentAcademicYear(),
      departmentCode: dept,
      departmentId: dept,
      departmentName: departmentName || dept,
      collegeId,
      createdByFacultyId: facultyId || null,
      isRepresentative: false,
      updatedAt: serverTimestamp(),
    }, { merge: true });

    return id;
  };

  const handleSaveCard = async (id, draft) => {
    try {
      const errs = validateStudentDraft(draft, { excludeId: String(id).startsWith('temp_') ? null : id });
      if (errs.length) {
        Alert.alert('Error', errs.join('\n'));
        return;
      }
      setLoading(true);
      const savedId = await saveStudentToFirestore(draft, id);
      cacheRef.current[cacheKeyFor(selectedYear)] = null;
      await loadStudentsAndCR(true);
      setEditingMap((prev) => {
        const copy = { ...prev };
        delete copy[id];
        delete copy[savedId];
        return copy;
      });
      // If temp id, ensure removal is handled by reload
      Alert.alert('Saved');
    } catch (e) {
      console.error('Save student error', e);
      Alert.alert('Error', e.message || 'Failed to save student');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteCard = async (student) => {
    const name = student.name || 'this student';
    const roll = student.rollNumber || student.rollNo || '';
    Alert.alert(
      'Delete Student',
      `Delete ${name}${roll ? ` (Roll: ${roll})` : ''}? This will remove related CR assignments.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive', onPress: async () => {
            try {
              setLoading(true);
              const dept = getActiveDepartmentCode();
              const { students: deptStudentPath, reps: deptCRPath } = buildDeptPaths(selectedYear);
              const id = student.id || `student_${String(roll).toLowerCase().replace(/\s+/g, '_')}`;
              const batch = writeBatch(db);
              batch.delete(doc(db, deptStudentPath, id));
              // delete any CR records for this student
              const crRef = collection(db, deptCRPath);
              const crDocs = await getDocs(query(crRef, where('studentId', '==', id)));
              crDocs.forEach((d) => batch.delete(d.ref));
              await batch.commit();
              cacheRef.current[cacheKeyFor(selectedYear)] = null;
              await loadStudentsAndCR(true);
            } catch (e) {
              console.error('Delete student error', e);
              Alert.alert('Error', e.message || 'Failed to delete student');
            } finally {
              setLoading(false);
            }
          }
        }
      ]
    );
  };

  const handleSaveAllEditing = async () => {
    const ids = Object.keys(editingMap);
    if (ids.length === 0) return;
    setLoading(true);
    try {
      for (const id of ids) {
        const draft = editingMap[id];
        const errs = validateStudentDraft(draft, { excludeId: String(id).startsWith('temp_') ? null : id });
        if (errs.length) {
          Alert.alert('Error', errs.join('\n'));
          setLoading(false);
          return;
        }
      }
      for (const id of ids) {
        const draft = editingMap[id];
        await saveStudentToFirestore(draft, id);
      }
      cacheRef.current[cacheKeyFor(selectedYear)] = null;
      await loadStudentsAndCR(true);
      setEditingMap({});
      Alert.alert('Saved');
    } catch (e) {
      console.error('Save all error', e);
      Alert.alert('Error', e.message || 'Failed to save all');
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadStudentsCSV = async () => {
    try {
      const list = getVisibleStudents();
      if (list.length === 0) {
        Alert.alert('No Data', 'No student data to download');
        return;
      }
      const headers = ['Roll No', 'Name', 'Email', 'Phone'];
      let csv = headers.join(',') + '\n';
      list.forEach((s) => {
        const row = [s.rollNumber || '', s.name || '', s.email || '', s.phone || '']
          .map((f) => `"${String(f).replace(/"/g, '""')}"`).join(',');
        csv += row + '\n';
      });
      const yearLabel = getYearTitle(selectedYear).replace(/\s+/g, '_');
      const filename = `student_list_${yearLabel}.csv`;
      const appDir = FileSystem.documentDirectory + 'ClassConnect/';
      const dirInfo = await FileSystem.getInfoAsync(appDir);
      if (!dirInfo.exists) await FileSystem.makeDirectoryAsync(appDir, { intermediates: true });
      const filePath = appDir + filename;
      await FileSystem.writeAsStringAsync(filePath, csv, { encoding: 'utf8' });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(filePath, { mimeType: 'text/csv', dialogTitle: `Share ${filename}` });
      } else {
        Alert.alert('File Saved', 'Saved to: ' + filePath);
      }
    } catch (e) {
      console.error('Download CSV error', e);
      Alert.alert('Error', e.message || 'Failed to download CSV');
    }
  };

  const updateSpreadsheetCell = (rowIndex, colIndex, value) => {
    setSpreadsheetGridData(prevData => {
      const newData = [...prevData];
      const baseRow = newData[rowIndex] || buildEmptyRow(rowIndex);
      newData[rowIndex] = {
        ...baseRow,
        [spreadsheetColumnKeys[colIndex]]: value,
      };
      return ensureBufferRows(newData);
    });
  };

  const deleteSpreadsheetRow = async (rowIndex) => {
    const rowToDelete = spreadsheetGridData[rowIndex];
    if (!rowToDelete?.rollNo) {
      // Row is already empty, just clear it in UI
      setSpreadsheetGridData(prevData => {
        const newData = [...prevData];
        const baseRow = newData[rowIndex] || buildEmptyRow(rowIndex);
        newData[rowIndex] = {
          ...baseRow,
          rollNo: '',
          name: '',
          email: '',
          phone: '',
        };
        return ensureBufferRows(newData);
      });
      return;
    }

    // Confirm deletion
    Alert.alert(
      'Delete Student',
      `Delete ${rowToDelete.name || 'this student'} (Roll: ${rowToDelete.rollNo}) permanently?\n\nThis will remove ALL related data including CR assignments.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              setLoading(true);

              // Generate student ID from roll number (same logic as save)
              const studentId = `student_${rowToDelete.rollNo.toString().toLowerCase().replace(/\s+/g, '_')}`;

              // Use batch for atomic deletion
              const batch = writeBatch(db);

              // 1. Delete student document from year + department specific collection
              const { students: deptStudentPath, reps: deptCRPath } = buildDeptPaths(selectedYear);
              const studentRef = doc(db, deptStudentPath, studentId);
              batch.delete(studentRef);
              console.log('🗑️ Marking student for deletion:', studentId);

              // 2. Check if student is assigned as CR and delete CR doc
              const deptCRRef = collection(db, deptCRPath);
              const crQuery = query(deptCRRef, where('studentId', '==', studentId));
              const crDocs = await getDocs(crQuery);

              crDocs.forEach(crDoc => {
                batch.delete(crDoc.ref);
                console.log('🗑️ Marking CR for deletion (student was rep)');
              });

              // Commit all deletions atomically
              await batch.commit();
              console.log('✅ Atomic deletion completed - removed student and all related data');

              // Clear cache and re-fetch from Firestore
              cacheRef.current[cacheKeyFor(selectedYear)] = null;
              await loadSpreadsheetData();
              await loadStudentsAndCR(true);

              Alert.alert('Success', 'Student and all related data deleted');
            } catch (error) {
              console.error('Error deleting student:', error);
              Alert.alert('Error', 'Failed to delete student: ' + error.message);
            } finally {
              setLoading(false);
            }
          }
        }
      ]
    );
  };

  const persistSpreadsheetGrid = async (gridRows, { refresh = false, silent = false } = {}) => {
    const dept = getActiveDepartmentCode();
    if (!collegeId || !dept || !selectedYear) {
      console.warn('⚠️ Cannot save: missing collegeId, departmentCode, or selectedYear');
      return;
    }

    const isAutoSave = silent === true;
    const sortedRows = sanitizeGridRows(gridRows).filter(row => row.rollNo);

    // Never let auto-save perform destructive deletes when grid is empty or not initialized yet
    if (isAutoSave && sortedRows.length === 0) {
      console.log('⏭️ Skipping auto-save: no rows to persist for', selectedYear);
      return;
    }

    console.log('💾 Saving', sortedRows.length, 'students to year+department collection');

    try {
      if (!silent) {
        setSavingSpreadsheet(true);
      }

      // STEP 1: Only perform destructive delete on explicit manual save (never during auto-save)
      if (!isAutoSave) {
        const { students: deptStudentsPath } = buildDeptPaths(selectedYear);
        const deptStudentsRef = collection(db, deptStudentsPath);
        const existingSnapshot = await getDocs(deptStudentsRef);
        const batch = writeBatch(db);

        // Delete all existing student documents for this year + department
        existingSnapshot.docs.forEach(docSnap => {
          batch.delete(docSnap.ref);
        });

        // Commit deletions
        await batch.commit();
        console.log('🗑️  Cleared', existingSnapshot.docs.length, 'old students from', selectedYear, dept);
      } else {
        console.log('🚫 Skipping destructive delete during auto-save');
      }

      // STEP 2: Save students to year + department specific collection (NO Firebase Auth)
      const newBatch = writeBatch(db);
      const nowIso = new Date().toISOString();

      // Calculate academic_year for this year level (batch year)
      const academicYear = getAcademicYearForLevel(selectedYear);

      sortedRows.forEach((row) => {
        const studentId = row.id || `student_${row.rollNo.toString().toLowerCase().replace(/\s+/g, '_')}`;
        const { students: deptStudentPath } = buildDeptPaths(selectedYear);
        const yearRef = doc(db, deptStudentPath, studentId);
        const normalizedEmail = normalizeEmail(row.email);

        // Extract name parts
        const nameParts = row.name.split(' ').filter(Boolean);
        const firstName = nameParts[0] || '';
        const lastName = nameParts.slice(1).join(' ');
        const joiningYear = getCurrentAcademicYear() - selectedYear + 1; // Calculate joining year from current year

        // Save to year-wise students collection (NO Auth UID, NO passwords)
        newBatch.set(yearRef, {
          studentId,
          rollNo: row.rollNo,
          rollNumber: row.rollNo,
          name: row.name,
          firstName,
          lastName,
          email: normalizedEmail,
          phone: row.phone || '',
          joiningYear,
          currentYear: selectedYear,
          academic_year: academicYear,
          currentAcademicYear: getCurrentAcademicYear(),
          departmentCode: dept,
          departmentId: dept,
          departmentName: departmentName || dept,
          collegeId,
          createdByFacultyId: facultyId || null,
          isRepresentative: false,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }, { merge: true });
      });

      await newBatch.commit();
      console.log('✅ Saved', sortedRows.length, 'new student documents to Firestore');

      suppressAutoSaveRef.current = true;
      setSpreadsheetGridData(buildGridFromRows(sortedRows));
      gridInitializedRef.current = true;

      // STEP 4: Re-fetch from Firestore (single source of truth)
      cacheRef.current[cacheKeyFor(selectedYear)] = null;
      await loadStudentsAndCR(true);

    } catch (error) {
      console.error('Error saving spreadsheet:', error);
      if (!silent) {
        Alert.alert('Save Error', 'Failed to save student list: ' + error.message);
      }
    } finally {
      if (!silent) {
        setSavingSpreadsheet(false);
      }
    }
  };

  const handleSaveSpreadsheetGrid = async () => {
    if (!collegeId || !getActiveDepartmentCode() || !selectedYear) {
      Alert.alert('Error', 'Missing required data. Please ensure you are properly registered.');
      return;
    }

    const filledRows = spreadsheetGridData.filter(row => (row.rollNo || row.name || row.email || row.phone));
    if (filledRows.length === 0) {
      Alert.alert('No Data', 'Please add at least one student');
      return;
    }

    // All students must have an email (for future rep assignment)
    const missingEmail = filledRows.find(r => !normalizeEmail(r.email));
    if (missingEmail) {
      Alert.alert('Email Required', 'Every student must have an email address.');
      return;
    }

    // VALIDATION: Check for duplicates before saving
    const rollNos = new Map();
    const emails = new Map();
    const phones = new Map();
    const duplicateRollNos = new Set();
    const duplicateEmails = new Set();
    const duplicatePhones = new Set();

    filledRows.forEach((row, index) => {
      const rollNo = String(row.rollNo || '').trim();
      const email = String(row.email || '').trim().toLowerCase();
      const phone = String(row.phone || '').trim();

      // Check Roll Number duplicates - INDEPENDENT CHECK
      if (rollNo.length > 0 && rollNos.has(rollNo)) {
        duplicateRollNos.add(rollNo);
      }
      if (rollNo.length > 0 && !rollNos.has(rollNo)) {
        rollNos.set(rollNo, index);
      }

      // Check Email duplicates - INDEPENDENT CHECK (only if provided)
      if (email.length > 0 && emails.has(email)) {
        duplicateEmails.add(email);
      }
      if (email.length > 0 && !emails.has(email)) {
        emails.set(email, index);
      }

      // Check Phone duplicates - INDEPENDENT CHECK (only if provided)
      if (phone.length > 0 && phones.has(phone)) {
        duplicatePhones.add(phone);
      }
      if (phone.length > 0 && !phones.has(phone)) {
        phones.set(phone, index);
      }
    });

    // Build error messages only for fields with duplicates
    const duplicateErrors = [];
    if (duplicateRollNos.size > 0) {
      duplicateRollNos.forEach(rollNo => {
        duplicateErrors.push(`Roll number ${rollNo} already exists`);
      });
    }
    if (duplicateEmails.size > 0) {
      duplicateEmails.forEach(email => {
        duplicateErrors.push(`Email ${email} already exists`);
      });
    }
    if (duplicatePhones.size > 0) {
      duplicatePhones.forEach(phone => {
        duplicateErrors.push(`Phone number ${phone} already exists`);
      });
    }

    // Block save if duplicates found
    if (duplicateErrors.length > 0) {
      const errorMessage = duplicateErrors.join('\n');
      Alert.alert('Error', errorMessage);
      return;
    }

    await persistSpreadsheetGrid(spreadsheetGridData, { refresh: true, silent: false });
    // Show only a success message without extra text
    Alert.alert('Success');
  };

  // Modern CSV Upload Handlers - Direct Upload (Skip Modal)
  const parseCSVRow = (line) => {
    const result = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }

    result.push(current.trim());
    return result;
  };

  const handleCSVUpload = async () => {
    try {
      setLoading(true);

      // Open file picker directly
      const result = await DocumentPicker.getDocumentAsync({
        type: ['text/csv', 'text/comma-separated-values', 'application/csv'],
        copyToCacheDirectory: true,
      });

      if (result.canceled) {
        setLoading(false);
        return;
      }

      const file = result.assets[0];
      if (!file || !file.uri) {
        Alert.alert('Error', 'No file selected');
        setLoading(false);
        return;
      }

      // Validate file type
      const fileName = file.name || '';
      if (!fileName.toLowerCase().endsWith('.csv')) {
        Alert.alert('Invalid File', 'Please select a .csv file');
        setLoading(false);
        return;
      }

      console.log('📁 CSV file selected:', fileName);

      // Read and parse CSV
      const content = await FileSystem.readAsStringAsync(file.uri, {
        encoding: 'utf8',
      });

      const lines = content.trim().split(/\r?\n/).filter(line => line.trim().length > 0);

      if (lines.length < 2) {
        Alert.alert('Invalid CSV', 'CSV must contain headers and at least one data row');
        setLoading(false);
        return;
      }

      // Parse headers
      const headers = parseCSVRow(lines[0]).map(h => h.trim().toLowerCase());

      // Find column indices
      const rollIndex = headers.findIndex(h => h.includes('roll'));
      const nameIndex = headers.findIndex(h => h.includes('name'));
      const emailIndex = headers.findIndex(h => h.includes('email'));
      const phoneIndex = headers.findIndex(h => h.includes('phone'));

      if (rollIndex === -1 || nameIndex === -1) {
        Alert.alert('Invalid Format', 'CSV must contain "Roll No" and "Name" columns');
        setLoading(false);
        return;
      }

      // Parse student data
      const parsedStudents = [];
      const parseErrors = [];

      for (let i = 1; i < lines.length; i++) {
        const row = parseCSVRow(lines[i]);

        const rollNumber = (row[rollIndex] || '').trim();
        const name = (row[nameIndex] || '').trim();
        const email = (row[emailIndex] || '').trim().toLowerCase();
        const phone = (row[phoneIndex] || '').trim();

        if (!rollNumber || !name) {
          parseErrors.push({ row: i + 1, message: 'Missing Roll No or Name' });
          continue;
        }

        parsedStudents.push({
          rollNumber,
          name,
          email,
          phone,
        });
      }

      if (parsedStudents.length === 0) {
        Alert.alert('No Data', 'No valid students found in CSV');
        setLoading(false);
        return;
      }

      // Directly import the parsed students
      await handleCSVImport(parsedStudents);
    } catch (error) {
      console.error('CSV Upload Error:', error);
      Alert.alert('Error', 'Failed to process CSV: ' + error.message);
      setLoading(false);
    }
  };

  const handleCSVFileSelected = async (fileUri) => {
    // File validation is handled by direct upload
    console.log('📁 CSV file selected:', fileUri);
  };

  const handleCSVImport = async (validStudents) => {
    const dept = getActiveDepartmentCode();
    if (!collegeId || !dept || !selectedYear) {
      Alert.alert('Error', 'Missing department/year context');
      return;
    }

    try {
      setLoading(true);
      console.log('💾 Importing', validStudents.length, 'students to Firestore');

      // Get existing students to check for duplicates
      const { students: deptStudentsPath } = buildDeptPaths(selectedYear);
      const studentsRef = collection(db, deptStudentsPath);
      const existingSnapshot = await getDocs(studentsRef);

      const existingRollNos = new Set();
      const existingEmails = new Set();

      existingSnapshot.docs.forEach(doc => {
        const data = doc.data();
        const rollNo = String(data.rollNo || data.rollNumber || '').trim();
        const email = String(data.email || '').trim().toLowerCase();
        if (rollNo) existingRollNos.add(rollNo);
        if (email) existingEmails.add(email);
      });

      // Filter out duplicates
      const newStudents = validStudents.filter(student => {
        const rollNo = String(student.rollNumber || student.rollNo || '').trim();
        const email = String(student.email || '').trim().toLowerCase();

        if (existingRollNos.has(rollNo)) {
          console.log('⏭️ Skipping duplicate roll number:', rollNo);
          return false;
        }
        if (email && existingEmails.has(email)) {
          console.log('⏭️ Skipping duplicate email:', email);
          return false;
        }
        return true;
      });

      if (newStudents.length === 0) {
        Alert.alert('No New Students', 'All students in the CSV already exist in the database.');
        setLoading(false);
        return;
      }

      // Save to Firestore
      const batch = writeBatch(db);

      // Calculate academic_year for this year level (batch year)
      const academicYear = getAcademicYearForLevel(selectedYear);

      newStudents.forEach((student) => {
        const rollNo = student.rollNumber || student.rollNo;
        const studentId = `student_${String(rollNo).toLowerCase().replace(/\s+/g, '_')}`;
        const studentRef = doc(db, deptStudentsPath, studentId);

        const nameParts = (student.name || '').split(' ').filter(Boolean);
        const firstName = nameParts[0] || '';
        const lastName = nameParts.slice(1).join(' ');
        const joiningYear = getCurrentAcademicYear() - selectedYear + 1; // Calculate joining year from current year

        batch.set(studentRef, {
          studentId,
          rollNo: String(rollNo),
          rollNumber: String(rollNo),
          name: student.name || '',
          firstName,
          lastName,
          email: (student.email || '').toLowerCase(),
          phone: student.phone || '',
          joiningYear,
          currentYear: selectedYear,
          academic_year: academicYear,
          currentAcademicYear: getCurrentAcademicYear(),
          departmentCode: dept,
          departmentId: dept,
          departmentName: departmentName || dept,
          collegeId,
          createdByFacultyId: facultyId || null,
          isRepresentative: false,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }, { merge: true });
      });

      await batch.commit();
      console.log('✅ Successfully saved', newStudents.length, 'students to Firestore');

      // Clear cache and reload
      cacheRef.current[cacheKeyFor(selectedYear)] = null;
      await loadStudentsAndCR(true);

      const skippedCount = validStudents.length - newStudents.length;
      Alert.alert(
        'Success',
        `Added ${newStudents.length} new student(s)${skippedCount > 0 ? `\n\nSkipped ${skippedCount} duplicate(s)` : ''}`
      );
    } catch (error) {
      console.error('CSV Import Error:', error);
      Alert.alert('Error', 'Failed to import students: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadCSV = async () => {
    try {
      // Get only filled rows for the selected year
      const filledRows = spreadsheetGridData.filter(row => (row.rollNo || row.name || row.email || row.phone));

      if (filledRows.length === 0) {
        Alert.alert('No Data', 'No student data to download');
        return;
      }

      // Create CSV content with headers
      const headers = ['Roll No', 'Name', 'Email', 'Phone'];
      let csvContent = headers.join(',') + '\n';

      // Add data rows
      filledRows.forEach(row => {
        const csvRow = [
          row.rollNo || '',
          row.name || '',
          row.email || '',
          row.phone || ''
        ].map(field => `"${field}"`).join(',');
        csvContent += csvRow + '\n';
      });

      // Generate filename with year
      const yearLabel = getYearTitle(selectedYear).replace(/\s+/g, '_');
      const filename = `student_list_${yearLabel}.csv`;

      // Save to writable app document directory
      const appDir = FileSystem.documentDirectory + 'ClassConnect/';

      // Ensure ClassConnect directory exists
      const dirInfo = await FileSystem.getInfoAsync(appDir);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(appDir, { intermediates: true });
      }

      const filePath = appDir + filename;

      // Write CSV file
      await FileSystem.writeAsStringAsync(filePath, csvContent, {
        encoding: 'utf8',
      });

      console.log('📥 Downloaded CSV to:', filePath);

      // Show success alert with share option
      Alert.alert(
        'File Saved',
        'Choose where to share:',
        [
          {
            text: 'Share',
            onPress: async () => {
              try {
                if (await Sharing.isAvailableAsync()) {
                  await Sharing.shareAsync(filePath, {
                    mimeType: 'text/csv',
                    dialogTitle: `Share ${filename}`,
                  });
                } else {
                  Alert.alert('Sharing not available', 'File saved to: ' + filePath);
                }
              } catch (error) {
                console.error('Share error:', error);
                Alert.alert('Error', 'Failed to share file');
              }
            }
          },
          { text: 'OK' }
        ]
      );
    } catch (error) {
      console.error('Download CSV Error:', error);
      Alert.alert('Error', `Failed to download CSV: ${error.message}`);
    }
  };

  const handleAddListFromCSV = async () => {
    try {
      // Pick CSV file
      const result = await DocumentPicker.getDocumentAsync({
        type: ['text/csv', 'text/comma-separated-values', 'application/csv'],
        copyToCacheDirectory: true,
      });

      if (result.canceled) {
        return;
      }

      const file = result.assets[0];
      if (!file || !file.uri) {
        Alert.alert('Error', 'No file selected');
        return;
      }

      setLoading(true);

      // STEP 1: Load existing students from Firestore (source of truth)
      const dept = getActiveDepartmentCode();
      if (!collegeId || !dept || !selectedYear) {
        Alert.alert('Error', 'Missing required data. Please ensure you are properly registered.');
        setLoading(false);
        return;
      }

      const { students: deptStudentsPath } = buildDeptPaths(selectedYear);
      const studentsRef = collection(db, deptStudentsPath);
      const existingSnapshot = await getDocs(studentsRef);

      // Build Sets of existing unique values (normalized)
      const existingRollNos = new Set();
      const existingEmails = new Set();
      const existingPhones = new Set();

      existingSnapshot.docs.forEach(doc => {
        const data = doc.data();

        // Add roll number (always required)
        const rollNo = String(data.rollNo || data.rollNumber || '').trim();
        if (rollNo.length > 0) {
          existingRollNos.add(rollNo);
        }

        // Add email if exists
        const email = String(data.email || '').trim().toLowerCase();
        if (email.length > 0) {
          existingEmails.add(email);
        }

        // Add phone if exists
        const phone = String(data.phone || data.mobile || '').trim();
        if (phone.length > 0) {
          existingPhones.add(phone);
        }
      });

      console.log('📊 Existing data loaded:', {
        rollNumbers: existingRollNos.size,
        emails: existingEmails.size,
        phones: existingPhones.size
      });

      // STEP 2: Read and parse CSV file
      const content = await FileSystem.readAsStringAsync(file.uri);

      const lines = content.trim().split('\n');
      if (lines.length < 2) {
        Alert.alert('Invalid CSV', 'CSV must contain headers and at least one data row');
        setLoading(false);
        return;
      }

      // Parse headers
      const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim().toLowerCase());

      const rollNoIndex = headers.findIndex(h => h.includes('roll'));
      const nameIndex = headers.findIndex(h => h.includes('name'));
      const emailIndex = headers.findIndex(h => h.includes('email'));
      const phoneIndex = headers.findIndex(h => h.includes('phone') || h.includes('mobile'));

      if (rollNoIndex === -1 || nameIndex === -1) {
        Alert.alert('Invalid CSV', 'CSV must have "Roll No" and "Name" columns');
        setLoading(false);
        return;
      }

      // Parse CSV rows
      const newStudents = [];
      const parseErrors = [];

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const cells = line.split(',').map(c => c.replace(/"/g, '').trim());

        const rollNo = (rollNoIndex >= 0 ? cells[rollNoIndex] : '').trim();
        const name = (nameIndex >= 0 ? cells[nameIndex] : '').trim();
        const email = (emailIndex >= 0 ? cells[emailIndex] : '').trim();
        const phone = (phoneIndex >= 0 ? cells[phoneIndex] : '').trim();

        if (!rollNo || !name) {
          parseErrors.push(`Row ${i + 1}: Missing Roll No or Name`);
          continue;
        }

        newStudents.push({
          id: `row_${Date.now()}_${i}`,
          rollNo,
          name,
          email,
          phone,
          csvRowNumber: i + 1,
        });
      }

      if (newStudents.length === 0) {
        Alert.alert('No Data', 'No valid student records found in CSV');
        setLoading(false);
        return;
      }

      // STEP 3: VALIDATION - Check for duplicates within CSV file itself
      const csvRollNos = new Map();
      const csvEmails = new Map();
      const csvPhones = new Map();
      const duplicateErrors = [];

      for (const student of newStudents) {
        const rollNo = String(student.rollNo || '').trim();
        const email = String(student.email || '').trim().toLowerCase();
        const phone = String(student.phone || '').trim();

        // Check Roll Number duplicates within CSV (always required)
        if (rollNo.length > 0) {
          if (csvRollNos.has(rollNo)) {
            duplicateErrors.push(`This roll number already exists in the saved list.`);
          } else {
            csvRollNos.set(rollNo, student.csvRowNumber);
          }
        }

        // Check Email duplicates within CSV (only if provided)
        if (email.length > 0) {
          if (csvEmails.has(email)) {
            duplicateErrors.push(`This email already exists in the saved list.`);
          } else {
            csvEmails.set(email, student.csvRowNumber);
          }
        }

        // Check Phone duplicates within CSV (only if provided)
        if (phone.length > 0) {
          if (csvPhones.has(phone)) {
            duplicateErrors.push(`This phone number already exists in the saved list.`);
          } else {
            csvPhones.set(phone, student.csvRowNumber);
          }
        }
      }

      // Block if duplicates found within CSV
      if (duplicateErrors.length > 0) {
        const errorMessage = duplicateErrors.slice(0, 5).join('\n');
        const moreErrors = duplicateErrors.length > 5 ? `\n\n... and ${duplicateErrors.length - 5} more error(s)` : '';
        Alert.alert('❌ Duplicate Data in CSV', errorMessage + moreErrors);
        setLoading(false);
        return;
      }

      // STEP 4: VALIDATION - Check against existing Firestore data
      const conflictErrors = [];

      for (const student of newStudents) {
        const rollNo = String(student.rollNo || '').trim();
        const email = String(student.email || '').trim().toLowerCase();
        const phone = String(student.phone || '').trim();

        // Check Roll Number (required field)
        if (rollNo.length > 0 && existingRollNos.has(rollNo)) {
          conflictErrors.push(`This roll number already exists in the saved list.`);
        }

        // Check Email (only if provided)
        if (email.length > 0 && existingEmails.has(email)) {
          conflictErrors.push(`This email already exists in the saved list.`);
        }

        // Check Phone (only if provided)
        if (phone.length > 0 && existingPhones.has(phone)) {
          conflictErrors.push(`This phone number already exists in the saved list.`);
        }
      }

      // Block if conflicts found with existing data
      if (conflictErrors.length > 0) {
        const errorMessage = conflictErrors.slice(0, 5).join('\n');
        const moreErrors = conflictErrors.length > 5 ? `\n\n... and ${conflictErrors.length - 5} more error(s)` : '';
        Alert.alert('❌ Duplicate Data Found', errorMessage + moreErrors);
        setLoading(false);
        return;
      }

      // STEP 5: All validation passed - proceed with adding students to UI
      const existingData = spreadsheetGridData.filter(row => (row.rollNo && row.rollNo.trim()) || (row.name && row.name.trim()));
      const combinedStudents = [...existingData, ...newStudents];

      // Sort by roll number
      combinedStudents.sort((a, b) => {
        const aNum = parseInt(a.rollNo, 10) || 0;
        const bNum = parseInt(b.rollNo, 10) || 0;
        return aNum - bNum;
      });

      // Build new grid
      const newGrid = buildGridFromRows(combinedStudents);

      suppressAutoSaveRef.current = true;
      setSpreadsheetGridData(newGrid);

      const errorMsg = parseErrors.length > 0 ? `\n\n⚠️ Skipped ${parseErrors.length} row(s) with errors` : '';
      Alert.alert(
        'Success',
        `Added ${newStudents.length} new student(s) from CSV${errorMsg}\n\nRemember to click "Save All" to persist changes`,
        [{ text: 'OK' }]
      );

    } catch (error) {
      console.error('CSV Upload Error:', error);
      Alert.alert('Error', `Failed to import CSV: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSpreadsheetScroll = (event) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    if (headerScrollRef.current) {
      headerScrollRef.current.scrollTo({ x: offsetX, animated: false });
    }
  };

  useEffect(() => {
    if (suppressAutoSaveRef.current) {
      suppressAutoSaveRef.current = false;
      return undefined;
    }
    if (!gridInitializedRef.current) return undefined;
    if (!collegeId || !getActiveDepartmentCode() || !selectedYear) return undefined;

    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }

    autoSaveTimerRef.current = setTimeout(() => {
      // Auto-save with refresh to keep data in sync with Firestore
      persistSpreadsheetGrid(spreadsheetGridData, { refresh: true, silent: true });
    }, 900);

    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, [spreadsheetGridData, collegeId, departmentId, departmentCode, selectedYear]);

  const assignCRToSlot = useCallback(async (slot, student) => {
    const dept = getActiveDepartmentCode();
    if (!facultyId || !collegeId || !dept) {
      Alert.alert('Error', 'User not authenticated or department info missing');
      return;
    }

    const studentId = student.id || `student_${student.rollNo?.toString().toLowerCase().replace(/\s+/g, '_')}`;
    const studentName = student.name || 'Unknown';
    const normalizedEmail = normalizeEmail(student.email);

    // Validate email format
    if (!normalizedEmail || normalizedEmail.length < 3) {
      Alert.alert('Error', 'Student email is required to assign as Class Representative.');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalizedEmail)) {
      Alert.alert(
        'Invalid Email',
        `"${student.email}" is not a valid email address.\n\nPlease update the student's email before assigning as CR.`
      );
      return;
    }

    try {
      setLoading(true);

      // Check if user already exists
      const usersRef = collection(db, 'users');
      const userQuery = query(usersRef, where('email', '==', normalizedEmail));
      const userSnap = await getDocs(userQuery);

      let crUserId = null;
      let isNewAccount = false;
      let tempPasswordForAlert = null;

      if (userSnap.empty) {
        // AUTO-CREATE: User doesn't exist, create Firebase Auth account + user doc
        console.log('📝 Creating new auth account for CR:', normalizedEmail);

          // Generate CR password in format: firstname@1234
          const studentFirstName = student.firstName || student.name?.split(' ')[0] || 'Student';
          const crPassword = generateCRPassword(studentFirstName);

        try {
          // Use secondary auth to avoid logging out the admin
          const secondaryAuth = getSecondaryAuth();
          const userCredential = await createUserWithEmailAndPassword(secondaryAuth, normalizedEmail, crPassword);
          crUserId = userCredential.user.uid;
          isNewAccount = true;

          console.log('✅ Created new Firebase Auth user:', crUserId);
          console.log('📧 Email:', normalizedEmail);

          // Store password for later retrieval
          tempPasswordForAlert = crPassword;
        } catch (authError) {
          console.error('❌ Auth creation failed:', authError);
          Alert.alert('Error', `Failed to create account: ${authError.message}`);
          setLoading(false);
          return;
        }
      } else {
        // User already exists, use existing UID
        crUserId = userSnap.docs[0].id;
        console.log('✅ Using existing user account:', crUserId);
      }

      let resetEmailSent = false;
      if (!isNewAccount) {
        try {
          console.log('🔑 Triggering automatic password reset for existing account:', normalizedEmail);
          const secondaryAuth = getSecondaryAuth();
          await sendPasswordResetEmail(secondaryAuth, normalizedEmail);
          resetEmailSent = true;
          console.log('✅ Automatic reset email sent successfully');
        } catch (resetErr) {
          console.error('❌ Failed to trigger automatic reset:', resetErr);
        }
      }

      const { students: deptStudentPath, reps: deptCRPath } = buildDeptPaths(selectedYear);
      const batch = writeBatch(db);

      // STEP A: Deactivate ANY existing active CR records for this slot in this year+dept
      // This cleans up legacy records with random IDs or other students assigned to this slot
      const existingCRCol = collection(db, deptCRPath);
      const existingCRSnap = await getDocs(query(existingCRCol, where('active', '==', true)));

      existingCRSnap.docs.forEach(oldCRDoc => {
        const oldData = oldCRDoc.data();
        if (oldData.slot === slot || oldCRDoc.id === (slot === 'CR-1' ? 'cr_1' : 'cr_2')) {
          batch.set(oldCRDoc.ref, { active: false, replacedAt: serverTimestamp() }, { merge: true });

          // Also cleanup the old CR's user document flags if we have the UID
          if (oldData.uid && oldData.uid !== crUserId) {
            batch.set(doc(db, 'users', oldData.uid), {
              role: 'student',
              isCR: false,
              crCredentials: deleteField(),
              crPosition: deleteField(),
              crYear: deleteField(),
              crDepartment: deleteField(),
              disabledAt: serverTimestamp()
            }, { merge: true });
          }
        }
      });

      // 1. Mark student as representative in the student list
      const yearStudentRef = doc(db, deptStudentPath, studentId);
      batch.set(
        yearStudentRef,
        {
          isRepresentative: true,
          crEmail: normalizedEmail,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      // 2. Add/Update the CR record in the classrepresentative collection (for dashboard/lookup/saved credentials)
      const crDocId = slot === 'CR-1' ? 'cr_1' : 'cr_2';
      const deptCRRef = doc(db, deptCRPath, crDocId);

      const crRecordData = {
        id: crDocId,
        studentId: studentId,
        uid: crUserId,
        name: studentName,
        email: normalizedEmail,
        year: `year_${selectedYear}`,
        crYear: `Year ${selectedYear}`,
        departmentId: dept,
        departmentName: departmentName || dept,
        assignedAt: serverTimestamp(),
        assignedBy: facultyId,
        active: true,
        slot: slot,
        password: tempPasswordForAlert || (resetEmailSent ? 'PASSWORD_RESET_REQUIRED' : '(existing account)'),
        passwordNote: isNewAccount ? 'new' : (resetEmailSent ? 'Automatic reset email sent' : 'existing'),
      };
      batch.set(deptCRRef, crRecordData, { merge: true });

      // 3. Set CR flags on user profile (source of truth for login)
      batch.set(
        doc(db, 'users', crUserId),
        {
          email: normalizedEmail,
          name: studentName,
          role: 'cr',
          role_level: 'cr',
          isCR: true,
          active: true,
          collegeId,
          departmentCode: dept,
          departmentId: dept,
          departmentName: departmentName || dept,
          currentYear: selectedYear,
          crYear: `Year ${selectedYear}`,
          crPosition: slot === 'CR-1' ? 1 : 2,
          crDepartment: dept,
          currentAcademicYear: getCurrentAcademicYear(),
          linkedStudentId: studentId,
          // Save credentials for "View Saved Credentials" 
          crCredentials: {
            email: normalizedEmail,
            password: tempPasswordForAlert || (resetEmailSent ? 'PASSWORD_RESET_REQUIRED' : '(existing account)'),
            year: `Year ${selectedYear}`,
            createdAt: serverTimestamp(),
            accountStatus: isNewAccount ? 'new' : 'existing',
          },
        },
        { merge: true }
      );

      await batch.commit();

      // Refresh data
      cacheRef.current[cacheKeyFor(selectedYear)] = null;
      await loadStudentsAndCR(true);

      if (isNewAccount) {
        Alert.alert(
          '✔ CR Assigned Successfully',
          `Email: ${normalizedEmail}\n\nPassword: ${tempPasswordForAlert}\n\n⚠️ Share these credentials with the CR securely.`
        );
      } else if (resetEmailSent) {
        Alert.alert(
          '✔ CR Assigned Successfully',
          `Email: ${normalizedEmail}\n\nExisting account - A password reset email has been sent automatically.\n\nThe CR must check their email to set a new password.`
        );
      } else {
        Alert.alert(
          '✔ CR Assigned Successfully',
          `Email: ${normalizedEmail}\n\nExisting account - Password remains unchanged.\n\nYou may need to use "Send Password Reset" manually if requested.`
        );
      }
    } catch (error) {
      console.error('Assign CR error:', error);
      Alert.alert('Error', `Failed to assign Class Representative: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }, [facultyId, collegeId, departmentId, departmentCode, departmentName, selectedYear, loadStudentsAndCR, buildDeptPaths]);


  const handleAssignCR = useCallback((student) => {
    const yearTitle = getYearTitle(selectedYear);

    // Smart slot selection
    const isSlot1Empty = !classRepresentatives.cr1;
    const isSlot2Empty = !classRepresentatives.cr2;
    const targetSlot = isSlot1Empty ? 'CR-1' : (isSlot2Empty ? 'CR-2' : 'CR-1');

    Alert.alert(
      'Assign Class Representative',
      `Make ${student.name || student.firstName || 'student'} the ${targetSlot} for ${yearTitle}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Assign', onPress: () => assignCRToSlot(targetSlot, student) },
      ]
    );
  }, [assignCRToSlot, classRepresentatives, selectedYear]);

  const handleDeactivateCR = useCallback((slot) => {
    Alert.alert(
      'Deactivate CR',
      `Deactivate ${slot} for ${getYearTitle(selectedYear)}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Deactivate',
          style: 'destructive',
          onPress: async () => {
            try {
              setLoading(true);
              const dept = getActiveDepartmentCode();
              if (!dept) {
                Alert.alert('Error', 'Department information missing.');
                return;
              }

              const currentCR = slot === 'CR-1' ? classRepresentatives.cr1 : classRepresentatives.cr2;
              if (!currentCR?.studentId) {
                Alert.alert('Error', 'No representative found for this slot.');
                return;
              }

              const { students: deptStudentPath, reps: deptCRPath } = buildDeptPaths(selectedYear);
              const batch = writeBatch(db);
              const nowIso = new Date().toISOString();

              // 1. Mark student document
              const studentRef = doc(db, deptStudentPath, currentCR.studentId);
              batch.set(studentRef, { isRepresentative: false, updatedAt: nowIso }, { merge: true });

              // 2. Exhaustive deactivation in tracking collection
              const repsRef = collection(db, deptCRPath);
              const repsSnap = await getDocs(repsRef);

              repsSnap.docs.forEach(repDoc => {
                const data = repDoc.data();
                if (data.studentId === currentCR.studentId || (currentCR.email && data.email === currentCR.email)) {
                  batch.set(repDoc.ref, {
                    active: false,
                    revokedAt: serverTimestamp(),
                    status: 'deactivated'
                  }, { merge: true });
                }
              });

              // 3. Clear user profile flags
              if (currentCR.uid) {
                batch.set(
                  doc(db, 'users', currentCR.uid),
                  {
                    role: 'student',
                    isCR: false,
                    active: true,
                    revokedAt: nowIso,
                    crCredentials: deleteField(),
                    crPosition: deleteField(),
                    crYear: deleteField(),
                    crDepartment: deleteField()
                  },
                  { merge: true }
                );
              }

              await batch.commit();

              cacheRef.current[cacheKeyFor(selectedYear)] = null;
              await loadStudentsAndCR(true);
              Alert.alert('Success', `${slot} deactivated`);
            } catch (error) {
              console.error('Deactivate CR error', error);
              Alert.alert('Error', 'Failed to deactivate CR');
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  }, [classRepresentatives, collegeId, departmentId, departmentCode, selectedYear, facultyId, loadStudentsAndCR]);

  // Permanently delete CR record
  const handleDeleteCR = useCallback((slot) => {
    Alert.alert(
      'Delete CR',
      `Permanently delete ${slot} for ${getYearTitle(selectedYear)}? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              setLoading(true);
              const dept = getActiveDepartmentCode();
              if (!dept) {
                Alert.alert('Error', 'Department information missing.');
                return;
              }

              const currentCR = slot === 'CR-1' ? classRepresentatives.cr1 : classRepresentatives.cr2;
              if (!currentCR?.studentId) {
                Alert.alert('Error', 'No representative found for this slot.');
                return;
              }

              const { students: deptStudentPath, reps: deptCRPath } = buildDeptPaths(selectedYear);
              const batch = writeBatch(db);
              const nowIso = new Date().toISOString();

              // 1. Mark student document
              const studentRef = doc(db, deptStudentPath, currentCR.studentId);
              batch.set(studentRef, { isRepresentative: false, updatedAt: nowIso }, { merge: true });

              // 2. Exhaustive cleanup in tracking collection
              const repsRef = collection(db, deptCRPath);
              const repsSnap = await getDocs(repsRef);

              repsSnap.docs.forEach(repDoc => {
                const data = repDoc.data();
                if (data.studentId === currentCR.studentId || (currentCR.email && data.email === currentCR.email)) {
                  batch.set(repDoc.ref, {
                    active: false,
                    deletedAt: serverTimestamp(),
                    status: 'deleted'
                  }, { merge: true });
                }
              });

              // 3. Clear user profile
              if (currentCR.uid) {
                batch.set(
                  doc(db, 'users', currentCR.uid),
                  {
                    isCR: false,
                    role: 'student',
                    active: true,
                    revokedAt: nowIso,
                    crCredentials: deleteField(),
                    crPosition: deleteField(),
                    crYear: deleteField(),
                    crDepartment: deleteField()
                  },
                  { merge: true }
                );
              }

              await batch.commit();

              cacheRef.current[cacheKeyFor(selectedYear)] = null;
              await loadStudentsAndCR(true);
              Alert.alert('Deleted', `${slot} removed`);
            } catch (error) {
              console.error('Delete CR error', error);
              Alert.alert('Error', 'Failed to delete CR');
            } finally {
              setLoading(false);
            }
          }
        }
      ]
    );
  }, [classRepresentatives, collegeId, departmentId, departmentCode, selectedYear, facultyId, loadStudentsAndCR]);

  const openCROptions = useCallback((slot) => {
    const cr = slot === 'CR-1' ? classRepresentatives.cr1 : classRepresentatives.cr2;
    const status = cr ? (cr.active ? 'Active' : 'Inactive') : 'Not assigned';
    const crName = cr ? (cr.name || cr.studentName) : 'No data';
    const crEmail = cr ? (cr.email || 'N/A') : 'N/A';
    Alert.alert(
      `${slot} Options`,
      `${crName}\n${crEmail}\nStatus: ${status}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'View Details',
          onPress: () => {
            if (!cr) { Alert.alert('No data', 'No CR assigned'); return; }
            const crRoll = cr.rollNo || cr.rollNumber || 'N/A';
            const info = `Student: ${crName}\nRoll: ${crRoll}\nEmail: ${crEmail}\nCR ID: ${cr.crUserId || 'N/A'}\nStatus: ${cr.active ? 'Active' : 'Inactive'}`;
            Alert.alert(`${slot} Details`, info);
          }
        },
        {
          text: 'View Credentials',
          onPress: async () => {
            if (!cr || !cr.uid) {
              Alert.alert('Error', 'CR user ID not found.');
              return;
            }
            try {
              setLoading(true);
              const userDocRef = doc(db, 'users', cr.uid);
              const userSnap = await getDoc(userDocRef);

              if (userSnap.exists()) {
                const userData = userSnap.data();
                const creds = userData.crCredentials;

                if (creds) {
                  const status = creds.accountStatus === 'new' ? '✅ Ready to Login' : '⚠️ Existing Account';
                  const rawPwd = creds.password || creds.tempPassword || 'N/A';
                  const isResetRequired = rawPwd === 'PASSWORD_RESET_REQUIRED';
                  const isExisting = rawPwd === '(existing account)';

                  let actionNote = '';
                  let displayPwd = rawPwd;

                  if (creds.accountStatus === 'new') {
                    actionNote = 'CR can log in with these credentials immediately.';
                  } else if (isResetRequired) {
                    displayPwd = 'Password set by CR via reset link';
                    actionNote = 'A password reset link has been sent to the CR email. They must set a new password before logging in.';
                  } else if (isExisting) {
                    displayPwd = 'Password managed by user';
                    actionNote = 'Use "Send Password Reset" to let CR set a new password.';
                  } else {
                    actionNote = 'Use "Send Password Reset" to let CR set a new password.';
                  }

                  Alert.alert(
                    `Saved CR Credentials`,
                    `CR Name: ${userData.name || 'N/A'}\nEmail: ${creds.email || 'N/A'}\nPassword: ${displayPwd}\n\nStatus: ${status}\n\n${actionNote}`
                  );
                } else {
                  Alert.alert('No Credentials', 'No credentials found. This CR may have been assigned before the credential system was implemented.');
                }
              } else {
                Alert.alert('Error', 'User document not found.');
              }
            } catch (error) {
              console.error('Error fetching credentials:', error);
              Alert.alert('Error', 'Failed to retrieve credentials.');
            } finally {
              setLoading(false);
            }
          }
        },
        {
          text: 'Send Password Reset',
          onPress: async () => {
            if (!cr || !cr.email) {
              Alert.alert('Error', 'No email found for this CR.');
              return;
            }
            try {
              setLoading(true);
              const secondaryAuth = getSecondaryAuth();
              await sendPasswordResetEmail(secondaryAuth, cr.email);
              Alert.alert(
                'Password Reset Sent',
                `A password reset email has been sent to ${cr.email}.\n\nThe CR must check their email and set a new password.`
              );
            } catch (error) {
              console.error('Error sending password reset:', error);
              Alert.alert('Error', `Failed to send password reset email.\n\n${error.message}`);
            } finally {
              setLoading(false);
            }
          }
        },
        { text: 'Deactivate', onPress: () => handleDeactivateCR(slot), style: 'destructive' },
        { text: 'Delete', onPress: () => handleDeleteCR(slot), style: 'destructive' },
      ]
    );
  }, [classRepresentatives, handleDeactivateCR, handleDeleteCR, collegeId, departmentId, selectedYear]);

  const handleSelectCR = useCallback(async (student) => {
    const yearLabel = getYearTitle(selectedYear);

    // Determine target slot based on availability to avoid overwriting CR-1
    const isSlot1Empty = !classRepresentatives.cr1;
    const isSlot2Empty = !classRepresentatives.cr2;
    const targetSlot = isSlot1Empty ? 'CR-1' : (isSlot2Empty ? 'CR-2' : 'CR-1');

    Alert.alert(
      'Assign Class Representative',
      `Assign ${student.name} as ${targetSlot} for ${yearLabel}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Assign', onPress: () => assignCRToSlot(targetSlot, student) },
      ]
    );
  }, [assignCRToSlot, selectedYear, classRepresentatives]);

  const handleReplaceCR = useCallback(async (slotName, student) => {
    const yearLabel = getYearTitle(selectedYear);
    const crToReplace = slotName === 'CR-1' ? classRepresentatives.cr1 : classRepresentatives.cr2;

    Alert.alert(
      'Replace Class Representative',
      `Replace ${crToReplace?.name || 'current CR'} with ${student.name} for ${yearLabel}? Old credentials will be revoked.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Replace',
          onPress: async () => {
            try {
              setLoading(true);
              const dept = getActiveDepartmentCode();
              if (!crToReplace || !crToReplace.email || !dept) {
                Alert.alert('Error', 'Unable to find CR to replace.');
                setLoading(false);
                return;
              }

              // First remove CR flag from the old CR user/student
              const { students: deptStudentPath, reps: deptCRPath } = buildDeptPaths(selectedYear);

              // 1. Exhaustive sweep for tracking records of the old CR
              const repsRef = collection(db, deptCRPath);
              const repsSnap = await getDocs(repsRef);

              const batch = writeBatch(db);

              repsSnap.docs.forEach(repDoc => {
                const data = repDoc.data();
                if (data.studentId === crToReplace?.studentId || data.email === crToReplace?.email) {
                  batch.set(repDoc.ref, {
                    active: false,
                    replacedAt: serverTimestamp(),
                    statusNote: `Replaced by ${student.name}`
                  }, { merge: true });
                }
              });

              // 2. Clear student document flags
              if (crToReplace?.studentId) {
                batch.set(
                  doc(db, deptStudentPath, crToReplace.studentId),
                  { isRepresentative: false, updatedAt: serverTimestamp() },
                  { merge: true }
                );
              }

              // 3. Ensure fixed ID record is inactive
              const crDocId = slotName === 'CR-1' ? 'cr_1' : 'cr_2';
              batch.set(doc(db, deptCRPath, crDocId), { active: false, replacedAt: serverTimestamp() }, { merge: true });

              // 4. Clear user profile credentials
              if (crToReplace?.uid) {
                batch.set(
                  doc(db, 'users', crToReplace.uid),
                  {
                    isCR: false,
                    role: 'student',
                    active: true,
                    revokedAt: serverTimestamp(),
                    crCredentials: deleteField()
                  },
                  { merge: true }
                );
              }
              await batch.commit();

              // Now assign the new CR (flags only)
              setLoading(false);
              await assignCRToSlot(slotName, student);
            } catch (error) {
              console.error('Replace CR error:', error);
              Alert.alert('Error', 'Failed to replace Class Representative: ' + error.message);
              setLoading(false);
            }
          }
        }
      ]
    );
  }, [assignCRToSlot, selectedYear, classRepresentatives, facultyId, getActiveDepartmentCode]);

  const handleViewSavedCredentials = useCallback(async () => {
    if (!collegeId || !getActiveDepartmentCode()) {
      Alert.alert('Error', 'Department information not available');
      return;
    }

    try {
      setLoading(true);
      const { reps: deptCRPath } = buildDeptPaths(selectedYear);
      const credentialsRef = collection(db, deptCRPath);
      const snapshot = await getDocs(credentialsRef);

      // Filter for active reps only
      const activeReps = snapshot.docs.filter(doc => doc.data().active === true);

      if (activeReps.length === 0) {
        Alert.alert('No Credentials', `No active CR credentials for ${getYearTitle(selectedYear)}`);
        setLoading(false);
        return;
      }

      // Build credentials list from active reps
      const credentialsList = activeReps.map((doc, idx) => {
        const data = doc.data();
        return {
          slot: data.slot || `CR ${idx + 1}`,
          email: data.email,
          password: data.password,
          passwordNote: data.passwordNote,
          authMethod: data.authMethod,
          name: data.name,
          assignedAt: data.assignedAt
        };
      });

      const yearLabel = getYearTitle(selectedYear);
      setSavedCredentials(credentialsList);
      setCredentialsYearLabel(yearLabel);
      setCredentialsModalVisible(true);
    } catch (error) {
      console.error('Error fetching credentials:', error);
      Alert.alert('Error', 'Failed to fetch saved credentials: ' + error.message);
    } finally {
      setLoading(false);
    }
  }, [collegeId, departmentId, departmentCode, selectedYear]);

  const buildCredentialMessage = useCallback((cred) => {
    let passwordLine = '';
    if (cred.password === 'PASSWORD_RESET_REQUIRED') {
      passwordLine = 'Action: Password set by CR via reset link.';
    } else if (cred.password === '(existing account)') {
      passwordLine = 'Action: Password managed by user.';
    } else {
      passwordLine = `Temporary Password: ${cred.password}`;
    }

    const noteLine = cred.passwordNote ? `\nNote: ${cred.passwordNote}` : '';
    const authMethodLine = cred.authMethod ? `\nAuth Method: ${cred.authMethod}` : '';

    return `Class Representative Credentials (${cred.slot})\nName: ${cred.name || 'N/A'}\nEmail/Username: ${cred.email}${authMethodLine}\n${passwordLine}${noteLine}\nKeep this confidential and change the password after first login.`;
  }, []);

  const shareCredential = useCallback(async (cred) => {
    try {
      const message = buildCredentialMessage(cred);

      if (Platform.OS === 'web') {
        // Web fallback: show alert with copy option
        Alert.alert(
          `Share ${cred.slot} Credentials`,
          message,
          [
            { text: 'Close', style: 'cancel' }
          ]
        );
      } else {
        // Native: use React Native Share API
        const { Share } = require('react-native');
        Share.share({
          message,
          title: `${cred.slot} Login Credentials`,
        });
      }
    } catch (error) {
      if (error?.message?.includes('cancel') || error?.message?.includes('dismissed')) {
        return;
      }
      console.warn('Share error:', error?.message || error);
      Alert.alert('Share Error', 'Unable to open share sheet. Please try again.');
    }
  }, [buildCredentialMessage]);

  const handleRemoveCR = useCallback(async (crSlot, student) => {
    const slotName = crSlot === 'cr1' ? 'CR-1' : 'CR-2';

    Alert.alert(
      'Remove Class Representative',
      `Remove ${student.name} from ${slotName}?\n\nTheir login credentials will be revoked.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              setLoading(true);
              const dept = getActiveDepartmentCode();
              const normalizedEmail = normalizeEmail(student.email);

              if (!dept || !normalizedEmail) {
                Alert.alert('Error', 'Department or email information missing.');
                return;
              }

              const { students: deptStudentPath, reps: deptCRPath } = buildDeptPaths(selectedYear);

              // 1. Comprehensive search for all tracking records for this student
              const repsRef = collection(db, deptCRPath);
              const repsSnap = await getDocs(repsRef);

              const batch = writeBatch(db);

              // 2. Deactivate any record matching this student's ID or Email
              repsSnap.docs.forEach(repDoc => {
                const data = repDoc.data();
                if (data.studentId === student.id || data.email === normalizedEmail) {
                  batch.set(repDoc.ref, {
                    active: false,
                    revokedAt: serverTimestamp(),
                    statusNote: 'Removed by faculty'
                  }, { merge: true });
                }
              });

              // 3. Update student document to remove CR status
              batch.set(
                doc(db, deptStudentPath, student.id),
                { isRepresentative: false, updatedAt: serverTimestamp() },
                { merge: true }
              );

              // 4. Lookup user by email to clear flags and credentials
              const usersRef = collection(db, 'users');
              const userQuery = query(usersRef, where('email', '==', normalizedEmail));
              const userSnap = await getDocs(userQuery);

              if (!userSnap.empty) {
                batch.set(
                  doc(db, 'users', userSnap.docs[0].id),
                  {
                    isCR: false,
                    role: 'student',
                    active: true,
                    disabledAt: serverTimestamp(),
                    crCredentials: deleteField(),
                    crPosition: deleteField(),
                    crYear: deleteField(),
                    crDepartment: deleteField()
                  },
                  { merge: true }
                );
              }

              await batch.commit();

              // Refresh data
              cacheRef.current[cacheKeyFor(selectedYear)] = null;
              await loadStudentsAndCR(true);

              Alert.alert('Success', `${student.name} removed from ${slotName}`);
            } catch (error) {
              console.error('Remove CR error:', error);
              Alert.alert('Error', 'Failed to remove Class Representative: ' + error.message);
            } finally {
              setLoading(false);
            }
          }
        }
      ]
    );
  }, [collegeId, departmentId, departmentCode, selectedYear, facultyId, loadStudentsAndCR, buildDeptPaths]);





  return (
    <SafeAreaView style={styles.container}>
      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#0f5f73" />
        </View>
      )}

      <View style={styles.header}>
        <TouchableOpacity onPress={() => showSubMenu ? navigation.goBack() : setShowSubMenu(true)}>
          <Ionicons name="chevron-back" size={24} color="#ffffff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{showSubMenu ? 'Student Management' : 'Student Management'}</Text>
        {!showSubMenu && (
          <TouchableOpacity
            style={styles.headerIconButton}
            onPress={handlePromoteAcademicYear}
            disabled={promoting}
            activeOpacity={0.7}
          >
            {promoting ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <Ionicons name="trending-up" size={20} color="#ffffff" />
            )}
          </TouchableOpacity>
        )}
        {showSubMenu && <View style={{ width: 24 }} />}
      </View>

      {/* Sub-Menu View */}
      {showSubMenu ? (
        <ScrollView contentContainerStyle={styles.subMenuContent}>
          <Text style={styles.subMenuTitle}>Student Management</Text>
          <Text style={styles.subMenuSubtitle}>Manage students, class representatives & announcements</Text>

          <View style={styles.subMenuGrid}>
            {/* Announcements Card */}
            <TouchableOpacity
              style={styles.subMenuCard}
              onPress={() => router.push('/send-announcement')}
              activeOpacity={0.85}
            >
              <View style={[styles.subMenuIconContainer, { backgroundColor: '#fef3c7' }]}>
                <Ionicons name="megaphone" size={40} color="#d97706" />
              </View>
              <Text style={styles.subMenuCardTitle}>Announcements</Text>
              <Text style={styles.subMenuCardDescription}>Share class updates</Text>
            </TouchableOpacity>

            {/* Students Card */}
            <TouchableOpacity
              style={styles.subMenuCard}
              onPress={() => {
                cacheRef.current = {};
                gridInitializedRef.current = false;
                setShowStudentView(true);
                setShowSubMenu(false);
              }}
              activeOpacity={0.85}
            >
              <View style={[styles.subMenuIconContainer, { backgroundColor: '#d1fae5' }]}>
                <Ionicons name="people" size={40} color="#0891b2" />
              </View>
              <Text style={styles.subMenuCardTitle}>Students</Text>
              <Text style={styles.subMenuCardDescription}>Manage students & classes</Text>
            </TouchableOpacity>

            {/* Class Representative Card */}
            <TouchableOpacity
              style={styles.subMenuCard}
              onPress={() => {
                cacheRef.current = {};
                setShowCRView(true);
                setShowSubMenu(false);
              }}
              activeOpacity={0.85}
            >
              <View style={[styles.subMenuIconContainer, { backgroundColor: '#e9d5ff' }]}>
                <Ionicons name="people-circle" size={40} color="#a855f7" />
              </View>
              <Text style={styles.subMenuCardTitle}>Class Representative</Text>
              <Text style={styles.subMenuCardDescription}>Manage class representatives</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      ) : (
        <>
          <View style={styles.scrollContent}>
            {/* Year Selection */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.yearScroll}
              decelerationRate="fast"
              scrollEventThrottle={16}
            >
              {yearOptions.map(yearMeta => {
                // Mapping: Year 1 = baseYear, Year 2 = baseYear - 1, Year 3 = baseYear - 2, Year 4 = baseYear - 3
                return (
                  <TouchableOpacity
                    key={yearMeta.currentYear}
                    style={[styles.pill, selectedYear === yearMeta.currentYear && styles.pillActive]}
                    onPress={() => setSelectedYear(yearMeta.currentYear)}
                  >
                    <Text style={[styles.pillText, selectedYear === yearMeta.currentYear && styles.pillTextActive]}>
                      Year {yearMeta.currentYear} – {yearMeta.academicYear}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <View style={styles.contextMetaRow}>
              <Ionicons name="business-outline" size={16} color="#0f5f73" style={{ marginRight: 6 }} />
              <Text style={styles.contextMetaText}>
                {departmentName || getActiveDepartmentCode() || 'Department'}
                {getActiveDepartmentCode() ? ` (${getActiveDepartmentCode()})` : ''}
              </Text>
            </View>



            {/* Main Action Buttons */}
            {!showStudentView && !showCRView ? (
              <View>
                <TouchableOpacity
                  style={styles.studentMainButton}
                  onPress={() => {
                    // Clear cache to force fresh load
                    cacheRef.current = {};
                    gridInitializedRef.current = false;
                    setShowStudentView(true);
                    // Data will be loaded by useEffect when showStudentView becomes true
                  }}
                >
                  <Ionicons name="people" size={20} color="#ffffff" />
                  <Text style={styles.studentMainButtonText}>Student</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.studentMainButton, { backgroundColor: '#2f6f44', marginTop: 12 }]}
                  onPress={() => {
                    // Clear cache to force fresh load
                    cacheRef.current = {};
                    setShowCRView(true);
                    // Data will be loaded by useEffect
                  }}
                >
                  <Ionicons name="shield-checkmark" size={20} color="#ffffff" />
                  <Text style={styles.studentMainButtonText}>Class Representative</Text>
                </TouchableOpacity>
              </View>
            ) : showStudentView ? (
              <View style={{ flex: 1, minHeight: 0 }}>
                {/* Section 1: Create Student List */}
                <View style={[styles.sectionContainer, { flex: 1, minHeight: 0 }]}>
                  <View style={styles.sectionHeader}>
                    <Text style={styles.sectionTitle}>Student List</Text>
                    <Text style={styles.sectionSubtitle}>
                      {(departmentName || getActiveDepartmentCode() || 'Department')}
                    </Text>
                  </View>

                  {/* Card Grid Controls + Actions */}
                  <View style={[styles.spreadsheetTabContent, { flex: 1, minHeight: 0 }]}>
                    <View style={styles.spreadsheetHeader}>
                      <View style={[styles.spreadsheetHeaderButtons, { flex: 1 }]}>
                        <TouchableOpacity
                          style={styles.addListButton}
                          onPress={handleCSVUpload}
                          disabled={loading}
                        >
                          <Ionicons name="cloud-upload-outline" size={14} color="#0f5f73" />
                          <Text style={styles.addListButtonText}>Upload CSV</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.downloadButton}
                          onPress={handleDownloadStudentsCSV}
                          disabled={loading}
                        >
                          <Ionicons name="download-outline" size={14} color="#ffffff" />
                          <Text style={styles.downloadButtonText}>Download</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.spreadsheetSaveButton}
                          onPress={handleSaveAllEditing}
                          disabled={loading || Object.keys(editingMap).length === 0}
                        >
                          {loading ? (
                            <ActivityIndicator size="small" color="#ffffff" />
                          ) : (
                            <>
                              <Ionicons name="save-outline" size={14} color="#ffffff" />
                              <Text style={styles.spreadsheetSaveText}>Save All</Text>
                            </>
                          )}
                        </TouchableOpacity>
                      </View>
                    </View>

                    {/* Filters Row */}
                    <View style={{ paddingHorizontal: 12, paddingBottom: 8, gap: 6 }}>
                      <View style={{ flexDirection: 'row', gap: 6 }}>
                        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 8, borderWidth: 1, borderColor: '#e0e4e8', paddingHorizontal: 8 }}>
                          <Ionicons name="search" size={14} color="#7f8c8d" />
                          <TextInput
                            placeholder="Search..."
                            placeholderTextColor="#95a5a6"
                            style={{ flex: 1, paddingVertical: 6, fontSize: 13, color: '#2c3e50' }}
                            value={searchQuery}
                            onChangeText={setSearchQuery}
                          />
                        </View>
                        <TouchableOpacity
                          onPress={() => setSortKey(sortKey === 'roll' ? 'name' : 'roll')}
                          style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 8, borderWidth: 1, borderColor: '#e0e4e8', paddingHorizontal: 8, paddingVertical: 6 }}
                        >
                          <Ionicons name={sortKey === 'roll' ? 'pricetags-outline' : 'person-outline'} size={14} color="#0f5f73" />
                          <Text style={{ marginLeft: 4, color: '#0f5f73', fontWeight: '700', fontSize: 11 }}>{sortKey === 'roll' ? 'Roll' : 'Name'}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                          style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 8, borderWidth: 1, borderColor: '#e0e4e8', paddingHorizontal: 8, paddingVertical: 6 }}
                        >
                          <Ionicons name={sortOrder === 'asc' ? 'arrow-up' : 'arrow-down'} size={14} color="#0f5f73" />
                        </TouchableOpacity>
                      </View>

                      <TouchableOpacity
                        style={{ alignSelf: 'flex-start', marginTop: 2, flexDirection: 'row', alignItems: 'center', backgroundColor: '#0f5f73', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 }}
                        onPress={handleAddStudentCard}
                      >
                        <Ionicons name="add-circle-outline" size={16} color="#fff" />
                        <Text style={{ marginLeft: 6, color: '#fff', fontWeight: '700', fontSize: 12 }}>Add Student</Text>
                      </TouchableOpacity>
                    </View>

                    {/* Grid - Scrollable Container */}
                    <View style={{ flex: 1, minHeight: 0 }}>
                      <ScrollView
                        style={{ flex: 1 }}
                        contentContainerStyle={{ paddingHorizontal: 6, paddingBottom: 8 }}
                        showsVerticalScrollIndicator={false}
                        nestedScrollEnabled={true}
                        decelerationRate="fast"
                        scrollEventThrottle={16}
                        keyboardShouldPersistTaps="handled"
                      >
                        {loading && students.length === 0 ? (
                          <View style={{ flexDirection: 'column', gap: 12 }}>
                            {[...Array(6)].map((_, i) => (
                              <View key={i} style={{ height: 120, borderRadius: 16, backgroundColor: '#eef1f4' }} />
                            ))}
                          </View>
                        ) : getVisibleStudents().length === 0 ? (
                          <View style={styles.emptyStateContainer}>
                            <Ionicons name="people-outline" size={48} color="#95a5a6" />
                            <Text style={styles.emptyStateText}>No students found</Text>
                            <Text style={styles.emptyStateSubtext}>Use Add Student or import with Add List</Text>
                          </View>
                        ) : (
                          getVisibleStudents().map((item) => {
                            const editing = editingMap[item.id];
                            return (
                              <View key={item.id} style={{ marginBottom: 8 }}>
                                <StudentCard
                                  student={item}
                                  isEditing={!!editing}
                                  onEdit={() => handleEditCard(item.id)}
                                  onChange={(next) => handleChangeCard(item.id, next)}
                                  onSave={(next) => handleSaveCard(item.id, next)}
                                  onCancel={() => handleCancelCard(item.id)}
                                  onDelete={() => handleDeleteCard(item)}
                                />
                              </View>
                            );
                          })
                        )}
                      </ScrollView>
                    </View>
                  </View>
                </View>
              </View>
            ) : showCRView ? (
              <View style={{ flex: 1, minHeight: 0 }}>
                {/* CR Selection View */}
                <View style={[styles.sectionContainer, { flex: 1, minHeight: 0 }]}>
                  <View style={styles.sectionHeader}>
                    <Text style={styles.sectionTitle}>Select Class Representatives</Text>
                    <Text style={styles.sectionSubtitle}>
                      Choose up to 2 students from your list • {(departmentName || getActiveDepartmentCode() || 'Department')}
                    </Text>
                  </View>

                  {/* Current CR Status */}
                  <View style={styles.crStatusContainer}>
                    <View style={styles.crStatusSlot}>
                      <Text style={styles.crStatusLabel}>CR 1:</Text>
                      <Text style={styles.crStatusValue}>
                        {classRepresentatives.cr1 ? (classRepresentatives.cr1.name || classRepresentatives.cr1.studentName) : 'Not Assigned'}
                      </Text>
                    </View>
                    <View style={styles.crStatusSlot}>
                      <Text style={styles.crStatusLabel}>CR 2:</Text>
                      <Text style={styles.crStatusValue}>
                        {classRepresentatives.cr2 ? (classRepresentatives.cr2.name || classRepresentatives.cr2.studentName) : 'Not Assigned'}
                      </Text>
                    </View>
                  </View>

                  {/* View Saved Credentials Button */}
                  <TouchableOpacity
                    style={styles.viewCredentialsButton}
                    onPress={handleViewSavedCredentials}
                  >
                    <Ionicons name="document-text" size={18} color="#ffffff" />
                    <Text style={styles.viewCredentialsText}>View Saved Credentials</Text>
                  </TouchableOpacity>

                  {/* Student List for CR Selection - Scrollable */}
                  <Text style={styles.studentListTitle}>Available Students ({students.length})</Text>
                  <View style={{ flex: 1, minHeight: 0 }}>
                    <ScrollView
                      style={{ flex: 1 }}
                      showsVerticalScrollIndicator={true}
                      nestedScrollEnabled={true}
                      contentContainerStyle={{ paddingBottom: 20 }}
                    >
                      {students.length === 0 ? (
                        <View style={styles.emptyStateContainer}>
                          <Ionicons name="people-outline" size={48} color="#95a5a6" />
                          <Text style={styles.emptyStateText}>No students found</Text>
                          <Text style={styles.emptyStateSubtext}>Add students first using the Student button</Text>
                        </View>
                      ) : (
                        students.map((student) => {
                          const isCR1 = classRepresentatives.cr1?.studentId === student.id;
                          const isCR2 = classRepresentatives.cr2?.studentId === student.id;
                          const isAssigned = isCR1 || isCR2;
                          const canAssign = !classRepresentatives.cr1 || !classRepresentatives.cr2;

                          return (
                            <View key={student.id} style={styles.crStudentCard}>
                              <View style={styles.crStudentInfo}>
                                <View style={styles.crStudentAvatar}>
                                  <Text style={styles.crStudentAvatarText}>
                                    {student.name?.charAt(0) || '?'}
                                  </Text>
                                </View>
                                <View style={styles.crStudentDetails}>
                                  <Text style={styles.crStudentName}>{student.name || 'Unknown'}</Text>
                                  <Text style={styles.crStudentMeta}>Roll: {student.rollNumber}</Text>
                                  {student.email && (
                                    <Text style={styles.crStudentEmail}>{student.email}</Text>
                                  )}
                                </View>
                              </View>
                              <View style={styles.crStudentActions}>
                                {isAssigned ? (
                                  <View style={styles.crBadgeContainer}>
                                    <View style={styles.crBadge}>
                                      <Ionicons name="shield-checkmark" size={16} color="#2f6f44" />
                                      <Text style={styles.crBadgeText}>{isCR1 ? 'CR 1' : 'CR 2'}</Text>
                                    </View>
                                    <TouchableOpacity
                                      style={styles.crRemoveButton}
                                      onPress={() => handleRemoveCR(isCR1 ? 'cr1' : 'cr2', student)}
                                    >
                                      <Ionicons name="close-circle" size={24} color="#e74c3c" />
                                    </TouchableOpacity>
                                  </View>
                                ) : canAssign ? (
                                  <TouchableOpacity
                                    style={styles.crAssignButton}
                                    onPress={() => handleSelectCR(student)}
                                  >
                                    <Text style={styles.crAssignButtonText}>Assign as CR</Text>
                                  </TouchableOpacity>
                                ) : classRepresentatives.cr1 && classRepresentatives.cr2 ? (
                                  <View style={styles.crReplaceRow}>
                                    <TouchableOpacity
                                      style={styles.crReplaceButton}
                                      onPress={() => handleReplaceCR('CR-1', student)}
                                    >
                                      <Text style={styles.crReplaceButtonText}>Replace CR 1</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                      style={styles.crReplaceButton}
                                      onPress={() => handleReplaceCR('CR-2', student)}
                                    >
                                      <Text style={styles.crReplaceButtonText}>Replace CR 2</Text>
                                    </TouchableOpacity>
                                  </View>
                                ) : null
                                }
                              </View>
                            </View>
                          );
                        })
                      )}
                    </ScrollView>
                  </View>
                </View>
              </View>
            ) : null}
          </View>
        </>
      )}

      <Modal
        visible={credentialsModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setCredentialsModalVisible(false)}
      >
        <View style={styles.credModalOverlay}>
          <View style={styles.credModalContent}>
            <View style={styles.credModalHeader}>
              <View>
                <Text style={styles.credModalTitle}>Saved CR Credentials</Text>
                {!!credentialsYearLabel && (
                  <Text style={styles.credModalSubtitle}>{credentialsYearLabel}</Text>
                )}
              </View>
              <TouchableOpacity
                accessibilityRole="button"
                style={styles.credCloseButton}
                onPress={() => setCredentialsModalVisible(false)}
              >
                <Ionicons name="close" size={22} color="#2c3e50" />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.credScroll}
              contentContainerStyle={{ paddingBottom: 12 }}
              showsVerticalScrollIndicator={true}
            >
              {savedCredentials.map((cred) => (
                <View key={`${cred.slot}-${cred.email}`} style={styles.credCard}>
                  <View style={styles.credCardHeader}>
                    <View>
                      <Text style={styles.credSlot}>{cred.slot}</Text>
                      <Text style={styles.credName}>{cred.name || 'Not provided'}</Text>
                      <Text style={styles.credEmail}>{cred.email}</Text>
                    </View>
                    <View style={[styles.credBadge, cred.password === 'PASSWORD_RESET_REQUIRED' ? styles.credBadgeWarning : styles.credBadgeReady]}>
                      <Text style={styles.credBadgeText}>
                        {cred.password === 'PASSWORD_RESET_REQUIRED' ? 'Reset Required' : 'Ready to Login'}
                      </Text>
                    </View>
                  </View>

                  {cred.password === 'PASSWORD_RESET_REQUIRED' ? (
                    <>
                      <Text style={styles.credPassword}>Password: Set by CR via reset link</Text>
                      <Text style={styles.credResetNote}>
                        Password reset email sent. CR must open the reset link to set a new password.
                      </Text>
                    </>
                  ) : cred.password === '(existing account)' ? (
                    <Text style={styles.credPassword}>Password: Managed by user</Text>
                  ) : (
                    <Text style={styles.credPassword}>Temp Password: {cred.password}</Text>
                  )}

                  {cred.passwordNote ? (
                    <Text style={styles.credNote}>Note: {cred.passwordNote}</Text>
                  ) : null}

                  <View style={styles.shareIconContainer}>
                    <TouchableOpacity
                      style={styles.shareIconButton}
                      onPress={() => shareCredential(cred)}
                      accessibilityRole="button"
                      accessibilityLabel={`Share ${cred.slot} credentials`}
                    >
                      <Ionicons name="share-social" size={20} color="#0f5f73" />
                      <Text style={styles.shareIconLabel}>Share</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: '#0f5f73' }]}
                onPress={() => setCredentialsModalVisible(false)}
              >
                <Text style={styles.modalBtnText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      {/* Promotion Progress Indicator */}
      {promoting && (
        <View style={styles.promoLoadingOverlay}>
          <ActivityIndicator size="large" color="#ffffff" />
          <Text style={styles.promoLoadingText}>Promoting Academic Year... Please wait.</Text>
        </View>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  promoLoadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
  },
  promoLoadingText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
    marginTop: 16,
  },
  subMenuContent: {
    flexGrow: 1,
    padding: 24,
    paddingTop: 16,
  },
  subMenuTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#0f5f73',
    marginBottom: 8,
  },
  subMenuSubtitle: {
    fontSize: 14,
    color: '#576b70',
    marginBottom: 32,
  },
  subMenuGrid: {
    gap: 16,
  },
  subMenuCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
    marginBottom: 8,
  },
  subMenuIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  subMenuCardTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#0f5f73',
    marginBottom: 4,
    textAlign: 'center',
  },
  subMenuCardDescription: {
    fontSize: 13,
    color: '#576b70',
    textAlign: 'center',
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255,255,255,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  header: {
    backgroundColor: '#0f5f73',
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffff',
  },
  headerIconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  yearScroll: {
    marginBottom: 10,
    marginHorizontal: -12,
    paddingHorizontal: 12,
    flexGrow: 0,
  },
  contextMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    paddingHorizontal: 2,
  },
  contextMetaText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#5a6c7d',
  },
  pill: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    marginRight: 6,
    borderWidth: 1,
    borderColor: '#e0e4e8',
  },
  pillActive: {
    backgroundColor: '#0f5f73',
    borderColor: '#0f5f73',
  },
  pillText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#2c3e50',
  },
  pillTextActive: {
    color: '#ffffff',
  },
  studentMainButton: {
    backgroundColor: '#0f5f73',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  studentMainButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#ffffff',
    marginLeft: 10,
  },
  sectionContainer: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  sectionHeader: {
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#2c3e50',
    marginBottom: 3,
  },
  sectionSubtitle: {
    fontSize: 11,
    color: '#7f8c8d',
  },
  classGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  classButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 8,
    backgroundColor: '#ffffff',
    borderRadius: 8,
    marginHorizontal: 4,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#eef1f4',
  },
  classButtonActive: {
    backgroundColor: '#2f6f44',
    borderColor: '#2f6f44',
  },
  classButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#2c3e50',
  },
  classButtonTextActive: {
    color: '#ffffff',
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    borderRadius: 8,
    padding: 4,
    marginBottom: 16,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 6,
  },
  tabActive: {
    backgroundColor: '#eef1f4',
  },
  tabText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#7f8c8d',
    marginLeft: 4,
  },
  tabTextActive: {
    color: '#0f5f73',
  },
  tabContent: {
    marginBottom: 20,
  },
  crSection: {
    marginBottom: 20,
  },
  crTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#2c3e50',
    marginBottom: 10,
  },
  crCard: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    padding: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#2f6f44',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  crInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  crText: {
    marginLeft: 12,
  },
  crName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#2c3e50',
  },
  crRoll: {
    fontSize: 11,
    color: '#7f8c8d',
    marginTop: 2,
  },
  noCR: {
    fontSize: 12,
    color: '#7f8c8d',
    fontStyle: 'italic',
    backgroundColor: '#f0f0f0',
    padding: 12,
    borderRadius: 8,
  },
  studentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  studentCount: {
    fontSize: 13,
    fontWeight: '700',
    color: '#2c3e50',
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: '#d6eaf8',
    borderRadius: 6,
  },
  addButtonText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#0f5f73',
    marginLeft: 4,
  },
  viewCredentialsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#3498db',
    borderRadius: 8,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  viewCredentialsText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#ffffff',
    marginLeft: 8,
  },
  emptyText: {
    fontSize: 12,
    color: '#7f8c8d',
    fontStyle: 'italic',
    backgroundColor: '#f0f0f0',
    padding: 16,
    borderRadius: 8,
    textAlign: 'center',
  },
  studentCard: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  studentInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  studentAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#0f5f73',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffff',
  },
  studentDetails: {
    flex: 1,
  },
  studentName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#2c3e50',
  },
  studentMeta: {
    fontSize: 11,
    color: '#7f8c8d',
    marginTop: 2,
  },
  studentEmail: {
    fontSize: 10,
    color: '#7f8c8d',
    marginTop: 2,
  },
  studentActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionIcon: {
    padding: 8,
  },
  actionButton: {
    backgroundColor: '#ffffff',
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  actionContent: {
    flex: 1,
    marginLeft: 12,
  },
  actionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#2c3e50',
  },
  actionDesc: {
    fontSize: 11,
    color: '#7f8c8d',
    marginTop: 2,
  },
  credModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  credModalContent: {
    width: '100%',
    maxWidth: 520,
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 6,
  },
  credModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  credModalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#2c3e50',
  },
  credModalSubtitle: {
    fontSize: 12,
    color: '#7f8c8d',
    marginTop: 2,
  },
  credCloseButton: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: '#f0f3f6',
  },
  credScroll: {
    maxHeight: 400,
  },
  credCard: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#eef1f4',
    backgroundColor: '#fdfefe',
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 3,
    elevation: 1,
  },
  credCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  credSlot: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0f5f73',
  },
  credName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#2c3e50',
    marginTop: 2,
  },
  credEmail: {
    fontSize: 12,
    color: '#7f8c8d',
    marginTop: 2,
  },
  credBadge: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 20,
  },
  credBadgeReady: {
    backgroundColor: '#e6f4ea',
  },
  credBadgeWarning: {
    backgroundColor: '#fff3cd',
  },
  credBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#2c3e50',
  },
  credPassword: {
    fontSize: 13,
    color: '#2c3e50',
    marginBottom: 6,
  },
  credResetNote: {
    fontSize: 12,
    color: '#b26a00',
    marginBottom: 6,
  },
  credNote: {
    fontSize: 12,
    color: '#2c3e50',
    marginBottom: 8,
  },
  shareIconContainer: {
    marginTop: 12,
    alignItems: 'flex-start',
  },
  shareIconButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: '#d6eaf8',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#0f5f73',
  },
  shareIconLabel: {
    color: '#0f5f73',
    fontWeight: '700',
    fontSize: 13,
  },
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'flex-end',
    zIndex: 2000,
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eef1f4',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#2c3e50',
  },
  modalBody: {
    paddingVertical: 16,
    paddingHorizontal: 16,
    maxHeight: 400,
  },
  errorBox: {
    backgroundColor: '#ffe6e6',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#c23b3b',
  },
  errorTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#c23b3b',
    marginBottom: 6,
  },
  errorText: {
    fontSize: 11,
    color: '#a82a2a',
    marginBottom: 4,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#2c3e50',
    marginTop: 12,
    marginBottom: 6,
  },
  formatHint: {
    fontSize: 11,
    color: '#7f8c8d',
    backgroundColor: '#f8f9fa',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 6,
    marginBottom: 12,
    fontFamily: 'monospace',
  },
  csvTextInput: {
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#eef1f4',
    paddingVertical: 10,
    paddingHorizontal: 12,
    fontSize: 11,
    color: '#2c3e50',
    fontFamily: 'monospace',
    minHeight: 160,
    textAlignVertical: 'top',
  },
  csvInputContainer: {
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#eef1f4',
    maxHeight: 200,
    overflow: 'hidden',
  },
  csvInput: {
    padding: 10,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: '#eef1f4',
  },
  modalBtn: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
    alignItems: 'center',
  },
  cancelBtn: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#eef1f4',
  },
  saveBtn: {
    backgroundColor: '#0f5f73',
  },
  modalBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#2c3e50',
  },
  saveBtnText: {
    color: '#ffffff',
  },
  previewContainer: {
    maxHeight: 400,
    paddingHorizontal: 0,
    paddingVertical: 12,
  },
  gridTable: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#eef1f4',
  },
  gridRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#eef1f4',
  },
  gridCell: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRightWidth: 1,
    borderRightColor: '#eef1f4',
    justifyContent: 'center',
  },
  headerCell: {
    backgroundColor: '#0f5f73',
    borderRightColor: '#0a4958',
  },
  headerText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#ffffff',
  },
  cellText: {
    fontSize: 11,
    color: '#2c3e50',
  },
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  spreadsheetModal: {
    width: '95%',
    maxHeight: '85%',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    overflow: 'hidden',
  },
  sheetRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
  },
  sheetCell: {
    borderRightWidth: 1,
    borderRightColor: '#ddd',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 4,
    backgroundColor: '#ffffff',
  },
  sheetHeaderCell: {
    backgroundColor: '#0f5f73',
    paddingVertical: 12,
  },
  sheetHeaderText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#ffffff',
    textAlign: 'center',
  },
  rowNumber: {
    fontSize: 12,
    fontWeight: '600',
    color: '#555',
  },
  sheetInput: {
    width: '100%',
    fontSize: 12,
    color: '#2c3e50',
    paddingVertical: 4,
    paddingHorizontal: 6,
    textAlign: 'left',
  },
  addRowBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    backgroundColor: '#f8f9fa',
    borderTopWidth: 2,
    borderTopColor: '#0f5f73',
  },
  addRowText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0f5f73',
    marginLeft: 6,
  },
  crManagementSection: {
    flexShrink: 0,
  },
  crManagementTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#2c3e50',
    marginBottom: 4,
  },
  crManagementSubtitle: {
    fontSize: 13,
    color: '#7f8c8d',
    marginBottom: 16,
  },
  crSlotsContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  crSlot: {
    flex: 1,
  },
  crSlotLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#2c3e50',
    marginBottom: 8,
  },
  crAssignedCard: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    padding: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#2f6f44',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  crAssignedContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  crAssignedName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#2c3e50',
  },
  crAssignedRoll: {
    fontSize: 11,
    color: '#7f8c8d',
    marginTop: 2,
  },
  crAssignedStatus: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 4,
  },
  crEmptySlot: {
    fontSize: 13,
    color: '#95a5a6',
    fontStyle: 'italic',
    padding: 12,
    textAlign: 'center',
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
  },
  crSelectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#2c3e50',
    marginBottom: 12,
  },
  crSelectionItem: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderLeftWidth: 4,
    borderLeftColor: '#0f5f73',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  crSelectionInfo: {
    flex: 1,
  },
  crSelectionName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#2c3e50',
  },
  crSelectionRoll: {
    fontSize: 11,
    color: '#7f8c8d',
    marginTop: 4,
  },
  crSelectButton: {
    padding: 6,
  },
  crAssignedBadge: {
    padding: 6,
  },
  // Spreadsheet Tab Styles
  spreadsheetTabContent: {
    flexShrink: 0,
    backgroundColor: '#f8f9fa',
  },
  spreadsheetHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 10,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  spreadsheetTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#2c3e50',
    flex: 1,
  },
  spreadsheetHeaderButtons: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
  },
  addListButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e8f5e9',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    gap: 4,
    borderWidth: 1,
    borderColor: '#0f5f73',
  },
  addListButtonText: {
    color: '#0f5f73',
    fontSize: 11,
    fontWeight: '600',
    marginLeft: 2,
  },
  downloadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#2ecc71',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    gap: 4,
  },
  downloadButtonText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '600',
    marginLeft: 2,
  },
  spreadsheetSaveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0f5f73',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    gap: 4,
  },
  spreadsheetSaveText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '600',
    marginLeft: 2,
  },
  spreadsheetContainer: {
    flexShrink: 0,
    backgroundColor: '#ffffff',
  },
  spreadsheetHeaderRow: {
    flexDirection: 'row',
    backgroundColor: '#ecf0f1',
    borderBottomWidth: 2,
    borderBottomColor: '#bdc3c7',
    height: 50,
  },
  spreadsheetHeaderScrollView: {
    flex: 1,
  },
  spreadsheetHeaderCell: {
    width: 120,
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
    borderRightWidth: 1,
    borderRightColor: '#bdc3c7',
    paddingHorizontal: 4,
  },
  spreadsheetHeaderText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2c3e50',
    textAlign: 'center',
  },
  spreadsheetDataScrollView: {
    flexShrink: 0,
  },
  spreadsheetRowsContainer: {
    flexDirection: 'column',
  },
  spreadsheetRow: {
    flexDirection: 'row',
    height: 50,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  spreadsheetRowNumberCell: {
    width: 50,
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    borderRightWidth: 1,
    borderRightColor: '#e0e0e0',
  },
  spreadsheetRowNumberText: {
    fontSize: 11,
    color: '#95a5a6',
    fontWeight: '600',
  },
  spreadsheetCell: {
    width: 120,
    height: 50,
    borderRightWidth: 1,
    borderRightColor: '#e0e0e0',
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  spreadsheetFirstColumn: {
    backgroundColor: '#fafafa',
  },
  spreadsheetCellEditing: {
    backgroundColor: '#e3f2fd',
    borderRightColor: '#2196f3',
  },
  spreadsheetCellTouchable: {
    flex: 1,
    justifyContent: 'center',
  },
  spreadsheetCellText: {
    fontSize: 12,
    color: '#2c3e50',
  },
  spreadsheetCellInput: {
    flex: 1,
    fontSize: 12,
    color: '#2c3e50',
    paddingHorizontal: 2,
    paddingVertical: 0,
  },
  spreadsheetDeleteCell: {
    width: 50,
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
    borderLeftWidth: 1,
    borderLeftColor: '#e0e0e0',
  },
  // CR Selection View Styles
  crStatusContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
    gap: 12,
  },
  crStatusSlot: {
    flex: 1,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  crStatusLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#7f8c8d',
    marginBottom: 4,
  },
  crStatusValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#2c3e50',
  },
  studentListTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#2c3e50',
    marginBottom: 12,
  },
  crStudentList: {
    maxHeight: 500,
  },
  crStudentCard: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  crStudentInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  crStudentAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#0f5f73',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  crStudentAvatarText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#ffffff',
  },
  crStudentDetails: {
    flex: 1,
  },
  crStudentName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#2c3e50',
    marginBottom: 2,
  },
  crStudentMeta: {
    fontSize: 12,
    color: '#7f8c8d',
    marginBottom: 2,
  },
  crStudentEmail: {
    fontSize: 11,
    color: '#95a5a6',
  },
  crStudentActions: {
    marginLeft: 12,
  },
  crBadgeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  crBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#d5f4e6',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    gap: 4,
  },
  crBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2f6f44',
  },
  crRemoveButton: {
    padding: 4,
  },
  crAssignButton: {
    backgroundColor: '#2f6f44',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 6,
  },
  crAssignButtonDisabled: {
    backgroundColor: '#95a5a6',
    opacity: 0.5,
  },
  crAssignButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#ffffff',
  },
  crReplaceRow: {
    flexDirection: 'row',
    gap: 8,
  },
  crReplaceButton: {
    backgroundColor: '#0f5f73',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 6,
  },
  crReplaceButtonDisabled: {
    backgroundColor: '#95a5a6',
    opacity: 0.6,
  },
  crReplaceButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#ffffff',
  },
  emptyStateContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyStateText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#7f8c8d',
    marginTop: 12,
  },
  emptyStateSubtext: {
    fontSize: 13,
    color: '#95a5a6',
    marginTop: 4,
    textAlign: 'center',
  },
});

export default StudentManagementScreen;
