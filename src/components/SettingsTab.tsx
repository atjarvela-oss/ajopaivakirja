import React, { useRef, useState, type ChangeEvent } from 'react';
import { 
  CloudUpload, 
  FolderDown, 
  Sun, 
  Moon, 
  Laptop, 
  Mail, 
  ShieldCheck, 
  Lock, 
  Smartphone,
  HardDrive,
  Database,
  Monitor,
  BatteryCharging,
  RefreshCw,
  DownloadCloud,
  GitBranch,
  Sparkles,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import type { ThemeMode } from '../services/themeService';
import { 
  APP_VERSION, 
  getGitHubRepo, 
  checkForAppUpdate, 
  openUpdateDownload, 
  type UpdateCheckResult 
} from '../services/updateService';

interface SettingsTabProps {
  currentTheme: ThemeMode;
  onThemeChange: (theme: ThemeMode) => void;
  onBackupDrive: () => void;
  onRestoreDrive: (file: File) => void;
  drivesCount: number;
}

export const SettingsTab: React.FC<SettingsTabProps> = ({
  currentTheme,
  onThemeChange,
  onBackupDrive,
  onRestoreDrive,
  drivesCount,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Automaattinen varmuuskopiointi ajon jälkeen — oletuksena päällä (true)
  const [autoBackupPref, setAutoBackupPref] = useState<boolean>(() => {
    const saved = localStorage.getItem('opetuslupa_auto_backup');
    return saved === null ? true : saved === 'true';
  });

  const handleAutoBackupToggle = (val: boolean) => {
    setAutoBackupPref(val);
    localStorage.setItem('opetuslupa_auto_backup', String(val));
  };

  // Hereilläpito-asetus — tallennetaan paikallisesti
  const [keepAwakePref, setKeepAwakePref] = useState<boolean>(() => {
    const saved = localStorage.getItem('opetuslupa_keep_awake');
    return saved === null ? true : saved === 'true'; // Oletus: päällä
  });

  const handleKeepAwakeToggle = (val: boolean) => {
    setKeepAwakePref(val);
    localStorage.setItem('opetuslupa_keep_awake', String(val));
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onRestoreDrive(file);
      e.target.value = '';
    }
  };

  // GitHub Päivitysten tarkistus
  const [githubRepo] = useState<string>(getGitHubRepo);
  const [isCheckingUpdate, setIsCheckingUpdate] = useState<boolean>(false);
  const [updateResult, setUpdateResult] = useState<UpdateCheckResult | null>(null);

  const handleCheckUpdate = async () => {
    setIsCheckingUpdate(true);
    const res = await checkForAppUpdate(githubRepo);
    setUpdateResult(res);
    setIsCheckingUpdate(false);
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-12">
      
      {/* 1. Google Drive -varmuuskopiointi */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 sm:p-6 border border-slate-200 dark:border-slate-800 shadow-xs">
        <div className="flex items-center space-x-3 mb-4">
          <div className="p-2.5 rounded-xl bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400">
            <CloudUpload className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Google Drive -varmuuskopiointi
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Tallenna kaikki ajotiedot turvaan omaan pilvipalveluusi tai siirrä toiselle laitteelle
            </p>
          </div>
        </div>

        {/* Automaattinen varmuuskopiointi -kytkin */}
        <div className="flex items-center justify-between p-3.5 rounded-xl bg-blue-50/60 dark:bg-blue-950/30 border border-blue-200/80 dark:border-blue-900/40 mb-4">
          <div className="flex items-center space-x-3 pr-3">
            <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/60 text-blue-600 dark:text-blue-300 shrink-0">
              <CloudUpload className="w-4 h-4" />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-900 dark:text-white">
                Automaattinen varmuuskopiointi jokaisen ajon jälkeen
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
                Käynnistää varmuuskopioinnin Google Driveen heti, kun ajokerta päätetään ja tallennetaan.
              </p>
            </div>
          </div>
          <button
            onClick={() => handleAutoBackupToggle(!autoBackupPref)}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${
              autoBackupPref ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-600'
            }`}
            role="switch"
            aria-checked={autoBackupPref}
            title={autoBackupPref ? 'Kytke pois automaattinen varmuuskopiointi' : 'Kytke päälle automaattinen varmuuskopiointi'}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg transition duration-200 ${
                autoBackupPref ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-850/60 border border-slate-200 dark:border-slate-800 mb-4 text-xs text-slate-600 dark:text-slate-300 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Database className="w-4 h-4 text-blue-500 shrink-0" />
            <span>Tallennettuja ajokertoja laitteen muistissa: <strong>{drivesCount} kpl</strong></span>
          </div>
          <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold flex items-center space-x-1">
            <HardDrive className="w-3.5 h-3.5" />
            <span>Paikallinen tallennus</span>
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Varmuuskopioi */}
          <button
            onClick={onBackupDrive}
            className="flex items-center justify-center space-x-2 p-3.5 rounded-xl bg-blue-600 hover:bg-blue-500 active:scale-98 text-white font-bold text-xs sm:text-sm shadow-md shadow-blue-600/20 transition cursor-pointer"
          >
            <CloudUpload className="w-4 h-4" />
            <span>Varmuuskopioi manuaalisesti Driveen</span>
          </button>

          {/* Palauta */}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center justify-center space-x-2 p-3.5 rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 active:scale-98 text-slate-800 dark:text-slate-200 font-semibold text-xs sm:text-sm transition cursor-pointer"
          >
            <FolderDown className="w-4 h-4" />
            <span>Palauta varmuuskopiosta (JSON)</span>
          </button>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept=".json"
            className="hidden"
          />
        </div>

        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-3 leading-relaxed">
          💡 Automaattisen tallennuksen lisäksi voit milloin tahansa luoda manuaalisen varmuuskopion tai palauttaa aiemman varmuuskopiotiedoston.
        </p>
      </div>

      {/* 2. Ulkoasu ja Teema */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 sm:p-6 border border-slate-200 dark:border-slate-800 shadow-xs">
        <div className="flex items-center space-x-3 mb-4">
          <div className="p-2.5 rounded-xl bg-purple-100 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400">
            <Sun className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Ulkoasu ja teema
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Valitse sovelluksen värimaailma
            </p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2.5">
          {/* Vaalea */}
          <button
            onClick={() => onThemeChange('light')}
            className={`p-3 rounded-xl border text-center transition flex flex-col items-center justify-center space-y-1.5 cursor-pointer ${
              currentTheme === 'light'
                ? 'border-blue-600 bg-blue-50/80 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 font-bold ring-2 ring-blue-500/20'
                : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50 text-slate-700 dark:text-slate-300'
            }`}
          >
            <Sun className="w-5 h-5 text-amber-500" />
            <span className="text-xs">Vaalea</span>
          </button>

          {/* Tumma */}
          <button
            onClick={() => onThemeChange('dark')}
            className={`p-3 rounded-xl border text-center transition flex flex-col items-center justify-center space-y-1.5 cursor-pointer ${
              currentTheme === 'dark'
                ? 'border-blue-600 bg-blue-50/80 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 font-bold ring-2 ring-blue-500/20'
                : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50 text-slate-700 dark:text-slate-300'
            }`}
          >
            <Moon className="w-5 h-5 text-indigo-500" />
            <span className="text-xs">Tumma</span>
          </button>

          {/* Järjestelmä */}
          <button
            onClick={() => onThemeChange('system')}
            className={`p-3 rounded-xl border text-center transition flex flex-col items-center justify-center space-y-1.5 cursor-pointer ${
              currentTheme === 'system'
                ? 'border-blue-600 bg-blue-50/80 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 font-bold ring-2 ring-blue-500/20'
                : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50 text-slate-700 dark:text-slate-300'
            }`}
          >
            <Laptop className="w-5 h-5 text-slate-500" />
            <span className="text-xs">Automaattinen</span>
          </button>
        </div>
      </div>

      {/* 3. Ajonseuranta-asetukset */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 sm:p-6 border border-slate-200 dark:border-slate-800 shadow-xs">
        <div className="flex items-center space-x-3 mb-4">
          <div className="p-2.5 rounded-xl bg-orange-100 dark:bg-orange-950/60 text-orange-600 dark:text-orange-400">
            <Monitor className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Ajonseuranta
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              GPS-tallennus ja näytön käyttäytyminen ajon aikana
            </p>
          </div>
        </div>

        <div className="space-y-3">
          {/* Hereilläpito-kytkin */}
          <div className="flex items-center justify-between p-3.5 rounded-xl bg-slate-50 dark:bg-slate-850/60 border border-slate-200 dark:border-slate-800">
            <div className="flex items-center space-x-3">
              <Monitor className="w-4 h-4 text-orange-500 shrink-0" />
              <div>
                <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">Pidä näyttö päällä ajon aikana</p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">Estää puhelimen näytön sammumisen, kun ajo on käynnissä</p>
              </div>
            </div>
            <button
              onClick={() => handleKeepAwakeToggle(!keepAwakePref)}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${
                keepAwakePref ? 'bg-orange-500' : 'bg-slate-300 dark:bg-slate-600'
              }`}
              role="switch"
              aria-checked={keepAwakePref}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg transition duration-200 ${
                  keepAwakePref ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Taustapaikannus-infopalkki */}
          <div className="flex items-start space-x-3 p-3.5 rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/50">
            <BatteryCharging className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-semibold text-blue-800 dark:text-blue-300">Taustapaikannus aktiivinen</p>
              <p className="text-[11px] text-blue-600 dark:text-blue-400 mt-0.5 leading-relaxed">
                GPS-seuranta jatkuu myös näytön ollessa sammutettuna tai toisen sovelluksen ollessa auki. 
                Puhelimen ilmoituspalkissa näkyy <em>"Ajo käynnissä"</em> koko ajon ajan.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* 4. Sovelluksen valmistajan tiedot */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 sm:p-6 border border-slate-200 dark:border-slate-800 shadow-xs">
        <div className="flex items-center space-x-3 mb-4">
          <div className="p-2.5 rounded-xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400">
            <Smartphone className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Sovelluksen tiedot ja valmistaja
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Yhteystiedot ja versiohistoria
            </p>
          </div>
        </div>

        <div className="space-y-3 text-xs sm:text-sm">
          <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-850/60 border border-slate-200 dark:border-slate-800">
            <span className="text-slate-500 dark:text-slate-400">Valmistaja / Kehittäjä</span>
            <a 
              href="mailto:atjarvela@gmail.com"
              className="font-bold text-blue-600 dark:text-blue-400 hover:underline flex items-center space-x-1"
            >
              <Mail className="w-3.5 h-3.5" />
              <span>atjarvela@gmail.com</span>
            </a>
          </div>

          <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-850/60 border border-slate-200 dark:border-slate-800">
            <span className="text-slate-500 dark:text-slate-400">Sovelluksen nimi</span>
            <span className="font-semibold text-slate-900 dark:text-white">Opetuslupalaisen ajopäiväkirja</span>
          </div>

          <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-850/60 border border-slate-200 dark:border-slate-800">
            <span className="text-slate-500 dark:text-slate-400">Lomakemalli</span>
            <span className="font-semibold text-slate-900 dark:text-white">Opetusluvan opetuskortti</span>
          </div>

          <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-850/60 border border-slate-200 dark:border-slate-800">
            <span className="text-slate-500 dark:text-slate-400">Sovellusversio</span>
            <span className="font-mono text-xs px-2.5 py-1 rounded-md bg-blue-100 dark:bg-blue-950/60 font-bold text-blue-700 dark:text-blue-300">
              v{APP_VERSION}
            </span>
          </div>
        </div>
      </div>

      {/* 5. Automaattiset päivitykset (GitHub) */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 sm:p-6 border border-slate-200 dark:border-slate-800 shadow-xs">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400">
              <GitBranch className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center space-x-2">
                <span>Sovelluksen päivitykset</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold">
                  v{APP_VERSION}
                </span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Tarkista onko GitHubissa saatavilla uudempi APK-versio
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-3 text-xs sm:text-sm">
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-850/60 border border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <div>
              <span className="text-slate-500 dark:text-slate-400 text-xs block">Julkaisukanava (GitHub)</span>
              <a 
                href={`https://github.com/${githubRepo}`} 
                target="_blank" 
                rel="noreferrer"
                className="font-bold text-blue-600 dark:text-blue-400 hover:underline flex items-center space-x-1 mt-0.5"
              >
                <span>{githubRepo}</span>
              </a>
            </div>

            <button
              onClick={handleCheckUpdate}
              disabled={isCheckingUpdate}
              className="px-4 py-2.5 text-xs font-bold rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white shadow-xs transition flex items-center space-x-1.5 cursor-pointer active:scale-95"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isCheckingUpdate ? 'animate-spin' : ''}`} />
              <span>{isCheckingUpdate ? 'Tarkistetaan...' : 'Tarkista päivitykset nyt'}</span>
            </button>
          </div>

          {/* Päivitystuloksen näyttö */}
          {updateResult && (
            <div className="mt-2 animate-in fade-in duration-200">
              {updateResult.hasUpdate ? (
                <div className="p-4 rounded-xl bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/40 dark:to-indigo-950/40 border border-blue-200 dark:border-blue-800 space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center space-x-2">
                      <Sparkles className="w-5 h-5 text-amber-500 shrink-0" />
                      <span className="font-extrabold text-blue-900 dark:text-blue-100 text-sm">
                        Uusi versio v{updateResult.latestVersion} saatavilla!
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-500">
                      Käytössä: v{APP_VERSION}
                    </span>
                  </div>

                  {updateResult.releaseNotes && (
                    <p className="text-xs text-slate-700 dark:text-slate-300 italic bg-white/80 dark:bg-slate-900/60 p-2.5 rounded-lg border border-blue-100 dark:border-blue-900/60 leading-relaxed">
                      {updateResult.releaseNotes}
                    </p>
                  )}

                  <div className="flex items-center justify-end">
                    <button
                      onClick={() => openUpdateDownload(updateResult.downloadUrl)}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-md transition flex items-center space-x-1.5 active:scale-95 cursor-pointer"
                    >
                      <DownloadCloud className="w-4 h-4" />
                      <span>Lataa ja asenna päivitys</span>
                    </button>
                  </div>
                </div>
              ) : updateResult.error ? (
                <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200 text-xs flex items-center space-x-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
                  <span>{updateResult.error}</span>
                </div>
              ) : (
                <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 text-xs flex items-center space-x-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  <span>Käytössäsi on jo uusin versio (v{APP_VERSION}). Ei uusia päivityksiä saatavilla.</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 4. Tietoturvaseloste */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 sm:p-6 border border-slate-200 dark:border-slate-800 shadow-xs">
        <div className="flex items-center space-x-3 mb-4">
          <div className="p-2.5 rounded-xl bg-teal-100 dark:bg-teal-950/60 text-teal-600 dark:text-teal-400">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Tietoturva- ja yksityisyysseloste
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Miten sovellus käsittelee tietojasi ja suojaa yksityisyyttäsi
            </p>
          </div>
        </div>

        <div className="space-y-4 text-xs sm:text-sm text-slate-700 dark:text-slate-300">
          
          <div className="p-3.5 rounded-xl bg-teal-50/60 dark:bg-teal-950/30 border border-teal-200/60 dark:border-teal-900/40">
            <div className="flex items-center space-x-2 font-bold text-teal-900 dark:text-teal-200 mb-1">
              <Lock className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0" />
              <span>100 % Paikallinen tallennus laitteessasi</span>
            </div>
            <p className="text-xs text-teal-800 dark:text-teal-300 leading-relaxed">
              Kaikki ajokerrat, GPS-reittipisteet, päivämäärät, ajotunnit sekä oppilaan ja opettajan henkilötiedot (nimi ja henkilötunnus) tallennetaan ainoastaan käyttäjän omaan puhelimeen paikalliseen laitemuistiin (LocalStorage).
            </p>
          </div>

          <div className="space-y-2.5">
            <div className="flex items-start space-x-2.5">
              <div className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-2 shrink-0" />
              <div>
                <strong className="text-slate-900 dark:text-white">Ei ulkoisia pilvitietokantoja:</strong>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  Sovelluksessa ei ole käytössä ulkopuolisia käyttäjätilejä, pilvitietokantoja tai taustajärjestelmiä. Tietojasi ei koskaan lähetetä kolmansille osapuolille.
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-2.5">
              <div className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-2 shrink-0" />
              <div>
                <strong className="text-slate-900 dark:text-white">Ei analytiikkaa tai seurantakoodeja:</strong>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  Sovellus ei sisällä mainoksia, evästeitä (cookies), telemetriaa eikä kaupallisia seurantaohjelmia.
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-2.5">
              <div className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-2 shrink-0" />
              <div>
                <strong className="text-slate-900 dark:text-white">GPS- ja sijaintitiedot:</strong>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  Laitteen GPS-sijaintitietoja käytetään vain silloin, kun ajotila on aktiivisesti päällä ("Aloita ajo"). Tietoja käytetään ainoastaan ajetun matkan pituuden, nopeuden sekä ajoympäristön (taajama, maantie, pysäköinti) automaattiseen arviointiin. Sijaintia ei seurata taustalla sovelluksen ollessa suljettuna.
                </p>
              </div>
            </div>

            <div className="flex items-start space-x-2.5">
              <div className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-2 shrink-0" />
              <div>
                <strong className="text-slate-900 dark:text-white">Google Drive ja tiedostojen jako:</strong>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  Google Drive -varmuuskopiointi käynnistyy automaattisesti aina ajokerran tallentamisen jälkeen (voidaan kytkeä pois asetuksista) tai manuaalisesti painamalla Varmuuskopioi-painiketta. Tiedostot siirtyvät suoraan omaan hallintaasi Androidin virallisen jakovalikon kautta.
                </p>
              </div>
            </div>
          </div>

        </div>
      </div>

    </div>
  );
};
