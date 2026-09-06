import React, { useEffect, useRef, useState } from 'react';
import { 
  X, 
  CheckCircle2, 
  Check
} from 'lucide-react';
import L from 'leaflet';
import type { DriveSession, AppUser } from '../types';
import { ENVIRONMENT_CONFIG } from '../services/environmentClassifier';
import { approveDriveSession } from '../services/db';

interface DriveMapModalProps {
  drive: DriveSession | null;
  currentUser: AppUser | null;
  onClose: () => void;
  onDriveUpdated?: () => void;
}

export const DriveMapModal: React.FC<DriveMapModalProps> = ({
  drive,
  currentUser,
  onClose,
  onDriveUpdated,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);

  const [isApproving, setIsApproving] = useState(false);
  const [feedbackText, setFeedbackText] = useState(drive?.teacherFeedback || '');
  const [approvedLocal, setApprovedLocal] = useState(drive?.approvedByTeacher || false);

  const isAdmin = currentUser?.role === 'admin';

  useEffect(() => {
    if (!drive || !mapContainerRef.current) return;

    // Alustetaan kartta
    const map = L.map(mapContainerRef.current, {
      zoomControl: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
      maxZoom: 19,
    }).addTo(map);

    if (drive.routePoints && drive.routePoints.length > 0) {
      const latLngs = drive.routePoints.map((p) => [p.lat, p.lng] as [number, number]);

      // Reittiviiva
      const polyline = L.polyline(latLngs, {
        color: '#2563eb',
        weight: 5,
        opacity: 0.85,
        lineJoin: 'round',
      }).addTo(map);

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

      // Sovitetaan kartta reittiin
      map.fitBounds(polyline.getBounds(), { padding: [30, 30] });
    } else {
      map.setView([60.1699, 24.9384], 13);
    }

    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, [drive]);

  const handleApprove = async () => {
    if (!drive || !currentUser) return;
    setIsApproving(true);
    try {
      await approveDriveSession(drive.id, currentUser, feedbackText);
      setApprovedLocal(true);
      if (onDriveUpdated) onDriveUpdated();
    } catch (e) {
      console.error(e);
      alert('Kuittaus epäonnistui.');
    } finally {
      setIsApproving(false);
    }
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
              Oppilas: <strong>{drive.studentName}</strong> ({drive.studentEmail})
            </p>
          </div>

          <button
            onClick={onClose}
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

          {/* Aiheet ja muistiinpanot */}
          {drive.notes && (
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-800 text-xs">
              <span className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                Oppilaan muistiinpanot / Aiheet:
              </span>
              <p className="text-slate-600 dark:text-slate-400 whitespace-pre-wrap">
                {drive.notes}
              </p>
            </div>
          )}

          {/* Opettajan kuittaus ja palaute */}
          <div className={`p-4 rounded-xl border ${
            approvedLocal 
              ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800' 
              : 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800'
          }`}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center space-x-2">
                <CheckCircle2 className={`w-5 h-5 ${approvedLocal ? 'text-emerald-600' : 'text-amber-500'}`} />
                <span className="font-semibold text-xs sm:text-sm text-slate-900 dark:text-white">
                  {approvedLocal ? 'Opettaja on kuitannut ajokerran hyväksytyksi' : 'Odottaa opettajan kuittausta'}
                </span>
              </div>
              {drive.approvedByEmail && (
                <span className="text-[11px] text-slate-500">
                  Kuitannut: {drive.approvedByEmail}
                </span>
              )}
            </div>

            {/* Jos katselija on opettaja/admin ja ajo ei vielä hyväksytty */}
            {isAdmin && !approvedLocal ? (
              <div className="mt-3 space-y-2">
                <input
                  type="text"
                  value={feedbackText}
                  onChange={(e) => setFeedbackText(e.target.value)}
                  placeholder="Kirjoita opettajan palaute oppilaalle (valinnainen)..."
                  className="w-full text-xs p-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-hidden"
                />
                <button
                  onClick={handleApprove}
                  disabled={isApproving}
                  className="px-4 py-2 text-xs font-bold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white shadow-xs transition flex items-center space-x-1.5"
                >
                  <Check className="w-4 h-4" />
                  <span>{isApproving ? 'Kuitataan...' : 'Kuittaa ajo hyväksytyksi'}</span>
                </button>
              </div>
            ) : (
              drive.teacherFeedback && (
                <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 italic">
                  "{drive.teacherFeedback}"
                </p>
              )
            )}
          </div>

        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-850/50 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs sm:text-sm font-medium rounded-xl bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 hover:bg-slate-300 dark:hover:bg-slate-700 transition"
          >
            Sulje
          </button>
        </div>

      </div>
    </div>
  );
};
