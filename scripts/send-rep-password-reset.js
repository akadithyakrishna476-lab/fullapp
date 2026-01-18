#!/usr/bin/env node

/**
 * Send Password Reset: Send emails to specific reps to reset their Firebase Auth password
 */

import { initializeApp } from 'firebase/app';
import { getAuth, sendPasswordResetEmail } from 'firebase/auth';

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

const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  reset: '\x1b[0m',
};

const log = {
  success: (msg) => console.log(`${colors.green}✅ ${msg}${colors.reset}`),
  error: (msg) => console.log(`${colors.red}❌ ${msg}${colors.reset}`),
  info: (msg) => console.log(`${colors.cyan}ℹ️  ${msg}${colors.reset}`),
};

async function sendResetEmail(email) {
  try {
    log.info(`Sending reset email to ${email}...`);
    await sendPasswordResetEmail(auth, email);
    log.success(`Reset email sent to ${email}`);
    return true;
  } catch (error) {
    log.error(`Failed to send reset to ${email}: ${error.message}`);
    return false;
  }
}

async function main() {
  console.log('\n📧 CLASS REP PASSWORD RESET\n');
  
  // Send to the rep that had the auth error
  await sendResetEmail('aashnaraj2512006@gmail.com');
  
  console.log('\n✅ COMPLETE\n');
  process.exit(0);
}

main();
