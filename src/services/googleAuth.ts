import { initializeApp, getApps, getApp } from 'firebase/app';
import { 
  getAuth, 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  signOut,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

declare global {
  interface Window {
    google?: any;
  }
}

// Reuse existing app if already initialized
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);

// All Google Drive scopes configured for this applet
export const DRIVE_SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
];

const provider = new GoogleAuthProvider();
DRIVE_SCOPES.forEach(scope => provider.addScope(scope));
provider.setCustomParameters({
  prompt: 'select_account'
});

export interface GoogleUser {
  uid: string;
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
}

export interface GoogleAuthState {
  user: GoogleUser | null;
  accessToken: string | null;
  isAuthenticated: boolean;
}

// Flag to indicate ongoing sign-in
let isSigningIn = false;
// In-memory token cache (NEVER persisted to localStorage per security policy)
let cachedAccessToken: string | null = null;
let cachedUser: GoogleUser | null = null;

type AuthListener = (state: GoogleAuthState) => void;
const listeners = new Set<AuthListener>();

function notifyAuthListeners() {
  const state: GoogleAuthState = {
    user: cachedUser,
    accessToken: cachedAccessToken,
    isAuthenticated: !!(cachedUser && cachedAccessToken),
  };
  listeners.forEach(fn => {
    try {
      fn(state);
    } catch (e) {
      console.error('Error in auth listener:', e);
    }
  });
}

/**
 * Lataa dynaamisesti Google Identity Services (GSI) -skriptin, jos se ei ole vielä latautunut.
 */
function loadGsiScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (window.google?.accounts?.oauth2) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const existing = document.getElementById('gsi-client-script');
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', reject);
      return;
    }
    const script = document.createElement('script');
    script.id = 'gsi-client-script';
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Google Identity Services -kirjaston lataus epäonnistui.'));
    document.head.appendChild(script);
  });
}

/**
 * Kirjautuu sisään suoraan Google Identity Services (GSI) Token Clientin kautta.
 * Tämä ohittaa kokonaan Firebase Auth -popupin ja välttää mobiililaitteiden (kuten Chrome Android)
 * sessionStorage- ja kolmannen osapuolen evästerajoitukset ("missing initial state" / "storage-partitioned").
 */
async function signInWithGsi(): Promise<{ user: GoogleUser; accessToken: string }> {
  await loadGsiScript();

  if (!window.google?.accounts?.oauth2) {
    throw new Error('Google Identity Services ei ole saatavilla.');
  }

  const clientId = firebaseConfig.oAuthClientId;
  if (!clientId) {
    throw new Error('Google OAuth Client ID puuttuu sovelluksen asetuksista.');
  }

  return new Promise((resolve, reject) => {
    let resolved = false;

    try {
      const client = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: [
          ...DRIVE_SCOPES,
          'https://www.googleapis.com/auth/userinfo.profile',
          'https://www.googleapis.com/auth/userinfo.email',
        ].join(' '),
        prompt: '',
        callback: async (tokenResponse: any) => {
          if (resolved) return;
          resolved = true;

          if (tokenResponse.error) {
            console.error('GSI token error:', tokenResponse);
            if (tokenResponse.error === 'access_denied') {
              reject(new Error('Kirjautuminen peruttiin tai käyttöoikeutta ei myönnetty.'));
            } else {
              reject(new Error(`Google-kirjautumisvirhe: ${tokenResponse.error_description || tokenResponse.error}`));
            }
            return;
          }

          const accessToken = tokenResponse.access_token;
          if (!accessToken) {
            reject(new Error('Google ei palauttanut pääsyoikeusavainta (access token).'));
            return;
          }

          let user: GoogleUser;
          try {
            const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
              headers: { Authorization: `Bearer ${accessToken}` },
            });
            if (res.ok) {
              const info = await res.json();
              user = {
                uid: info.sub || 'google-user',
                displayName: info.name || info.given_name || 'Google-käyttäjä',
                email: info.email || null,
                photoURL: info.picture || null,
              };
            } else {
              user = {
                uid: 'google-user',
                displayName: 'Google-käyttäjä',
                email: null,
                photoURL: null,
              };
            }
          } catch {
            user = {
              uid: 'google-user',
              displayName: 'Google-käyttäjä',
              email: null,
              photoURL: null,
            };
          }

          cachedAccessToken = accessToken;
          cachedUser = user;
          notifyAuthListeners();
          resolve({ user, accessToken });
        },
        error_callback: (err: any) => {
          if (resolved) return;
          resolved = true;
          console.error('GSI client error:', err);
          reject(new Error(err?.message || 'Google-kirjautumisikkunan avaaminen epäonnistui.'));
        }
      });

      client.requestAccessToken();
    } catch (err) {
      if (!resolved) {
        resolved = true;
        reject(err);
      }
    }
  });
}

/**
 * Initializes the auth state listener. Call this on app load.
 */
export const initAuth = (
  onAuthChange: (state: GoogleAuthState) => void
) => {
  listeners.add(onAuthChange);

  // Välitä tämänhetkinen muistissa oleva tila heti
  onAuthChange({
    user: cachedUser,
    accessToken: cachedAccessToken,
    isAuthenticated: !!(cachedUser && cachedAccessToken),
  });

  // Kuunnellaan myös mahdollista Firebase Auth -tilaa rinnalla
  const unsubscribeFb = onAuthStateChanged(auth, async (fbUser) => {
    if (fbUser && !cachedUser) {
      cachedUser = {
        uid: fbUser.uid,
        displayName: fbUser.displayName,
        email: fbUser.email,
        photoURL: fbUser.photoURL,
      };
      notifyAuthListeners();
    } else if (!fbUser && !cachedAccessToken) {
      cachedUser = null;
      notifyAuthListeners();
    }
  });

  return () => {
    listeners.delete(onAuthChange);
    unsubscribeFb();
  };
};

/**
 * Must be called from a user interaction (button click)
 */
export const googleSignIn = async (): Promise<{ user: GoogleUser; accessToken: string } | null> => {
  if (isSigningIn) return null;
  try {
    isSigningIn = true;

    // Ensisijainen tapa: Google Identity Services (GSI)
    // Toimii saumattomasti mobiiliselaimilla (Android Chrome, iOS Safari) ilman
    // kolmannen osapuolen iframe/sessionStorage-ongelmia
    try {
      const gsiResult = await signInWithGsi();
      return gsiResult;
    } catch (gsiErr: any) {
      console.warn('GSI-kirjautuminen epäonnistui tai ei saatavilla, kokeillaan Firebase Authia:', gsiErr);
      // Jos käyttäjä perui itse dialogin, ei avata toista popupia perään
      if (gsiErr?.message?.includes('peruttiin') || gsiErr?.message?.includes('access_denied')) {
        throw gsiErr;
      }

      // Toissijainen tapa: Firebase Auth popup
      const result = await signInWithPopup(auth, provider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      
      if (!credential?.accessToken) {
        throw new Error('Google-kirjautuminen ei palauttanut pääsyoikeusavainta (access token).');
      }

      const user: GoogleUser = {
        uid: result.user.uid,
        displayName: result.user.displayName,
        email: result.user.email,
        photoURL: result.user.photoURL,
      };

      cachedAccessToken = credential.accessToken;
      cachedUser = user;
      notifyAuthListeners();
      return { user, accessToken: cachedAccessToken };
    }
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
  if (cachedAccessToken && window.google?.accounts?.oauth2?.revoke) {
    try {
      window.google.accounts.oauth2.revoke(cachedAccessToken, () => {});
    } catch (e) {
      console.warn('Tokenin mitätöinti epäonnistui:', e);
    }
  }
  try {
    await signOut(auth);
  } catch (e) {
    console.warn('Firebase signOut epäonnistui:', e);
  }
  cachedAccessToken = null;
  cachedUser = null;
  notifyAuthListeners();
};
