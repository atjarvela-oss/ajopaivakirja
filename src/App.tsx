import { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar';
import { StatsOverview } from './components/StatsOverview';
import { DriveTracker } from './components/DriveTracker';
import { DriveTable } from './components/DriveTable';
import { DriveMapModal } from './components/DriveMapModal';
import { ManualDriveModal } from './components/ManualDriveModal';
import type { DriveSession, OverallStats } from './types';
import { getLocalDrives, calculateOverallStats } from './services/localDb';
import { exportDrivesToPdf, exportElementToPng } from './services/exportService';
import { backupToGoogleDrive, restoreFromBackupFile } from './services/driveBackup';
import { Car, CheckCircle2, AlertCircle } from 'lucide-react';

export function App() {
  const [drives, setDrives] = useState<DriveSession[]>([]);
  const [stats, setStats] = useState<OverallStats>({
    totalDrives: 0,
    totalDurationSeconds: 0,
    totalDistanceKm: 0,
    byEnvironment: {
      maantie: { count: 0, durationSeconds: 0, distanceKm: 0 },
      taajama: { count: 0, durationSeconds: 0, distanceKm: 0 },
      kaupunki: { count: 0, durationSeconds: 0, distanceKm: 0 },
      pysakointi: { count: 0, durationSeconds: 0, distanceKm: 0 },
    },
  });

  const [selectedDriveForMap, setSelectedDriveForMap] = useState<DriveSession | null>(null);
  const [showManualModal, setShowManualModal] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [isExportingPng, setIsExportingPng] = useState(false);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 4000);
  };

  const refreshDrives = () => {
    const list = getLocalDrives();
    setDrives(list);
    setStats(calculateOverallStats(list));
  };

  useEffect(() => {
    refreshDrives();
  }, []);

  const handleExportPdf = async () => {
    try {
      setIsExportingPdf(true);
      await exportDrivesToPdf(drives, stats);
      showToast('PDF-ajopäiväkirja luotu onnistuneesti!');
    } catch (e: any) {
      console.error(e);
      showToast('PDF-luonti epäonnistui: ' + e.message, 'error');
    } finally {
      setIsExportingPdf(false);
    }
  };

  const handleExportPng = async () => {
    try {
      setIsExportingPng(true);
      await exportElementToPng('driving-log-table-container', 'ajopaivakirja');
      showToast('Ajopäiväkirjan kuva (PNG) luotu onnistuneesti!');
    } catch (e: any) {
      console.error(e);
      showToast('PNG-luonti epäonnistui: ' + e.message, 'error');
    } finally {
      setIsExportingPng(false);
    }
  };

  const handleBackupDrive = async () => {
    try {
      await backupToGoogleDrive(drives);
      showToast('Valitse "Tallenna Google Driveen" avautuvasta jakovalikosta!');
    } catch (e: any) {
      console.error(e);
      showToast('Varmuuskopiointi epäonnistui: ' + e.message, 'error');
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

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col font-sans antialiased transition-colors">
      
      {/* Yläpalkki (Puhdas Android-opettajanäkymä) */}
      <Navbar
        onExportPdf={handleExportPdf}
        onExportPng={handleExportPng}
        onBackupDrive={handleBackupDrive}
        onRestoreDrive={handleRestoreDrive}
        isExportingPdf={isExportingPdf}
        isExportingPng={isExportingPng}
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

      {/* Pääsisältö */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6 sm:space-y-8">
        
        {/* Yhteenvetokortit ja ajoympäristöjakauma */}
        <section>
          <StatsOverview stats={stats} />
        </section>

        {/* Ajotila ja Reaaliaikainen GPS-seuranta */}
        <section className="no-print">
          <DriveTracker
            onDriveSaved={refreshDrives}
            onOpenManualEntry={() => setShowManualModal(true)}
          />
        </section>

        {/* Taulukkotyylinen listaus ajokerroista */}
        <section>
          <DriveTable
            drives={drives}
            onSelectDrive={(drive) => setSelectedDriveForMap(drive)}
            onRefresh={refreshDrives}
            onExportPdf={handleExportPdf}
            onExportPng={handleExportPng}
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
            <span>Puhdas paikallinen Android-sovellus</span>
          </div>
          <div>
            Kaikki ajotiedot säilyvät puhelimessasi. Varmuuskopioi säännöllisesti Google Driveen yläpalkin painikkeella.
          </div>
        </div>
      </footer>

      {/* Modaalit */}
      <DriveMapModal
        drive={selectedDriveForMap}
        onClose={() => setSelectedDriveForMap(null)}
        onDriveUpdated={refreshDrives}
      />

      <ManualDriveModal
        isOpen={showManualModal}
        onClose={() => setShowManualModal(false)}
        onDriveSaved={refreshDrives}
      />

    </div>
  );
}

export default App;
