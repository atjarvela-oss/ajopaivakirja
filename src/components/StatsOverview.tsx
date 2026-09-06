import React from 'react';
import { 
  Clock, 
  MapPin, 
  CheckCircle2, 
  TrendingUp,
  Compass
} from 'lucide-react';
import type { OverallStats, EnvironmentType } from '../types';
import { ENVIRONMENT_CONFIG } from '../services/environmentClassifier';

interface StatsOverviewProps {
  stats: OverallStats;
}

export const StatsOverview: React.FC<StatsOverviewProps> = ({ stats }) => {
  const totalHours = Number((stats.totalDurationSeconds / 3600).toFixed(1));
  const minTargetHours = 10; // Traficomin perusvaatimus 10 ajotuntia
  const progressPercent = Math.min(100, Math.round((totalHours / minTargetHours) * 100));

  return (
    <div className="space-y-4">
      {/* Pääkortit */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        
        {/* Kokonaistunnit */}
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Ajetut tunnit yht.</span>
            <div className="p-1.5 rounded-lg bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline space-x-2">
            <span className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white">
              {totalHours}
            </span>
            <span className="text-xs text-slate-500 font-medium">/ {minTargetHours} h tavoite</span>
          </div>
          
          {/* Edistymispalkki */}
          <div className="mt-3">
            <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
              <div 
                className="h-full bg-blue-600 rounded-full transition-all duration-500"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <span className="text-[10px] text-slate-400 mt-1 block">
              {progressPercent}% vaaditusta 10h minimistä
            </span>
          </div>
        </div>

        {/* Kokonaiskilometrit */}
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Ajettu matka</span>
            <div className="p-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400">
              <MapPin className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline space-x-1">
            <span className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white">
              {stats.totalDistanceKm}
            </span>
            <span className="text-xs text-slate-500 font-medium">km</span>
          </div>
          <span className="text-[10px] text-slate-400 mt-4 block">
            Kaikki tallennetut ajokerrat
          </span>
        </div>

        {/* Ajokerrat */}
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Ajokerrat</span>
            <div className="p-1.5 rounded-lg bg-purple-50 dark:bg-purple-950/50 text-purple-600 dark:text-purple-400">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline space-x-1">
            <span className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white">
              {stats.totalDrives}
            </span>
            <span className="text-xs text-slate-500 font-medium">kpl</span>
          </div>
          <span className="text-[10px] text-slate-400 mt-4 block">
            Keskimäärin {(stats.totalDrives > 0 ? (stats.totalDurationSeconds / stats.totalDrives / 60).toFixed(0) : 0)} min / kerta
          </span>
        </div>

        {/* Opettajan Kuittaamat */}
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Hyväksytyt ajot</span>
            <div className="p-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline space-x-1">
            <span className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white">
              {stats.approvedDrives}
            </span>
            <span className="text-xs text-slate-500 font-medium">/ {stats.totalDrives} kuitattu</span>
          </div>
          <span className="text-[10px] text-slate-400 mt-4 block">
            Opettajan allekirjoittamat ajot
          </span>
        </div>

      </div>

      {/* Ajoympäristöjen erittely */}
      <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3 flex items-center space-x-1.5">
          <Compass className="w-4 h-4 text-blue-500" />
          <span>Ajoympäristöjen jakautuminen (Opetussuunnitelma)</span>
        </h4>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {(Object.keys(ENVIRONMENT_CONFIG) as EnvironmentType[]).map((envKey) => {
            const cfg = ENVIRONMENT_CONFIG[envKey];
            const data = stats.byEnvironment[envKey];
            const hours = (data.durationSeconds / 3600).toFixed(1);

            return (
              <div 
                key={envKey} 
                className="p-3 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-850/60"
              >
                <div className="flex items-center space-x-1.5 mb-1.5">
                  <span className={`w-2.5 h-2.5 rounded-full`} style={{ backgroundColor: cfg.bgLight }} />
                  <span className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                    {cfg.label.split(' / ')[0]}
                  </span>
                </div>
                <div className="text-lg font-bold text-slate-900 dark:text-white">
                  {hours} <span className="text-xs font-normal text-slate-500">h</span>
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  {data.distanceKm} km • {data.count} ajoa
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
