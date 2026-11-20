import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  sendEmailVerification,
  onAuthStateChanged,
  updateProfile,
} from 'firebase/auth';
import { ref, get, set, update, serverTimestamp } from 'firebase/database';
import { auth, db, isFirebaseConfigured } from '../firebase.js';

const ALLOWED_SIGNUP_ROLES = ['buyer', 'tenant', 'owner', 'agent'];

function assertAuthReady() {
  if (!isFirebaseConfigured() || !auth || !db) {
    throw new Error('Firebase is not configured yet. Update firebase.js with your Firebase project config.');
  }
}

/**
 * Register a new user with Email & Password.
 * Never permits setting 'admin' role from client-side registration.
 */
export async function registerUser({ name, email, password, phone = '', role = 'buyer' }) {
  assertAuthReady();

  const safeRole = ALLOWED_SIGNUP_ROLES.includes(role) ? role : 'buyer';
  const trimmedName = String(name || '').trim();
  const trimmedEmail = String(email || '').trim().toLowerCase();

  if (trimmedName.length < 2) {
    throw new Error('Please enter your full name (minimum 2 characters).');
  }
  if (!trimmedEmail || !trimmedEmail.includes('@')) {
    throw new Error('Please enter a valid email address.');
  }
  if (!password || password.length < 6) {
    throw new Error('Password must be at least 6 characters long.');
  }

  const cred = await createUserWithEmailAndPassword(auth, trimmedEmail, password);
  await updateProfile(cred.user, { displayName: trimmedName });
  await sendEmailVerification(cred.user);

  const userProfile = {
    uid: cred.user.uid,
    name: trimmedName,
    email: trimmedEmail,
    phone: String(phone || '').trim(),
    role: safeRole,
    photoURL: '',
    verified: false,
    verificationStatus: 'unverified',
    status: 'active',
    city: 'Bhopal',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  await set(ref(db, `users/${cred.user.uid}`), userProfile);
  return { user: cred.user, profile: userProfile };
}

export async function loginUser(email, password) {
  assertAuthReady();
  const cred = await signInWithEmailAndPassword(auth, String(email || '').trim(), password);
  return cred.user;
}

export async function logoutUser() {
  if (!auth) return;
  await signOut(auth);
}

export async function resetPassword(email) {
  assertAuthReady();
  const cleanEmail = String(email || '').trim();
  if (!cleanEmail) throw new Error('Enter your registered email address.');
  await sendPasswordResetEmail(auth, cleanEmail);
}

export async function resendVerification() {
  assertAuthReady();
  if (!auth.currentUser) throw new Error('Please sign in first.');
  await sendEmailVerification(auth.currentUser);
}

/**
 * Fetch user profile & trusted Firebase custom claims.
 * Admin privilege is checked strictly via Firebase Auth ID token custom claim `admin === true`.
 */
export async function getUserSessionContext(user) {
  if (!user || !db) return { user: null, profile: null, isAdmin: false };

  let isAdmin = false;
  try {
    const tokenResult = await user.getIdTokenResult(true);
    isAdmin = tokenResult?.claims?.admin === true;
  } catch {
    isAdmin = false;
  }

  const snap = await get(ref(db, `users/${user.uid}`));
  let profile = snap.exists() ? snap.val() : null;

  if (!profile) {
    profile = {
      uid: user.uid,
      name: user.displayName || user.email?.split('@')[0] || 'User',
      email: user.email || '',
      phone: '',
      role: 'buyer',
      photoURL: user.photoURL || '',
      verified: false,
      status: 'active',
      createdAt: serverTimestamp(),
    };
    await set(ref(db, `users/${user.uid}`), profile);
  }

  return { user, profile, isAdmin };
}

export async function updateUserProfileData(uid, updates) {
  assertAuthReady();
  const safeUpdates = {
    name: String(updates.name || '').trim(),
    phone: String(updates.phone || '').trim(),
    city: String(updates.city || 'Bhopal').trim(),
    bio: String(updates.bio || '').trim().slice(0, 400),
    updatedAt: serverTimestamp(),
  };

  if (updates.photoURL !== undefined) {
    safeUpdates.photoURL = String(updates.photoURL);
  }

  await update(ref(db, `users/${uid}`), safeUpdates);
  if (auth.currentUser && safeUpdates.name) {
    await updateProfile(auth.currentUser, {
      displayName: safeUpdates.name,
      ...(safeUpdates.photoURL ? { photoURL: safeUpdates.photoURL } : {}),
    });
  }
}

export function observeAuth(callback) {
  if (!isFirebaseConfigured() || !auth) {
    callback({ user: null, profile: null, isAdmin: false, configured: false });
    return () => {};
  }

  return onAuthStateChanged(auth, async (user) => {
    if (!user) {
      callback({ user: null, profile: null, isAdmin: false, configured: true });
      return;
    }
    try {
      const ctx = await getUserSessionContext(user);
      callback({ ...ctx, configured: true });
    } catch (err) {
      console.error('Failed to load auth context:', err);
      callback({ user, profile: null, isAdmin: false, configured: true, error: err });
    }
  });
}
