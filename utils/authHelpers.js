import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase/firebaseConfig';

export const UNAUTHORIZED_MESSAGE = 'Unauthorized login. Please use your respective login page.';

const normalizeRole = (role) => (role || '').trim().toLowerCase();

const roleMatchesExpected = (role, expectedRole) => {
  const actual = normalizeRole(role);
  const expected = normalizeRole(expectedRole);
  if (!actual || !expected) return false;
  return actual === expected;
};

export const fetchUserRole = async (userId, userEmail = null) => {
  let role = null;
  let source = null;

  // Try lookup by UID first (preferred)
  if (userId) {
    try {
      const userDoc = await getDoc(doc(db, 'users', userId));
      if (userDoc.exists()) {
        const userData = userDoc.data();
        role = normalizeRole(userData.role);
        source = 'users';
        console.log(`Found user role in users collection: ${role}`);
      }
    } catch (e) {
      console.warn('Error fetching from users collection:', e);
    }

    if (!role) {
      try {
        const crDoc = await getDoc(doc(db, 'classRepresentatives', userId));
        if (crDoc.exists()) {
          const crData = crDoc.data();
          role = normalizeRole(crData.role);
          source = 'classRepresentatives';
          console.log(`Found user role in classRepresentatives collection: ${role}`);
        }
      } catch (e) {
        console.warn('Error fetching from classRepresentatives collection:', e);
      }
    }
  }

  // Fallback: lookup by email when UID docs are missing (supports existing accounts)
  if (!role && userEmail) {
    const normalizedEmail = String(userEmail || '').trim().toLowerCase();
    const emailDocId = normalizedEmail.replace(/[@.]/g, '_');

    try {
      const userEmailDoc = await getDoc(doc(db, 'users', emailDocId));
      if (userEmailDoc.exists()) {
        const userData = userEmailDoc.data();
        role = normalizeRole(userData.role);
        source = 'users-by-email';
        console.log(`Found user role by email in users: ${role}`);
        return { role, source };
      }
    } catch (e) {
      console.warn('Error fetching from users by email:', e);
    }

    try {
      const crEmailDoc = await getDoc(doc(db, 'classRepresentatives', emailDocId));
      if (crEmailDoc.exists()) {
        const crData = crEmailDoc.data();
        role = normalizeRole(crData.role);
        source = 'classRepresentatives-by-email';
        console.log(`Found user role by email in classRepresentatives: ${role}`);
        return { role, source };
      }
    } catch (e) {
      console.warn('Error fetching from classRepresentatives by email:', e);
    }

    // Last resort: query by email field in users collection
    try {
      const usersQuery = query(collection(db, 'users'), where('email', '==', normalizedEmail));
      const usersSnapshot = await getDocs(usersQuery);
      if (!usersSnapshot.empty) {
        const userData = usersSnapshot.docs[0].data();
        role = normalizeRole(userData.role);
        source = 'users-query';
        console.log(`Found user role by email query: ${role}`);
        return { role, source };
      }
    } catch (e) {
      console.warn('Email query failed:', e);
    }

    // Last resort: query by email field in classRepresentatives collection
    try {
      const crQuery = query(collection(db, 'classRepresentatives'), where('email', '==', normalizedEmail));
      const crSnapshot = await getDocs(crQuery);
      if (!crSnapshot.empty) {
        const crData = crSnapshot.docs[0].data();
        role = normalizeRole(crData.role);
        source = 'classRepresentatives-query';
        console.log(`Found user role by email query in classRepresentatives: ${role}`);
        return { role, source };
      }
    } catch (e) {
      console.warn('ClassRepresentatives email query failed:', e);
    }
  }

  console.log(`No role found for user. userId: ${userId}, email: ${userEmail}`);
  return { role, source };
};

export const ensureUserRole = async ({ userId, expectedRole, userEmail = null }) => {
  const { role, source } = await fetchUserRole(userId, userEmail);
  const allowed = roleMatchesExpected(role, expectedRole);
  
  console.log(`Role check - Expected: ${expectedRole}, Found: ${role}, Source: ${source}, Allowed: ${allowed}`);
  
  return { allowed, role, source };
};
