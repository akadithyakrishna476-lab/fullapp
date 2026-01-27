/**
 * CR Account Reactivation Utilities
 * Helps re-enable disabled CR accounts with proper validation
 */

import { collection, doc, getDoc, getDocs, query, updateDoc, where, writeBatch, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/firebaseConfig';

/**
 * Year mapping helper
 * Maps year level to joining year display
 */
const getJoiningYearForLevel = (yearLevel) => {
  const currentYear = 2027; // Update if needed
  return currentYear - (yearLevel - 1);
};

/**
 * Re-enable/reactivate a CR account
 * @param {string} crEmail - CR email address
 * @param {number} yearLevel - Year level (1, 2, 3, or 4)
 * @param {string} department - Department code (IT, CSE, ECE, EEE, MECH, CIVIL)
 * @returns {Promise<{success: boolean, message: string, details: Object}>}
 */
export const reactivateCRAccount = async (crEmail, yearLevel, department) => {
  try {
    console.log('🔐 Starting CR reactivation process...');
    console.log(`   Email: ${crEmail}, Year: ${yearLevel}, Dept: ${department}`);

    const normalizedEmail = crEmail.toLowerCase().trim();

    // STEP 1: Validate year level
    if (![1, 2, 3, 4].includes(yearLevel)) {
      throw new Error('Invalid year level. Must be 1, 2, 3, or 4.');
    }

    // STEP 2: Validate department
    const validDepts = ['IT', 'CSE', 'ECE', 'EEE', 'MECH', 'CIVIL'];
    if (!validDepts.includes(department)) {
      throw new Error(`Invalid department. Must be one of: ${validDepts.join(', ')}`);
    }

    // STEP 3: Check if target class has students
    const yearId = `year${yearLevel}`;
    const studentCount = await checkClassStudentCount(yearId, department);

    if (studentCount === 0) {
      throw new Error(
        `⚠️ Target class ${yearId}/${department} has ZERO students!\n\n` +
        `Cannot reactivate CR for empty class.\n\n` +
        `Please either:\n` +
        `1. Add students to this class first\n` +
        `2. OR assign the CR to a different year with students`
      );
    }

    console.log(`✅ Target class has ${studentCount} students`);

    // STEP 4: Find CR record in Firestore
    const yearKey = `year_${yearLevel}`;
    const crRef = collection(db, 'classrepresentative', yearKey, `department_${department}`);
    const crQuery = query(crRef, where('email', '==', normalizedEmail));
    const crSnapshot = await getDocs(crQuery);

    if (crSnapshot.empty) {
      throw new Error(
        `CR record not found in classrepresentative/${yearKey}/department_${department}\n\n` +
        `Try checking other years or departments.`
      );
    }

    const crDocId = crSnapshot.docs[0].id;
    const crData = crSnapshot.docs[0].data();
    const authUid = crData.authUid || crData.userId;

    console.log(`✅ Found CR record:`, { id: crDocId, name: crData.name, email: normalizedEmail });

    // STEP 5: Update CR document in classrepresentative collection
    const crDocRef = doc(db, 'classrepresentative', yearKey, `department_${department}`, crDocId);
    await updateDoc(crDocRef, {
      active: true,
      status: 'active',
      role: 'class_representative',
      assignedDepartment: department,
      assignedYear: yearLevel,
      reactivatedAt: serverTimestamp(),
      isDisabled: false,
      disableReason: null
    });

    console.log('✅ Updated classrepresentative document');

    // STEP 6: Update user profile if authUid exists
    if (authUid) {
      const userDocRef = doc(db, 'users', authUid);
      await updateDoc(userDocRef, {
        active: true,
        status: 'active',
        role: 'class_representative',
        departmentCode: department,
        departmentId: department,
        currentYear: yearLevel,
        year: yearKey,
        assignedDepartment: department,
        assignedYear: yearLevel,
        reactivatedAt: serverTimestamp(),
        isDisabled: false,
        disableReason: null
      });

      console.log(`✅ Updated user profile (${authUid})`);
    }

    // STEP 7: Also update nested structure if it exists
    try {
      const nestedRef = collection(db, 'classRepresentatives', yearId, 'departments', department, 'reps');
      const nestedQuery = query(nestedRef, where('email', '==', normalizedEmail));
      const nestedSnapshot = await getDocs(nestedQuery);

      if (!nestedSnapshot.empty) {
        const nestedDocId = nestedSnapshot.docs[0].id;
        const nestedDocRef = doc(db, 'classRepresentatives', yearId, 'departments', department, 'reps', nestedDocId);
        await updateDoc(nestedDocRef, {
          active: true,
          status: 'active',
          role: 'class_representative',
          assignedDepartment: department,
          assignedYear: yearLevel,
          reactivatedAt: serverTimestamp(),
          isDisabled: false,
          disableReason: null
        });

        console.log('✅ Updated nested CR document');
      }
    } catch (nestedError) {
      console.warn('⚠️ Nested structure update skipped (may not exist):', nestedError.message);
    }

    const joiningYear = getJoiningYearForLevel(yearLevel);

    return {
      success: true,
      message: `✅ CR account successfully reactivated!`,
      details: {
        name: crData.name,
        email: normalizedEmail,
        department: department,
        yearLevel: yearLevel,
        joiningYear: joiningYear,
        classStudentCount: studentCount,
        authUid: authUid || 'N/A',
        status: 'ACTIVE',
        canNowLogin: true
      }
    };

  } catch (error) {
    console.error('❌ CR reactivation failed:', error.message);
    return {
      success: false,
      message: `❌ Reactivation failed: ${error.message}`,
      details: null
    };
  }
};

/**
 * Check how many students are in a class
 */
const checkClassStudentCount = async (yearId, department) => {
  try {
    const studentsPath = `students/${yearId}/departments/${department}/students`;
    const snap = await getDocs(collection(db, studentsPath));
    return snap.size;
  } catch (error) {
    console.warn(`⚠️ Error checking student count:`, error.message);
    return 0;
  }
};

/**
 * List all inactive CRs that can be reactivated
 * @returns {Promise<Array>} List of inactive CRs
 */
export const listInactiveCRs = async () => {
  try {
    const inactiveCRs = [];
    const years = ['year_1', 'year_2', 'year_3', 'year_4'];
    const departments = ['IT', 'CSE', 'ECE', 'EEE', 'MECH', 'CIVIL'];

    for (const year of years) {
      for (const dept of departments) {
        try {
          const crRef = collection(db, 'classrepresentative', year, `department_${dept}`);
          const q = query(crRef, where('active', '==', false));
          const snapshot = await getDocs(q);

          snapshot.forEach(doc => {
            const data = doc.data();
            inactiveCRs.push({
              id: doc.id,
              name: data.name,
              email: data.email,
              department: dept,
              yearLevel: parseInt(year.replace('year_', '')),
              disableReason: data.disableReason || 'Unknown',
              disabledAt: data.disabledAt,
              documentPath: `classrepresentative/${year}/department_${dept}/${doc.id}`
            });
          });
        } catch (err) {
          // Collection might not exist, continue
        }
      }
    }

    console.log(`Found ${inactiveCRs.length} inactive CRs`);
    return inactiveCRs;
  } catch (error) {
    console.error('Error listing inactive CRs:', error);
    return [];
  }
};

/**
 * Get detailed status of a CR account
 * @param {string} crEmail - CR email
 * @returns {Promise<Object>} CR status details
 */
export const getCRAccountStatus = async (crEmail) => {
  try {
    const normalizedEmail = crEmail.toLowerCase().trim();
    const years = ['year_1', 'year_2', 'year_3', 'year_4'];
    const departments = ['IT', 'CSE', 'ECE', 'EEE', 'MECH', 'CIVIL'];

    for (const year of years) {
      for (const dept of departments) {
        try {
          const crRef = collection(db, 'classrepresentative', year, `department_${dept}`);
          const q = query(crRef, where('email', '==', normalizedEmail));
          const snapshot = await getDocs(q);

          if (!snapshot.empty) {
            const data = snapshot.docs[0].data();
            const yearLevel = parseInt(year.replace('year_', ''));
            const joiningYear = 2027 - (yearLevel - 1);
            const studentCount = await checkClassStudentCount(`year${yearLevel}`, dept);

            return {
              found: true,
              name: data.name,
              email: normalizedEmail,
              department: dept,
              yearLevel: yearLevel,
              joiningYear: joiningYear,
              classStudentCount: studentCount,
              active: data.active,
              status: data.status || 'unknown',
              role: data.role,
              disableReason: data.disableReason || null,
              disabledAt: data.disabledAt || null,
              authUid: data.authUid || data.userId || null,
              documentPath: `classrepresentative/${year}/department_${dept}/${snapshot.docs[0].id}`,
              canLogin: data.active === true && data.status === 'active',
              readyToReactivate: studentCount > 0
            };
          }
        } catch (err) {
          // Continue searching
        }
      }
    }

    return {
      found: false,
      message: `No CR found with email: ${crEmail}`
    };
  } catch (error) {
    console.error('Error getting CR status:', error);
    return {
      found: false,
      error: error.message
    };
  }
};

export default {
  reactivateCRAccount,
  listInactiveCRs,
  getCRAccountStatus
};
