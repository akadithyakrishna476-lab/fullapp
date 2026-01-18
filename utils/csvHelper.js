/**
 * CSV Helper utilities for student list import/export
 * Handles CSV generation and parsing with validation
 */

// Generate CSV template for a specific year and class
export const generateCSVTemplate = (year, className) => {
  const headers = ['Roll Number', 'First Name', 'Last Name', 'Email', 'Mobile'];
  const rows = [headers];
  
  // Add sample rows (empty)
  for (let i = 1; i <= 5; i++) {
    rows.push(['', '', '', '', '']);
  }
  
  const csv = rows.map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
  return csv;
};

// Parse CSV content and validate
// Expected format: Roll No, Name, Email, Phone No
export const parseCSVContent = (csvText) => {
  const lines = csvText.trim().split('\n');
  if (lines.length < 2) {
    throw new Error('CSV must contain header and at least one data row');
  }

  const rawHeaderCells = lines[0].split(',').map(h => h.trim());
  const headers = rawHeaderCells.map(h => h.replace(/"/g, '').trim());
  const expectedHeaders = ['Roll No', 'Name', 'Email', 'Phone No'];

  // Validate headers: exact match required (order and names)
  if (headers.length !== expectedHeaders.length || !expectedHeaders.every((h, i) => headers[i] === h)) {
    throw new Error('CSV headers must be exactly: Roll No,Name,Email,Phone No');
  }

  const students = [];
  const errors = [];
  const rollNumbers = new Set();
  const emails = new Set();

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue; // Skip empty lines

    const cells = line.split(',').map(c => c.replace(/"/g, '').trim());
    
    if (cells.length < expectedHeaders.length) {
      errors.push(`Row ${i + 1}: Missing required fields`);
      continue;
    }

    const [rollNo, name, email, phone] = cells;

    // Validate required fields
    if (!rollNo || !name || !email) {
      errors.push(`Row ${i + 1}: Missing required data (Roll No, Name, Email required)`);
      continue;
    }

    // Validate email format
    if (!isValidEmail(email)) {
      errors.push(`Row ${i + 1}: Invalid email format`);
      continue;
    }

    // Check for duplicates within this batch
    if (rollNumbers.has(rollNo)) {
      errors.push(`Row ${i + 1}: Duplicate roll number "${rollNo}"`);
      continue;
    }

    if (emails.has(email)) {
      errors.push(`Row ${i + 1}: Duplicate email "${email}"`);
      continue;
    }

    rollNumbers.add(rollNo);
    emails.add(email);

    students.push({
      rollNumber: rollNo,
      name,
      email,
      phone: phone || '',
    });
  }

  if (students.length === 0) {
    throw new Error('No valid student records found in CSV');
  }

  return { students, errors };
};

// Validate email format
export const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

// Convert array of students to CSV format
export const convertStudentsToCSV = (students) => {
  const headers = ['Roll Number', 'First Name', 'Last Name', 'Email', 'Mobile'];
  const rows = [headers];

  students.forEach(student => {
    const [firstName, ...lastNameParts] = student.name.split(' ');
    const lastName = lastNameParts.join(' ') || '';
    rows.push([
      student.rollNumber || '',
      firstName || '',
      lastName,
      student.email || '',
      student.mobile || '',
    ]);
  });

  return rows.map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
};

// Generate unique student ID
export const generateStudentId = () => {
  return `STU-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

// Generate simple, easy-to-remember password for CR
export const generatePassword = () => {
  const length = 8;
  const upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lower = 'abcdefghijklmnopqrstuvwxyz';
  const digits = '0123456789';
  const all = upper + lower + digits; // No special characters for simplicity

  const pick = (set) => set.charAt(Math.floor(Math.random() * set.length));

  // Ensure at least one uppercase, one lowercase, one digit
  const required = [pick(upper), pick(lower), pick(digits)];
  const remaining = length - required.length;
  let rest = '';
  for (let i = 0; i < remaining; i++) rest += pick(all);

  // Shuffle
  const combined = [...required, ...rest.split('')];
  for (let i = combined.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [combined[i], combined[j]] = [combined[j], combined[i]];
  }

  return combined.join('');
};

// Hash password using Web Crypto if available, otherwise fallback to a lightweight (non-cryptographic) fallback.
export const hashPassword = async (password) => {
  try {
    if (typeof globalThis.crypto !== 'undefined' && crypto.subtle && crypto.subtle.digest) {
      const enc = new TextEncoder();
      const data = enc.encode(password + ':classconnect'); // add a small app salt
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }
  } catch (e) {
    // fall through to fallback
  }

  // Fallback hashing: produce a hex string from char codes + simple salt (not as secure as SHA-256).
  const salted = password.split('').reverse().join('') + 'classconnect_fallback_salt';
  let out = '';
  for (let i = 0; i < salted.length; i++) {
    out += salted.charCodeAt(i).toString(16);
  }
  return out;
};
