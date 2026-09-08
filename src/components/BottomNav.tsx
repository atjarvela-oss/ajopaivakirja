import type { FC } from 'react';
import { 
  BarChart3, 
  Navigation, 
  FileText, 
  Settings
} from 'lucide-react';
import type { ActiveTab } from './Navbar';

interface BottomNavProps {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
  isDriving?: boolean;
  isPaused?: boolean;
}

export const BottomNav: FC<BottomNavProps> = ({
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
    <div className="sm:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 px-2 py-1 shadow-lg no-print">
      <div className="grid grid-cols-4 gap-1">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`flex flex-col items-center justify-center py-1.5 px-1 rounded-xl transition cursor-pointer relative ${
                isActive
                  ? 'text-blue-600 dark:text-blue-400 font-bold'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <div className="relative">
                <Icon className={`w-5 h-5 ${isActive ? 'stroke-[2.5]' : 'stroke-2'}`} />
                {tab.id === 'ajo' && isDriving && (
                  <span className={`absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full ${isPaused ? 'bg-amber-500' : 'bg-rose-500 animate-ping'}`} />
                )}
              </div>
              <span className="text-[10px] mt-0.5 tracking-tight leading-none">
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
