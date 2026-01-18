import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import React, { useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Modal,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';

/**
 * Modern CSV Upload Modal Component
 * Handles file selection, parsing, preview, and validation
 */
const CSVUploadModal = ({ visible, onClose, onImport, year, departmentName }) => {
  const [step, setStep] = useState('select'); // 'select' | 'preview'
  const [loading, setLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [students, setStudents] = useState([]);
  const [errors, setErrors] = useState([]);

  // Parse CSV row handling quotes and commas
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

  // Handle file selection
  const handleSelectFile = async () => {
    try {
      setLoading(true);
      setErrors([]);

      // Pick CSV file
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

      setSelectedFile(file);

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
      const rollIndex = headers.findIndex(h => 
        h.includes('roll') || h.includes('usn') || h.includes('regno') || h.includes('reg')
      );
      const nameIndex = headers.findIndex(h => h.includes('name'));
      const emailIndex = headers.findIndex(h => h.includes('email') || h.includes('mail'));
      const phoneIndex = headers.findIndex(h => 
        h.includes('phone') || h.includes('mobile') || h.includes('contact')
      );

      if (rollIndex === -1) {
        Alert.alert('Invalid CSV', 'CSV must have a "Roll No" or "Roll Number" column');
        setLoading(false);
        return;
      }

      if (nameIndex === -1) {
        Alert.alert('Invalid CSV', 'CSV must have a "Name" column');
        setLoading(false);
        return;
      }

      // Parse student data
      const parsedStudents = [];
      const parseErrors = [];

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const cells = parseCSVRow(line);

        const rollNumber = (cells[rollIndex] || '').trim();
        const name = (cells[nameIndex] || '').trim();
        const email = emailIndex >= 0 ? (cells[emailIndex] || '').trim() : '';
        const phone = phoneIndex >= 0 ? (cells[phoneIndex] || '').trim() : '';

        if (!rollNumber || !name) {
          parseErrors.push({
            row: i + 1,
            message: 'Missing Roll Number or Name',
          });
          continue;
        }

        parsedStudents.push({
          rollNumber,
          name,
          email,
          phone,
          rowNumber: i + 1,
        });
      }

      if (parsedStudents.length === 0) {
        Alert.alert('No Data', 'No valid student records found in CSV');
        setLoading(false);
        return;
      }

      // Check for duplicates within CSV
      const rollNumbers = new Map();
      const emails = new Map();
      const duplicateErrors = [];

      parsedStudents.forEach((student, index) => {
        const roll = student.rollNumber;
        const email = student.email.toLowerCase();

        if (rollNumbers.has(roll)) {
          duplicateErrors.push({
            row: student.rowNumber,
            message: `Duplicate Roll Number: ${roll}`,
          });
        } else {
          rollNumbers.set(roll, index);
        }

        if (email && emails.has(email)) {
          duplicateErrors.push({
            row: student.rowNumber,
            message: `Duplicate Email: ${email}`,
          });
        } else if (email) {
          emails.set(email, index);
        }
      });

      if (duplicateErrors.length > 0) {
        setErrors(duplicateErrors);
        Alert.alert(
          'Duplicate Data Found',
          `Found ${duplicateErrors.length} duplicate(s) in CSV. Please fix and try again.`
        );
        setLoading(false);
        return;
      }

      setStudents(parsedStudents);
      setErrors(parseErrors);
      setStep('preview');
    } catch (error) {
      console.error('CSV Selection Error:', error);
      Alert.alert('Error', 'Failed to read CSV file: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  // Handle import
  const handleImport = () => {
    if (students.length === 0) {
      Alert.alert('No Data', 'No students to import');
      return;
    }

    onImport(students);
  };

  // Reset modal
  const handleClose = () => {
    setStep('select');
    setSelectedFile(null);
    setStudents([]);
    setErrors([]);
    onClose();
  };

  // Render student preview card
  const StudentPreviewItem = ({ student, index }) => (
    <View style={styles.previewCard}>
      <View style={styles.previewCardHeader}>
        <View style={styles.previewAvatar}>
          <Text style={styles.previewAvatarText}>
            {student.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
          </Text>
        </View>
        <View style={styles.previewInfo}>
          <Text style={styles.previewName}>{student.name}</Text>
          <Text style={styles.previewSubtext}>Roll: {student.rollNumber}</Text>
        </View>
        <View style={styles.previewBadge}>
          <Text style={styles.previewBadgeText}>#{index + 1}</Text>
        </View>
      </View>
      {(student.email || student.phone) && (
        <View style={styles.previewDetails}>
          {student.email && (
            <View style={styles.detailRow}>
              <MaterialCommunityIcons name="email" size={14} color="#7f8c8d" />
              <Text style={styles.detailText}>{student.email}</Text>
            </View>
          )}
          {student.phone && (
            <View style={styles.detailRow}>
              <MaterialCommunityIcons name="phone" size={14} color="#7f8c8d" />
              <Text style={styles.detailText}>{student.phone}</Text>
            </View>
          )}
        </View>
      )}
    </View>
  );

  return (
    <Modal visible={visible} animationType="slide" transparent={false}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
            <MaterialCommunityIcons name="close" size={24} color="#ffffff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Upload Student CSV</Text>
          <View style={{ width: 40 }} />
        </View>

        {/* Content */}
        <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
          {step === 'select' ? (
            <>
              {/* Instructions */}
              <View style={styles.infoCard}>
                <MaterialCommunityIcons name="information" size={24} color="#0f5f73" />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.infoTitle}>CSV Format Requirements</Text>
                  <Text style={styles.infoText}>
                    Your CSV file must include the following columns:{'\n'}
                    • Roll No (required){'\n'}
                    • Name (required){'\n'}
                    • Email (optional){'\n'}
                    • Phone (optional)
                  </Text>
                </View>
              </View>

              {/* Upload context */}
              <View style={styles.contextCard}>
                <Text style={styles.contextLabel}>Uploading to:</Text>
                <Text style={styles.contextValue}>{departmentName}</Text>
                <Text style={styles.contextValue}>Year: {year}</Text>
              </View>

              {/* Select file button */}
              <TouchableOpacity
                style={styles.selectButton}
                onPress={handleSelectFile}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <>
                    <MaterialCommunityIcons name="file-upload" size={24} color="#ffffff" />
                    <Text style={styles.selectButtonText}>Select CSV File</Text>
                  </>
                )}
              </TouchableOpacity>

              {/* Sample CSV */}
              <View style={styles.sampleCard}>
                <Text style={styles.sampleTitle}>Sample CSV Format:</Text>
                <View style={styles.sampleCode}>
                  <Text style={styles.sampleText}>Roll No,Name,Email,Phone</Text>
                  <Text style={styles.sampleText}>1001,John Doe,john@example.com,1234567890</Text>
                  <Text style={styles.sampleText}>1002,Jane Smith,jane@example.com,0987654321</Text>
                </View>
              </View>
            </>
          ) : (
            <>
              {/* Preview Header */}
              <View style={styles.previewHeader}>
                <MaterialCommunityIcons name="file-check" size={24} color="#2f6f44" />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.previewHeaderTitle}>
                    {students.length} Student{students.length !== 1 ? 's' : ''} Ready to Import
                  </Text>
                  <Text style={styles.previewHeaderSubtitle}>
                    {selectedFile?.name}
                  </Text>
                </View>
              </View>

              {/* Errors */}
              {errors.length > 0 && (
                <View style={styles.errorCard}>
                  <MaterialCommunityIcons name="alert" size={20} color="#e74c3c" />
                  <View style={{ flex: 1, marginLeft: 8 }}>
                    <Text style={styles.errorTitle}>
                      {errors.length} row(s) skipped due to errors
                    </Text>
                    {errors.slice(0, 3).map((err, idx) => (
                      <Text key={idx} style={styles.errorText}>
                        Row {err.row}: {err.message}
                      </Text>
                    ))}
                    {errors.length > 3 && (
                      <Text style={styles.errorText}>
                        ... and {errors.length - 3} more
                      </Text>
                    )}
                  </View>
                </View>
              )}

              {/* Student List Preview */}
              <View style={styles.previewList}>
                {students.slice(0, 50).map((student, index) => (
                  <StudentPreviewItem key={index} student={student} index={index} />
                ))}
                {students.length > 50 && (
                  <Text style={styles.moreText}>
                    ... and {students.length - 50} more student(s)
                  </Text>
                )}
              </View>
            </>
          )}
        </ScrollView>

        {/* Footer Actions */}
        {step === 'preview' && (
          <View style={styles.footer}>
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => {
                setStep('select');
                setSelectedFile(null);
                setStudents([]);
                setErrors([]);
              }}
            >
              <Text style={styles.backButtonText}>Back</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.importButton}
              onPress={handleImport}
              disabled={students.length === 0}
            >
              <MaterialCommunityIcons name="check" size={20} color="#ffffff" />
              <Text style={styles.importButtonText}>
                Import {students.length} Student{students.length !== 1 ? 's' : ''}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  header: {
    backgroundColor: '#0f5f73',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    paddingTop: 50,
  },
  closeButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#ffffff',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
  },
  infoCard: {
    backgroundColor: '#e8f4f8',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    marginBottom: 16,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f5f73',
    marginBottom: 8,
  },
  infoText: {
    fontSize: 14,
    color: '#2c3e50',
    lineHeight: 20,
  },
  contextCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#e0e4e8',
  },
  contextLabel: {
    fontSize: 12,
    color: '#7f8c8d',
    marginBottom: 4,
  },
  contextValue: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2c3e50',
    marginBottom: 4,
  },
  selectButton: {
    backgroundColor: '#0f5f73',
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  selectButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffff',
    marginLeft: 12,
  },
  sampleCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e0e4e8',
  },
  sampleTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2c3e50',
    marginBottom: 12,
  },
  sampleCode: {
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    padding: 12,
  },
  sampleText: {
    fontSize: 12,
    fontFamily: 'monospace',
    color: '#2c3e50',
    marginBottom: 4,
  },
  previewHeader: {
    backgroundColor: '#d4edda',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  previewHeaderTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#2f6f44',
    marginBottom: 4,
  },
  previewHeaderSubtitle: {
    fontSize: 12,
    color: '#5a6c7d',
  },
  errorCard: {
    backgroundColor: '#f8d7da',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    marginBottom: 16,
  },
  errorTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#e74c3c',
    marginBottom: 8,
  },
  errorText: {
    fontSize: 12,
    color: '#721c24',
    marginBottom: 4,
  },
  previewList: {
    gap: 12,
  },
  previewCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e0e4e8',
  },
  previewCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  previewAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#0f5f73',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewAvatarText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ffffff',
  },
  previewInfo: {
    flex: 1,
    marginLeft: 12,
  },
  previewName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#2c3e50',
    marginBottom: 2,
  },
  previewSubtext: {
    fontSize: 12,
    color: '#7f8c8d',
  },
  previewBadge: {
    backgroundColor: '#e8f4f8',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  previewBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#0f5f73',
  },
  previewDetails: {
    marginTop: 12,
    gap: 6,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  detailText: {
    fontSize: 13,
    color: '#5a6c7d',
  },
  moreText: {
    fontSize: 14,
    color: '#7f8c8d',
    textAlign: 'center',
    fontStyle: 'italic',
    marginTop: 8,
  },
  footer: {
    backgroundColor: '#ffffff',
    paddingHorizontal: 16,
    paddingVertical: 16,
    paddingBottom: 24,
    borderTopWidth: 1,
    borderTopColor: '#e0e4e8',
    flexDirection: 'row',
    gap: 12,
  },
  backButton: {
    flex: 1,
    backgroundColor: '#e0e4e8',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2c3e50',
  },
  importButton: {
    flex: 2,
    backgroundColor: '#2f6f44',
    borderRadius: 12,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  importButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffff',
  },
});

export default CSVUploadModal;
