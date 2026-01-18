#!/usr/bin/env node

/**
 * Password Reset Email Script: Send password reset emails to reps
 * 
 * This script sends Firebase password reset emails to reps who need
 * to sync their password with Firestore credentials.
 * 
 * Usage: node scripts/send-password-reset-emails.js
 */

import { initializeApp } from 'firebase/app';
import { getAuth, sendPasswordResetEmail } from 'firebase/auth';
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

async function sendPasswordResetEmails() {
  log.header('📧 SENDING PASSWORD RESET EMAILS');
  log.info(`Project: ${firebaseConfig.projectId}`);
  log.info(`To: Reps needing password sync\n`);

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
                    password: data.password, // Store for reference
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

    log.info(`Found ${allReps.length} class representative(s)\n`);
    log.header('🔄 Sending Password Reset Emails');

    let sent = 0;
    let failed = 0;
    const results = [];

    // Send password reset emails
    for (const rep of allReps) {
      const email = rep.email?.toLowerCase().trim();
      const password = rep.password;

      if (!email || !password) {
        log.warning(`Skipping ${rep.id}: missing email or password`);
        continue;
      }

      try {
        log.info(`Sending reset email to: ${email}`);
        
        await sendPasswordResetEmail(auth, email);
        
        log.success(`Reset email sent to ${email}`);
        log.info(`  New password: ${password}`);
        sent++;
        results.push({
          email,
          status: 'sent',
          password
        });
      } catch (error) {
        const code = error?.code || '';
        let message = error.message;
        
        if (code === 'auth/user-not-found') {
          message = 'User not found in Firebase Auth';
        } else if (code === 'auth/invalid-email') {
          message = 'Invalid email format';
        } else if (code === 'auth/too-many-requests') {
          message = 'Too many reset requests. Try again later.';
        }
        
        log.error(`Failed to send reset to ${email}: ${message}`);
        failed++;
        results.push({
          email,
          status: 'failed',
          reason: message
        });
      }
    }

    // Summary
    log.header('📊 EMAIL SUMMARY');
    log.success(`Sent: ${sent} password reset email(s)`);
    log.error(`Failed: ${failed}`);

    if (results.length > 0) {
      log.header('📋 RESULTS');
      results.forEach((r) => {
        if (r.status === 'sent') {
          console.log(`✅ ${r.email}`);
          console.log(`   Password to set: ${r.password}`);
        } else {
          console.log(`❌ ${r.email}`);
          console.log(`   Reason: ${r.reason}`);
        }
      });
    }

    log.header('📋 NEXT STEPS');
    log.info('Reps should:');
    console.log('  1. Check their email inbox');
    console.log('  2. Click the password reset link');
    console.log('  3. Enter the new password shown above');
    console.log('  4. Log in to ClassConnect app');
    console.log('');
    log.info('Password reset links expire in 24 hours');

    log.header('✅ COMPLETE');
    process.exit(failed > 0 ? 1 : 0);

  } catch (error) {
    log.error(`Fatal error: ${error.message}`);
    console.error(error);
    process.exit(1);
  }
}

sendPasswordResetEmails();
