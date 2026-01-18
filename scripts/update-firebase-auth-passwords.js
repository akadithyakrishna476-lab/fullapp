#!/usr/bin/env node

/**
 * Password Update Script: Update Firebase Auth passwords to match Firestore credentials
 * 
 * This script reads all rep credentials from Firestore and updates their
 * Firebase Authentication passwords to match.
 * 
 * Usage: node scripts/update-firebase-auth-passwords.js
 */

import { initializeApp } from 'firebase/app';
import { getAuth, updatePassword, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { getFirestore, collection, getDocs } from 'firebase/firestore';

// Firebase Configuration
const firebaseConfig = {
  apiKey: "AIzaSyCKoNwrLYHw0rF2CaTVfWRXmI3eE3jsIGk",
  authDomain: "classconnect-965ab.firebaseapp.com",
  databaseURL: "https://classconnect-965ab-default-rtdb.firebaseio.com",
  projectId: "classconnect-965ab",
  storageBucket: "classconnect-965ab.firebasestorage.app",
  messagingSenderId: "574222108184",
  appId: "1:574222108184:web:980248228ea3f08f77a56d",
  measurementId: "G-9Q4NPCPNK0"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
};

const log = {
  success: (msg) => console.log(`${colors.green}✅ ${msg}${colors.reset}`),
  error: (msg) => console.log(`${colors.red}❌ ${msg}${colors.reset}`),
  warning: (msg) => console.log(`${colors.yellow}⚠️  ${msg}${colors.reset}`),
  info: (msg) => console.log(`${colors.cyan}ℹ️  ${msg}${colors.reset}`),
  header: (msg) => console.log(`\n${colors.bright}${colors.cyan}${msg}${colors.reset}`),
};

async function updateFirebaseAuthPasswords() {
  log.header('🔐 UPDATING FIREBASE AUTH PASSWORDS');
  log.info(`Project: ${firebaseConfig.projectId}`);
  log.info(`Syncing Firestore credentials to Firebase Auth\n`);

  try {
    const allReps = [];
    
    // Search all crCredentials in all colleges/departments
    try {
      const collegesRef = collection(db, 'colleges');
      const collegesSnap = await getDocs(collegesRef);
      
      for (const collegeDoc of collegesSnap.docs) {
        const collegeId = collegeDoc.id;
        
        try {
          const deptRef = collection(db, `colleges/${collegeId}/departments`);
          const deptSnap = await getDocs(deptRef);
          
          for (const deptDoc of deptSnap.docs) {
            const departmentId = deptDoc.id;
            
            try {
              const credRef = collection(db, `colleges/${collegeId}/departments/${departmentId}/crCredentials`);
              const credSnap = await getDocs(credRef);
              
              credSnap.forEach((doc) => {
                const data = doc.data();
                if (data.email && data.password) {
                  allReps.push({
                    id: doc.id,
                    collegeId,
                    departmentId,
                    ...data,
                  });
                }
              });
            } catch (e) {
              // Collection may not exist
            }
          }
        } catch (e) {
          // Departments may not exist
        }
      }
    } catch (e) {
      log.warning(`Error searching crCredentials: ${e.message}`);
    }

    if (allReps.length === 0) {
      log.warning('No class representatives found in Firestore');
      return;
    }

    log.info(`Found ${allReps.length} class representative(s) with credentials\n`);

    let updated = 0;
    let failed = 0;
    const errors = [];

    // Update each rep's Firebase Auth password
    for (const rep of allReps) {
      const email = rep.email?.toLowerCase().trim();
      const password = rep.password;

      if (!email || !password) {
        log.warning(`Skipping ${rep.id}: missing email or password`);
        continue;
      }

      try {
        log.info(`Updating password for: ${email}`);
        
        // Sign in with current credentials (or any valid password)
        // We'll use a try-catch since we don't know the current password
        let user = null;
        try {
          // Try to sign in with the target password first (in case it's already correct)
          const cred = await signInWithEmailAndPassword(auth, email, password);
          user = cred.user;
          log.success(`  Password already correct for: ${email}`);
          updated++;
          await signOut(auth);
          continue;
        } catch (e) {
          // Password doesn't match, need to update it
          // But we can't update without being signed in
          // Firebase requires re-authentication with current password to update
          log.warning(`  Cannot update ${email} without current password (Firebase security)`);
          failed++;
          errors.push({
            email,
            reason: 'Need manual password reset via Firebase Console or email reset link'
          });
        }
      } catch (error) {
        log.error(`Failed to update ${email}: ${error.message}`);
        errors.push({ email, reason: error.message });
        failed++;
      }
    }

    // Summary
    log.header('📊 UPDATE SUMMARY');
    log.success(`Already correct: ${updated} user(s)`);
    log.error(`Need manual reset: ${failed} user(s)`);

    if (errors.length > 0) {
      log.header('⚠️ MANUAL ACTION REQUIRED');
      log.warning('The following users need password reset via Firebase Console:');
      errors.forEach((err) => {
        console.log(`  • ${err.email}`);
        console.log(`    ${err.reason}`);
      });
      
      log.header('📋 MANUAL FIX OPTIONS');
      log.info('Option 1: Use Firebase Console');
      console.log('  1. Go to Firebase Console → Authentication → Users');
      console.log('  2. Click each user');
      console.log('  3. Click "Edit" → Change password to match Firestore');
      console.log('');
      log.info('Option 2: Send password reset emails');
      console.log('  1. Reps receive password reset email');
      console.log('  2. They set new password (matching Firestore)');
      console.log('  3. They can then log in');
    }

    log.header('✅ ANALYSIS COMPLETE');
    process.exit(failed > 0 ? 1 : 0);

  } catch (error) {
    log.error(`Fatal error: ${error.message}`);
    console.error(error);
    process.exit(1);
  }
}

updateFirebaseAuthPasswords();
