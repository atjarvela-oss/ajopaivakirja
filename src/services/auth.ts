import { 
  signInWithPopup, 
  signOut as fbSignOut, 
  onAuthStateChanged, 
  type User as FirebaseUser 
} from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, collection, getDocs } from 'firebase/firestore';
import { 
  firebaseAuth, 
  firestoreDb, 
  googleProvider, 
  SUPERADMIN_EMAIL, 
  isFirebaseConfigured 
} from './firebase';
import type { AppUser, UserRole } from '../types';

const DEMO_USER_KEY = 'opetuslupa_demo_user';
const DEMO_USERS_LIST_KEY = 'opetuslupa_demo_users_list';

const DEFAULT_DEMO_USERS: AppUser[] = [
  {
    uid: 'admin-atjarvela',
    email: 'atjarvela@gmail.com',
    displayName: 'Pääkäyttäjä (atjarvela@gmail.com)',
    photoURL: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&auto=format&fit=crop&q=80',
    role: 'admin',
    createdAt: new Date().toISOString(),
  },
  {
    uid: 'student-demo-1',
    email: 'oppilas.esimerkki@gmail.com',
    displayName: 'Matti Meikäläinen (Oppilas)',
    photoURL: 'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?w=100&auto=format&fit=crop&q=80',
    role: 'student',
    createdAt: new Date().toISOString(),
  },
];

export function resolveUserRole(email: string | null | undefined, existingRole?: UserRole): UserRole {
  if (email && email.toLowerCase().trim() === SUPERADMIN_EMAIL) {
    return 'admin';
  }
  return existingRole || 'student';
}

export function getDemoUsers(): AppUser[] {
  try {
    const raw = localStorage.getItem(DEMO_USERS_LIST_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error(e);
  }
  localStorage.setItem(DEMO_USERS_LIST_KEY, JSON.stringify(DEFAULT_DEMO_USERS));
  return DEFAULT_DEMO_USERS;
}

export function saveDemoUsers(users: AppUser[]) {
  localStorage.setItem(DEMO_USERS_LIST_KEY, JSON.stringify(users));
}

export async function loginWithGoogle(): Promise<AppUser> {
  if (isFirebaseConfigured && firebaseAuth && firestoreDb) {
    const result = await signInWithPopup(firebaseAuth, googleProvider);
    const fbUser = result.user;
    return syncFirebaseUser(fbUser);
  } else {
    return loginAsDemoUser('atjarvela@gmail.com');
  }
}

export async function syncFirebaseUser(fbUser: FirebaseUser): Promise<AppUser> {
  if (!firestoreDb) {
    throw new Error('Firestore ei ole alustettu');
  }

  const userRef = doc(firestoreDb, 'users', fbUser.uid);
  const snap = await getDoc(userRef);

  const email = fbUser.email;
  let role: UserRole = resolveUserRole(email);

  if (snap.exists()) {
    const data = snap.data();
    if (email && email.toLowerCase().trim() === SUPERADMIN_EMAIL) {
      role = 'admin';
    } else if (data.role) {
      role = data.role as UserRole;
    }

    const updatedUser: AppUser = {
      uid: fbUser.uid,
      email: fbUser.email,
      displayName: fbUser.displayName || 'Käyttäjä',
      photoURL: fbUser.photoURL || null,
      role,
      lastLoginAt: new Date().toISOString(),
    };

    await updateDoc(userRef, {
      displayName: updatedUser.displayName,
      photoURL: updatedUser.photoURL,
      role: updatedUser.role,
      lastLoginAt: updatedUser.lastLoginAt,
    });

    return updatedUser;
  } else {
    const newUser: AppUser = {
      uid: fbUser.uid,
      email: fbUser.email,
      displayName: fbUser.displayName || 'Käyttäjä',
      photoURL: fbUser.photoURL || null,
      role,
      createdAt: new Date().toISOString(),
      lastLoginAt: new Date().toISOString(),
    };

    await setDoc(userRef, newUser);
    return newUser;
  }
}

export function loginAsDemoUser(email: string): AppUser {
  const users = getDemoUsers();
  let found = users.find(u => u.email?.toLowerCase() === email.toLowerCase());

  if (!found) {
    const role = resolveUserRole(email);
    found = {
      uid: 'demo-' + Date.now(),
      email,
      displayName: email === SUPERADMIN_EMAIL ? 'Pääkäyttäjä (' + email + ')' : email.split('@')[0],
      photoURL: null,
      role,
      createdAt: new Date().toISOString(),
    };
    users.push(found);
    saveDemoUsers(users);
  }

  localStorage.setItem(DEMO_USER_KEY, JSON.stringify(found));
  window.dispatchEvent(new Event('auth-state-change'));
  return found;
}

export async function logoutUser() {
  if (isFirebaseConfigured && firebaseAuth) {
    await fbSignOut(firebaseAuth);
  }
  localStorage.removeItem(DEMO_USER_KEY);
  window.dispatchEvent(new Event('auth-state-change'));
}

export function getCurrentStoredUser(): AppUser | null {
  try {
    const raw = localStorage.getItem(DEMO_USER_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error(e);
  }
  return null;
}

export async function fetchAllUsers(): Promise<AppUser[]> {
  if (isFirebaseConfigured && firestoreDb) {
    const snap = await getDocs(collection(firestoreDb, 'users'));
    return snap.docs.map(d => d.data() as AppUser);
  } else {
    return getDemoUsers();
  }
}

export function updateUserRole(userId: string, newRole: UserRole): Promise<void> {
  if (isFirebaseConfigured && firestoreDb) {
    return updateDoc(doc(firestoreDb, 'users', userId), {
      role: newRole,
      updatedAt: new Date().toISOString(),
    });
  } else {
    const users = getDemoUsers();
    const target = users.find(u => u.uid === userId);
    if (target) {
      target.role = newRole;
      saveDemoUsers(users);
      const current = getCurrentStoredUser();
      if (current && current.uid === userId) {
        current.role = newRole;
        localStorage.setItem(DEMO_USER_KEY, JSON.stringify(current));
      }
      window.dispatchEvent(new Event('auth-state-change'));
    }
    return Promise.resolve();
  }
}

export function subscribeToAuth(callback: (user: AppUser | null) => void): () => void {
  if (isFirebaseConfigured && firebaseAuth) {
    return onAuthStateChanged(firebaseAuth, async (fbUser) => {
      if (fbUser) {
        try {
          const appUser = await syncFirebaseUser(fbUser);
          callback(appUser);
        } catch (e) {
          console.error('Käyttäjätietojen nouto epäonnistui:', e);
          callback(null);
        }
      } else {
        callback(null);
      }
    });
  } else {
    const notify = () => {
      callback(getCurrentStoredUser());
    };
    window.addEventListener('auth-state-change', notify);
    notify();
    return () => window.removeEventListener('auth-state-change', notify);
  }
}
