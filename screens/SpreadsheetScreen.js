import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from 'expo-router';
import { collection, doc, getDocs, setDoc } from 'firebase/firestore';
import React, { useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { auth, db } from '../firebase/firebaseConfig';

const CELL_WIDTH = 120;
const CELL_HEIGHT = 50;
const COLUMN_COUNT = 4; // Roll No, Name, Email, Phone
const INITIAL_ROWS = 100; // Start with 100 rows
const ROW_NUMBER_WIDTH = 50;

const SpreadsheetScreen = ({ route }) => {
  const navigation = useNavigation();
  const { year } = route.params || {};
  
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('spreadsheet');
  const [editingCell, setEditingCell] = useState(null);
  const [scrollY, setScrollY] = useState(0);
  
  const facultyId = auth.currentUser?.uid;
  const mainScrollRef = useRef(null);
  const headerScrollRef = useRef(null);

  const columns = ['Roll No', 'Name', 'Email', 'Phone'];
  const columnKeys = ['rollNo', 'name', 'email', 'phone'];

  // Initialize data with empty rows
  useEffect(() => {
    loadStudentData();
  }, [year, facultyId]);

  const loadStudentData = async () => {
    if (!facultyId || !year) {
      // Initialize with empty rows
      const emptyRows = Array.from({ length: INITIAL_ROWS }, (_, i) => ({
        id: `row_${i}`,
        rollNo: '',
        name: '',
        email: '',
        phone: '',
      }));
      setData(emptyRows);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const yearKey = `year${year}`;
      const basePath = `faculty/${facultyId}/years/${yearKey}`;
      const studentsRef = collection(db, basePath, 'students');
      const snapshot = await getDocs(studentsRef);

      // Get existing students sorted by Roll No
      const existingStudents = snapshot.docs.map(d => ({
        id: d.id,
        rollNo: d.data().rollNumber || '',
        name: d.data().firstName ? `${d.data().firstName} ${d.data().lastName || ''}`.trim() : '',
        email: d.data().email || '',
        phone: d.data().mobile || '',
      })).sort((a, b) => {
        const numA = parseInt(a.rollNo, 10) || 0;
        const numB = parseInt(b.rollNo, 10) || 0;
        return numA - numB;
      });

      // Create array with existing students + empty rows
      const totalRows = Math.max(INITIAL_ROWS, existingStudents.length + 50);
      const allRows = Array.from({ length: totalRows }, (_, i) => {
        if (i < existingStudents.length) {
          return existingStudents[i];
        }
        return {
          id: `row_${i}`,
          rollNo: '',
          name: '',
          email: '',
          phone: '',
        };
      });

      setData(allRows);
    } catch (error) {
      console.error('Error loading student data:', error);
      Alert.alert('Error', 'Failed to load student data');
      const emptyRows = Array.from({ length: INITIAL_ROWS }, (_, i) => ({
        id: `row_${i}`,
        rollNo: '',
        name: '',
        email: '',
        phone: '',
      }));
      setData(emptyRows);
    } finally {
      setLoading(false);
    }
  };

  const updateCell = (rowIndex, colIndex, value) => {
    setData(prevData => {
      const newData = [...prevData];
      newData[rowIndex] = {
        ...newData[rowIndex],
        [columnKeys[colIndex]]: value,
      };
      return newData;
    });
  };

  const deleteRow = (rowIndex) => {
    setData(prevData => {
      const newData = [...prevData];
      newData[rowIndex] = {
        ...newData[rowIndex],
        rollNo: '',
        name: '',
        email: '',
        phone: '',
      };
      return newData;
    });
  };

  const handleSave = async () => {
    if (!facultyId || !year) {
      Alert.alert('Error', 'Missing required data');
      return;
    }

    try {
      setSaving(true);
      const yearKey = `year${year}`;
      const basePath = `faculty/${facultyId}/years/${yearKey}`;

      // Get only non-empty rows (with Roll No)
      const validRows = data.filter(row => row.rollNo && row.rollNo.trim() !== '');

      if (validRows.length === 0) {
        Alert.alert('No Data', 'Please add at least one student with a Roll Number');
        setSaving(false);
        return;
      }

      // Save each student to Firestore
      for (const row of validRows) {
        const studentId = row.id && !row.id.startsWith('row_') ? row.id : `student_${row.rollNo}`;
        const docRef = doc(db, basePath, 'students', studentId);
        
        await setDoc(docRef, {
          rollNumber: row.rollNo,
          firstName: row.name.split(' ')[0] || '',
          lastName: row.name.split(' ').slice(1).join(' ') || '',
          email: row.email || '',
          mobile: row.phone || '',
          active: true,
          createdAt: new Date().toISOString(),
        }, { merge: true });
      }

      Alert.alert('Success', `Saved ${validRows.length} student(s) successfully`);
      await loadStudentData();
    } catch (error) {
      console.error('Error saving data:', error);
      Alert.alert('Error', 'Failed to save student data');
    } finally {
      setSaving(false);
    }
  };

  const handleScroll = (event) => {
    const offsetX = event.nativeEvent.contentOffset.x;
    if (headerScrollRef.current) {
      headerScrollRef.current.scrollTo({ x: offsetX, animated: false });
    }
  };

  const renderCell = (rowIndex, colIndex, value) => {
    const isEditing = editingCell?.rowIndex === rowIndex && editingCell?.colIndex === colIndex;

    return (
      <View
        key={`cell-${rowIndex}-${colIndex}`}
        style={[
          styles.cell,
          colIndex === 0 && styles.firstColumn,
          isEditing && styles.cellEditing,
        ]}
      >
        {isEditing ? (
          <TextInput
            style={styles.cellInput}
            value={value}
            onChangeText={(text) => updateCell(rowIndex, colIndex, text)}
            onBlur={() => setEditingCell(null)}
            autoFocus
            placeholder={columns[colIndex]}
            placeholderTextColor="#ccc"
          />
        ) : (
          <TouchableOpacity
            style={styles.cellTouchable}
            onPress={() => setEditingCell({ rowIndex, colIndex })}
          >
            <Text style={styles.cellText} numberOfLines={1}>
              {value || ''}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  const renderRow = (rowIndex) => {
    const row = data[rowIndex];
    if (!row) return null;

    return (
      <View key={`row-${rowIndex}`} style={styles.row}>
        <View style={styles.rowNumberCell}>
          <Text style={styles.rowNumberText}>{rowIndex + 1}</Text>
        </View>
        {columns.map((col, colIndex) => 
          renderCell(rowIndex, colIndex, row[columnKeys[colIndex]])
        )}
        <TouchableOpacity
          style={styles.deleteCell}
          onPress={() => {
            Alert.alert(
              'Clear Row',
              'Clear all data in this row?',
              [
                { text: 'Cancel' },
                {
                  text: 'Clear',
                  onPress: () => deleteRow(rowIndex),
                  style: 'destructive',
                },
              ]
            );
          }}
        >
          <Ionicons name="trash-outline" size={18} color="#e74c3c" />
        </TouchableOpacity>
      </View>
    );
  };

  const renderStudentList = () => {
    const sortedStudents = data
      .filter(row => row.rollNo && row.rollNo.trim() !== '')
      .sort((a, b) => {
        const numA = parseInt(a.rollNo, 10) || 0;
        const numB = parseInt(b.rollNo, 10) || 0;
        return numA - numB;
      });

    return (
      <ScrollView style={styles.listContainer}>
        {sortedStudents.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="document-outline" size={48} color="#95a5a6" />
            <Text style={styles.emptyStateText}>No students added yet</Text>
          </View>
        ) : (
          sortedStudents.map((student, index) => (
            <View key={`student-${student.id}-${index}`} style={styles.listItem}>
              <View style={styles.listItemContent}>
                <View style={styles.listItemRow}>
                  <Text style={styles.listItemLabel}>Roll No:</Text>
                  <Text style={styles.listItemValue}>{student.rollNo}</Text>
                </View>
                <View style={styles.listItemRow}>
                  <Text style={styles.listItemLabel}>Name:</Text>
                  <Text style={styles.listItemValue}>{student.name}</Text>
                </View>
                <View style={styles.listItemRow}>
                  <Text style={styles.listItemLabel}>Email:</Text>
                  <Text style={[styles.listItemValue, styles.emailText]}>{student.email}</Text>
                </View>
                <View style={styles.listItemRow}>
                  <Text style={styles.listItemLabel}>Phone:</Text>
                  <Text style={styles.listItemValue}>{student.phone}</Text>
                </View>
              </View>
            </View>
          ))
        )}
      </ScrollView>
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Ionicons name="chevron-back" size={24} color="#ffffff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Student List</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#0f5f73" />
          <Text style={styles.loadingText}>Loading student data...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={24} color="#ffffff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Student List</Text>
        <TouchableOpacity onPress={handleSave} disabled={saving}>
          {saving ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <Ionicons name="save-outline" size={24} color="#ffffff" />
          )}
        </TouchableOpacity>
      </View>

      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'spreadsheet' && styles.tabButtonActive]}
          onPress={() => setActiveTab('spreadsheet')}
        >
          <Ionicons name="grid-outline" size={18} color={activeTab === 'spreadsheet' ? '#0f5f73' : '#95a5a6'} />
          <Text style={[styles.tabButtonText, activeTab === 'spreadsheet' && styles.tabButtonTextActive]}>
            Spreadsheet
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'list' && styles.tabButtonActive]}
          onPress={() => setActiveTab('list')}
        >
          <Ionicons name="list-outline" size={18} color={activeTab === 'list' ? '#0f5f73' : '#95a5a6'} />
          <Text style={[styles.tabButtonText, activeTab === 'list' && styles.tabButtonTextActive]}>
            Student List
          </Text>
        </TouchableOpacity>
      </View>

      {activeTab === 'spreadsheet' ? (
        <View style={styles.spreadsheetContainer}>
          {/* Header Row */}
          <View style={styles.headerRow}>
            <View style={styles.rowNumberCell}>
              <Text style={styles.headerText}>#</Text>
            </View>
            <ScrollView
              ref={headerScrollRef}
              horizontal
              scrollEnabled={false}
              showsHorizontalScrollIndicator={false}
              style={styles.headerScrollView}
            >
              {columns.map((col, idx) => (
                <View key={`header-${idx}`} style={styles.headerCell}>
                  <Text style={styles.headerText}>{col}</Text>
                </View>
              ))}
            </ScrollView>
            <View style={styles.deleteCell} />
          </View>

          {/* Data Rows */}
          <ScrollView
            style={styles.dataScrollView}
            showsVerticalScrollIndicator={true}
            nestedScrollEnabled={true}
          >
            <ScrollView
              ref={mainScrollRef}
              horizontal
              showsHorizontalScrollIndicator={true}
              onScroll={handleScroll}
              scrollEventThrottle={16}
            >
              <View style={styles.rowsContainer}>
                {data.map((row, idx) => renderRow(idx))}
              </View>
            </ScrollView>
          </ScrollView>
        </View>
      ) : (
        renderStudentList()
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  header: {
    backgroundColor: '#0f5f73',
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#07292d',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 4,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffff',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    color: '#576b70',
    fontSize: 14,
  },
  tabContainer: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    backgroundColor: '#ffffff',
  },
  tabButton: {
    flex: 1,
    flexDirection: 'row',
    paddingVertical: 12,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 3,
    borderBottomColor: 'transparent',
  },
  tabButtonActive: {
    borderBottomColor: '#0f5f73',
  },
  tabButtonText: {
    marginLeft: 6,
    fontSize: 13,
    fontWeight: '600',
    color: '#95a5a6',
  },
  tabButtonTextActive: {
    color: '#0f5f73',
  },
  spreadsheetContainer: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  headerRow: {
    flexDirection: 'row',
    backgroundColor: '#ecf0f1',
    borderBottomWidth: 2,
    borderBottomColor: '#bdc3c7',
    height: CELL_HEIGHT,
  },
  headerScrollView: {
    flex: 1,
  },
  headerCell: {
    width: CELL_WIDTH,
    height: CELL_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
    borderRightWidth: 1,
    borderRightColor: '#bdc3c7',
    paddingHorizontal: 4,
  },
  headerText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2c3e50',
    textAlign: 'center',
  },
  dataScrollView: {
    flex: 1,
  },
  rowsContainer: {
    flexDirection: 'column',
  },
  row: {
    flexDirection: 'row',
    height: CELL_HEIGHT,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  rowNumberCell: {
    width: ROW_NUMBER_WIDTH,
    height: CELL_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    borderRightWidth: 1,
    borderRightColor: '#e0e0e0',
  },
  rowNumberText: {
    fontSize: 11,
    color: '#95a5a6',
    fontWeight: '600',
  },
  cell: {
    width: CELL_WIDTH,
    height: CELL_HEIGHT,
    borderRightWidth: 1,
    borderRightColor: '#e0e0e0',
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  firstColumn: {
    backgroundColor: '#fafafa',
  },
  cellEditing: {
    backgroundColor: '#e3f2fd',
    borderRightColor: '#2196f3',
  },
  cellTouchable: {
    flex: 1,
    justifyContent: 'center',
  },
  cellText: {
    fontSize: 12,
    color: '#2c3e50',
  },
  cellInput: {
    flex: 1,
    fontSize: 12,
    color: '#2c3e50',
    paddingHorizontal: 2,
    paddingVertical: 0,
  },
  deleteCell: {
    width: 50,
    height: CELL_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
    borderLeftWidth: 1,
    borderLeftColor: '#e0e0e0',
  },
  listContainer: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#f8f9fa',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyStateText: {
    fontSize: 14,
    color: '#95a5a6',
    marginTop: 12,
  },
  listItem: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#0f5f73',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  listItemContent: {
    gap: 6,
  },
  listItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  listItemLabel: {
    fontSize: 11,
    color: '#95a5a6',
    fontWeight: '600',
    width: 70,
  },
  listItemValue: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: '#2c3e50',
  },
  emailText: {
    fontSize: 12,
  },
});

export default SpreadsheetScreen;
