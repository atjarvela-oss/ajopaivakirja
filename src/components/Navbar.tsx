import { useRef, type ChangeEvent, type FC } from 'react';
import { 
  Car, 
  CloudUpload, 
  FolderDown, 
  FileDown, 
  Image as ImageIcon
} from 'lucide-react';

interface NavbarProps {
  onExportPdf: () => void;
  onExportPng: () => void;
  onBackupDrive: () => void;
  onRestoreDrive: (file: File) => void;
  isExportingPdf?: boolean;
  isExportingPng?: boolean;
}

export const Navbar: FC<NavbarProps> = ({
  onExportPdf,
  onExportPng,
  onBackupDrive,
  onRestoreDrive,
  isExportingPdf,
  isExportingPng,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onRestoreDrive(file);
      e.target.value = '';
    }
  };

  return (
    <header className="sticky top-0 z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur border-b border-slate-200 dark:border-slate-800 transition-colors shadow-xs no-print">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          
          {/* Logo ja Sovelluksen Nimi */}
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-blue-500/20">
              <Car className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-bold text-lg text-slate-900 dark:text-white tracking-tight">
                  Ajopäiväkirja
                </span>
                <span className="text-[10px] sm:text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 font-semibold">
                  Opettajan versio
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 hidden sm:block">
                Paikallinen Android-tallennus • Google Drive -varmuuskopio
              </p>
            </div>
          </div>

          {/* Varmuuskopiointi & Export-toiminnot */}
          <div className="flex items-center space-x-1.5 sm:space-x-2">
            
            {/* Google Drive -varmuuskopio */}
            <button
              onClick={onBackupDrive}
              className="px-2.5 sm:px-3 py-1.5 text-xs font-semibold rounded-xl bg-blue-50 text-blue-700 hover:bg-blue-100 dark:bg-blue-950/50 dark:text-blue-300 dark:hover:bg-blue-900/50 border border-blue-200 dark:border-blue-800 transition flex items-center space-x-1.5"
              title="Varmuuskopioi kaikki ajot Google Driveen"
            >
              <CloudUpload className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <span className="hidden md:inline">Google Drive</span>
            </button>

            {/* Palauta tiedostosta */}
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-2.5 sm:px-3 py-1.5 text-xs font-medium rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition flex items-center space-x-1"
              title="Palauta varmuuskopio tiedostosta"
            >
              <FolderDown className="w-4 h-4" />
              <span className="hidden lg:inline">Palauta</span>
            </button>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept=".json"
              className="hidden"
            />

            <div className="h-5 w-[1px] bg-slate-200 dark:bg-slate-700 mx-1 hidden sm:block" />

            {/* Vie PNG */}
            <button
              onClick={onExportPng}
              disabled={isExportingPng}
              className="px-2.5 sm:px-3 py-1.5 text-xs font-semibold rounded-xl border border-purple-200 dark:border-purple-800 bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300 hover:bg-purple-100 transition flex items-center space-x-1"
              title="Lataa tai jaa ajopäiväkirja kuvana (PNG)"
            >
              <ImageIcon className="w-3.5 h-3.5 text-purple-600" />
              <span>{isExportingPng ? 'Luodaan...' : 'Vie PNG'}</span>
            </button>

            {/* Vie PDF */}
            <button
              onClick={onExportPdf}
              disabled={isExportingPdf}
              className="px-3 sm:px-3.5 py-1.5 text-xs font-bold rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white shadow-xs transition flex items-center space-x-1.5 active:scale-95"
              title="Luo virallinen A4 PDF -ajopäiväkirja"
            >
              <FileDown className="w-4 h-4" />
              <span>{isExportingPdf ? 'Luodaan...' : 'Vie PDF'}</span>
            </button>

          </div>

        </div>
      </div>
    </header>
  );
};
