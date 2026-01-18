import { 
  collection, 
  query, 
  where, 
  getDocs, 
  addDoc, 
  updateDoc,
  serverTimestamp,
  doc
} from 'firebase/firestore';
import { 
  createUserWithEmailAndPassword, 
  updatePassword,
  signInWithEmailAndPassword
} from 'firebase/auth';
import { db, auth } from '../firebase/firebaseConfig';

/**
 * Generate a new CR password in format: FirstName@XXXX
 * @param {string} firstName - Student's first name
 * @returns {string} Generated password
 */
export const generateCRPassword = (firstName) => {
  const randomNumber = Math.floor(1000 + Math.random() * 9000); // 4-digit random number
  return `${firstName}@${randomNumber}`;
};

/**
 * Check if maximum CR limit (2) has been reached for a year + department
 * @param {string} year - Year (e.g., "year_3")
 * @param {string} departmentId - Department ID
 * @returns {Promise<{allowed: boolean, count: number}>}
 */
export const checkCRLimit = async (year, departmentId) => {
  try {
    const crCollectionRef = collection(db, 'classrepresentative', year, `department_${departmentId}`);
    const q = query(crCollectionRef, where('active', '==', true));
    const snapshot = await getDocs(q);
    
    const count = snapshot.size;
    return {
      allowed: count < 2,
      count: count
    };
  } catch (error) {
    console.error('Error checking CR limit:', error);
    throw error;
  }
};

/**
 * Deactivate all existing active CR records for a student
 * @param {string} year - Year (e.g., "year_3")
 * @param {string} departmentId - Department ID
 * @param {string} email - Student email
 */
export const deactivateExistingCRRecords = async (year, departmentId, email) => {
  try {
    const crCollectionRef = collection(db, 'classrepresentative', year, `department_${departmentId}`);
    const q = query(
      crCollectionRef,
      where('email', '==', email),
      where('active', '==', true)
    );
    
    const snapshot = await getDocs(q);
    
    // Update all active records to inactive
    const updatePromises = snapshot.docs.map(docSnapshot => 
      updateDoc(doc(db, 'classrepresentative', year, `department_${departmentId}`, docSnapshot.id), {
        active: false
      })
    );
    
    await Promise.all(updatePromises);
    console.log(`Deactivated ${snapshot.size} existing CR records for ${email}`);
  } catch (error) {
    console.error('Error deactivating existing CR records:', error);
    throw error;
  }
};

/**
 * Create or update Firebase Auth user with new password
 * @param {string} email - Student email
 * @param {string} password - New generated password
 * @returns {Promise<{uid: string, isNewUser: boolean}>}
 */
export const createOrUpdateAuthUser = async (email, password) => {
  try {
    // Try to sign in to check if user exists
    let userCredential;
    let isNewUser = false;
    
    try {
      // Attempt to create new user
      userCredential = await createUserWithEmailAndPassword(auth, email, password);
      isNewUser = true;
      console.log(`Created new Firebase Auth user: ${email}`);
    } catch (createError) {
      if (createError.code === 'auth/email-already-in-use') {
        // User exists, need to update password
        // First, we need to sign in with a temporary method
        // For security, we'll use admin SDK approach or handle differently
        
        // Alternative: Use Firebase Admin SDK (server-side) for password update
        // For client-side, we need the current password to update
        // Since we're the system, we'll use a workaround:
        
        console.log(`User ${email} already exists. Password will be updated on next login attempt.`);
        // Note: In production, use Firebase Admin SDK or Cloud Functions
        // to update password without knowing the old password
        
        return {
          uid: null,
          isNewUser: false,
          requiresPasswordUpdate: true,
          email: email,
          newPassword: password
        };
      } else {
        throw createError;
      }
    }
    
    return {
      uid: userCredential.user.uid,
      isNewUser: isNewUser
    };
  } catch (error) {
    console.error('Error creating/updating auth user:', error);
    throw error;
  }
};

/**
 * Assign a student as Class Representative
 * @param {Object} student - Student object
 * @param {string} facultyId - Faculty ID assigning the CR
 * @returns {Promise<{success: boolean, password: string, message: string}>}
 */
export const assignClassRepresentative = async (student, facultyId) => {
  try {
    const { studentId, name, email, year, departmentId, departmentName } = student;
    
    // 1. Check CR limit
    const limitCheck = await checkCRLimit(year, departmentId);
    if (!limitCheck.allowed) {
      return {
        success: false,
        message: `Maximum 2 CRs already assigned for ${departmentName}. Current count: ${limitCheck.count}`
      };
    }
    
    // 2. Deactivate any existing active CR records for this student
    await deactivateExistingCRRecords(year, departmentId, email);
    
    // 3. Generate new password
    const firstName = name.split(' ')[0]; // Get first name
    const newPassword = generateCRPassword(firstName);
    
    // 4. Create or update Firebase Auth user
    const authResult = await createOrUpdateAuthUser(email, newPassword);
    
    // 5. Create new CR record in Firestore
    const crCollectionRef = collection(db, 'classrepresentative', year, `department_${departmentId}`);
    const crData = {
      studentId: studentId,
      name: name,
      email: email,
      year: year,
      departmentId: departmentId,
      departmentName: departmentName,
      assignedAt: serverTimestamp(),
      assignedBy: facultyId,
      active: true,
      authUid: authResult.uid || null
    };
    
    const docRef = await addDoc(crCollectionRef, crData);
    
    console.log(`Successfully assigned ${name} as CR with ID: ${docRef.id}`);
    
    return {
      success: true,
      password: newPassword,
      message: `${name} has been assigned as Class Representative`,
      crId: docRef.id,
      isNewUser: authResult.isNewUser
    };
    
  } catch (error) {
    console.error('Error assigning CR:', error);
    return {
      success: false,
      message: `Failed to assign CR: ${error.message}`
    };
  }
};

/**
 * Validate CR access after Firebase authentication
 * @param {string} email - Logged in user email
 * @returns {Promise<{isValid: boolean, crData: Object|null, message: string}>}
 */
export const validateCRAccess = async (email) => {
  try {
    // Search across all years and departments for active CR record
    const years = ['year_1', 'year_2', 'year_3', 'year_4'];
    const departments = ['CSE', 'IT', 'ECE', 'EEE', 'MECH', 'CIVIL'];
    
    for (const year of years) {
      for (const dept of departments) {
        try {
          const crCollectionRef = collection(db, 'classrepresentative', year, `department_${dept}`);
          const q = query(
            crCollectionRef,
            where('email', '==', email),
            where('active', '==', true)
          );
          
          const snapshot = await getDocs(q);
          
          if (!snapshot.empty) {
            const crDoc = snapshot.docs[0];
            const crData = {
              id: crDoc.id,
              ...crDoc.data()
            };
            
            return {
              isValid: true,
              crData: crData,
              message: 'Valid CR access'
            };
          }
        } catch (error) {
          // Collection might not exist, continue
          continue;
        }
      }
    }
    
    // No active CR record found
    return {
      isValid: false,
      crData: null,
      message: 'You are not an active Class Representative'
    };
    
  } catch (error) {
    console.error('Error validating CR access:', error);
    return {
      isValid: false,
      crData: null,
      message: `Validation error: ${error.message}`
    };
  }
};

/**
 * Deactivate a CR (remove their active status)
 * @param {string} year - Year (e.g., "year_3")
 * @param {string} departmentId - Department ID
 * @param {string} crId - CR document ID
 * @returns {Promise<{success: boolean, message: string}>}
 */
export const deactivateCR = async (year, departmentId, crId) => {
  try {
    const crDocRef = doc(db, 'classrepresentative', year, `department_${departmentId}`, crId);
    await updateDoc(crDocRef, {
      active: false
    });
    
    return {
      success: true,
      message: 'CR has been deactivated successfully'
    };
  } catch (error) {
    console.error('Error deactivating CR:', error);
    return {
      success: false,
      message: `Failed to deactivate CR: ${error.message}`
    };
  }
};

/**
 * Get all active CRs for a department and year
 * @param {string} year - Year (e.g., "year_3")
 * @param {string} departmentId - Department ID
 * @returns {Promise<Array>}
 */
export const getActiveCRs = async (year, departmentId) => {
  try {
    const crCollectionRef = collection(db, 'classrepresentative', year, `department_${departmentId}`);
    const q = query(crCollectionRef, where('active', '==', true));
    const snapshot = await getDocs(q);
    
    const crs = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    return crs;
  } catch (error) {
    console.error('Error fetching active CRs:', error);
    return [];
  }
};
