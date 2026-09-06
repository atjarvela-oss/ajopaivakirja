import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';
import type { FirebaseConfigState } from '../types';

const STORAGE_KEY = 'opetuslupa_firebase_config';
export const SUPERADMIN_EMAIL = (import.meta.env.VITE_ADMIN_EMAIL || 'atjarvela@gmail.com').toLowerCase();

/**
 * Hakee aktiivisen Firebase-konfiguraation joko ympäristömuuttujista tai LocalStoragesta
 */
export function getStoredFirebaseConfig(): FirebaseConfigState | null {
  const envConfig: FirebaseConfigState = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY || '',
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '',
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || '',
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '',
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
    appId: import.meta.env.VITE_FIREBASE_APP_ID || '',
  };

  if (envConfig.apiKey && envConfig.projectId) {
    return envConfig;
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.apiKey && parsed.projectId) {
        return parsed;
      }
    }
  } catch (e) {
    console.warn('Virhe luettaessa tallennettua Firebase-konfiguraatiota:', e);
  }

  return null;
}

export function saveFirebaseConfig(config: FirebaseConfigState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  window.location.reload();
}

export function clearFirebaseConfig() {
  localStorage.removeItem(STORAGE_KEY);
  window.location.reload();
}

let firebaseApp: FirebaseApp | null = null;
let firebaseAuth: Auth | null = null;
let firestoreDb: Firestore | null = null;

const activeConfig = getStoredFirebaseConfig();

if (activeConfig && activeConfig.apiKey) {
  try {
    firebaseApp = getApps().length > 0 ? getApp() : initializeApp(activeConfig);
    firebaseAuth = getAuth(firebaseApp);
    firestoreDb = getFirestore(firebaseApp);
  } catch (error) {
    console.error('Firebase-alustuksessa tapahtui virhe:', error);
  }
}

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export { firebaseApp, firebaseAuth, firestoreDb };
export const isFirebaseConfigured = !!firebaseApp;
