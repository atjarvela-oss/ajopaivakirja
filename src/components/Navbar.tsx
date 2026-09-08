import type { FC } from 'react';
import { 
  Car, 
  BarChart3, 
  Navigation, 
  FileText, 
  Settings,
  Radio,
  Pause
} from 'lucide-react';

export type ActiveTab = 'yhteenveto' | 'ajo' | 'raportti' | 'asetukset';

interface NavbarProps {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
  isDriving?: boolean;
  isPaused?: boolean;
}

export const Navbar: FC<NavbarProps> = ({
  activeTab,
  onTabChange,
  isDriving = false,
  isPaused = false,
}) => {
  const tabs = [
    { id: 'yhteenveto' as const, label: 'Yhteenveto', icon: BarChart3 },
    { id: 'ajo' as const, label: 'Ajo', icon: Navigation },
    { id: 'raportti' as const, label: 'Raportti', icon: FileText },
    { id: 'asetukset' as const, label: 'Asetukset', icon: Settings },
  ];

  return (
    <header className="sticky top-0 z-30 shrink-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur border-b border-slate-200 dark:border-slate-800 transition-colors shadow-xs no-print">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-13 sm:h-16">
          
          {/* Logo ja Sovelluksen Nimi */}
          <div className="flex items-center space-x-2.5 sm:space-x-3">
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-blue-500/20 shrink-0">
              <Car className="w-4.5 h-4.5 sm:w-6 sm:h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-bold text-sm sm:text-lg text-slate-900 dark:text-white tracking-tight">
                  Opetuslupalaisen ajopäiväkirja
                </span>
                {isDriving && (
                  isPaused ? (
                    <span className="text-[10px] sm:text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 font-bold flex items-center space-x-1">
                      <Pause className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                      <span>Ajo tauolla</span>
                    </span>
                  ) : (
                    <span className="text-[10px] sm:text-xs px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 font-bold flex items-center space-x-1 animate-pulse">
                      <Radio className="w-3 h-3 text-rose-600 animate-spin" />
                      <span>Ajo käynnissä</span>
                    </span>
                  )
                )}
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 hidden sm:block">
                Ajo-opetuksen opetuskortti
              </p>
            </div>
          </div>

          {/* Välilehdet (Työpöytä / Tabletti) */}
          <nav className="hidden sm:flex items-center space-x-1 bg-slate-100 dark:bg-slate-800/70 p-1 rounded-xl border border-slate-200 dark:border-slate-700/60">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => onTabChange(tab.id)}
                  className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                    isActive
                      ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{tab.label}</span>
                  {tab.id === 'ajo' && isDriving && (
                    <span className={`w-2 h-2 rounded-full ${isPaused ? 'bg-amber-500' : 'bg-rose-500 animate-ping'}`} />
                  )}
                </button>
              );
            })}
          </nav>

        </div>
      </div>
    </header>
  );
};
