// Global academic year setting used for display mapping.
// Baseline: Year 1 = 2025, Year 2 = 2024, Year 3 = 2023, Year 4 = 2022.
let _currentAcademicYear = 2025;

// Getter function for current academic year (Mapping Base)
export const getCurrentAcademicYear = () => _currentAcademicYear;

// Update the academic year value
export const setCurrentAcademicYear = (year) => {
  _currentAcademicYear = year;
};

/**
 * Get the joining/batch year for a specific level based on the 2025 mapping.
 * Year 1 -> 2025
 * Year 2 -> 2024
 * Year 3 -> 2023
 * Year 4 -> 2022
 */
export const getJoiningYearForLevel = (yearLevel) => {
  const level = parseInt(yearLevel, 10) || 1;
  return _currentAcademicYear - (level - 1);
};

/**
 * Standard utility for a unified display label
 * e.g., "Year 1 (2025)"
 */
export const getYearDisplayLabel = (yearLevel) => {
  const level = parseInt(yearLevel, 10) || 1;
  const cohort = getJoiningYearForLevel(level);
  return `Year ${level} – ${cohort}`;
};
