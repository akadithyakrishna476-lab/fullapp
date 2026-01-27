/**
 * Academic Year Management Utilities
 * Handles loading, updating, and promoting academic years with batch-based student data
 */

import { collection, deleteField, doc, getDoc, getDocs, serverTimestamp, setDoc, writeBatch } from 'firebase/firestore';
import { getCurrentAcademicYear, getYearDisplayLabel, setCurrentAcademicYear } from '../constants/academicYear';
import { db } from '../firebase/firebaseConfig';

const SETTINGS_DOC_PATH = 'settings/academicYear';
const GRADUATED_ARCHIVE_PATH = 'graduatedStudents';

/**
 * Load the current academic year from Firestore
 * Falls back to hardcoded value if not found
 */
export const loadAcademicYear = async () => {
  try {
    const settingsRef = doc(db, SETTINGS_DOC_PATH);
    const snap = await getDoc(settingsRef);

    if (snap.exists()) {
      let year = snap.data().currentYear;
      if (year && typeof year === 'number') {
        // Reset logic for incorrect future years (Fix for mapping to 2025 base)
        if (year > 2026) {
          console.log('🔄 Detected incorrect future mapping in Firestore:', year, '- Resetting to 2025');
          year = 2025;
        }
        setCurrentAcademicYear(year);
        console.log('📅 Loaded academic year from Firestore mapping:', year);
        return year;
      }
    }

    // Initialize Firestore with current hardcoded value
    const fallbackYear = getCurrentAcademicYear();
    await setDoc(settingsRef, {
      currentYear: fallbackYear,
      lastUpdated: serverTimestamp(),
      updatedBy: 'system'
    });

    console.log('📅 Initialized academic year in Firestore:', fallbackYear);
    return fallbackYear;
  } catch (error) {
    console.error('Error loading academic year:', error);
    return getCurrentAcademicYear(); // fallback
  }
};

/**
 * Increment the academic year and physically migrate all student data
 * Year 3 → Year 4, Year 2 → Year 3, Year 1 → Year 2
 * Archives Year 4 students before promotion
 * Creates empty Year 1 for new batch
 * 
 * @param {string} facultyId - Faculty performing the promotion
 * @returns {Promise<{success: boolean, message: string, archivedCount: number, migratedCount: number}>}
 */
export const promoteAcademicYear = async (facultyId) => {
  try {
    console.log('🎓 Starting academic year promotion...');

    // 1. Load current academic year
    const currentYear = await loadAcademicYear();
    const newAcademicYear = currentYear + 1;

    // 2. Archive Year 4 students first (they graduate)
    const archivedCount = await archiveYear4Students(facultyId);

    // 3. Migrate students: Year 3→4, Year 2→3, Year 1→2
    const migratedCount = await migrateStudentsByYear(facultyId, newAcademicYear);

    // 4. Update academic year in Firestore (Global Label Mapping)
    const settingsRef = doc(db, SETTINGS_DOC_PATH);
    await setDoc(settingsRef, {
      currentYear: newAcademicYear,
      lastUpdated: serverTimestamp(),
      updatedBy: facultyId,
      previousYear: currentYear,
      promotionDate: serverTimestamp()
    });

    // 5. Update in-memory value
    setCurrentAcademicYear(newAcademicYear);

    console.log(`✅ Academic year promoted: ${currentYear} → ${newAcademicYear}`);
    console.log(`📚 Archived ${archivedCount} Year 4 students`);
    console.log(`🔄 Migrated ${migratedCount} students to next level`);

    return {
      success: true,
      message: `Academic year promoted to ${newAcademicYear}. Labels shifted forward. ${migratedCount} students updated. ${archivedCount} students graduated.`,
      archivedCount,
      migratedCount,
      previousYear: currentYear,
      newYear: newAcademicYear
    };

  } catch (error) {
    console.error('❌ Error promoting academic year:', error);
    return {
      success: false,
      message: `Failed to promote academic year: ${error.message}`,
      archivedCount: 0,
      migratedCount: 0
    };
  }
};

/**
 * Archive all Year 4 students before promotion
 * @returns {number} Count of archived students
 */
const archiveYear4Students = async (facultyId) => {
  const departments = ['IT', 'CSE', 'ECE', 'EEE', 'MECH', 'CIVIL'];
  let archivedCount = 0;

  try {
    // 1. Fetch all Year 4 students in parallel across all departments
    const fetchPromises = departments.map(dept => {
      const year4Path = `students/year4/departments/${dept}/students`;
      return getDocs(collection(db, year4Path)).then(snap => ({ dept, snap }));
    });

    const results = await Promise.all(fetchPromises);
    const batch = writeBatch(db);
    let operationCount = 0;

    for (const { dept, snap } of results) {
      if (snap.empty) continue;

      snap.forEach(docSnap => {
        const studentData = docSnap.data();
        const archiveId = `${studentData.joiningYear}_${docSnap.id}`;
        const archiveRef = doc(db, GRADUATED_ARCHIVE_PATH, archiveId);

        batch.set(archiveRef, {
          ...studentData,
          archivedAt: serverTimestamp(),
          archivedBy: facultyId,
          graduationYear: new Date().getFullYear(),
          department: dept,
          originalYear: 4
        });

        batch.delete(docSnap.ref);
        operationCount += 2; // set + delete
        archivedCount++;
      });

      // Deactivate Year 4 CRs for this department (in separate async call)
      deactivateYear4CRs(dept).catch(err => console.warn(`CR deactivation failed for ${dept}:`, err));
      deactivateYear4CRsNested(dept).catch(err => console.warn(`Nested CR deactivation failed for ${dept}:`, err));
    }

    if (operationCount > 0) {
      await batch.commit();
      console.log(`📦 Archived ${archivedCount} total Year 4 students`);
    }

  } catch (error) {
    console.warn(`⚠️ Error in optimized archiving:`, error.message);
  }

  return archivedCount;
};

/**
 * Migrate students between year collections
 * Year 3 → Year 4, Year 2 → Year 3, Year 1 → Year 2
 * @returns {number} Total count of migrated students
 */
const migrateStudentsByYear = async (facultyId, newAcademicYear) => {
  const departments = ['IT', 'CSE', 'ECE', 'EEE', 'MECH', 'CIVIL'];
  let totalMigrated = 0;

  const migrations = [
    { from: 'year3', to: 'year4', nextLevel: 4 },
    { from: 'year2', to: 'year3', nextLevel: 3 },
    { from: 'year1', to: 'year2', nextLevel: 2 }
  ];

  for (const { from, to, nextLevel } of migrations) {
    try {
      // 1. Fetch all students for this year level across all departments in parallel
      const fetchPromises = departments.map(dept => {
        const sourcePath = `students/${from}/departments/${dept}/students`;
        return getDocs(collection(db, sourcePath)).then(snap => ({ dept, snap }));
      });

      const results = await Promise.all(fetchPromises);
      const batch = writeBatch(db);
      let countForLevel = 0;
      let opsForLevel = 0;

      for (const { dept, snap } of results) {
        if (snap.empty) continue;

        const targetPath = `students/${to}/departments/${dept}/students`;

        snap.forEach(docSnap => {
          const studentData = docSnap.data();
          const targetDocRef = doc(db, targetPath, docSnap.id);

          // Calculate the correct academic_year for the new level
          // Formula: academicYear - yearLevel + 1
          // Example: If promoting to Year 3 in 2025: 2025 - 3 + 1 = 2023
          const academic_year = newAcademicYear - nextLevel + 1;
          const joiningYear = academic_year;

          batch.set(targetDocRef, {
            ...studentData,
            year_level: nextLevel,
            currentYear: nextLevel,
            academic_year: academic_year,
            joiningYear: joiningYear,
            currentAcademicYear: newAcademicYear,
            migratedAt: serverTimestamp(),
            migratedBy: facultyId,
            previousLevel: from,
          });

          batch.delete(docSnap.ref);
          opsForLevel += 2;
          countForLevel++;
        });
      }

      if (opsForLevel > 0) {
        await batch.commit();
        totalMigrated += countForLevel;
        console.log(`🔄 Level ${nextLevel}: Updated ${countForLevel} total students`);

        // CR MIGRATION: Migrate CR records for this level
        await migrateCRRecordsForLevel(facultyId, from, to, nextLevel);
      }
    } catch (error) {
      console.warn(`⚠️ Error in level migration ${from}:`, error.message);
    }
  }

  return totalMigrated;
};

/**
 * Migrate Class Representative records between year levels
 * Handles both the main tracking collection and user profile updates
 */
const migrateCRRecordsForLevel = async (facultyId, fromYearId, toYearId, nextLevel) => {
  const departments = ['IT', 'CSE', 'ECE', 'EEE', 'MECH', 'CIVIL'];
  const fromYearKey = fromYearId.includes('_') ? fromYearId : fromYearId.replace('year', 'year_');
  const toYearKey = toYearId.includes('_') ? toYearId : toYearId.replace('year', 'year_');

  for (const dept of departments) {
    try {
      const sourcePath = `classrepresentative/${fromYearKey}/department_${dept}`;
      const snapshot = await getDocs(collection(db, sourcePath));

      if (snapshot.empty) continue;

      const batch = writeBatch(db);
      const targetPath = `classrepresentative/${toYearKey}/department_${dept}`;

      console.log(`🎓 Migrating ${snapshot.size} CRs from ${sourcePath} to ${targetPath}`);

      for (const docSnap of snapshot.docs) {
        const crData = docSnap.data();
        if (crData.active === false) continue;

        const targetRef = doc(db, targetPath, docSnap.id);
        const resolvedUid = crData.uid || crData.userId || crData.authUid;

        // 1. Move the assignment record
        batch.set(targetRef, {
          ...crData,
          year: toYearKey,
          currentYear: nextLevel,
          migratedAt: serverTimestamp(),
          migratedBy: facultyId,
          lastPromotedFrom: fromYearKey
        });
        batch.delete(docSnap.ref);

        // 2. Update User Profile (Source of Truth for login/dashboard)
        if (resolvedUid) {
          const userRef = doc(db, 'users', resolvedUid);
          batch.update(userRef, {
            currentYear: nextLevel,
            year: toYearKey,
            updatedAt: serverTimestamp()
          });
        } else if (crData.email) {
          // Fallback: try to find user by email if UID is missing in CR record
          const emailQuery = query(collection(db, 'users'), where('email', '==', crData.email.toLowerCase().trim()));
          const emailSnap = await getDocs(emailQuery);
          if (!emailSnap.empty) {
            batch.update(emailSnap.docs[0].ref, {
              currentYear: nextLevel,
              year: toYearKey,
              updatedAt: serverTimestamp()
            });
          }
        }

        // 3. Update alternate CR collection (legacy support)
        if (crData.email) {
          const emailDocId = crData.email.toLowerCase().replace(/[@.]/g, '_');
          const altRef = doc(db, 'classRepresentatives', emailDocId);
          batch.set(altRef, {
            year: toYearId.replace('_', ''),
            yearLevel: nextLevel,
            currentYear: nextLevel,
            updatedAt: serverTimestamp()
          }, { merge: true });
        }
      }

      await batch.commit();
    } catch (error) {
      console.warn(`⚠️ CR migration failed for ${fromYearKey}/${dept}:`, error.message);
    }
  }
};

/**
 * Find all students who will be in Year 4 after promotion
 * (i.e., students where currentYear = currentAcademicYear - joiningYear + 1 = 4)
 */
const findGraduatingStudents = async (currentYear) => {
  const graduatingJoiningYear = currentYear - 3; // Students who joined 3 years ago are now Year 4
  const batchId = `batch_${graduatingJoiningYear}`;

  const graduatingStudents = [];
  const departments = ['IT', 'CSE', 'ECE', 'EEE', 'MECH', 'CIVIL']; // Add all your departments

  for (const dept of departments) {
    try {
      const studentsPath = `students/${batchId}/departments/${dept}/students`;
      const studentsRef = collection(db, studentsPath);
      const snapshot = await getDocs(studentsRef);

      snapshot.forEach(doc => {
        graduatingStudents.push({
          id: doc.id,
          data: doc.data(),
          department: dept,
          batchId,
          path: `${studentsPath}/${doc.id}`
        });
      });

      console.log(`📋 Found ${snapshot.size} Year 4 students in ${dept}`);
    } catch (error) {
      console.warn(`⚠️ Could not load Year 4 students from ${dept}:`, error.message);
    }
  }

  return {
    students: graduatingStudents,
    totalCount: graduatingStudents.length,
    joiningYear: graduatingJoiningYear,
    batchId
  };
};

/**
 * Archive graduating students to a separate collection
 * Then delete them from active student collections
 */
const archiveGraduatingStudents = async (graduatingBatches, facultyId) => {
  const { students } = graduatingBatches;

  if (students.length === 0) {
    console.log('ℹ️ No Year 4 students to archive');
    return 0;
  }

  let archivedCount = 0;
  const BATCH_SIZE = 500; // Firestore batch limit

  // Process in batches of 500
  for (let i = 0; i < students.length; i += BATCH_SIZE) {
    const batch = writeBatch(db);
    const chunk = students.slice(i, i + BATCH_SIZE);

    for (const student of chunk) {
      // Archive to graduatedStudents collection
      const archiveId = `${student.batchId}_${student.id}`;
      const archiveRef = doc(db, GRADUATED_ARCHIVE_PATH, archiveId);

      batch.set(archiveRef, {
        ...student.data,
        archivedAt: serverTimestamp(),
        archivedBy: facultyId,
        originalPath: student.path,
        graduationYear: student.data.joiningYear + 3, // They graduated after 4 years
        department: student.department
      });

      // Delete from active students collection
      const studentRef = doc(db, student.path);
      batch.delete(studentRef);
    }

    await batch.commit();
    archivedCount += chunk.length;
    console.log(`📦 Archived batch ${Math.floor(i / BATCH_SIZE) + 1}: ${chunk.length} students`);
  }

  // Also archive/deactivate any CRs from graduating batch
  await deactivateGraduatingCRs(graduatingBatches.batchId);

  return archivedCount;
};

const deactivateYear4CRs = async (dept) => {
  try {
    // Check both potential path formats (year_4 and year4)
    const year4Paths = [`classrepresentative/year_4/department_${dept}`, `classrepresentative/year4/department_${dept}`];

    for (const path of year4Paths) {
      const crRef = collection(db, path);
      const snapshot = await getDocs(crRef);

      if (snapshot.empty) continue;

      const batch = writeBatch(db);
      snapshot.forEach(docSnap => {
        const data = docSnap.data();

        // 1. Deactivate the CR assignment record
        batch.update(docSnap.ref, {
          active: false,
          graduatedAt: serverTimestamp(),
          status: 'graduated',
          note: 'Deactivated - Year 4 graduated'
        });

        // 2. Clear CR flags from the User Profile
        if (data.uid) {
          const userRef = doc(db, 'users', data.uid);
          batch.set(userRef, {
            role: 'student',
            isCR: false,
            graduatedAt: serverTimestamp(),
            crYear: deleteField(),
            crPosition: deleteField(),
            crCredentials: deleteField(),
            crDepartment: deleteField()
          }, { merge: true });
        }
      });

      await batch.commit();
      console.log(`🎓 Deactivated ${snapshot.size} CRs from graduated ${dept} batch at ${path}`);
    }
  } catch (error) {
    console.warn(`⚠️ Error deactivating Year 4 CRs for ${dept}:`, error.message);
  }
};

const deactivateYear4CRsNested = async (dept) => {
  try {
    const nestedRef = collection(db, 'classRepresentatives', 'year4', 'departments', dept, 'reps');
    const snapshot = await getDocs(nestedRef);

    if (snapshot.empty) return;

    const batch = writeBatch(db);
    snapshot.forEach(docSnap => {
      const data = docSnap.data();

      // 1. Deactivate assignment
      batch.update(docSnap.ref, {
        active: false,
        graduatedAt: serverTimestamp(),
        note: 'Deactivated - Year 4 graduated'
      });

      // 2. Clear user profile
      if (data.uid) {
        const userRef = doc(db, 'users', data.uid);
        batch.set(userRef, {
          role: 'student',
          isCR: false,
          graduatedAt: serverTimestamp(),
          crYear: deleteField(),
          crPosition: deleteField(),
          crCredentials: deleteField(),
          crDepartment: deleteField()
        }, { merge: true });
      }
    });

    await batch.commit();
    console.log(`🎓 Deactivated ${snapshot.size} nested CRs from graduated ${dept} batch`);
  } catch (error) {
    console.warn(`⚠️ Error deactivating nested Year 4 CRs for ${dept}:`, error.message);
  }
};

/**
 * Get a summary of students per year
 * Useful for showing stats before promotion
 */
export const getStudentDistribution = async () => {
  const distribution = [];
  const departments = ['IT', 'CSE', 'ECE', 'EEE', 'MECH', 'CIVIL'];
  const globalYear = getCurrentAcademicYear();

  try {
    const yearPromises = [1, 2, 3, 4].map(async (year) => {
      const yearId = `year${year}`;
      const deptPromises = departments.map(dept => {
        const studentsPath = `students/${yearId}/departments/${dept}/students`;
        return getDocs(collection(db, studentsPath));
      });

      const deptSnaps = await Promise.all(deptPromises);
      const totalStudents = deptSnaps.reduce((acc, snap) => acc + snap.size, 0);
      const batchYear = globalYear - year + 1;

      return {
        currentYear: year,
        yearId,
        studentCount: totalStudents,
        label: getYearDisplayLabel(year)
      };
    });

    return await Promise.all(yearPromises);
  } catch (error) {
    console.error('Error in distribution calculation:', error);
    return [];
  }
};

// Re-export for convenience
export { getCurrentAcademicYear, getJoiningYearForLevel, getYearDisplayLabel, setCurrentAcademicYear } from '../constants/academicYear';

