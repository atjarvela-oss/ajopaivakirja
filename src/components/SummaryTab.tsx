import type { FC } from 'react';
import { 
  Play, 
  PlusCircle, 
  UserCheck, 
  Calendar, 
  ChevronRight, 
  Car,
  MapPin,
  Clock
} from 'lucide-react';
import { StatsOverview } from './StatsOverview';
import type { DriveSession, OverallStats, TeachingInfo } from '../types';
import { TRAFICOM_TOPIC_CONFIG } from '../services/environmentClassifier';

interface SummaryTabProps {
  stats: OverallStats;
  teachingInfo: TeachingInfo;
  recentDrives: DriveSession[];
  onNavigateToDrive: () => void;
  onNavigateToReport: () => void;
  onOpenManualEntry: () => void;
  onSelectDriveForMap: (drive: DriveSession) => void;
}

export const SummaryTab: FC<SummaryTabProps> = ({
  stats,
  teachingInfo,
  recentDrives,
  onNavigateToDrive,
  onNavigateToReport,
  onOpenManualEntry,
  onSelectDriveForMap,
}) => {
  const latestDrives = [...recentDrives]
    .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())
    .slice(0, 5);

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      
      {/* 1. Yhteenvetotilastot */}
      <section>
        <StatsOverview stats={stats} />
      </section>

      {/* 2. Pika-toiminnot */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <button
          onClick={onNavigateToDrive}
          className="flex items-center justify-between p-4 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-md shadow-blue-500/20 active:scale-98 transition cursor-pointer"
        >
          <div className="flex items-center space-x-3">
            <div className="p-3 rounded-xl bg-white/15">
              <Play className="w-5 h-5 fill-white" />
            </div>
            <div className="text-left">
              <div className="text-sm font-extrabold">Aloita uusi ajo</div>
              <div className="text-xs text-blue-100">Reaaliaikainen GPS-seuranta</div>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-white/70" />
        </button>

        <button
          onClick={onOpenManualEntry}
          className="flex items-center justify-between p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-850 active:scale-98 transition cursor-pointer shadow-xs"
        >
          <div className="flex items-center space-x-3">
            <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400">
              <PlusCircle className="w-5 h-5" />
            </div>
            <div className="text-left">
              <div className="text-sm font-extrabold text-slate-900 dark:text-white">
                Lisää ajo manuaalisesti
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                Kirjaa aiempi ajokerta jälkikäteen
              </div>
            </div>
          </div>
          <ChevronRight className="w-5 h-5 text-slate-400" />
        </button>
      </div>

      {/* 3. Opetuskortin perustiedot & Raportti-linkki */}
      <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <div className="flex items-center space-x-2">
            <UserCheck className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Opetuskortin perustiedot
            </h3>
          </div>
          <button
            onClick={onNavigateToReport}
            className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline flex items-center space-x-1 cursor-pointer"
          >
            <span>Avaa opetuskortti</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-850/60 border border-slate-200 dark:border-slate-800">
            <span className="text-slate-500 dark:text-slate-400 block mb-0.5">Oppilas</span>
            <span className="font-bold text-slate-900 dark:text-white truncate block">
              {teachingInfo.studentName || 'Ei vielä määritetty'}
            </span>
            {teachingInfo.studentSsn && (
              <span className="text-[11px] text-slate-400">Hetu: {teachingInfo.studentSsn}</span>
            )}
          </div>

          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-850/60 border border-slate-200 dark:border-slate-800">
            <span className="text-slate-500 dark:text-slate-400 block mb-0.5">Opettaja</span>
            <span className="font-bold text-slate-900 dark:text-white truncate block">
              {teachingInfo.teacherName || 'Ei vielä määritetty'}
            </span>
            {teachingInfo.teacherSsn && (
              <span className="text-[11px] text-slate-400">Hetu: {teachingInfo.teacherSsn}</span>
            )}
          </div>

          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-850/60 border border-slate-200 dark:border-slate-800">
            <span className="text-slate-500 dark:text-slate-400 block mb-0.5">Opetuksen aloitus / Luokka</span>
            <span className="font-bold text-slate-900 dark:text-white flex items-center space-x-1">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <span>{teachingInfo.startDate || '—'} (Korttiluokka {teachingInfo.licenseClass || 'B'})</span>
            </span>
          </div>
        </div>
      </div>

      {/* 4. Viimeisimmät ajokerrat */}
      <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-2">
            <Clock className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Viimeisimmät ajokerrat
            </h3>
          </div>
          {latestDrives.length > 0 && (
            <button
              onClick={onNavigateToReport}
              className="text-xs font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
            >
              Näytä kaikki ({recentDrives.length})
            </button>
          )}
        </div>

        {latestDrives.length === 0 ? (
          <div className="text-center py-8 text-slate-400 dark:text-slate-500 text-xs">
            <Car className="w-8 h-8 mx-auto mb-2 opacity-40" />
            <p className="font-medium text-slate-600 dark:text-slate-400">Ei vielä tallennettuja ajokertoja</p>
            <p className="text-[11px] mt-1">Aloita ensimmäinen ajosi painamalla "Aloita uusi ajo" yltä.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {latestDrives.map((drive, idx) => {
              const sDate = new Date(drive.startTime);
              const pvm = sDate.toLocaleDateString('fi-FI');
              const klo = sDate.toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit' });
              const durationMin = Math.round(drive.durationSeconds / 60);
              const topic = drive.topicCode || 'A';
              const topicConfig = TRAFICOM_TOPIC_CONFIG[topic];

              return (
                <div 
                  key={drive.id || idx}
                  className="py-3 flex items-center justify-between hover:bg-slate-50/70 dark:hover:bg-slate-850/50 rounded-xl px-2 transition cursor-pointer"
                  onClick={() => onSelectDriveForMap(drive)}
                >
                  <div className="flex items-center space-x-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs ${topicConfig?.badgeClass || 'bg-blue-100 text-blue-800'}`}>
                      {topic}
                    </div>
                    <div>
                      <div className="text-xs font-bold text-slate-900 dark:text-white flex items-center space-x-2">
                        <span>{pvm} klo {klo}</span>
                        <span className="text-[11px] text-slate-400 font-normal">({durationMin} min)</span>
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate max-w-[200px] sm:max-w-md">
                        {drive.notes ? drive.notes : topicConfig?.title}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center space-x-3 text-right">
                    <div>
                      <div className="text-xs font-bold text-slate-900 dark:text-white">
                        {drive.distanceKm} km
                      </div>
                      <div className="text-[10px] text-slate-400">
                        {drive.avgSpeedKmH} km/h
                      </div>
                    </div>
                    {drive.routePoints && drive.routePoints.length > 0 && (
                      <div className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-blue-600">
                        <MapPin className="w-4 h-4" />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

    </div>
  );
};
