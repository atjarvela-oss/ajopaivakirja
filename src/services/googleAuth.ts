import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  getAuth, 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  signOut,
  type User 
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

// Reuse existing app if already initialized
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);

// All Google Drive scopes configured for this applet
export const DRIVE_SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/drive.appdata',
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/drive.metadata',
  'https://www.googleapis.com/auth/drive.readonly',
];

const provider = new GoogleAuthProvider();
DRIVE_SCOPES.forEach(scope => provider.addScope(scope));
provider.setCustomParameters({
  prompt: 'select_account'
});

// Flag to indicate ongoing sign-in
let isSigningIn = false;
// In-memory token cache (NEVER persisted to localStorage per security policy)
let cachedAccessToken: string | null = null;

export interface GoogleAuthState {
  user: User | null;
  accessToken: string | null;
  isAuthenticated: boolean;
}

/**
 * Initializes the auth state listener. Call this on app load.
 */
export const initAuth = (
  onAuthChange: (state: GoogleAuthState) => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      if (cachedAccessToken) {
        onAuthChange({
          user,
          accessToken: cachedAccessToken,
          isAuthenticated: true,
        });
      } else if (!isSigningIn) {
        // Token not in memory (e.g. page refresh). Prompt or allow user to click Sign In
        onAuthChange({
          user,
          accessToken: null,
          isAuthenticated: false,
        });
      }
    } else {
      cachedAccessToken = null;
      onAuthChange({
        user: null,
        accessToken: null,
        isAuthenticated: false,
      });
    }
  });
};

/**
 * Must be called from a user interaction (button click)
 */
export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    
    if (!credential?.accessToken) {
      throw new Error('Google-kirjautuminen ei palauttanut pääsyoikeusavainta (access token).');
    }

    cachedAccessToken = credential.accessToken;
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: any) {
    console.error('Sign in error:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const getAccessToken = async (): Promise<string | null> => {
  return cachedAccessToken;
};

export const setCachedAccessToken = (token: string | null) => {
  cachedAccessToken = token;
};

export const googleSignOut = async (): Promise<void> => {
  await signOut(auth);
  cachedAccessToken = null;
};
