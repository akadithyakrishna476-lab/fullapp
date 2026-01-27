/**
 * Faculty Password Validator
 * 
 * Validates faculty account passwords according to strict format requirements:
 * - Must begin with faculty member's name (without spaces, lowercase preferred)
 * - Followed by @ symbol
 * - Followed by exactly 4 numeric digits
 * 
 * Format: name@1234
 * Examples: anu@2321, anitha@1023
 * 
 * This validator applies ONLY to faculty accounts and not to other roles.
 */

/**
 * Validate faculty password format
 * 
 * @param {string} password - The password to validate
 * @param {string} facultyName - The faculty member's full name
 * @returns {object} { isValid: boolean, error: string|null }
 */
export const validateFacultyPassword = (password, facultyName) => {
  // Trim inputs
  const trimmedPassword = password ? password.trim() : '';
  const trimmedName = facultyName ? facultyName.trim() : '';

  // Check if password is empty
  if (!trimmedPassword) {
    return {
      isValid: false,
      error: 'Password must be in the format: name@1234 (4 digits after @)'
    };
  }

  // Check if faculty name is provided
  if (!trimmedName) {
    return {
      isValid: false,
      error: 'Faculty name is required to validate password format'
    };
  }

  // Remove spaces from faculty name for comparison (lowercase)
  const namePart = trimmedName.toLowerCase().replace(/\s+/g, '');

  // Pattern: lowercase name (without spaces) + @ + exactly 4 digits
  // Format: name@1234
  const facultyPasswordPattern = new RegExp(`^${namePart}@\\d{4}$`);

  // Test the password against the pattern
  if (!facultyPasswordPattern.test(trimmedPassword)) {
    return {
      isValid: false,
      error: 'Password must be in the format: name@1234 (4 digits after @)'
    };
  }

  return {
    isValid: true,
    error: null
  };
};

/**
 * Check if a password matches faculty format (used for UI feedback)
 * 
 * @param {string} password - The password to check
 * @param {string} facultyName - The faculty member's full name
 * @returns {boolean} True if password matches format
 */
export const isFacultyPasswordFormatValid = (password, facultyName) => {
  const validation = validateFacultyPassword(password, facultyName);
  return validation.isValid;
};

/**
 * Get the expected password format for a faculty member
 * 
 * @param {string} facultyName - The faculty member's full name
 * @returns {string} The expected format (e.g., "anu@1234")
 */
export const getFacultyPasswordFormat = (facultyName) => {
  if (!facultyName) return 'name@1234';
  const namePart = facultyName.toLowerCase().replace(/\s+/g, '');
  return `${namePart}@1234`;
};
