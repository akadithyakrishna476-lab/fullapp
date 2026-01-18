/**
 * CSV Upload Helper - Production-ready CSV parsing and validation
 * Expo SDK 54 compatible - uses modern FileSystem APIs
 */

import * as FileSystem from 'expo-file-system/legacy';

/**
 * Validates file type is CSV
 * @param {string} mimeType - MIME type from DocumentPicker
 * @param {string} filename - File name
 * @returns {boolean}
 */
export const isValidCSVFile = (mimeType, filename) => {
  const validMimeTypes = ['text/csv', 'text/comma-separated-values', 'application/csv', 'application/vnd.ms-excel'];
  const hasValidMime = validMimeTypes.includes(mimeType);
  const hasCSVExtension = filename?.toLowerCase().endsWith('.csv');
  
  return hasValidMime || hasCSVExtension;
};

/**
 * Reads CSV file using Expo FileSystem SDK 54 API
 * Avoids deprecated APIs like getInfoAsync (if using legacy API fallback)
 * @param {string} uri - File URI from DocumentPicker
 * @returns {Promise<string>} - CSV content as string
 */
export const readCSVFile = async (uri) => {
  try {
    // Expo SDK 54 compatible: readAsStringAsync is current standard API
    const content = await FileSystem.readAsStringAsync(uri, {
      encoding: 'utf8',
    });
    
    if (!content || content.trim().length === 0) {
      throw new Error('CSV file is empty');
    }
    
    return content;
  } catch (error) {
    if (error.message === 'CSV file is empty') {
      throw error;
    }
    throw new Error(`Failed to read CSV file: ${error.message}`);
  }
};

/**
 * Parses CSV text into structured data
 * Handles various CSV formats with flexible column detection
 * @param {string} csvText - Raw CSV content
 * @returns {Object} - { headers, rows, errors }
 */
export const parseCSVText = (csvText) => {
  try {
    const lines = csvText.trim().split(/\r?\n/).filter(line => line.trim().length > 0);
    
    if (lines.length < 2) {
      throw new Error('CSV must contain at least a header row and one data row');
    }

    // Parse header row
    const headerLine = lines[0];
    const headers = parseCSVRow(headerLine).map(h => h.trim());
    
    if (headers.length === 0) {
      throw new Error('CSV headers are empty or invalid');
    }

    // Parse data rows
    const rows = [];
    const errors = [];

    for (let i = 1; i < lines.length; i++) {
      try {
        const cells = parseCSVRow(lines[i]);
        
        // Skip completely empty rows
        if (cells.every(cell => !cell || cell.trim().length === 0)) {
          continue;
        }
        
        rows.push({
          rowNumber: i + 1, // Actual line number in file
          cells,
          raw: lines[i],
        });
      } catch (err) {
        errors.push({
          rowNumber: i + 1,
          error: `Invalid row format: ${err.message}`,
        });
      }
    }

    if (rows.length === 0) {
      throw new Error('CSV contains no valid data rows');
    }

    return {
      headers,
      rows,
      errors,
      totalRows: rows.length,
    };
  } catch (error) {
    throw new Error(`CSV parsing failed: ${error.message}`);
  }
};

/**
 * Parses a single CSV row, handling quoted fields and escapes
 * Robust CSV parsing that handles quoted values with commas
 * @param {string} line - CSV line
 * @returns {string[]} - Array of cell values
 */
const parseCSVRow = (line) => {
  const cells = [];
  let current = '';
  let insideQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];
    
    if (char === '"') {
      if (insideQuotes && nextChar === '"') {
        // Escaped quote
        current += '"';
        i++; // Skip next quote
      } else {
        // Toggle quote state
        insideQuotes = !insideQuotes;
      }
    } else if (char === ',' && !insideQuotes) {
      // Field separator
      cells.push(current.replace(/^"|"$/g, '').trim());
      current = '';
    } else {
      current += char;
    }
  }
  
  // Add last field
  cells.push(current.replace(/^"|"$/g, '').trim());
  
  return cells;
};

/**
 * Maps CSV columns to student fields intelligently
 * Handles various column name variations
 * @param {string[]} headers - CSV headers
 * @returns {Object} - { mapping, confidence, unmapped }
 */
export const mapCSVColumns = (headers) => {
  const mapping = {
    rollNumber: null,
    name: null,
    email: null,
    phone: null,
    year: null,
    class: null,
  };

  const unmapped = [];
  const confidence = {
    rollNumber: 0,
    name: 0,
    email: 0,
    phone: 0,
    year: 0,
    class: 0,
  };

  headers.forEach((header, index) => {
    const lower = header.toLowerCase().trim();
    
    // Roll Number mapping
    if (!mapping.rollNumber && 
        (lower.includes('roll') || lower.includes('regdno') || lower.includes('usn') || 
         lower === 'roll_no' || lower === 'roll#' || lower === 'rollno')) {
      mapping.rollNumber = index;
      confidence.rollNumber = lower.includes('roll') ? 1 : 0.8;
    }
    
    // Name mapping
    if (!mapping.name && 
        (lower.includes('name') || lower === 'student_name' || lower === 'fullname')) {
      mapping.name = index;
      confidence.name = lower.includes('name') ? 1 : 0.8;
    }
    
    // Email mapping
    if (!mapping.email && 
        (lower.includes('email') || lower.includes('mail') || lower === 'e-mail')) {
      mapping.email = index;
      confidence.email = lower.includes('email') ? 1 : 0.8;
    }
    
    // Phone mapping
    if (!mapping.phone && 
        (lower.includes('phone') || lower.includes('mobile') || lower.includes('tel') || 
         lower === 'contact' || lower.includes('number'))) {
      mapping.phone = index;
      confidence.phone = lower.includes('phone') ? 1 : 0.8;
    }
    
    // Year/Class mapping
    if (!mapping.year && 
        (lower.includes('year') || lower.includes('class') || lower.includes('sem'))) {
      mapping.year = index;
      confidence.year = 0.7;
    }
    
    if (!mapping.class && 
        (lower.includes('class') || lower.includes('section') || lower.includes('div'))) {
      mapping.class = index;
      confidence.class = 0.7;
    }
  });

  // Identify unmapped headers
  headers.forEach((header, index) => {
    const isMapped = Object.values(mapping).includes(index);
    if (!isMapped) {
      unmapped.push({ header, index });
    }
  });

  return { mapping, confidence, unmapped };
};

/**
 * Converts CSV rows to student objects
 * @param {Array} rows - Parsed CSV rows
 * @param {Object} mapping - Column mapping from mapCSVColumns
 * @returns {Object} - { students, errors }
 */
export const convertRowsToStudents = (rows, mapping) => {
  const students = [];
  const errors = [];

  if (!mapping.rollNumber || mapping.rollNumber < 0) {
    throw new Error('Roll Number column is required for CSV import');
  }

  if (!mapping.name || mapping.name < 0) {
    throw new Error('Name column is required for CSV import');
  }

  rows.forEach((row) => {
    try {
      const rollNumber = row.cells[mapping.rollNumber]?.trim();
      const name = row.cells[mapping.name]?.trim();
      const email = mapping.email !== null ? row.cells[mapping.email]?.trim() : '';
      const phone = mapping.phone !== null ? row.cells[mapping.phone]?.trim() : '';
      const year = mapping.year !== null ? row.cells[mapping.year]?.trim() : '';

      // Validation
      if (!rollNumber) {
        errors.push({
          rowNumber: row.rowNumber,
          field: 'Roll Number',
          error: 'Roll Number is required',
        });
        return;
      }

      if (!name) {
        errors.push({
          rowNumber: row.rowNumber,
          field: 'Name',
          error: 'Name is required',
        });
        return;
      }

      // Validate email if provided
      if (email && !isValidEmail(email)) {
        errors.push({
          rowNumber: row.rowNumber,
          field: 'Email',
          error: `Invalid email format: ${email}`,
        });
        return;
      }

      // Validate phone if provided (basic check)
      if (phone && !/^[\d\s\-\+\(\)]+$/.test(phone)) {
        errors.push({
          rowNumber: row.rowNumber,
          field: 'Phone',
          error: `Invalid phone format: ${phone}`,
        });
        return;
      }

      students.push({
        rollNumber,
        name,
        email: email || '',
        phone: phone || '',
        year: year || '',
        csvRowNumber: row.rowNumber,
      });
    } catch (err) {
      errors.push({
        rowNumber: row.rowNumber,
        error: `Failed to parse row: ${err.message}`,
      });
    }
  });

  return { students, errors };
};

/**
 * Validates email format
 * @param {string} email
 * @returns {boolean}
 */
export const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email.trim());
};

/**
 * Validates phone number format (basic)
 * @param {string} phone
 * @returns {boolean}
 */
export const isValidPhone = (phone) => {
  const phoneRegex = /^[\d\s\-\+\(\)]{7,}$/;
  return phoneRegex.test(phone.trim());
};

/**
 * Detects duplicates within CSV data
 * @param {Array} students - Student objects
 * @returns {Object} - { duplicates, hasDuplicates }
 */
export const detectDuplicates = (students) => {
  const duplicates = {
    rollNumber: [],
    email: [],
    phone: [],
  };

  const rollNumbers = {};
  const emails = {};
  const phones = {};

  students.forEach((student) => {
    // Check roll numbers
    if (student.rollNumber) {
      const roll = student.rollNumber.toLowerCase().trim();
      if (rollNumbers[roll]) {
        duplicates.rollNumber.push({
          value: student.rollNumber,
          rows: [rollNumbers[roll], student.csvRowNumber],
        });
      } else {
        rollNumbers[roll] = student.csvRowNumber;
      }
    }

    // Check emails
    if (student.email) {
      const email = student.email.toLowerCase().trim();
      if (emails[email]) {
        duplicates.email.push({
          value: student.email,
          rows: [emails[email], student.csvRowNumber],
        });
      } else {
        emails[email] = student.csvRowNumber;
      }
    }

    // Check phones
    if (student.phone) {
      const phone = student.phone.trim();
      if (phones[phone]) {
        duplicates.phone.push({
          value: student.phone,
          rows: [phones[phone], student.csvRowNumber],
        });
      } else {
        phones[phone] = student.csvRowNumber;
      }
    }
  });

  const hasDuplicates =
    duplicates.rollNumber.length > 0 ||
    duplicates.email.length > 0 ||
    duplicates.phone.length > 0;

  return { duplicates, hasDuplicates };
};

/**
 * Validates students against existing data
 * @param {Array} newStudents - New student objects from CSV
 * @param {Array} existingStudents - Existing students in system
 * @returns {Object} - { conflicts, hasConflicts }
 */
export const validateAgainstExisting = (newStudents, existingStudents = []) => {
  const conflicts = {
    rollNumber: [],
    email: [],
    phone: [],
  };

  const existingRolls = new Set();
  const existingEmails = new Set();
  const existingPhones = new Set();

  existingStudents.forEach((student) => {
    if (student.rollNumber) {
      existingRolls.add(student.rollNumber.toLowerCase().trim());
    }
    if (student.email) {
      existingEmails.add(student.email.toLowerCase().trim());
    }
    if (student.phone) {
      existingPhones.add(student.phone.trim());
    }
  });

  newStudents.forEach((student) => {
    if (student.rollNumber) {
      const roll = student.rollNumber.toLowerCase().trim();
      if (existingRolls.has(roll)) {
        conflicts.rollNumber.push({
          value: student.rollNumber,
          csvRow: student.csvRowNumber,
        });
      }
    }

    if (student.email) {
      const email = student.email.toLowerCase().trim();
      if (existingEmails.has(email)) {
        conflicts.email.push({
          value: student.email,
          csvRow: student.csvRowNumber,
        });
      }
    }

    if (student.phone) {
      const phone = student.phone.trim();
      if (existingPhones.has(phone)) {
        conflicts.phone.push({
          value: student.phone,
          csvRow: student.csvRowNumber,
        });
      }
    }
  });

  const hasConflicts =
    conflicts.rollNumber.length > 0 ||
    conflicts.email.length > 0 ||
    conflicts.phone.length > 0;

  return { conflicts, hasConflicts };
};

/**
 * Generates comprehensive error summary
 * @param {Object} parseResult - Result from parseCSVText
 * @param {Object} duplicateCheck - Result from detectDuplicates
 * @param {Object} conflictCheck - Result from validateAgainstExisting
 * @returns {Array} - Array of error messages
 */
export const generateErrorSummary = (parseResult, duplicateCheck, conflictCheck) => {
  const errors = [];

  // Parse errors
  if (parseResult.errors?.length > 0) {
    errors.push(`CSV Format Errors: ${parseResult.errors.length} row(s) have invalid format`);
  }

  // Duplicate errors
  if (duplicateCheck.hasDuplicates) {
    if (duplicateCheck.duplicates.rollNumber.length > 0) {
      errors.push(`Duplicate Roll Numbers: ${duplicateCheck.duplicates.rollNumber.length} found in CSV`);
    }
    if (duplicateCheck.duplicates.email.length > 0) {
      errors.push(`Duplicate Emails: ${duplicateCheck.duplicates.email.length} found in CSV`);
    }
    if (duplicateCheck.duplicates.phone.length > 0) {
      errors.push(`Duplicate Phones: ${duplicateCheck.duplicates.phone.length} found in CSV`);
    }
  }

  // Conflict errors
  if (conflictCheck.hasConflicts) {
    if (conflictCheck.conflicts.rollNumber.length > 0) {
      errors.push(`Existing Roll Numbers: ${conflictCheck.conflicts.rollNumber.length} already exist in system`);
    }
    if (conflictCheck.conflicts.email.length > 0) {
      errors.push(`Existing Emails: ${conflictCheck.conflicts.email.length} already exist in system`);
    }
    if (conflictCheck.conflicts.phone.length > 0) {
      errors.push(`Existing Phones: ${conflictCheck.conflicts.phone.length} already exist in system`);
    }
  }

  return errors;
};

/**
 * Complete CSV upload workflow
 * @param {string} fileUri - File URI from DocumentPicker
 * @param {Array} existingStudents - Existing students in system
 * @returns {Object} - Complete validation result with students and errors
 */
export const processCSVUpload = async (fileUri, existingStudents = []) => {
  try {
    // Step 1: Read file
    const csvContent = await readCSVFile(fileUri);

    // Step 2: Parse CSV
    const parseResult = parseCSVText(csvContent);

    // Step 3: Map columns
    const { mapping, confidence } = mapCSVColumns(parseResult.headers);

    // Step 4: Convert to students
    const { students, errors: conversionErrors } = convertRowsToStudents(parseResult.rows, mapping);

    // Step 5: Detect internal duplicates
    const duplicateCheck = detectDuplicates(students);

    // Step 6: Check against existing data
    const conflictCheck = validateAgainstExisting(students, existingStudents);

    // Step 7: Generate comprehensive errors
    const allErrors = [
      ...parseResult.errors,
      ...conversionErrors,
    ];

    const errorSummary = generateErrorSummary(parseResult, duplicateCheck, conflictCheck);

    return {
      success: !duplicateCheck.hasDuplicates && !conflictCheck.hasConflicts,
      students: students.filter((s) => {
        const hasError = conversionErrors.some((e) => e.rowNumber === s.csvRowNumber);
        return !hasError;
      }),
      validCount: students.length - conversionErrors.length,
      parseResult,
      mapping,
      confidence,
      duplicateCheck,
      conflictCheck,
      errors: allErrors,
      errorSummary,
      warnings: [],
    };
  } catch (error) {
    return {
      success: false,
      students: [],
      validCount: 0,
      error: error.message,
      errorSummary: [error.message],
    };
  }
};
