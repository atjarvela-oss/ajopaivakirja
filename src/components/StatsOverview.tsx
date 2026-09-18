import React from 'react';
import { 
  Clock, 
  MapPin, 
  CheckCircle2, 
  TrendingUp,
  Compass
} from 'lucide-react';
import type { OverallStats, TraficomTopicCode } from '../types';
import { TRAFICOM_TOPIC_CONFIG } from '../services/environmentClassifier';

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

        {/* Jäljellä tavoitteesta */}
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Jäljellä 10 h tavoitteesta</span>
            <div className="p-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline space-x-1">
            <span className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white">
              {Math.max(0, Number((minTargetHours - totalHours).toFixed(1)))}
            </span>
            <span className="text-xs text-slate-500 font-medium">h jäljellä</span>
          </div>
          <span className="text-[10px] text-slate-400 mt-4 block">
            {totalHours >= minTargetHours ? 'Opetusluvan 10h minimi täytetty! 🎉' : 'Vaaditaan ennen ajokoetta'}
          </span>
        </div>

      </div>

      {/* Ajoympäristöjen jakautuminen (Traficom-kategoriat) */}
      <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3 flex items-center space-x-1.5">
          <Compass className="w-4 h-4 text-blue-500" />
          <span>Ajoympäristöjen jakautuminen (Opetussuunnitelma)</span>
        </h4>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {(['K', 'A', 'B'] as TraficomTopicCode[]).map((code) => {
            const cfg = TRAFICOM_TOPIC_CONFIG[code];
            const data = stats.byTopicCode?.[code] || { count: 0, durationSeconds: 0, distanceKm: 0 };
            const hours = (data.durationSeconds / 3600).toFixed(1);
            const lessons50Min = (data.durationSeconds / (50 * 60)).toFixed(1);

            return (
              <div 
                key={code} 
                className="p-3.5 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-850/60 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center space-x-2 mb-2">
                    <span className={`w-5 h-5 rounded flex items-center justify-center font-black text-xs border shrink-0 ${cfg.badgeClass}`}>
                      {code}
                    </span>
                    <div className="min-w-0 flex-1">
                      <span className="text-xs font-bold text-slate-900 dark:text-white block truncate">
                        {cfg.title}
                      </span>
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 block truncate">
                        {cfg.sublabel}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-baseline space-x-1.5 my-1">
                    <span className="text-xl font-extrabold text-slate-900 dark:text-white">
                      {hours}
                    </span>
                    <span className="text-xs font-normal text-slate-500">h</span>
                    <span className="text-[11px] text-slate-400 dark:text-slate-500 ml-1">
                      ({lessons50Min} ajotuntia)
                    </span>
                  </div>
                </div>

                <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-2 pt-2 border-t border-slate-200/60 dark:border-slate-800 flex items-center justify-between">
                  <span>{data.distanceKm} km</span>
                  <span>{data.count} {data.count === 1 ? 'ajo' : 'ajoa'}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
