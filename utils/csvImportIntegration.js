/**
 * CSV Import Integration - Integration guide and helper functions
 * This file shows how to integrate the CSV upload feature into StudentManagementScreen
 */

import * as DocumentPicker from 'expo-document-picker';
import { isValidCSVFile, processCSVUpload } from '../utils/csvUploadHelper';

/**
 * Main CSV import handler
 * Integrates with StudentManagementScreen lifecycle
 * 
 * Usage in component:
 * const [csvModalVisible, setCsvModalVisible] = useState(false);
 * const [csvUploadState, setCsvUploadState] = useState({ file: null, preview: null });
 * 
 * Then call: handleCSVImportFlow()
 */
export const createCSVImportHandlers = ({
  onUpdateStudents, // Function to update students in state
  onFileSelected, // Function to update file selection state
  onPreviewLoaded, // Function to update preview state
  existingStudents = [], // Current students in system
  onSuccess, // Callback after successful import
  onError, // Error callback
}) => {
  return {
    /**
     * Step 1: Open file picker and validate selection
     */
    handleSelectCSVFile: async () => {
      try {
        const result = await DocumentPicker.getDocumentAsync({
          type: ['text/csv', 'text/comma-separated-values', 'application/csv'],
          copyToCacheDirectory: true,
        });

        if (result.canceled) {
          return null;
        }

        const file = result.assets[0];
        if (!file || !file.uri) {
          onError?.('No file selected');
          return null;
        }

        // Validate file type
        if (!isValidCSVFile(file.mimeType, file.name)) {
          onError?.(`Invalid file type. Please select a CSV file. Got: ${file.mimeType}`);
          return null;
        }

        // Update UI with file selection
        onFileSelected?.({
          name: file.name,
          uri: file.uri,
          size: file.size,
          mimeType: file.mimeType,
        });

        return file;
      } catch (error) {
        onError?.(error.message);
        return null;
      }
    },

    /**
     * Step 2: Process and preview CSV file
     */
    handlePreviewCSV: async (fileUri) => {
      try {
        const result = await processCSVUpload(fileUri, existingStudents);

        if (!result.success) {
          onError?.(result.error || result.errorSummary?.[0] || 'Failed to process CSV');
          return null;
        }

        // Update preview state
        onPreviewLoaded?.(result);

        return result;
      } catch (error) {
        onError?.(error.message);
        return null;
      }
    },

    /**
     * Step 3: Import validated students into system
     */
    handleImportStudents: async (students) => {
      try {
        if (!students || students.length === 0) {
          onError?.('No valid students to import');
          return false;
        }

        // Call parent component's update function
        await onUpdateStudents?.(students);

        onSuccess?.({
          count: students.length,
          students,
        });

        return true;
      } catch (error) {
        onError?.(error.message);
        return false;
      }
    },

    /**
     * Complete workflow: Select -> Preview -> Import
     */
    handleCompleteCSVImport: async (fileUri, students) => {
      try {
        // Validate
        if (!fileUri) {
          onError?.('No file selected');
          return false;
        }

        if (!students || students.length === 0) {
          onError?.('No valid students to import');
          return false;
        }

        // Import
        await onUpdateStudents?.(students);

        onSuccess?.({
          count: students.length,
          students,
        });

        return true;
      } catch (error) {
        onError?.(error.message);
        return false;
      }
    },
  };
};

/**
 * Hook-friendly version for React components
 * 
 * Usage:
 * const csvHandlers = useCSVImportHandlers({
 *   existingStudents,
 *   onSuccess: (result) => { Alert.alert('Success', `Imported ${result.count} students`); },
 *   onError: (error) => { Alert.alert('Error', error); },
 * });
 * 
 * Then: csvHandlers.handleSelectCSVFile()
 */
export const useCSVImportHandlers = (config) => {
  const [csvFile, setCsvFile] = React.useState(null);
  const [csvPreview, setCsvPreview] = React.useState(null);
  const [isProcessing, setIsProcessing] = React.useState(false);

  const handlers = createCSVImportHandlers({
    ...config,
    onFileSelected: (file) => {
      setCsvFile(file);
      config.onFileSelected?.(file);
    },
    onPreviewLoaded: (preview) => {
      setCsvPreview(preview);
      config.onPreviewLoaded?.(preview);
    },
  });

  return {
    csvFile,
    csvPreview,
    isProcessing,
    setIsProcessing,
    ...handlers,
  };
};

/**
 * CSV Import State Manager
 * Complete state management for CSV import workflow
 */
export class CSVImportStateManager {
  constructor(config = {}) {
    this.config = config;
    this.state = {
      step: 'select', // 'select' | 'preview' | 'importing' | 'complete' | 'error'
      file: null,
      preview: null,
      error: null,
      isLoading: false,
    };
    this.listeners = [];
  }

  getState() {
    return { ...this.state };
  }

  setState(newState) {
    this.state = { ...this.state, ...newState };
    this.notifyListeners();
  }

  subscribe(listener) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  notifyListeners() {
    this.listeners.forEach(listener => listener(this.state));
  }

  async selectFile() {
    try {
      this.setState({ isLoading: true, error: null });

      const result = await DocumentPicker.getDocumentAsync({
        type: ['text/csv', 'text/comma-separated-values', 'application/csv'],
        copyToCacheDirectory: true,
      });

      if (result.canceled) {
        return;
      }

      const file = result.assets[0];
      if (!file?.uri) {
        throw new Error('No file selected');
      }

      if (!isValidCSVFile(file.mimeType, file.name)) {
        throw new Error(`Invalid file type: ${file.mimeType}`);
      }

      await this.previewFile(file.uri);
      this.setState({
        file: {
          name: file.name,
          uri: file.uri,
          size: file.size,
        },
        step: 'preview',
        isLoading: false,
      });
    } catch (error) {
      this.setState({
        error: error.message,
        step: 'error',
        isLoading: false,
      });
    }
  }

  async previewFile(fileUri) {
    const preview = await processCSVUpload(
      fileUri,
      this.config.existingStudents || []
    );

    if (!preview.success) {
      throw new Error(preview.errorSummary?.[0] || 'Failed to process CSV');
    }

    this.setState({ preview });
  }

  async importStudents() {
    try {
      this.setState({ isLoading: true, step: 'importing', error: null });

      const { preview } = this.state;
      if (!preview?.students) {
        throw new Error('No valid students in preview');
      }

      await this.config.onImport?.(preview.students);

      this.setState({
        step: 'complete',
        isLoading: false,
      });

      return true;
    } catch (error) {
      this.setState({
        error: error.message,
        step: 'error',
        isLoading: false,
      });
      return false;
    }
  }

  reset() {
    this.setState({
      step: 'select',
      file: null,
      preview: null,
      error: null,
      isLoading: false,
    });
  }
}

/**
 * Example Integration with StudentManagementScreen
 * 
 * Add to StudentManagementScreen component:
 * 
 * ```jsx
 * const [csvModalVisible, setCsvModalVisible] = useState(false);
 * const [csvUploadState, setCsvUploadState] = useState({
 *   selectedFile: null,
 *   previewData: null,
 *   loading: false,
 * });
 * 
 * const csvHandlers = createCSVImportHandlers({
 *   onFileSelected: (file) => {
 *     setCsvUploadState(prev => ({ ...prev, selectedFile: file }));
 *   },
 *   onPreviewLoaded: (preview) => {
 *     setCsvUploadState(prev => ({ ...prev, previewData: preview }));
 *   },
 *   onUpdateStudents: async (students) => {
 *     const existingData = spreadsheetGridData.filter(row =>
 *       (row.rollNo && row.rollNo.trim()) || (row.name && row.name.trim())
 *     );
 *     const combined = [...existingData, ...students];
 *     const newGrid = buildGridFromRows(combined);
 *     setSpreadsheetGridData(newGrid);
 *     await persistSpreadsheetGrid(newGrid, { refresh: true });
 *   },
 *   onSuccess: (result) => {
 *     Alert.alert('Success', `Imported ${result.count} students`);
 *     setCsvModalVisible(false);
 *   },
 *   onError: (error) => {
 *     Alert.alert('Error', error);
 *   },
 *   existingStudents: getVisibleStudents(),
 * });
 * 
 * const handleCSVFileSelect = async () => {
 *   setCsvUploadState(prev => ({ ...prev, loading: true }));
 *   try {
 *     const file = await csvHandlers.handleSelectCSVFile();
 *     if (file) {
 *       await csvHandlers.handlePreviewCSV(file.uri);
 *     }
 *   } finally {
 *     setCsvUploadState(prev => ({ ...prev, loading: false }));
 *   }
 * };
 * 
 * const handleCSVUpload = async (students) => {
 *   setCsvUploadState(prev => ({ ...prev, loading: true }));
 *   try {
 *     await csvHandlers.handleImportStudents(students);
 *   } finally {
 *     setCsvUploadState(prev => ({ ...prev, loading: false }));
 *   }
 * };
 * 
 * // In render:
 * <TouchableOpacity onPress={() => setCsvModalVisible(true)}>
 *   <Text>Import CSV</Text>
 * </TouchableOpacity>
 * 
 * <CSVUploadModal
 *   visible={csvModalVisible}
 *   onClose={() => {
 *     setCsvModalVisible(false);
 *     setCsvUploadState({
 *       selectedFile: null,
 *       previewData: null,
 *       loading: false,
 *     });
 *   }}
 *   onFileSelect={handleCSVFileSelect}
 *   onUpload={handleCSVUpload}
 *   selectedFile={csvUploadState.selectedFile}
 *   previewData={csvUploadState.previewData}
 *   loading={csvUploadState.loading}
 *   errors={csvUploadState.previewData?.errors || []}
 * />
 * ```
 */

export default {
  createCSVImportHandlers,
  CSVImportStateManager,
};
