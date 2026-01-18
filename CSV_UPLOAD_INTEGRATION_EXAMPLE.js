/**
 * CSV UPLOAD INTEGRATION EXAMPLE
 * 
 * This file shows the exact code to add to StudentManagementScreen.js
 * to integrate the CSV upload feature.
 * 
 * Copy the relevant sections into StudentManagementScreen.js
 */

// ============================================================================
// STEP 1: Add these imports at the top of StudentManagementScreen.js
// ============================================================================



// ============================================================================
// STEP 2: Add these state variables in the StudentManagementScreen component
// ============================================================================

// Inside the StudentManagementScreen function, add:

const [csvModalVisible, setCsvModalVisible] = useState(false);
const [csvUploadState, setCsvUploadState] = useState({
  selectedFile: null,
  previewData: null,
  loading: false,
});

// ============================================================================
// STEP 3: Create CSV handlers
// ============================================================================

// Add this function inside StudentManagementScreen component:

const createCSVHandlers = () => {
  return createCSVImportHandlers({
    onFileSelected: (file) => {
      setCsvUploadState(prev => ({ ...prev, selectedFile: file }));
    },
    onPreviewLoaded: (preview) => {
      setCsvUploadState(prev => ({ ...prev, previewData: preview }));
    },
    onUpdateStudents: async (students) => {
      try {
        // Normalize incoming students to match grid format
        const normalizedNewStudents = students.map(s => ({
          id: `student_${s.rollNumber.toLowerCase().replace(/\s+/g, '_')}`,
          rollNo: s.rollNumber,
          name: s.name,
          email: s.email,
          phone: s.phone,
          year: s.year || selectedYear,
        }));

        // Get existing students that have data
        const existingData = spreadsheetGridData.filter(row =>
          (row.rollNo && row.rollNo.trim()) || (row.name && row.name.trim())
        );

        // Combine and remove duplicates by roll number
        const combinedStudents = [...existingData];
        const existingRolls = new Set(existingData.map(s => s.rollNo?.toLowerCase()));
        
        for (const newStudent of normalizedNewStudents) {
          if (!existingRolls.has(newStudent.rollNo.toLowerCase())) {
            combinedStudents.push(newStudent);
          }
        }

        // Sort by roll number
        combinedStudents.sort((a, b) => {
          const aNum = parseInt(a.rollNo, 10) || 0;
          const bNum = parseInt(b.rollNo, 10) || 0;
          return aNum - bNum;
        });

        // Build new grid from combined students
        const newGrid = buildGridFromRows(combinedStudents);
        setSpreadsheetGridData(newGrid);

        // Auto-save to Firestore
        await persistSpreadsheetGrid(newGrid, { refresh: true });

        return true;
      } catch (error) {
        console.error('Error importing students:', error);
        throw error;
      }
    },
    onSuccess: (result) => {
      Alert.alert(
        'Import Successful',
        `Successfully imported ${result.count} student(s)!\n\nClick "Save All" to save all changes to Firestore.`,
        [{ text: 'OK' }]
      );
      resetCSVState();
      setCsvModalVisible(false);
    },
    onError: (error) => {
      Alert.alert('Import Error', error || 'Failed to import CSV');
    },
    existingStudents: getVisibleStudents(),
  });
};

// Memoize CSV handlers to avoid recreating on every render
const csvHandlers = React.useMemo(() => createCSVHandlers(), [
  spreadsheetGridData,
  selectedYear,
  getVisibleStudents(),
]);

// ============================================================================
// STEP 4: Add handler functions
// ============================================================================

const handleCSVFileSelect = async () => {
  setCsvUploadState(prev => ({ ...prev, loading: true }));
  try {
    const file = await csvHandlers.handleSelectCSVFile();
    if (file) {
      // File selected, now process it for preview
      await csvHandlers.handlePreviewCSV(file.uri);
    }
  } catch (error) {
    Alert.alert('Error', error.message);
  } finally {
    setCsvUploadState(prev => ({ ...prev, loading: false }));
  }
};

const handleCSVUpload = async (students) => {
  setCsvUploadState(prev => ({ ...prev, loading: true }));
  try {
    await csvHandlers.handleImportStudents(students);
  } catch (error) {
    Alert.alert('Error', error.message);
  } finally {
    setCsvUploadState(prev => ({ ...prev, loading: false }));
  }
};

const resetCSVState = () => {
  setCsvUploadState({
    selectedFile: null,
    previewData: null,
    loading: false,
  });
};

// ============================================================================
// STEP 5: Add this UI button in the render section
// ============================================================================

// Find the section where student management buttons are displayed
// (near where "Download CSV" or "Add Student" buttons are)
// Add this button:

<TouchableOpacity
  style={[styles.actionButton, { backgroundColor: '#0f5f73' }]}
  onPress={() => setCsvModalVisible(true)}
  disabled={loading}
>
  <MaterialCommunityIcons name="file-import" size={20} color="#ffffff" />
  <Text style={styles.actionButtonText}>Import from CSV</Text>
</TouchableOpacity>

// ============================================================================
// STEP 6: Add the CSV Modal component at the end of the render section
// ============================================================================

<CSVUploadModal
  visible={csvModalVisible}
  onClose={() => {
    setCsvModalVisible(false);
    resetCSVState();
  }}
  onFileSelect={handleCSVFileSelect}
  onUpload={handleCSVUpload}
  selectedFile={csvUploadState.selectedFile}
  previewData={csvUploadState.previewData}
  loading={csvUploadState.loading}
  errors={csvUploadState.previewData?.errors || []}
/>

// ============================================================================
// STEP 7: Update the actionButton style in StyleSheet
// ============================================================================

// Find the StyleSheet.create at the bottom of the file
// Add or update these styles:

actionButton: {
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: '#2f6f44',
  paddingHorizontal: 16,
  paddingVertical: 12,
  borderRadius: 8,
  gap: 8,
  marginHorizontal: 12,
  marginVertical: 6,
},
actionButtonText: {
  fontSize: 14,
  fontWeight: '600',
  color: '#ffffff',
},

// ============================================================================
// COMPLETE MINIMAL INTEGRATION EXAMPLE
// ============================================================================

/**
 * If you want a minimal example, use this simpler version:
 */

// At the top:
import CSVUploadModal from '../components/CSVUploadModal';
import { createCSVImportHandlers } from '../utils/csvImportIntegration';

// In component:
const [csvModalVisible, setCsvModalVisible] = useState(false);
const [csvUploadState, setCsvUploadState] = useState({
  selectedFile: null,
  previewData: null,
  loading: false,
});

// Simple handlers:
const csvHandlers = createCSVImportHandlers({
  onFileSelected: (file) => {
    setCsvUploadState(prev => ({ ...prev, selectedFile: file }));
  },
  onPreviewLoaded: (preview) => {
    setCsvUploadState(prev => ({ ...prev, previewData: preview }));
  },
  onUpdateStudents: async (students) => {
    // Simple: just add to grid
    const newGrid = buildGridFromRows([
      ...spreadsheetGridData,
      ...students.map(s => ({
        rollNo: s.rollNumber,
        name: s.name,
        email: s.email,
        phone: s.phone,
      }))
    ]);
    setSpreadsheetGridData(newGrid);
    await persistSpreadsheetGrid(newGrid);
  },
  onSuccess: () => {
    Alert.alert('Success', 'Students imported!');
    setCsvModalVisible(false);
    setCsvUploadState({ selectedFile: null, previewData: null, loading: false });
  },
  onError: (error) => {
    Alert.alert('Error', error);
  },
  existingStudents: getVisibleStudents(),
});

// File selection:
const handleSelectFile = async () => {
  setCsvUploadState(prev => ({ ...prev, loading: true }));
  try {
    const file = await csvHandlers.handleSelectCSVFile();
    if (file) await csvHandlers.handlePreviewCSV(file.uri);
  } finally {
    setCsvUploadState(prev => ({ ...prev, loading: false }));
  }
};

// In render:
<TouchableOpacity onPress={() => setCsvModalVisible(true)}>
  <Text>Import CSV</Text>
</TouchableOpacity>

<CSVUploadModal
  visible={csvModalVisible}
  onClose={() => setCsvModalVisible(false)}
  onFileSelect={handleSelectFile}
  onUpload={(students) => {
    setCsvUploadState(prev => ({ ...prev, loading: true }));
    csvHandlers.handleImportStudents(students)
      .finally(() => setCsvUploadState(prev => ({ ...prev, loading: false })));
  }}
  selectedFile={csvUploadState.selectedFile}
  previewData={csvUploadState.previewData}
  loading={csvUploadState.loading}
  errors={csvUploadState.previewData?.errors || []}
/>

// ============================================================================
// ERROR HANDLING EXAMPLE
// ============================================================================

/**
 * If you want advanced error handling:
 */

const handleCSVFileSelectWithErrorHandling = async () => {
  setCsvUploadState(prev => ({ ...prev, loading: true }));
  try {
    const file = await csvHandlers.handleSelectCSVFile();
    if (!file) {
      // User cancelled
      setCsvUploadState(prev => ({ ...prev, loading: false }));
      return;
    }

    // Process the file
    const preview = await csvHandlers.handlePreviewCSV(file.uri);
    if (!preview) {
      throw new Error('Failed to process CSV');
    }

    // Check for specific error conditions
    if (preview.errorSummary.length > 0) {
      console.warn('CSV Processing warnings:', preview.errorSummary);
      Alert.alert(
        'CSV Issues',
        `Found ${preview.errorSummary.length} issues:\n\n${preview.errorSummary.slice(0, 3).join('\n')}`
      );
    }

  } catch (error) {
    console.error('CSV selection error:', error);
    Alert.alert('Error', `Failed to select CSV: ${error.message}`);
  } finally {
    setCsvUploadState(prev => ({ ...prev, loading: false }));
  }
};

// ============================================================================
// LOGGING & DEBUG EXAMPLE
// ============================================================================

/**
 * Add logging for debugging:
 */

const handleCSVUploadWithLogging = async (students) => {
  console.log('🚀 Starting CSV import');
  console.log('📊 Students to import:', students.length);
  students.slice(0, 3).forEach(s => {
    console.log(`  - ${s.rollNumber}: ${s.name} (${s.email})`);
  });

  setCsvUploadState(prev => ({ ...prev, loading: true }));
  try {
    await csvHandlers.handleImportStudents(students);
    console.log('✅ CSV import successful');
  } catch (error) {
    console.error('❌ CSV import failed:', error);
    Alert.alert('Error', error.message);
  } finally {
    setCsvUploadState(prev => ({ ...prev, loading: false }));
  }
};

// ============================================================================
// TESTING SCENARIOS
// ============================================================================

/**
 * For testing, create these test files in your project:
 * 
 * students_valid.csv:
 * Roll No,Name,Email,Phone
 * 1001,John Doe,john@example.com,9876543210
 * 1002,Jane Smith,jane@example.com,9876543211
 * 
 * students_errors.csv:
 * Roll No,Name,Email
 * 1001,John,invalid-email
 * ,Jane,jane@example.com
 * 
 * students_duplicates.csv:
 * Roll No,Name,Email
 * 1001,John,john@example.com
 * 1001,Jane,jane@example.com
 * 
 * Then test each scenario to verify error handling works correctly.
 */

export {
  // Export for testing
  createCSVHandlers,
  handleCSVFileSelect,
  handleCSVUpload,
  resetCSVState,
};
