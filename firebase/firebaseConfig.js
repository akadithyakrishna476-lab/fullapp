// Import the functions you need from the SDKs you need
import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth, initializeAuth, getReactNativePersistence } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
export const firebaseConfig = {
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
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

// NOTE: We intentionally do NOT initialize Firebase Analytics here because
// analytics requires browser APIs (document, IndexedDB, cookies) which are
// not available in React Native / some web bundling environments and will
// cause runtime errors. If you need analytics on web only, initialize it
// in a web-only entry point guarded by `analytics.isSupported()`.

// Initialize Firebase Authentication with React Native persistence when
// AsyncStorage is available. Fall back to `getAuth` when AsyncStorage or
// initializeAuth is not available (e.g., running in a web/SSR environment).
let authInstance;
const isReactNative = typeof navigator !== 'undefined' && navigator.product === 'ReactNative';
if (isReactNative) {
  try {
    // Try to require AsyncStorage; if it's not installed this will throw and
    // we'll fall back to regular getAuth which uses in-memory persistence.
    // Using require keeps this import from breaking web bundlers.
    // eslint-disable-next-line global-require
    const AsyncStorage = require('@react-native-async-storage/async-storage').default;
    authInstance = initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) });
  } catch (e) {
    // Fallback: either AsyncStorage isn't installed or initialization failed
    authInstance = getAuth(app);
  }
} else {
  // Web / Node: use default getAuth
  authInstance = getAuth(app);
}

// Initialize Cloud Firestore and get a reference to the service
export const auth = authInstance;
export const db = getFirestore(app);

// Provide a dedicated secondary auth instance for background user provisioning
// to avoid mutating the primary faculty session during account creation.
export const getSecondaryAuth = () => {
  const secondaryName = 'classconnect-secondary';
  const existing = getApps().find(a => a.name === secondaryName);
  const secondaryApp = existing || initializeApp(firebaseConfig, secondaryName);
  return getAuth(secondaryApp);
};

export default app;