import React, { useState } from 'react';
import { 
  ShieldCheck, 
  LogOut, 
  Settings, 
  Car, 
  Users, 
  ChevronDown
} from 'lucide-react';
import type { AppUser } from '../types';
import { loginWithGoogle, logoutUser, loginAsDemoUser } from '../services/auth';
import { SUPERADMIN_EMAIL } from '../services/firebase';

interface NavbarProps {
  currentUser: AppUser | null;
  onOpenSettings: () => void;
  onOpenAdminPanel: () => void;
  selectedStudentName?: string;
  onClearStudentFilter?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentUser,
  onOpenSettings,
  onOpenAdminPanel,
  selectedStudentName,
  onClearStudentFilter,
}) => {
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const handleGoogleLogin = async () => {
    try {
      setIsLoggingIn(true);
      await loginWithGoogle();
    } catch (err) {
      console.error('Kirjautuminen epäonnistui:', err);
      alert('Kirjautuminen epäonnistui. Tarkista Firebase-konfiguraatio asetuksista tai kokeile demotilaa.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    setShowUserMenu(false);
    await logoutUser();
  };

  const isAdmin = currentUser?.role === 'admin';

  return (
    <header className="sticky top-0 z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur border-b border-slate-200 dark:border-slate-800 transition-colors shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          
          {/* Logo ja Sovelluksen Nimi */}
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center text-white shadow-md shadow-blue-500/20">
              <Car className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-bold text-lg text-slate-900 dark:text-white tracking-tight">
                  Ajopäiväkirja
                </span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300 font-medium">
                  Opetuslupa
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 hidden sm:block">
                Ajokertojen tallennus & ajoympäristön arviointi
              </p>
            </div>
          </div>

          {/* Opettajan oppilassuodatin-ilmoitus */}
          {isAdmin && selectedStudentName && (
            <div className="hidden md:flex items-center space-x-2 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 px-3 py-1 rounded-lg text-xs text-amber-800 dark:text-amber-300">
              <Users className="w-3.5 h-3.5" />
              <span>Tarkastellaan oppilasta: <strong>{selectedStudentName}</strong></span>
              {onClearStudentFilter && (
                <button
                  onClick={onClearStudentFilter}
                  className="ml-1 underline hover:text-amber-900 dark:hover:text-amber-100 font-medium"
                >
                  Näytä kaikki
                </button>
              )}
            </div>
          )}

          {/* Oikea laita: Tila, Hallinta & Käyttäjäprofiili */}
          <div className="flex items-center space-x-2 sm:space-x-3">
            
            {/* Admin-paneeli painike pääkäyttäjälle */}
            {isAdmin && (
              <button
                onClick={onOpenAdminPanel}
                className="flex items-center space-x-1.5 px-3 py-1.5 text-xs sm:text-sm font-medium rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-950/50 dark:text-indigo-300 dark:hover:bg-indigo-900/50 border border-indigo-200 dark:border-indigo-800 transition"
                title="Käyttäjähallinta ja oppilaat"
              >
                <ShieldCheck className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <span className="hidden sm:inline">Pääkäyttäjä</span>
              </button>
            )}

            {/* Asetukset (Firebase & konfiguraatio) */}
            <button
              onClick={onOpenSettings}
              className="p-2 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-800 transition"
              title="Firebase- ja järjestelmäasetukset"
            >
              <Settings className="w-5 h-5" />
            </button>

            {/* Käyttäjä & Kirjautuminen */}
            {currentUser ? (
              <div className="relative">
                <button
                  onClick={() => setShowUserMenu(!showUserMenu)}
                  className="flex items-center space-x-2 p-1.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 bg-white dark:bg-slate-800 transition text-left"
                >
                  {currentUser.photoURL ? (
                    <img 
                      src={currentUser.photoURL} 
                      alt={currentUser.displayName || ''} 
                      className="w-7 h-7 rounded-lg object-cover ring-1 ring-slate-200 dark:ring-slate-700" 
                    />
                  ) : (
                    <div className="w-7 h-7 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold text-xs">
                      {(currentUser.displayName || currentUser.email || 'U')[0].toUpperCase()}
                    </div>
                  )}

                  <div className="hidden sm:block text-xs">
                    <div className="font-semibold text-slate-800 dark:text-slate-200 max-w-[120px] truncate">
                      {currentUser.displayName || currentUser.email}
                    </div>
                    <div className="text-[10px] text-slate-500 dark:text-slate-400 flex items-center gap-1">
                      {currentUser.role === 'admin' ? (
                        <span className="text-amber-600 dark:text-amber-400 font-medium">Pääkäyttäjä</span>
                      ) : (
                        <span>Oppilas</span>
                      )}
                    </div>
                  </div>

                  <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                </button>

                {/* Käyttäjävalikko dropdown */}
                {showUserMenu && (
                  <div className="absolute right-0 mt-2 w-64 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 py-2 z-50 text-sm animate-in fade-in slide-in-from-top-2 duration-150">
                    <div className="px-4 py-2 border-b border-slate-100 dark:border-slate-700/60">
                      <p className="font-medium text-slate-900 dark:text-white truncate">
                        {currentUser.displayName || 'Käyttäjä'}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                        {currentUser.email}
                      </p>
                      <div className="mt-1.5 flex items-center gap-1.5">
                        <span className={`text-[10px] px-2 py-0.5 rounded-md font-medium uppercase tracking-wider ${
                          currentUser.role === 'admin' 
                            ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-300' 
                            : 'bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-300'
                        }`}>
                          {currentUser.role === 'admin' ? 'Pääkäyttäjä / Opettaja' : 'Oppilas'}
                        </span>
                        {currentUser.email?.toLowerCase() === SUPERADMIN_EMAIL && (
                          <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold">
                            (Superadmin)
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Vaihto testausta varten */}
                    <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-700/60">
                      <div className="text-[11px] font-medium text-slate-400 uppercase tracking-wider mb-1 px-1">
                        Pikavaihto (Kehitystila)
                      </div>
                      <button
                        onClick={() => {
                          loginAsDemoUser(SUPERADMIN_EMAIL);
                          setShowUserMenu(false);
                        }}
                        className="w-full text-left px-2 py-1 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-md flex items-center justify-between"
                      >
                        <span>Pääkäyttäjä (atjarvela@...)</span>
                        {currentUser.role === 'admin' && <span className="text-emerald-500">✓</span>}
                      </button>
                      <button
                        onClick={() => {
                          loginAsDemoUser('oppilas.esimerkki@gmail.com');
                          setShowUserMenu(false);
                        }}
                        className="w-full text-left px-2 py-1 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-md flex items-center justify-between"
                      >
                        <span>Oppilas (Matti)</span>
                        {currentUser.role === 'student' && <span className="text-emerald-500">✓</span>}
                      </button>
                    </div>

                    <button
                      onClick={handleLogout}
                      className="w-full text-left px-4 py-2 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 flex items-center space-x-2 transition"
                    >
                      <LogOut className="w-4 h-4" />
                      <span>Kirjaudu ulos</span>
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center space-x-2">
                <button
                  onClick={handleGoogleLogin}
                  disabled={isLoggingIn}
                  className="flex items-center space-x-2 px-3 sm:px-4 py-2 text-xs sm:text-sm font-semibold rounded-xl bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-750 shadow-xs transition active:scale-98"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                    />
                  </svg>
                  <span>{isLoggingIn ? 'Kirjaudutaan...' : 'Kirjaudu Googlella'}</span>
                </button>
              </div>
            )}

          </div>
        </div>
      </div>
    </header>
  );
};
