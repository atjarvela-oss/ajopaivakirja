import React, { useEffect, useRef, useState } from 'react';
import { 
  X, 
  Check, 
  Save,
  Sparkles,
  Volume2,
  VolumeX,
  Fuel,
  Share2,
} from 'lucide-react';
import L from 'leaflet';
import type { DriveSession } from '../types';
import { ENVIRONMENT_CONFIG } from '../services/environmentClassifier';
import { updateLocalDrive } from '../services/localDb';
import { speakDrivingReport, stopSpeakingReport } from '../services/drivingReportService';
import { DriveShareModal } from './DriveShareModal';

interface DriveMapModalProps {
  drive: DriveSession | null;
  onClose: () => void;
  onDriveUpdated?: () => void;
}

export const DriveMapModal: React.FC<DriveMapModalProps> = ({
  drive,
  onClose,
  onDriveUpdated,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);

  const [notesText, setNotesText] = useState(drive?.notes || '');
  const [teacherNotes, setTeacherNotes] = useState(drive?.teacherNotes || '');
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);

  useEffect(() => {
    return () => {
      stopSpeakingReport();
    };
  }, []);

  const handleClose = () => {
    stopSpeakingReport();
    setIsSpeaking(false);
    onClose();
  };

  useEffect(() => {
    if (drive) {
      setNotesText(drive.notes || '');
      setTeacherNotes(drive.teacherNotes || '');
    }
  }, [drive]);

  useEffect(() => {
    if (!drive || !mapContainerRef.current) return;

    let isMounted = true;
    let t1: any = null;
    let t2: any = null;

    if ((mapContainerRef.current as any)._leaflet_id) {
      delete (mapContainerRef.current as any)._leaflet_id;
    }

    // Alustetaan kartta
    const map = L.map(mapContainerRef.current, {
      zoomControl: true,
    });

    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png?key=cb1_2zol_1_eeae5b3125b861ead072afd6', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 20,
      crossOrigin: true,
      keepBuffer: 6,
      updateWhenIdle: false,
      updateWhenZooming: true,
    }).addTo(map);

    let polylineBounds: L.LatLngBounds | null = null;

    if (drive.routePoints && drive.routePoints.length > 0) {
      const latLngs = drive.routePoints.map((p) => [p.lat, p.lng] as [number, number]);

      // Reittiviiva
      const polyline = L.polyline(latLngs, {
        color: '#2563eb',
        weight: 6,
        opacity: 0.9,
        lineJoin: 'round',
        lineCap: 'round',
      }).addTo(map);

      polylineBounds = polyline.getBounds();

      // Lähtöpiste (Vihreä)
      const startPoint = latLngs[0];
      L.circleMarker(startPoint, {
        radius: 9,
        fillColor: '#10b981',
        color: '#ffffff',
        weight: 3,
        opacity: 1,
        fillOpacity: 1,
      }).addTo(map).bindPopup('Lähtöpiste');

      // Lopetuspiste (Punainen)
      const endPoint = latLngs[latLngs.length - 1];
      L.circleMarker(endPoint, {
        radius: 9,
        fillColor: '#ef4444',
        color: '#ffffff',
        weight: 3,
        opacity: 1,
        fillOpacity: 1,
      }).addTo(map).bindPopup('Lopetuspiste');

      // Ajotapa-tapahtumien merkit kartalle (äkkijarrutukset, tiukat mutkat, moottorin sammumiset)
      if (drive.drivingBehavior && drive.drivingBehavior.events) {
        drive.drivingBehavior.events.forEach((ev) => {
          if (ev.lat && ev.lng) {
            const isBrake = ev.type === 'hard_brake';
            const isTurn = ev.type === 'hard_turn';
            const isStall = ev.type === 'engine_stall';

            const color = isBrake ? '#e11d48' : isTurn ? '#f59e0b' : isStall ? '#9333ea' : '#3b82f6';
            const label = isBrake 
              ? `Äkkijarrutus (${ev.value ? ev.value.toFixed(1) + ' m/s²' : ''})` 
              : isTurn 
              ? `Vauhdikas mutka (${ev.value ? ev.value.toFixed(1) + ' m/s²' : ''})` 
              : isStall 
              ? 'Moottorin sammuminen' 
              : ev.description;

            L.circleMarker([ev.lat, ev.lng], {
              radius: 6,
              fillColor: color,
              color: '#ffffff',
              weight: 2,
              opacity: 1,
              fillOpacity: 0.9,
            }).addTo(map).bindPopup(`<strong>${label}</strong><br/><span style="font-size: 11px; color: #64748b;">${new Date(ev.timestamp).toLocaleTimeString('fi-FI')}</span>`);
          }
        });
      }

      // Sovitetaan kartta reittiin
      if (polylineBounds.isValid()) {
        map.fitBounds(polylineBounds, { padding: [40, 40] });
      } else {
        map.setView(startPoint, 15);
      }
    } else {
      map.setView([60.1699, 24.9384], 14);
    }

    mapInstanceRef.current = map;

    // Varmistetaan että modaalin avautumisanimaation jälkeen mitat päivittyvät
    map.whenReady(() => {
      t1 = setTimeout(() => {
        if (!isMounted || !mapInstanceRef.current) return;
        try {
          map.invalidateSize({ pan: false });
          if (polylineBounds && polylineBounds.isValid()) {
            map.fitBounds(polylineBounds, { padding: [40, 40], animate: false });
          }
        } catch {}
      }, 150);
      t2 = setTimeout(() => {
        if (!isMounted || !mapInstanceRef.current) return;
        try {
          map.invalidateSize({ pan: false });
        } catch {}
      }, 400);
    });

    // ResizeObserver modaalille
    const observer = new ResizeObserver(() => {
      if (!isMounted || !mapInstanceRef.current) return;
      if (mapContainerRef.current && mapContainerRef.current.clientWidth > 0 && mapContainerRef.current.clientHeight > 0) {
        try {
          map.invalidateSize({ pan: false });
        } catch {}
      }
    });
    if (mapContainerRef.current) {
      observer.observe(mapContainerRef.current);
    }

    return () => {
      isMounted = false;
      if (t1) clearTimeout(t1);
      if (t2) clearTimeout(t2);
      observer.disconnect();
      try {
        map.stop();
        map.remove();
      } catch {}
      mapInstanceRef.current = null;
    };
  }, [drive]);

  const handleSaveNotes = () => {
    if (!drive) return;
    updateLocalDrive(drive.id, {
      notes: notesText,
      teacherNotes: teacherNotes,
    });
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2000);
    if (onDriveUpdated) onDriveUpdated();
  };

  if (!drive) return null;

  const envConfig = ENVIRONMENT_CONFIG[drive.environment.primary];
  const startDate = new Date(drive.startTime);
  const endDate = new Date(drive.endTime);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs">
      <div className="bg-white dark:bg-slate-900 w-full max-w-3xl rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[92vh]">
        
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div>
            <div className="flex items-center space-x-2">
              <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                Ajokerran tiedot & reitti
              </h3>
              <span className={`text-xs px-2 py-0.5 rounded-lg font-semibold border ${envConfig.badgeClass}`}>
                {envConfig.label}
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Opetusajokerta • {startDate.toLocaleDateString('fi-FI')}
            </p>
          </div>

          <button
            onClick={handleClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Kartta */}
        <div className="relative h-60 sm:h-72 w-full bg-slate-100 dark:bg-slate-800 shrink-0">
          <div ref={mapContainerRef} className="w-full h-full" />
          {(!drive.routePoints || drive.routePoints.length === 0) && (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-100/90 dark:bg-slate-800/90 text-xs text-slate-500">
              Tälle ajokerralle ei ole tallennettuja GPS-reittipisteitä (manuaalisesti syötetty ajo).
            </div>
          )}
        </div>

        {/* Yksityiskohdat ja analyysi */}
        <div className="p-5 overflow-y-auto space-y-4">
          
          {/* Tunnusluvut */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
            <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
              <div className="text-[11px] text-slate-500">Päivämäärä</div>
              <div className="text-xs sm:text-sm font-semibold text-slate-900 dark:text-white">
                {startDate.toLocaleDateString('fi-FI')}
              </div>
            </div>

            <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
              <div className="text-[11px] text-slate-500">Kellonaika & Kesto</div>
              <div className="text-xs sm:text-sm font-semibold text-slate-900 dark:text-white">
                {startDate.toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit' })} - {endDate.toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit' })} ({Math.round(drive.durationSeconds / 60)} min)
              </div>
            </div>

            <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
              <div className="text-[11px] text-slate-500">Matka</div>
              <div className="text-xs sm:text-sm font-semibold text-slate-900 dark:text-white">
                {drive.distanceKm} km
              </div>
            </div>

            <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
              <div className="text-[11px] text-slate-500">Nopeus (keski / max)</div>
              <div className="text-xs sm:text-sm font-semibold text-slate-900 dark:text-white">
                {drive.avgSpeedKmH} / {drive.maxSpeedKmH} km/h
              </div>
            </div>
          </div>

          {/* Ympäristöjakauma */}
          <div>
            <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-400 mb-1.5 font-medium">
              <span>Ajoympäristön arvioitu jakauma:</span>
              <span className="text-[11px]">
                Maantie: {drive.environment.distribution.maantie}% • Taajama: {drive.environment.distribution.taajama}% • Kaupunki: {drive.environment.distribution.kaupunki}% • Pysäköinti: {drive.environment.distribution.pysakointi}%
              </span>
            </div>
            <div className="h-2.5 w-full bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden flex">
              <div 
                style={{ width: `${drive.environment.distribution.maantie}%` }} 
                className="bg-emerald-500 h-full" 
                title={`Maantie ${drive.environment.distribution.maantie}%`}
              />
              <div 
                style={{ width: `${drive.environment.distribution.taajama}%` }} 
                className="bg-blue-500 h-full" 
                title={`Taajama ${drive.environment.distribution.taajama}%`}
              />
              <div 
                style={{ width: `${drive.environment.distribution.kaupunki}%` }} 
                className="bg-amber-500 h-full" 
                title={`Kaupunki ${drive.environment.distribution.kaupunki}%`}
              />
              <div 
                style={{ width: `${drive.environment.distribution.pysakointi}%` }} 
                className="bg-purple-500 h-full" 
                title={`Pysäköinti ${drive.environment.distribution.pysakointi}%`}
              />
            </div>
          </div>

          {/* Ajotavan analyysi, OBD-kulutus ja Sanallinen palaute */}
          {(drive.drivingBehavior || drive.obdData) && (
            <div className="p-4 rounded-xl bg-linear-to-br from-indigo-50/70 to-blue-50/50 dark:from-indigo-950/40 dark:to-slate-850/60 border border-indigo-200/80 dark:border-indigo-800/60 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Sparkles className="w-4.5 h-4.5 text-indigo-600 dark:text-indigo-400" />
                  <h4 className="text-xs sm:text-sm font-bold text-indigo-950 dark:text-indigo-200">
                    Ajotapa-analyysi & Sanallinen raportti
                  </h4>
                </div>

                <div className="flex items-center space-x-1.5">
                  <button
                    type="button"
                    onClick={() => setShowShareModal(true)}
                    className="px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition cursor-pointer bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 shadow-xs"
                    title="Jaa ajotapakooste (PNG-kuva tai teksti)"
                  >
                    <Share2 className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                    <span>Jaa kooste</span>
                  </button>

                  {drive.drivingBehavior?.verbalReport && (
                    <button
                      type="button"
                      onClick={() => {
                        if (isSpeaking) {
                          stopSpeakingReport();
                          setIsSpeaking(false);
                        } else {
                          const ok = speakDrivingReport(drive.drivingBehavior!.verbalReport!);
                          if (ok) setIsSpeaking(true);
                        }
                      }}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition cursor-pointer ${
                        isSpeaking
                          ? 'bg-rose-600 text-white shadow-sm'
                          : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm'
                      }`}
                      title={isSpeaking ? 'Pysäytä puhe' : 'Kuuntele raportti ääneen'}
                    >
                      {isSpeaking ? (
                        <>
                          <VolumeX className="w-3.5 h-3.5" />
                          <span>Pysäytä</span>
                        </>
                      ) : (
                        <>
                          <Volume2 className="w-3.5 h-3.5" />
                          <span>Kuuntele</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>

              {/* Tunnusluvut */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs">
                {drive.drivingBehavior && (
                  <>
                    <div className="p-2 rounded-lg bg-white/80 dark:bg-slate-900/80 border border-indigo-100 dark:border-indigo-900/50">
                      <div className="text-[10px] text-slate-500">Tasaisuusindeksi</div>
                      <div className="text-sm font-bold text-slate-900 dark:text-white">
                        {drive.drivingBehavior.smoothnessScore}/100
                      </div>
                    </div>

                    <div className="p-2 rounded-lg bg-white/80 dark:bg-slate-900/80 border border-indigo-100 dark:border-indigo-900/50">
                      <div className="text-[10px] text-slate-500">Äkkijarrutukset</div>
                      <div className={`text-sm font-bold ${drive.drivingBehavior.hardBrakesCount > 0 ? 'text-rose-600' : 'text-slate-900 dark:text-white'}`}>
                        {drive.drivingBehavior.hardBrakesCount} kpl
                      </div>
                    </div>

                    <div className="p-2 rounded-lg bg-white/80 dark:bg-slate-900/80 border border-indigo-100 dark:border-indigo-900/50">
                      <div className="text-[10px] text-slate-500">Vauhdikkaat mutkat</div>
                      <div className={`text-sm font-bold ${drive.drivingBehavior.hardTurnsCount > 0 ? 'text-amber-600' : 'text-slate-900 dark:text-white'}`}>
                        {drive.drivingBehavior.hardTurnsCount} kpl
                      </div>
                    </div>

                    <div className="p-2 rounded-lg bg-white/80 dark:bg-slate-900/80 border border-indigo-100 dark:border-indigo-900/50">
                      <div className="text-[10px] text-slate-500">Sammumiset</div>
                      <div className={`text-sm font-bold ${drive.drivingBehavior.engineStallsCount > 0 ? 'text-purple-600' : 'text-slate-900 dark:text-white'}`}>
                        {drive.drivingBehavior.engineStallsCount} kpl
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* OBD-polttoainetieto */}
              {drive.obdData && drive.obdData.connected && (
                <div className="p-2.5 rounded-lg bg-emerald-50/80 dark:bg-emerald-950/40 border border-emerald-200/80 dark:border-emerald-800/60 flex items-center justify-between text-xs text-emerald-900 dark:text-emerald-200">
                  <div className="flex items-center space-x-1.5">
                    <Fuel className="w-3.5 h-3.5 text-emerald-600" />
                    <span className="font-medium">Polttoaineen keskikulutus:</span>
                    <strong>{drive.obdData.avgFuelConsumptionL100Km || '—'} l/100 km</strong>
                    {drive.obdData.avgFuelRateLitersPerHour !== undefined && (
                      <span className="text-[11px] text-emerald-700 dark:text-emerald-300">
                        (virtaus {drive.obdData.avgFuelRateLitersPerHour} L/h{drive.obdData.fuelRateSupported ? ' PID 5E' : ''})
                      </span>
                    )}
                  </div>
                  {drive.obdData.totalFuelUsedLiters !== undefined && (
                    <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
                      yht. {drive.obdData.totalFuelUsedLiters} L
                    </span>
                  )}
                </div>
              )}

              {/* Sanallinen tekstiraportti */}
              {drive.drivingBehavior?.verbalReport && (
                <div className="p-3 rounded-lg bg-white/90 dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-700/80 text-xs text-slate-700 dark:text-slate-200 leading-relaxed font-sans">
                  {drive.drivingBehavior.verbalReport}
                </div>
              )}
            </div>
          )}

          {/* Aiheet ja muistiinpanot */}
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Aiheet ja oppilaan harjoitukset:
              </label>
              <textarea
                value={notesText}
                onChange={(e) => setNotesText(e.target.value)}
                rows={2}
                placeholder="Aiheet (esim. peruutus, liittymät)..."
                className="w-full text-xs p-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-hidden"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Opettajan arvio ja huomiot:
              </label>
              <textarea
                value={teacherNotes}
                onChange={(e) => setTeacherNotes(e.target.value)}
                rows={2}
                placeholder="Opettajan palaute oppilaalle..."
                className="w-full text-xs p-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-hidden"
              />
            </div>

            <div className="flex items-center justify-between pt-1">
              {savedSuccess ? (
                <span className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center space-x-1 font-semibold">
                  <Check className="w-4 h-4" />
                  <span>Muutokset tallennettu!</span>
                </span>
              ) : <div />}

              <button
                type="button"
                onClick={handleSaveNotes}
                className="px-4 py-2 text-xs font-bold rounded-xl bg-blue-600 hover:bg-blue-500 text-white shadow-xs transition flex items-center space-x-1.5"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Tallenna muutokset</span>
              </button>
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-850/50 flex justify-between items-center">
          <button
            type="button"
            onClick={() => setShowShareModal(true)}
            className="px-3 py-1.5 text-xs font-semibold rounded-xl bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 transition flex items-center space-x-1.5 cursor-pointer"
          >
            <Share2 className="w-3.5 h-3.5" />
            <span>Jaa ajotapakooste (PNG)</span>
          </button>

          <button
            onClick={handleClose}
            className="px-4 py-2 text-xs sm:text-sm font-medium rounded-xl bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 hover:bg-slate-300 dark:hover:bg-slate-700 transition"
          >
            Sulje
          </button>
        </div>

      </div>

      {/* Jaettavan ajotapakoosteen modaali */}
      <DriveShareModal
        isOpen={showShareModal}
        onClose={() => setShowShareModal(false)}
        data={drive}
      />
    </div>
  );
};
