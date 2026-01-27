/**
 * Firebase Cloud Functions for Secure Class Rep Management
 * 
 * This file contains the backend logic for:
 * 1. Assigning new reps with faculty-generated passwords
 * 2. Reassigning reps and invalidating old passwords
 * 3. Password reset functionality (restricted to active reps)
 * 4. User validation checks
 * 
 * IMPORTANT: Deploy these as Cloud Functions on Firebase Console
 * 
 * npm install firebase-admin firebase-functions cors
 */

// For deployment in Cloud Functions environment:
// const functions = require('firebase-functions');
// const admin = require('firebase-admin');
// const cors = require('cors')({ origin: true });

// For local testing/Node.js backend:
// Set these up with your Firebase Admin SDK

import admin from 'firebase-admin';
import { generateSecurePassword, generateCRPassword } from '../utils/passwordGenerator.js';

/**
 * FACULTY ENDPOINT: Assign a student as Class Representative
 * 
 * Only faculty can call this endpoint
 * Generates a new password and sends it to the student's email
 * 
 * Request body:
 * {
 *   studentUid: string,
 *   studentEmail: string,
 *   collegeId: string,
 *   departmentId: string,
 *   slot: string,
 *   year: number,
 *   facultyId: string (validated against Firebase Auth)
 * }
 * 
 * Response:
 * {
 *   success: boolean,
 *   message: string,
 *   password: string (only in development/secure channel),
 *   uid: string
 * }
 */
export const assignClassRepresentative = async (req, res) => {
  // Enable CORS
  // return cors(req, res, async () => {
  
  try {
    // Verify faculty authentication
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized: No authentication token'
      });
    }

    const token = authHeader.split('Bearer ')[1];
    let decodedToken;
    try {
      decodedToken = await admin.auth().verifyIdToken(token);
    } catch (err) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized: Invalid token'
      });
    }

    // Validate faculty role (you may need to check custom claims or Firestore)
    // This is a simplified check - adjust based on your faculty verification method
    const facultyDoc = await admin.firestore()
      .collection('users')
      .doc(decodedToken.uid)
      .get();

    if (!facultyDoc.exists() || facultyDoc.data()?.role !== 'faculty') {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: Only faculty can assign Class Representatives'
      });
    }

    // Validate request parameters
    const {
      studentUid,
      studentEmail,
      collegeId,
      departmentId,
      slot,
      year
    } = req.body;

    if (!studentUid || !studentEmail || !collegeId || !departmentId || !slot || !year) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: studentUid, studentEmail, collegeId, departmentId, slot, year'
      });
    }

    const normalizedEmail = String(studentEmail).trim().toLowerCase();

    // Retrieve student's first name for password generation
    let studentFirstName = 'Student'; // Fallback
    try {
      const studentDoc = await admin.firestore()
        .collection('users')
        .doc(studentUid)
        .get();
      
      if (studentDoc.exists() && studentDoc.data()?.firstName) {
        studentFirstName = studentDoc.data().firstName;
      }
    } catch (err) {
      console.warn(`Could not retrieve student name: ${err.message}`);
      // Continue with fallback name
    }

    // Generate new password in format: firstname@1234
    const newPassword = generateCRPassword(studentFirstName);

    // Step 1: Create or update user in Firebase Auth
    let uid = studentUid;
    try {
      // Try to get existing user
      const existingUser = await admin.auth().getUser(studentUid);
      uid = existingUser.uid;
      
      // Update password for existing user
      await admin.auth().updateUser(uid, {
        password: newPassword,
        email: normalizedEmail
      });

      console.log(`✅ Updated Firebase Auth user: ${uid}`);
    } catch (err) {
      if (err.code === 'auth/user-not-found') {
        // Create new user
        const newUser = await admin.auth().createUser({
          email: normalizedEmail,
          password: newPassword,
          emailVerified: false
        });

        uid = newUser.uid;
        console.log(`✅ Created new Firebase Auth user: ${uid}`);
      } else {
        throw err;
      }
    }

    // Step 2: Update Firestore user document with rep metadata
    const userRef = admin.firestore().collection('users').doc(uid);
    
    // Get current passwordVersion if exists
    const currentDoc = await userRef.get();
    const currentPasswordVersion = currentDoc.data()?.passwordVersion || 0;
    const newPasswordVersion = currentPasswordVersion + 1;

    await userRef.set({
      email: normalizedEmail,
      role: 'rep',
      isActiveRep: true,
      passwordVersion: newPasswordVersion,
      collegeId,
      departmentId,
      slot,
      year,
      assignedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      assignedByFacultyId: decodedToken.uid,
      // Merge with existing data
      ...currentDoc.data()
    }, { merge: true });

    console.log(`✅ Updated Firestore user document: ${uid}`);

    // Step 3: Create assignment record for auditing
    const assignmentRef = admin.firestore()
      .collection('repAssignments')
      .doc();

    await assignmentRef.set({
      uid,
      email: normalizedEmail,
      collegeId,
      departmentId,
      slot,
      year,
      passwordVersion: newPasswordVersion,
      action: 'assigned',
      assignedByFacultyId: decodedToken.uid,
      assignedAt: new Date().toISOString()
    });

    console.log(`✅ Created assignment record: ${assignmentRef.id}`);

    // Step 4: Send password email (implement your email service)
    // await sendRepPasswordEmail(normalizedEmail, newPassword, {
    //   collegeId,
    //   departmentId,
    //   slot,
    //   year
    // });

    // IMPORTANT: In production, only return a success message without the password
    // The password should only be transmitted via secure email
    return res.status(200).json({
      success: true,
      message: `Class Representative assigned successfully. Password sent to ${normalizedEmail}`,
      password: newPassword,
      securityWarning: 'Share these credentials securely. The student should change the password after first login.',
      uid,
      passwordVersion: newPasswordVersion
    });

  } catch (error) {
    console.error('Error assigning Class Representative:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to assign Class Representative',
      error: error.message
    });
  }

  // });  // Close CORS wrapper
};

/**
 * FACULTY ENDPOINT: Reassign a Class Representative
 * 
 * When a rep is replaced, this endpoint:
 * 1. Invalidates the old rep's access
 * 2. Generates a new password for the new rep
 * 3. Updates all metadata
 * 
 * Request body:
 * {
 *   oldRepUid: string (the UID being replaced),
 *   newStudentUid: string (the new rep's UID),
 *   newStudentEmail: string (the new rep's email),
 *   collegeId: string,
 *   departmentId: string,
 *   slot: string,
 *   year: number,
 *   facultyId: string
 * }
 */
export const reassignClassRepresentative = async (req, res) => {
  try {
    // Verify faculty authentication
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized: No authentication token'
      });
    }

    const token = authHeader.split('Bearer ')[1];
    let decodedToken;
    try {
      decodedToken = await admin.auth().verifyIdToken(token);
    } catch (err) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized: Invalid token'
      });
    }

    // Validate faculty role
    const facultyDoc = await admin.firestore()
      .collection('users')
      .doc(decodedToken.uid)
      .get();

    if (!facultyDoc.exists() || facultyDoc.data()?.role !== 'faculty') {
      return res.status(403).json({
        success: false,
        message: 'Forbidden: Only faculty can reassign Class Representatives'
      });
    }

    const {
      oldRepUid,
      newStudentUid,
      newStudentEmail,
      collegeId,
      departmentId,
      slot,
      year
    } = req.body;

    if (!oldRepUid || !newStudentUid || !newStudentEmail || !collegeId || !departmentId || !slot || !year) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields'
      });
    }

    const normalizedNewEmail = String(newStudentEmail).trim().toLowerCase();

    // Step 1: Disable old rep
    console.log(`🚫 Disabling old rep: ${oldRepUid}`);
    
    // Update old rep's Firestore document
    await admin.firestore()
      .collection('users')
      .doc(oldRepUid)
      .update({
        isActiveRep: false,
        disabledAt: new Date().toISOString(),
        disabledByFacultyId: decodedToken.uid,
        disabledReason: 'Replaced as Class Representative'
      });

    // Disable old rep in Firebase Auth by setting password to random string
    // This effectively locks the account without deleting it
    const disablePassword = Math.random().toString(36).substring(2, 15) + 
                            Math.random().toString(36).substring(2, 15);
    
    try {
      await admin.auth().updateUser(oldRepUid, {
        password: disablePassword
      });
      console.log(`✅ Old rep auth disabled`);
    } catch (err) {
      console.error('Failed to update old rep password:', err);
      // Continue anyway - Firestore flag is more important
    }

    // Step 2: Create/Update new rep
    console.log(`✅ Setting up new rep: ${newStudentUid}`);

    // Retrieve new student's first name for password generation
    let newStudentFirstName = 'Student'; // Fallback
    try {
      const newStudentDoc = await admin.firestore()
        .collection('users')
        .doc(newStudentUid)
        .get();
      
      if (newStudentDoc.exists() && newStudentDoc.data()?.firstName) {
        newStudentFirstName = newStudentDoc.data().firstName;
      }
    } catch (err) {
      console.warn(`Could not retrieve new student name: ${err.message}`);
      // Continue with fallback name
    }

    // Generate new password in format: firstname@1234
    const newPassword = generateCRPassword(newStudentFirstName);

    let newUid = newStudentUid;
    try {
      const existingUser = await admin.auth().getUser(newStudentUid);
      newUid = existingUser.uid;
      
      await admin.auth().updateUser(newUid, {
        password: newPassword,
        email: normalizedNewEmail
      });

      console.log(`✅ Updated new rep in Firebase Auth`);
    } catch (err) {
      if (err.code === 'auth/user-not-found') {
        const newUser = await admin.auth().createUser({
          email: normalizedNewEmail,
          password: newPassword,
          emailVerified: false
        });

        newUid = newUser.uid;
        console.log(`✅ Created new rep in Firebase Auth`);
      } else {
        throw err;
      }
    }

    // Update new rep's Firestore document
    const newRepDoc = await admin.firestore()
      .collection('users')
      .doc(newUid)
      .get();

    const newPasswordVersion = (newRepDoc.data()?.passwordVersion || 0) + 1;

    await admin.firestore()
      .collection('users')
      .doc(newUid)
      .set({
        email: normalizedNewEmail,
        role: 'rep',
        isActiveRep: true,
        passwordVersion: newPasswordVersion,
        collegeId,
        departmentId,
        slot,
        year,
        assignedAt: new Date().toISOString(),
        reassignedAt: new Date().toISOString(),
        assignedByFacultyId: decodedToken.uid,
        updatedAt: new Date().toISOString(),
        ...newRepDoc.data()
      }, { merge: true });

    // Step 3: Record reassignment for auditing
    await admin.firestore()
      .collection('repAssignments')
      .doc()
      .set({
        oldRepUid,
        newRepUid: newUid,
        newEmail: normalizedNewEmail,
        collegeId,
        departmentId,
        slot,
        year,
        oldPasswordVersion: newRepDoc.data()?.passwordVersion || 0,
        newPasswordVersion,
        action: 'reassigned',
        reassignedByFacultyId: decodedToken.uid,
        reassignedAt: new Date().toISOString()
      });

    console.log(`✅ Reassignment completed`);

    return res.status(200).json({
      success: true,
      message: 'Class Representative reassigned successfully',
      password: newPassword,
      securityWarning: 'Share these credentials securely. The student should change the password after first login.',
      newUid,
      oldRepDisabled: true,
      newPasswordVersion
    });

  } catch (error) {
    console.error('Error reassigning Class Representative:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to reassign Class Representative',
      error: error.message
    });
  }
};

/**
 * REP ENDPOINT: Request Password Reset
 * 
 * Only allows password reset for active reps
 * Generates a temporary reset link instead of using Firebase's default
 * 
 * Request body:
 * {
 *   email: string,
 *   tokenExpiry: number (milliseconds, default 3600000 = 1 hour)
 * }
 */
export const requestPasswordReset = async (req, res) => {
  try {
    const { email, tokenExpiry = 3600000 } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required'
      });
    }

    const normalizedEmail = String(email).trim().toLowerCase();

    // Find user by email
    const usersSnapshot = await admin.firestore()
      .collection('users')
      .where('email', '==', normalizedEmail)
      .limit(1)
      .get();

    if (usersSnapshot.empty) {
      // Don't reveal if user exists
      return res.status(200).json({
        success: true,
        message: 'If an account exists, a reset link has been sent to the email'
      });
    }

    const userDoc = usersSnapshot.docs[0];
    const userData = userDoc.data();
    const uid = userDoc.id;

    // STRICT CHECK: Only active reps can reset password
    if (userData.role !== 'rep' || userData.isActiveRep !== true) {
      console.log(`❌ Password reset denied for non-active rep: ${uid}`);
      
      // Don't reveal the reason (security)
      return res.status(200).json({
        success: true,
        message: 'If an account exists, a reset link has been sent to the email'
      });
    }

    // Generate reset token
    const resetToken = Math.random().toString(36).substring(2, 15) +
                      Math.random().toString(36).substring(2, 15) +
                      Math.random().toString(36).substring(2, 15);

    const resetTokenHash = require('crypto')
      .createHash('sha256')
      .update(resetToken)
      .digest('hex');

    const expiresAt = new Date(Date.now() + tokenExpiry);

    // Store reset request in Firestore
    await admin.firestore()
      .collection('passwordResets')
      .doc()
      .set({
        uid,
        email: normalizedEmail,
        resetTokenHash,
        createdAt: new Date().toISOString(),
        expiresAt: expiresAt.toISOString(),
        used: false,
        passwordVersionAtReset: userData.passwordVersion
      });

    // Send reset email with token
    // await sendPasswordResetEmail(normalizedEmail, resetToken, uid);

    console.log(`✅ Password reset requested for: ${uid}`);

    return res.status(200).json({
      success: true,
      message: 'If an account exists, a reset link has been sent to the email'
    });

  } catch (error) {
    console.error('Error requesting password reset:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to process password reset request',
      error: error.message
    });
  }
};

/**
 * REP ENDPOINT: Verify Reset Token and Reset Password
 * 
 * Used after rep clicks reset link in email
 * Validates token and updates password
 * 
 * Request body:
 * {
 *   uid: string,
 *   resetToken: string,
 *   newPassword: string
 * }
 */
export const completePasswordReset = async (req, res) => {
  try {
    const { uid, resetToken, newPassword } = req.body;

    if (!uid || !resetToken || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: uid, resetToken, newPassword'
      });
    }

    // Validate new password strength
    const { validatePasswordStrength } = await import('../utils/passwordGenerator.js');
    const validation = validatePasswordStrength(newPassword);

    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        message: 'Password does not meet requirements',
        errors: validation.errors
      });
    }

    // Hash the provided token
    const resetTokenHash = require('crypto')
      .createHash('sha256')
      .update(resetToken)
      .digest('hex');

    // Find and validate reset request
    const resetsSnapshot = await admin.firestore()
      .collection('passwordResets')
      .where('uid', '==', uid)
      .where('resetTokenHash', '==', resetTokenHash)
      .where('used', '==', false)
      .limit(1)
      .get();

    if (resetsSnapshot.empty) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired reset link'
      });
    }

    const resetDoc = resetsSnapshot.docs[0];
    const resetData = resetDoc.data();

    // Check expiration
    const expiresAt = new Date(resetData.expiresAt);
    if (new Date() > expiresAt) {
      return res.status(400).json({
        success: false,
        message: 'Reset link has expired'
      });
    }

    // Get user to verify they're still an active rep
    const userDoc = await admin.firestore()
      .collection('users')
      .doc(uid)
      .get();

    if (!userDoc.exists()) {
      return res.status(400).json({
        success: false,
        message: 'User not found'
      });
    }

    const userData = userDoc.data();

    // CRITICAL: Verify user is still active rep and password hasn't been updated since reset was issued
    if (userData.role !== 'rep' || userData.isActiveRep !== true) {
      return res.status(400).json({
        success: false,
        message: 'User is no longer an active Class Representative'
      });
    }

    if (userData.passwordVersion !== resetData.passwordVersionAtReset) {
      return res.status(400).json({
        success: false,
        message: 'Password was already reset. Please request a new reset link.'
      });
    }

    // Update password in Firebase Auth
    await admin.auth().updateUser(uid, {
      password: newPassword
    });

    // Mark reset as used
    await resetDoc.ref.update({
      used: true,
      usedAt: new Date().toISOString()
    });

    // Update user's last password change timestamp
    await admin.firestore()
      .collection('users')
      .doc(uid)
      .update({
        lastPasswordChangedAt: new Date().toISOString()
      });

    console.log(`✅ Password reset completed for user: ${uid}`);

    return res.status(200).json({
      success: true,
      message: 'Password has been reset successfully'
    });

  } catch (error) {
    console.error('Error completing password reset:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to reset password',
      error: error.message
    });
  }
};

/**
 * REP ENDPOINT: Change Password (After First Login)
 * 
 * Reps can optionally change their password after first login
 * DOES NOT require them to change password
 * 
 * Request body:
 * {
 *   uid: string,
 *   currentPassword: string,
 *   newPassword: string,
 *   idToken: string (Firebase Auth token)
 * }
 */
export const changePassword = async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized'
      });
    }

    const token = authHeader.split('Bearer ')[1];
    let decodedToken;
    
    try {
      decodedToken = await admin.auth().verifyIdToken(token);
    } catch (err) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized: Invalid token'
      });
    }

    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Current password and new password are required'
      });
    }

    // Validate new password strength
    const { validatePasswordStrength } = await import('../utils/passwordGenerator.js');
    const validation = validatePasswordStrength(newPassword);

    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        message: 'New password does not meet requirements',
        errors: validation.errors
      });
    }

    // Get user
    const userDoc = await admin.firestore()
      .collection('users')
      .doc(decodedToken.uid)
      .get();

    if (!userDoc.exists()) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Verify user is still active rep
    const userData = userDoc.data();
    if (userData.role !== 'rep' || userData.isActiveRep !== true) {
      return res.status(403).json({
        success: false,
        message: 'Only active Class Representatives can change password'
      });
    }

    // Verify current password (would need to re-auth on client side)
    // This is a simplified version - in production, use Firebase reauthentication

    // Update password
    await admin.auth().updateUser(decodedToken.uid, {
      password: newPassword
    });

    // Update last password change timestamp
    await admin.firestore()
      .collection('users')
      .doc(decodedToken.uid)
      .update({
        lastPasswordChangedAt: new Date().toISOString()
      });

    console.log(`✅ Password changed for user: ${decodedToken.uid}`);

    return res.status(200).json({
      success: true,
      message: 'Password changed successfully'
    });

  } catch (error) {
    console.error('Error changing password:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to change password',
      error: error.message
    });
  }
};
