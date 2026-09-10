import { useState, useEffect } from 'react';
import { Navbar, type ActiveTab } from './components/Navbar';
import { BottomNav } from './components/BottomNav';
import { SummaryTab } from './components/SummaryTab';
import { DriveTracker } from './components/DriveTracker';
import { TraficomCard } from './components/TraficomCard';
import { SettingsTab } from './components/SettingsTab';
import { DriveMapModal } from './components/DriveMapModal';
import { ManualDriveModal } from './components/ManualDriveModal';
import type { DriveSession, OverallStats, TeachingInfo } from './types';
import { 
  getLocalDrives, 
  calculateOverallStats, 
  getTeachingInfo, 
  saveTeachingInfo, 
  deleteLocalDrive 
} from './services/localDb';
import { exportTraficomPdf } from './services/exportService';
import { backupToGoogleDrive, restoreFromBackupFile } from './services/driveBackup';
import { getStoredTheme, applyTheme, type ThemeMode } from './services/themeService';
import { CheckCircle2, AlertCircle } from 'lucide-react';
import { UpdateNotification } from './components/UpdateNotification';
import { checkForAppUpdate, type UpdateCheckResult } from './services/updateService';

export function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('yhteenveto');
  const [isDriving, setIsDriving] = useState(false);
  const [isDrivePaused, setIsDrivePaused] = useState(false);
  const [currentTheme, setCurrentTheme] = useState<ThemeMode>(getStoredTheme());
  const [availableUpdate, setAvailableUpdate] = useState<UpdateCheckResult | null>(null);
  
  const [drives, setDrives] = useState<DriveSession[]>([]);
  const [teachingInfo, setTeachingInfo] = useState<TeachingInfo>(getTeachingInfo());
  const [stats, setStats] = useState<OverallStats>({
    totalDrives: 0,
    totalDurationSeconds: 0,
    totalDistanceKm: 0,
    lessonHours50Min: 0,
    byEnvironment: {
      maantie: { count: 0, durationSeconds: 0, distanceKm: 0 },
      taajama: { count: 0, durationSeconds: 0, distanceKm: 0 },
      kaupunki: { count: 0, durationSeconds: 0, distanceKm: 0 },
      pysakointi: { count: 0, durationSeconds: 0, distanceKm: 0 },
    },
    byTopicCode: {
      K: { count: 0, durationSeconds: 0 },
      A: { count: 0, durationSeconds: 0 },
      B: { count: 0, durationSeconds: 0 },
    },
  });

  const [selectedDriveForMap, setSelectedDriveForMap] = useState<DriveSession | null>(null);
  const [showManualModal, setShowManualModal] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 4000);
  };

  // Teeman alustus ja vaihto
  useEffect(() => {
    applyTheme(currentTheme);
  }, [currentTheme]);

  const handleThemeChange = (newTheme: ThemeMode) => {
    setCurrentTheme(newTheme);
    applyTheme(newTheme);
    showToast(
      newTheme === 'dark' 
        ? 'Tumma teema käytössä' 
        : newTheme === 'light' 
        ? 'Vaalea teema käytössä' 
        : 'Järjestelmän teema käytössä'
    );
  };

  const refreshDrives = () => {
    const list = getLocalDrives();
    setDrives(list);
    setStats(calculateOverallStats(list));
    setTeachingInfo(getTeachingInfo());
  };

  useEffect(() => {
    refreshDrives();

    // Tarkistetaan GitHub-päivitykset taustalla 2 sekunnin kuluttua käynnistyksestä
    const updateTimer = setTimeout(() => {
      checkForAppUpdate()
        .then((res) => {
          if (res.hasUpdate) {
            setAvailableUpdate(res);
          }
        })
        .catch(() => {});
    }, 2000);

    return () => clearTimeout(updateTimer);
  }, []);

  const handleUpdateTeachingInfo = (info: TeachingInfo) => {
    saveTeachingInfo(info);
    setTeachingInfo(info);
    showToast('Oppilastiedot päivitetty onnistuneesti!');
  };

  const handleDeleteDrive = (id: string) => {
    deleteLocalDrive(id);
    refreshDrives();
    showToast('Ajokerta poistettu.');
  };

  const handleExportPdf = async () => {
    try {
      await exportTraficomPdf(drives, stats, teachingInfo);
      showToast('Opetuskortti-PDF luotu onnistuneesti!');
    } catch (e: any) {
      console.error(e);
      showToast('PDF-luonti epäonnistui: ' + (e?.message || e), 'error');
    }
  };

  const handleBackupDrive = async () => {
    try {
      const res = await backupToGoogleDrive(drives, teachingInfo);
      showToast(`Varmuuskopio luotu (${res.filename})`);
    } catch (e: any) {
      console.error(e);
      showToast('Varmuuskopiointi epäonnistui: ' + (e?.message || e), 'error');
    }
  };

  const handleRestoreDrive = async (file: File) => {
    const res = await restoreFromBackupFile(file);
    if (res.success) {
      refreshDrives();
      showToast(`Palautettiin onnistuneesti ${res.count} ajokertaa!`);
    } else {
      showToast(res.error || 'Palautus epäonnistui.', 'error');
    }
  };

  const handleDriveSaved = async () => {
    refreshDrives();
    setActiveTab('raportti'); // Siirrytään suoraan raporttiin tallennuksen jälkeen
    showToast('Ajokerta tallennettu onnistuneesti!');
  };

  return (
    <div className={`bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col font-sans antialiased transition-colors ${
      activeTab === 'ajo'
        ? 'h-[100dvh] max-h-[100dvh] overflow-hidden pb-14 sm:pb-0'
        : 'min-h-screen pb-16 sm:pb-0'
    }`}>
      
      {/* Yläpalkki (Siisti, ilman ylimääräisiä nappeja ja tekstejä) */}
      <Navbar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        isDriving={isDriving}
        isPaused={isDrivePaused}
      />

      {/* Ilmoitusviesti / Toast */}
      {notification && (
        <div className="fixed top-20 right-4 z-50 animate-in fade-in slide-in-from-top-3 duration-200">
          <div className={`p-3.5 rounded-2xl shadow-xl border flex items-center space-x-2 text-xs sm:text-sm font-semibold ${
            notification.type === 'success'
              ? 'bg-emerald-600 text-white border-emerald-500 shadow-emerald-600/20'
              : 'bg-rose-600 text-white border-rose-500 shadow-rose-600/20'
          }`}>
            {notification.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 shrink-0" />
            )}
            <span>{notification.message}</span>
          </div>
        </div>
      )}

      {/* Pääsisältö välilehtien mukaan */}
      <main className={`w-full mx-auto transition-all ${
        activeTab === 'ajo'
          ? 'flex-1 flex flex-col min-h-0 max-w-7xl px-2 sm:px-4 lg:px-6 py-2 sm:py-3 h-full overflow-hidden'
          : 'flex-1 max-w-7xl px-4 sm:px-6 lg:px-8 py-5 sm:py-7'
      }`}>
        
        {/* Välilehti 1: Yhteenveto */}
        {activeTab === 'yhteenveto' && (
          <SummaryTab
            stats={stats}
            teachingInfo={teachingInfo}
            recentDrives={drives}
            onNavigateToDrive={() => setActiveTab('ajo')}
            onNavigateToReport={() => setActiveTab('raportti')}
            onOpenManualEntry={() => setShowManualModal(true)}
            onSelectDriveForMap={(drive) => setSelectedDriveForMap(drive)}
          />
        )}

        {/* Välilehti 2: Ajo (Pidetään DOM:ssa piilotettuna jotta GPS-seuranta ei katkea välilehteä vaihdettaessa) */}
        <div className={activeTab === 'ajo' ? 'flex-1 flex flex-col min-h-0 h-full' : 'hidden'}>
          <DriveTracker
            isActiveTab={activeTab === 'ajo'}
            onDriveSaved={handleDriveSaved}
            onOpenManualEntry={() => setShowManualModal(true)}
            onDrivingStatusChange={(driving, paused) => {
              setIsDriving(driving);
              setIsDrivePaused(!!paused);
            }}
          />
        </div>

        {/* Välilehti 3: Raportti (Opetuskortti) */}
        {activeTab === 'raportti' && (
          <TraficomCard
            drives={drives}
            teachingInfo={teachingInfo}
            onUpdateTeachingInfo={handleUpdateTeachingInfo}
            onSelectDrive={(drive) => setSelectedDriveForMap(drive)}
            onDeleteDrive={handleDeleteDrive}
            onExportPdf={handleExportPdf}
            onOpenManualEntry={() => setShowManualModal(true)}
          />
        )}

        {/* Välilehti 4: Asetukset */}
        {activeTab === 'asetukset' && (
          <SettingsTab
            currentTheme={currentTheme}
            onThemeChange={handleThemeChange}
            onBackupDrive={handleBackupDrive}
            onRestoreDrive={handleRestoreDrive}
            drivesCount={drives.length}
          />
        )}

      </main>

      {/* Alapalkki (Mobiililaitteille helpottamaan yhden käden käyttöä puhelimella) */}
      <BottomNav
        activeTab={activeTab}
        onTabChange={setActiveTab}
        isDriving={isDriving}
        isPaused={isDrivePaused}
      />

      {/* Modaalit */}
      <DriveMapModal
        drive={selectedDriveForMap}
        onClose={() => setSelectedDriveForMap(null)}
        onDriveUpdated={refreshDrives}
      />

      <ManualDriveModal
        isOpen={showManualModal}
        onClose={() => setShowManualModal(false)}
        onDriveSaved={handleDriveSaved}
      />

      {/* Päivityshoksautus / Ilmoitus uuden version saapuessa */}
      <UpdateNotification
        updateInfo={availableUpdate}
        onDismiss={() => setAvailableUpdate(null)}
      />

    </div>
  );
}

export default App;
