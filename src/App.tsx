import { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar';
import { StatsOverview } from './components/StatsOverview';
import { DriveTracker } from './components/DriveTracker';
import { DriveTable } from './components/DriveTable';
import { DriveMapModal } from './components/DriveMapModal';
import { AdminPanelModal } from './components/AdminPanelModal';
import { ManualDriveModal } from './components/ManualDriveModal';
import { FirebaseSettingsModal } from './components/FirebaseSettingsModal';
import type { AppUser, DriveSession, OverallStats } from './types';
import { subscribeToAuth, loginAsDemoUser } from './services/auth';
import { getDriveSessions, calculateOverallStats } from './services/db';
import { isFirebaseConfigured, SUPERADMIN_EMAIL } from './services/firebase';
import { Sparkles, Car } from 'lucide-react';

export function App() {
  const [currentUser, setCurrentUser] = useState<AppUser | null>(null);
  const [drives, setDrives] = useState<DriveSession[]>([]);
  const [stats, setStats] = useState<OverallStats>({
    totalDrives: 0,
    totalDurationSeconds: 0,
    totalDistanceKm: 0,
    approvedDrives: 0,
    byEnvironment: {
      maantie: { count: 0, durationSeconds: 0, distanceKm: 0 },
      taajama: { count: 0, durationSeconds: 0, distanceKm: 0 },
      kaupunki: { count: 0, durationSeconds: 0, distanceKm: 0 },
      pysakointi: { count: 0, durationSeconds: 0, distanceKm: 0 },
    },
  });

  // Valitun oppilaan suodatus (Opettajanäkymä)
  const [selectedStudent, setSelectedStudent] = useState<AppUser | null>(null);

  // Modalien tilat
  const [selectedDriveForMap, setSelectedDriveForMap] = useState<DriveSession | null>(null);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showManualModal, setShowManualModal] = useState(false);

  // Kuuntele kirjautumisen tilaa
  useEffect(() => {
    const unsubscribe = subscribeToAuth((user) => {
      // Jos ei kirjautunutta käyttäjää eikä Firebasea, alustetaan oletuksena opettaja atjarvela@gmail.com
      if (!user && !isFirebaseConfigured) {
        const defaultUser = loginAsDemoUser(SUPERADMIN_EMAIL);
        setCurrentUser(defaultUser);
      } else {
        setCurrentUser(user);
      }
    });

    return () => unsubscribe();
  }, []);

  // Lataa ajokerrat kun käyttäjä tai oppilassuodatin muuttuu
  const refreshDrives = async () => {
    if (!currentUser) return;
    const studentFilterId = selectedStudent ? selectedStudent.uid : undefined;
    const data = await getDriveSessions(currentUser, studentFilterId);
    setDrives(data);
    setStats(calculateOverallStats(data));
  };

  useEffect(() => {
    refreshDrives();
  }, [currentUser, selectedStudent]);

  const handleDriveSaved = () => {
    refreshDrives();
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col font-sans antialiased transition-colors">
      
      {/* Yläpalkki */}
      <Navbar
        currentUser={currentUser}
        onOpenSettings={() => setShowSettingsModal(true)}
        onOpenAdminPanel={() => setShowAdminPanel(true)}
        selectedStudentName={selectedStudent?.displayName || selectedStudent?.email || undefined}
        onClearStudentFilter={() => setSelectedStudent(null)}
      />

      {/* Pääsisältö */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6 sm:space-y-8">
        
        {/* Tervetuloa- ja infobanneri */}
        {!isFirebaseConfigured && (
          <div className="no-print p-4 rounded-2xl bg-gradient-to-r from-blue-500/10 via-indigo-500/10 to-purple-500/10 border border-blue-200/80 dark:border-blue-900/50 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center space-x-3">
              <div className="p-2.5 rounded-xl bg-blue-600 text-white shrink-0 shadow-xs">
                <Sparkles className="w-5 h-5" />
              </div>
              <div className="text-xs sm:text-sm">
                <p className="font-semibold text-slate-900 dark:text-white">
                  Opetuslupaportaali on valmiina käyttöön!
                </p>
                <p className="text-slate-600 dark:text-slate-300 text-xs">
                  Pääkäyttäjänä: <strong className="text-indigo-600 dark:text-indigo-400">{SUPERADMIN_EMAIL}</strong>. Voit testata GPS-ajoa simulaattorilla, seurata ajoympäristön tunnistusta ja kuitata ajokertoja hyväksytyksi.
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-2 text-xs">
              <button
                onClick={() => setShowSettingsModal(true)}
                className="px-3 py-1.5 rounded-xl font-semibold bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-700 hover:bg-slate-50 transition shadow-2xs"
              >
                Kytke Firebase
              </button>
            </div>
          </div>
        )}

        {/* Yhteenvetokortit ja ajoympäristöjakauma */}
        <section>
          <StatsOverview stats={stats} />
        </section>

        {/* Ajotila ja Reaaliaikainen GPS-seuranta */}
        <section className="no-print">
          <DriveTracker
            currentUser={currentUser}
            onDriveSaved={handleDriveSaved}
            onOpenManualEntry={() => setShowManualModal(true)}
          />
        </section>

        {/* Taulukkotyylinen listaus ajokerroista */}
        <section>
          <DriveTable
            drives={drives}
            currentUser={currentUser}
            onSelectDrive={(drive) => setSelectedDriveForMap(drive)}
            onRefresh={refreshDrives}
          />
        </section>

      </main>

      {/* Alatunniste */}
      <footer className="no-print border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 py-6 text-center text-xs text-slate-500 dark:text-slate-400">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center space-x-2">
            <Car className="w-4 h-4 text-blue-600" />
            <span className="font-semibold text-slate-700 dark:text-slate-300">Opetuslupa Ajopäiväkirja</span>
            <span>•</span>
            <span>Pääkäyttäjä {SUPERADMIN_EMAIL}</span>
          </div>
          <div>
            Täyttää Traficomin ja Ajovarman opetuslupavaatimukset ajokertojen ja ajoympäristöjen erittelyyn.
          </div>
        </div>
      </footer>

      {/* Modaalit */}
      <DriveMapModal
        drive={selectedDriveForMap}
        currentUser={currentUser}
        onClose={() => setSelectedDriveForMap(null)}
        onDriveUpdated={refreshDrives}
      />

      <AdminPanelModal
        isOpen={showAdminPanel}
        onClose={() => setShowAdminPanel(false)}
        onSelectStudent={(student) => setSelectedStudent(student)}
        selectedStudentId={selectedStudent?.uid}
      />

      <ManualDriveModal
        isOpen={showManualModal}
        onClose={() => setShowManualModal(false)}
        currentUser={currentUser}
        onDriveSaved={handleDriveSaved}
      />

      <FirebaseSettingsModal
        isOpen={showSettingsModal}
        onClose={() => setShowSettingsModal(false)}
      />

    </div>
  );
}

export default App;
