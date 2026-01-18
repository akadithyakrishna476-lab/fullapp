#!/usr/bin/env node

/**
 * Import Script: Sync Firestore Rep Credentials to Firebase Auth
 * 
 * This script reads all Class Representatives from Firestore and creates
 * corresponding Firebase Authentication accounts.
 * 
 * Usage: node scripts/import-reps-to-firebase-auth.js
 */

import { initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, getDocs } from 'firebase/firestore';

// Firebase Configuration (from firebaseConfig.js)
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

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Color codes for console output
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

async function importRepsToFirebaseAuth() {
  log.header('🔐 IMPORTING CLASS REPS TO FIREBASE AUTH');
  log.info(`Project: ${firebaseConfig.projectId}`);
  log.info(`Reading from Firestore: crCredentials collection (nested in colleges/departments)\n`);

  try {
    const allReps = [];
    
    // Recursively search all collections for crCredentials
    const searchCredentialsCollections = async () => {
      try {
        // Get all colleges
        const collegesRef = collection(db, 'colleges');
        const collegesSnap = await getDocs(collegesRef);
        
        for (const collegeDoc of collegesSnap.docs) {
          const collegeId = collegeDoc.id;
          
          // Get all departments in this college
          try {
            const deptRef = collection(db, `colleges/${collegeId}/departments`);
            const deptSnap = await getDocs(deptRef);
            
            for (const deptDoc of deptSnap.docs) {
              const departmentId = deptDoc.id;
              
              // Get crCredentials in this department
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
                      source: 'crCredentials',
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
      
      return allReps;
    };
    
    const reps = await searchCredentialsCollections();

    log.info(`Found ${reps.length} class representative(s) in Firestore\n`);

    // Statistics
    let created = 0;
    let skipped = 0;
    let failed = 0;
    const errors = [];

    // Process each rep
    for (const rep of reps) {
      const email = rep.email?.toLowerCase().trim();
      const password = rep.password;

      if (!email || !password) {
        log.warning(`Skipping rep ${rep.id}: missing email or password`);
        skipped++;
        continue;
      }

      try {
        log.info(`Creating Firebase Auth user: ${email}`);
        
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        log.success(`Created user: ${email} (UID: ${userCredential.user.uid})`);
        created++;
      } catch (error) {
        const errorCode = error.code;
        
        if (errorCode === 'auth/email-already-in-use') {
          log.warning(`User already exists: ${email}`);
          skipped++;
        } else if (errorCode === 'auth/weak-password') {
          log.error(`Weak password for ${email}: ${error.message}`);
          errors.push({ email, reason: 'Weak password', details: error.message });
          failed++;
        } else if (errorCode === 'auth/invalid-email') {
          log.error(`Invalid email format: ${email}`);
          errors.push({ email, reason: 'Invalid email format', details: error.message });
          failed++;
        } else {
          log.error(`Failed to create ${email}: ${error.message}`);
          errors.push({ email, reason: error.message, details: errorCode });
          failed++;
        }
      }
    }

    // Summary
    log.header('📊 IMPORT SUMMARY');
    log.success(`Created: ${created} new user(s)`);
    log.warning(`Skipped: ${skipped} (already exist or missing data)`);
    log.error(`Failed: ${failed}`);

    if (errors.length > 0) {
      log.header('❌ ERRORS');
      errors.forEach((err) => {
        console.log(`  • ${err.email}: ${err.reason}`);
        if (err.details) console.log(`    Details: ${err.details}`);
      });
    }

    log.header('✅ IMPORT COMPLETE');
    log.info('All reps can now log in with their Firestore credentials');
    process.exit(created > 0 ? 0 : 1);

  } catch (error) {
    log.error(`Fatal error: ${error.message}`);
    console.error(error);
    process.exit(1);
  }
}

// Run the import
importRepsToFirebaseAuth();
