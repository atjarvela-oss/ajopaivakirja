import React, { useState, useEffect, useCallback } from 'react';
import { 
  CloudUpload, 
  CloudDownload, 
  Trash2, 
  RefreshCw, 
  CheckCircle2, 
  AlertCircle, 
  LogOut, 
  FileText,
  HardDrive,
  Clock,
  Loader2,
  ExternalLink,
  Copy,
  Check,
  X
} from 'lucide-react';
import type { DriveSession, TeachingInfo } from '../types';
import { 
  initAuth, 
  googleSignIn, 
  googleSignOut, 
  getAccessToken,
  type GoogleAuthState 
} from '../services/googleAuth';
import { 
  listGoogleDriveBackups, 
  uploadBackupToGoogleDrive, 
  downloadBackupFromGoogleDrive, 
  deleteBackupFromGoogleDrive, 
  type GoogleDriveBackupItem 
} from '../services/googleDriveService';
import { importDrives, saveTeachingInfo } from '../services/localDb';

interface GoogleDriveManagerProps {
  drives: DriveSession[];
  teachingInfo: TeachingInfo;
  onDataRestored: (count: number) => void;
  onShowToast: (message: string, type?: 'success' | 'error') => void;
}

export const GoogleDriveManager: React.FC<GoogleDriveManagerProps> = ({
  drives,
  teachingInfo,
  onDataRestored,
  onShowToast,
}) => {
  const [authState, setAuthState] = useState<GoogleAuthState>({
    user: null,
    accessToken: null,
    isAuthenticated: false,
  });
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isLoadingBackups, setIsLoadingBackups] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isRestoringId, setIsRestoringId] = useState<string | null>(null);
  const [backups, setBackups] = useState<GoogleDriveBackupItem[]>([]);

  // Vahvistusmodaalin tila (MANDATORY per Google Workspace policy)
  const [confirmDeleteFile, setConfirmDeleteFile] = useState<GoogleDriveBackupItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [unauthorizedDomain, setUnauthorizedDomain] = useState<string | null>(null);
  const [copiedDomain, setCopiedDomain] = useState(false);

  const loadBackups = useCallback(async (token?: string) => {
    const accessToken = token || authState.accessToken || await getAccessToken();
    if (!accessToken) return;

    setIsLoadingBackups(true);
    try {
      const items = await listGoogleDriveBackups(accessToken);
      setBackups(items);
    } catch (err: any) {
      console.error('Virhe haettaessa Drive-varmuuskopioita:', err);
      // Jos token on vanhentunut, pyydetään uudelleenkirjautumista
      if (err.message && (err.message.includes('401') || err.message.includes('auth'))) {
        onShowToast('Google-istunto on vanhentunut. Kirjaudu uudelleen.', 'error');
      }
    } finally {
      setIsLoadingBackups(false);
    }
  }, [authState.accessToken, onShowToast]);

  // Kuunnellaan kirjautumistilan muutoksia
  useEffect(() => {
    const unsubscribe = initAuth((state) => {
      setAuthState(state);
      if (state.isAuthenticated && state.accessToken) {
        loadBackups(state.accessToken);
      } else {
        setBackups([]);
      }
    });

    return () => unsubscribe();
  }, [loadBackups]);

  const handleSignIn = async () => {
    setIsLoggingIn(true);
    try {
      const res = await googleSignIn();
      if (res) {
        setAuthState({
          user: res.user,
          accessToken: res.accessToken,
          isAuthenticated: true,
        });
        onShowToast(`Kirjauduttu: ${res.user.displayName || res.user.email}`);
        await loadBackups(res.accessToken);
      }
    } catch (err: any) {
      console.error('Google sign-in epäonnistui:', err);
      if (err?.code === 'auth/unauthorized-domain') {
        const host = window.location.hostname;
        setUnauthorizedDomain(host);
        onShowToast(`Osoitetta "${host}" ei ole vielä valtuutettu Firebase Consoleissa. Katso ohjeet alta.`, 'error');
      } else if (err?.code !== 'auth/popup-closed-by-user' && err?.code !== 'auth/cancelled-popup-request') {
        onShowToast('Google-kirjautuminen epäonnistui: ' + (err.message || err), 'error');
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await googleSignOut();
      setAuthState({ user: null, accessToken: null, isAuthenticated: false });
      setBackups([]);
      onShowToast('Kirjauduttu ulos Google-tililtä.');
    } catch (err: any) {
      console.error('Uloskirjautuminen epäonnistui:', err);
    }
  };

  const handleBackupNow = async () => {
    const accessToken = authState.accessToken || await getAccessToken();
    if (!accessToken) {
      handleSignIn();
      return;
    }

    setIsUploading(true);
    try {
      const created = await uploadBackupToGoogleDrive(accessToken, drives, teachingInfo);
      onShowToast(`Varmuuskopio tallennettu Google Driveen! (${created.name})`);
      await loadBackups(accessToken);
    } catch (err: any) {
      console.error('Varmuuskopiointi epäonnistui:', err);
      onShowToast('Google Drive -tallennus epäonnistui: ' + (err.message || err), 'error');
    } finally {
      setIsUploading(false);
    }
  };

  const handleRestoreBackup = async (file: GoogleDriveBackupItem) => {
    const accessToken = authState.accessToken || await getAccessToken();
    if (!accessToken) return;

    const confirmRestore = window.confirm(
      `Haluatko palauttaa tiedot Google Drive -varmuuskopiosta "${file.name}"?\n\nTämä lisää tallennetut ajokerrat laitteesi muistiin.`
    );
    if (!confirmRestore) return;

    setIsRestoringId(file.id);
    try {
      const payload = await downloadBackupFromGoogleDrive(accessToken, file.id);
      
      let driveList: DriveSession[] = [];
      if (Array.isArray(payload)) {
        driveList = payload;
      } else if (payload?.drives && Array.isArray(payload.drives)) {
        driveList = payload.drives;
        if (payload.teachingInfo) {
          saveTeachingInfo(payload.teachingInfo);
        }
      }

      if (driveList.length > 0) {
        importDrives(driveList);
        onDataRestored(driveList.length);
        onShowToast(`Palautettiin onnistuneesti ${driveList.length} ajokertaa Google Drivesta!`);
      } else {
        onShowToast('Valittu varmuuskopio oli tyhjä tai vioittunut.', 'error');
      }
    } catch (err: any) {
      console.error('Palautus epäonnistui:', err);
      onShowToast('Varmuuskopion palautus epäonnistui: ' + (err.message || err), 'error');
    } finally {
      setIsRestoringId(null);
    }
  };

  // Vahvistettu poisto (täyttää Google Workspacen tietosuoja- ja tuhoavien operaatioiden vaatimuksen)
  const confirmExecuteDelete = async () => {
    if (!confirmDeleteFile) return;

    const accessToken = authState.accessToken || await getAccessToken();
    if (!accessToken) return;

    setIsDeleting(true);
    try {
      await deleteBackupFromGoogleDrive(accessToken, confirmDeleteFile.id);
      onShowToast(`Varmuuskopio "${confirmDeleteFile.name}" poistettiin Google Drivesta.`);
      setConfirmDeleteFile(null);
      await loadBackups(accessToken);
    } catch (err: any) {
      console.error('Poisto epäonnistui:', err);
      onShowToast('Tiedoston poisto Google Drivesta epäonnistui: ' + (err.message || err), 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Unauthorized domain -opastusbanneri */}
      {unauthorizedDomain && (
        <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700/60 space-y-3 animate-in fade-in duration-200">
          <div className="flex items-start justify-between">
            <div className="flex items-start space-x-2.5">
              <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-xs font-bold text-amber-900 dark:text-amber-200">
                  Valtuuta tämä osoite Firebase Consoleissa
                </h4>
                <p className="text-[11px] text-amber-800 dark:text-amber-300/90 mt-0.5 leading-relaxed">
                  Googlen kirjautumisturvallisuus edellyttää, että sovelluksen verkko-osoite lisätään Firebasen sallittujen osoitteiden listalle.
                </p>
              </div>
            </div>
            <button
              onClick={() => setUnauthorizedDomain(null)}
              className="text-amber-600 hover:text-amber-800 dark:text-amber-400 p-1 cursor-pointer"
              title="Sulje"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center space-x-2 p-2 rounded-xl bg-white dark:bg-slate-900 border border-amber-200 dark:border-amber-800/60 text-xs">
            <span className="font-mono text-[11px] text-slate-800 dark:text-slate-200 truncate select-all flex-1">
              {unauthorizedDomain}
            </span>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(unauthorizedDomain);
                setCopiedDomain(true);
                setTimeout(() => setCopiedDomain(false), 2000);
              }}
              className="flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-amber-100 dark:bg-amber-900/60 hover:bg-amber-200 text-amber-800 dark:text-amber-200 text-[11px] font-semibold transition shrink-0 cursor-pointer"
            >
              {copiedDomain ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedDomain ? 'Kopioitu!' : 'Kopioi osoite'}</span>
            </button>
          </div>

          <div className="text-[11px] text-amber-900/90 dark:text-amber-300/80 space-y-1 pl-1">
            <p>1. Avaa <strong>Firebase Console</strong> alla olevasta linkistä.</p>
            <p>2. Valitse <strong>Authorized domains</strong> ➔ <strong>Add domain</strong>.</p>
            <p>3. Liitä kopioitu osoite, paina <strong>Done</strong> ja kokeile kirjautua uudelleen!</p>
          </div>

          <div>
            <a
              href="https://console.firebase.google.com/project/gen-lang-client-0312449356/authentication/settings"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-500 active:scale-98 text-white font-bold text-xs shadow-xs transition"
            >
              <span>Avaa Firebase Console Authorized domains</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>
      )}

      {/* Kirjautumistila */}
      <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-850/80 border border-slate-200 dark:border-slate-800 transition-all">
        {authState.isAuthenticated && authState.user ? (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center space-x-3">
              {authState.user.photoURL ? (
                <img 
                  src={authState.user.photoURL} 
                  alt={authState.user.displayName || 'Käyttäjä'} 
                  className="w-10 h-10 rounded-full border border-slate-200 dark:border-slate-700 object-cover shrink-0"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/60 text-blue-600 dark:text-blue-300 font-bold flex items-center justify-center shrink-0">
                  {(authState.user.displayName || authState.user.email || 'U')[0].toUpperCase()}
                </div>
              )}
              <div className="min-w-0">
                <div className="flex items-center space-x-2">
                  <span className="text-sm font-bold text-slate-900 dark:text-white truncate">
                    {authState.user.displayName || 'Google-käyttäjä'}
                  </span>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400">
                    <CheckCircle2 className="w-3 h-3 mr-1" />
                    Yhdistetty
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                  {authState.user.email}
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-2 shrink-0">
              <button
                id="btn-refresh-drive-backups"
                onClick={() => loadBackups()}
                disabled={isLoadingBackups}
                className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-white dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition cursor-pointer disabled:opacity-50"
                title="Päivitä varmuuskopiolista"
              >
                <RefreshCw className={`w-4 h-4 ${isLoadingBackups ? 'animate-spin' : ''}`} />
              </button>
              <button
                id="btn-google-signout"
                onClick={handleSignOut}
                className="flex items-center space-x-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-rose-50 dark:hover:bg-rose-950/40 hover:text-rose-600 dark:hover:text-rose-400 border border-slate-200 dark:border-slate-700 hover:border-rose-200 dark:hover:border-rose-800/60 transition cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Kirjaudu ulos</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold text-slate-900 dark:text-white flex items-center space-x-1.5">
                <HardDrive className="w-4 h-4 text-blue-500" />
                <span>Ota käyttöön suora Google Drive -varmuuskopiointi</span>
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
                Kirjautumalla Google-tililläsi sovellus voi tallentaa ajotiedot ja raportit suoraan omaan Driveesi.
              </p>
            </div>

            {/* Virallinen Google Sign-In -painike */}
            <button
              id="btn-google-signin"
              onClick={handleSignIn}
              disabled={isLoggingIn}
              className="inline-flex items-center justify-center space-x-3 px-4 py-2.5 rounded-xl bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold text-xs border border-slate-300 dark:border-slate-600 shadow-xs active:scale-98 transition cursor-pointer disabled:opacity-60 shrink-0"
            >
              {isLoggingIn ? (
                <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
              ) : (
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 48 48">
                  <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                  <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                  <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                  <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
                </svg>
              )}
              <span>{isLoggingIn ? 'Kirjaudutaan...' : 'Kirjaudu Google-tilillä'}</span>
            </button>
          </div>
        )}
      </div>

      {/* Varmuuskopioi heti Google Driveen -toiminto */}
      {authState.isAuthenticated && (
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-4 rounded-2xl bg-blue-50/60 dark:bg-blue-950/30 border border-blue-200/80 dark:border-blue-900/40">
          <div>
            <p className="text-xs font-bold text-slate-900 dark:text-white">
              Tallenna uusi varmuuskopio Driveen
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Luo aikaleimattu varmuuskopiotiedosto Google Driveesi ({drives.length} ajokertaa).
            </p>
          </div>
          <button
            id="btn-upload-to-google-drive"
            onClick={handleBackupNow}
            disabled={isUploading}
            className="flex items-center justify-center space-x-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 active:scale-98 text-white font-bold text-xs shadow-md shadow-blue-600/20 transition cursor-pointer disabled:opacity-60 shrink-0"
          >
            {isUploading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <CloudUpload className="w-4 h-4" />
            )}
            <span>{isUploading ? 'Tallennetaan...' : 'Tallenna Driveen nyt'}</span>
          </button>
        </div>
      )}

      {/* Google Drivessa olevat varmuuskopiot */}
      {authState.isAuthenticated && (
        <div className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center space-x-1.5">
              <CloudDownload className="w-3.5 h-3.5 text-blue-500" />
              <span>Google Drivessa olevat varmuuskopiot ({backups.length})</span>
            </h4>
            {isLoadingBackups && (
              <span className="text-[11px] text-blue-500 flex items-center space-x-1">
                <Loader2 className="w-3 h-3 animate-spin" />
                <span>Haetaan...</span>
              </span>
            )}
          </div>

          {backups.length === 0 ? (
            <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {isLoadingBackups ? 'Ladataan varmuuskopioita Google Drivesta...' : 'Ei vielä tallennettuja varmuuskopioita Google Drivessa.'}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
              {backups.map((file) => (
                <div 
                  key={file.id} 
                  className="p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-slate-50 dark:hover:bg-slate-850/50 transition"
                >
                  <div className="min-w-0 flex items-start space-x-3">
                    <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5">
                      <FileText className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                        {file.name}
                      </p>
                      <div className="flex items-center space-x-3 text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        <span className="flex items-center space-x-1">
                          <Clock className="w-3 h-3" />
                          <span>{new Date(file.modifiedTime).toLocaleString('fi-FI')}</span>
                        </span>
                        {file.size && (
                          <span>({(Number(file.size) / 1024).toFixed(1)} KB)</span>
                        )}
                      </div>
                      {file.description && (
                        <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5 truncate">
                          {file.description}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center space-x-2 shrink-0 self-end sm:self-center">
                    <button
                      onClick={() => handleRestoreBackup(file)}
                      disabled={isRestoringId === file.id}
                      className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/60 text-xs font-semibold transition cursor-pointer disabled:opacity-50"
                      title="Palauta ajotiedot tästä varmuuskopiosta"
                    >
                      {isRestoringId === file.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <CloudDownload className="w-3.5 h-3.5" />
                      )}
                      <span>Palauta</span>
                    </button>

                    <button
                      onClick={() => setConfirmDeleteFile(file)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition cursor-pointer"
                      title="Poista Google Drivesta"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* MANDATORY Confirmation Dialog for Destructive Operations (Google Workspace Policy) */}
      {confirmDeleteFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full p-5 sm:p-6 shadow-2xl border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex items-center space-x-3 text-rose-600 dark:text-rose-400">
              <div className="p-2.5 rounded-xl bg-rose-100 dark:bg-rose-950/60">
                <AlertCircle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Poista tiedosto Google Drivesta?
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Vahvista poisto ennen jatkamista
                </p>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-800 text-xs space-y-1">
              <p className="font-bold text-slate-800 dark:text-slate-200 truncate">
                {confirmDeleteFile.name}
              </p>
              <p className="text-slate-500 dark:text-slate-400">
                Tallennettu: {new Date(confirmDeleteFile.modifiedTime).toLocaleString('fi-FI')}
              </p>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Haluatko varmasti poistaa tämän varmuuskopiotiedoston Google Drivestasi? <strong>Tätä toimintoa ei voi perua.</strong>
            </p>

            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteFile(null)}
                disabled={isDeleting}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
              >
                Peruuta
              </button>
              <button
                type="button"
                onClick={confirmExecuteDelete}
                disabled={isDeleting}
                className="flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow-md shadow-rose-600/20 transition cursor-pointer disabled:opacity-60"
              >
                {isDeleting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5" />
                )}
                <span>{isDeleting ? 'Poistetaan...' : 'Kyllä, poista tiedosto'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
