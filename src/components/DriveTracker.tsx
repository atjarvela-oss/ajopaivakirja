import React, { useState, useEffect, useRef } from 'react';
import { 
  Play, 
  Square, 
  Navigation, 
  Gauge, 
  Timer, 
  MapPin, 
  Sparkles, 
  Radio, 
  Save, 
  X
} from 'lucide-react';
import L from 'leaflet';
import type { GeoPoint, DriveSession, EnvironmentType, DriveEnvironment } from '../types';
import { classifyEnvironment, calculateDistanceKm, ENVIRONMENT_CONFIG } from '../services/environmentClassifier';
import { saveLocalDrive } from '../services/localDb';

interface DriveTrackerProps {
  onDriveSaved: (drive: DriveSession) => void;
  onOpenManualEntry: () => void;
}

export const DriveTracker: React.FC<DriveTrackerProps> = ({
  onDriveSaved,
  onOpenManualEntry,
}) => {
  const [isDriving, setIsDriving] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);
  const [startTime, setStartTime] = useState<Date | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [currentSpeed, setCurrentSpeed] = useState<number>(0);
  const [maxSpeed, setMaxSpeed] = useState<number>(0);
  const [totalDistanceKm, setTotalDistanceKm] = useState<number>(0);
  const [gpsAccuracy, setGpsAccuracy] = useState<number | null>(null);
  const [routePoints, setRoutePoints] = useState<GeoPoint[]>([]);
  const [liveEnvironment, setLiveEnvironment] = useState<DriveEnvironment>({
    primary: 'taajama',
    distribution: { maantie: 0, taajama: 100, kaupunki: 0, pysakointi: 0 },
  });

  // Tallennusmodalin tila ajon päätyttyä
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saveNotes, setSaveNotes] = useState('');
  const [selectedEnvOverride, setSelectedEnvOverride] = useState<EnvironmentType>('taajama');
  const [finalDriveData, setFinalDriveData] = useState<{
    startTime: Date;
    endTime: Date;
    durationSeconds: number;
    distanceKm: number;
    avgSpeed: number;
    maxSpeed: number;
    points: GeoPoint[];
    environment: DriveEnvironment;
  } | null>(null);

  // Karttaviitteet
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const polylineRef = useRef<L.Polyline | null>(null);
  const currentMarkerRef = useRef<L.CircleMarker | null>(null);

  // Seurantaintervallit ja watchPosition id
  const timerIntervalRef = useRef<any>(null);
  const watchIdRef = useRef<number | null>(null);
  const simulationIntervalRef = useRef<any>(null);

  // Alustetaan Leaflet-kartta
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const defaultCenter: [number, number] = [60.1699, 24.9384]; // Helsinki
      const map = L.map(mapContainerRef.current, {
        center: defaultCenter,
        zoom: 14,
        zoomControl: false,
      });

      L.control.zoom({ position: 'bottomright' }).addTo(map);

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap',
        maxZoom: 19,
      }).addTo(map);

      const polyline = L.polyline([], {
        color: '#2563eb',
        weight: 5,
        opacity: 0.85,
        lineJoin: 'round',
      }).addTo(map);

      const marker = L.circleMarker(defaultCenter, {
        radius: 8,
        fillColor: '#2563eb',
        color: '#ffffff',
        weight: 3,
        opacity: 1,
        fillOpacity: 1,
      }).addTo(map);

      mapInstanceRef.current = map;
      polylineRef.current = polyline;
      currentMarkerRef.current = marker;
    }

    return () => {
      // Clean up map when component unmounts
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Päivitetään kartan reitti ja sijainti
  useEffect(() => {
    if (!mapInstanceRef.current || routePoints.length === 0) return;

    const latLngs = routePoints.map((p) => [p.lat, p.lng] as [number, number]);
    const latest = latLngs[latLngs.length - 1];

    if (polylineRef.current) {
      polylineRef.current.setLatLngs(latLngs);
    }

    if (currentMarkerRef.current) {
      currentMarkerRef.current.setLatLng(latest);
    }

    // Keskitetään kartta viimeisimpään pisteeseen
    mapInstanceRef.current.panTo(latest, { animate: true, duration: 0.5 });
  }, [routePoints]);

  // Päivitetään ajoympäristön arvio reaaliajassa ajon aikana
  useEffect(() => {
    if (isDriving && routePoints.length >= 2) {
      const result = classifyEnvironment(routePoints, elapsedSeconds);
      setLiveEnvironment(result);
    }
  }, [routePoints, elapsedSeconds, isDriving]);

  // Sekuntikello
  useEffect(() => {
    if (isDriving) {
      timerIntervalRef.current = setInterval(() => {
        setElapsedSeconds((prev) => prev + 1);
      }, 1000);
    } else {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    }
    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, [isDriving]);

  // Käynnistä ajo oikealla GPS:llä
  const startRealDrive = () => {
    if (!navigator.geolocation) {
      alert('Selaimesi ei tue GPS-sijaintia.');
      return;
    }

    const now = new Date();
    setStartTime(now);
    setElapsedSeconds(0);
    setCurrentSpeed(0);
    setMaxSpeed(0);
    setTotalDistanceKm(0);
    setRoutePoints([]);
    setIsSimulating(false);
    setIsDriving(true);

    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const speedKmh = pos.coords.speed !== null ? Math.round(pos.coords.speed * 3.6) : null;
        const accuracy = Math.round(pos.coords.accuracy);

        setGpsAccuracy(accuracy);

        // Suodatetaan epätarkat GPS-hyppäykset
        if (accuracy > 35) return;

        const newPoint: GeoPoint = {
          lat,
          lng,
          timestamp: pos.timestamp || Date.now(),
          speed: speedKmh,
          accuracy,
        };

        setRoutePoints((prev) => {
          if (prev.length > 0) {
            const last = prev[prev.length - 1];
            const dist = calculateDistanceKm(last.lat, last.lng, lat, lng);
            // Vain jos siirrytty yli 3 metriä
            if (dist > 0.003) {
              setTotalDistanceKm((d) => Number((d + dist).toFixed(2)));
              const spd = speedKmh !== null ? speedKmh : Math.round(dist / ((newPoint.timestamp - last.timestamp) / 3600000));
              setCurrentSpeed(spd);
              setMaxSpeed((m) => Math.max(m, spd));
              return [...prev, newPoint];
            }
            return prev;
          } else {
            return [newPoint];
          }
        });
      },
      (err) => {
        console.warn('GPS-virhe:', err);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 1000,
      }
    );

    watchIdRef.current = id;
  };

  // Käynnistä ajo simulaatiolla (Työpöytä- / esittelytestaus)
  const startSimulatedDrive = () => {
    const now = new Date();
    setStartTime(now);
    setElapsedSeconds(0);
    setCurrentSpeed(0);
    setMaxSpeed(0);
    setTotalDistanceKm(0);
    setRoutePoints([]);
    setIsSimulating(true);
    setIsDriving(true);
    setGpsAccuracy(5);

    // Esimerkkireitti: Parkkipaikka -> Keskusta -> Taajama -> Tuusulanväylä (Maantie)
    const baseLat = 60.1700;
    const baseLng = 24.9400;
    let step = 0;
    let currentDistance = 0;

    simulationIntervalRef.current = setInterval(() => {
      step++;
      let speed = 8; // km/h (pysäköinti)
      let dLat = 0.0001;
      let dLng = 0.0001;

      if (step <= 5) {
        // Pysäköintialue: hidas ryömintä ja suunnanmuutokset
        speed = 6 + Math.sin(step) * 4;
        dLat = Math.sin(step) * 0.0002;
        dLng = Math.cos(step) * 0.0002;
      } else if (step <= 15) {
        // Kaupunkiajo: 20-35 km/h, liikennevalopysähdys stepissä 10
        speed = step === 10 ? 0 : 25 + Math.sin(step) * 10;
        dLat = 0.0004;
        dLng = 0.0002;
      } else if (step <= 25) {
        // Taajama: 45-55 km/h
        speed = 50 + Math.sin(step) * 5;
        dLat = 0.0008;
        dLng = 0.0004;
      } else {
        // Maantie: 85-100 km/h
        speed = 90 + Math.sin(step) * 10;
        dLat = 0.0015;
        dLng = 0.0008;
      }

      const pointLat = baseLat + dLat * step;
      const pointLng = baseLng + dLng * step;
      const distStep = (speed / 3600) * 2; // 2 sekunnin edistymä
      currentDistance += distStep;

      setCurrentSpeed(Math.round(speed));
      setMaxSpeed((m) => Math.max(m, Math.round(speed)));
      setTotalDistanceKm(Number(currentDistance.toFixed(2)));

      setRoutePoints((prev) => [
        ...prev,
        {
          lat: pointLat,
          lng: pointLng,
          timestamp: Date.now(),
          speed: Math.round(speed),
          accuracy: 5,
        },
      ]);
    }, 2000);
  };

  // Lopeta ajo ja avaa koontitiedot tallennusta varten
  const stopDrive = () => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (simulationIntervalRef.current) {
      clearInterval(simulationIntervalRef.current);
      simulationIntervalRef.current = null;
    }

    setIsDriving(false);
    setIsSimulating(false);

    const endTime = new Date();
    const duration = Math.max(1, elapsedSeconds);
    const avgSpeed = duration > 0 ? Number(((totalDistanceKm / (duration / 3600))).toFixed(1)) : 0;
    
    // Lopullinen analyysi ajoympäristöstä
    const finalEnv = classifyEnvironment(routePoints, duration);
    setSelectedEnvOverride(finalEnv.primary);

    setFinalDriveData({
      startTime: startTime || new Date(Date.now() - duration * 1000),
      endTime,
      durationSeconds: duration,
      distanceKm: totalDistanceKm,
      avgSpeed: isNaN(avgSpeed) ? 0 : avgSpeed,
      maxSpeed,
      points: routePoints,
      environment: finalEnv,
    });

    setShowSaveModal(true);
  };

  // Tallennetaan ajokerta
  const handleConfirmSave = async () => {
    if (!finalDriveData) return;

    const newDrive: DriveSession = {
      id: 'drive-' + Date.now(),
      startTime: finalDriveData.startTime.toISOString(),
      endTime: finalDriveData.endTime.toISOString(),
      durationSeconds: finalDriveData.durationSeconds,
      distanceKm: finalDriveData.distanceKm,
      avgSpeedKmH: finalDriveData.avgSpeed,
      maxSpeedKmH: finalDriveData.maxSpeed,
      environment: {
        primary: selectedEnvOverride,
        distribution: finalDriveData.environment.distribution,
        manualOverride: selectedEnvOverride !== finalDriveData.environment.primary,
      },
      routePoints: finalDriveData.points,
      notes: saveNotes,
      studentName: 'Opetuslupaoppilas',
      createdAt: new Date().toISOString(),
    };

    saveLocalDrive(newDrive);
    onDriveSaved(newDrive);
    setShowSaveModal(false);
    setSaveNotes('');
    setRoutePoints([]);
    setTotalDistanceKm(0);
    setElapsedSeconds(0);
  };

  // Muotoillaan sekunnit tunneiksi ja minuuteiksi
  const formatTime = (totalSec: number) => {
    const hours = Math.floor(totalSec / 3600);
    const minutes = Math.floor((totalSec % 3600) / 60);
    const seconds = totalSec % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  const currentEnvInfo = ENVIRONMENT_CONFIG[liveEnvironment.primary];

  return (
    <div className="space-y-4">
      {/* Ajotilan Pääpaneeli */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-md border border-slate-200 dark:border-slate-800 overflow-hidden">
        
        {/* Yläpalkki: Tila ja Painikkeet */}
        <div className="p-4 sm:p-6 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <div className={`p-3 rounded-xl flex items-center justify-center ${
              isDriving 
                ? 'bg-rose-100 dark:bg-rose-950/60 text-rose-600 animate-pulse' 
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
            }`}>
              <Navigation className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                  {isDriving ? (isSimulating ? 'Ajoseuranta käynnissä (Simulaatio)' : 'Ajoseuranta käynnissä') : 'Valmiina ajoon'}
                </h2>
                {isDriving && (
                  <span className="flex h-2.5 w-2.5 relative">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-500"></span>
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {isDriving ? 'GPS tallentaa reittiä, nopeutta ja ajoympäristöä' : 'Käynnistä seuranta aloittaessasi ajotunnin'}
              </p>
            </div>
          </div>

          {/* Toimintopainikkeet */}
          <div className="flex flex-wrap items-center gap-2">
            {!isDriving ? (
              <>
                <button
                  onClick={onOpenManualEntry}
                  className="px-3 py-2 text-xs sm:text-sm font-medium rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 transition"
                >
                  Lisää ajo manuaalisesti
                </button>

                <button
                  onClick={startSimulatedDrive}
                  className="px-3 py-2 text-xs sm:text-sm font-medium rounded-xl bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 border border-indigo-200 dark:border-indigo-800 transition flex items-center space-x-1.5"
                  title="Testaa seurantaa ja ajoympäristön arviointia työpöydällä"
                >
                  <Sparkles className="w-4 h-4 text-indigo-500" />
                  <span>Simuloi ajo</span>
                </button>

                <button
                  onClick={startRealDrive}
                  className="px-5 py-2.5 text-sm font-bold rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-600/20 active:scale-95 transition flex items-center space-x-2"
                >
                  <Play className="w-4 h-4 fill-white" />
                  <span>Aloita ajo (GPS)</span>
                </button>
              </>
            ) : (
              <button
                onClick={stopDrive}
                className="px-6 py-2.5 text-sm font-bold rounded-xl bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-600/30 active:scale-95 transition flex items-center space-x-2 animate-bounce-subtle"
              >
                <Square className="w-4 h-4 fill-white" />
                <span>Päätä ajo & Tallenna</span>
              </button>
            )}
          </div>
        </div>

        {/* Telemetria ja Mittarit (Ajon aikana) */}
        <div className="p-4 sm:p-6 bg-slate-50/70 dark:bg-slate-850/50 border-b border-slate-100 dark:border-slate-800">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
            
            {/* Kesto */}
            <div className="p-3.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 shadow-xs">
              <div className="flex items-center space-x-1.5 text-slate-500 dark:text-slate-400 text-xs mb-1">
                <Timer className="w-3.5 h-3.5 text-blue-500" />
                <span>Ajoaika</span>
              </div>
              <div className="text-xl sm:text-2xl font-bold font-mono text-slate-900 dark:text-white">
                {formatTime(elapsedSeconds)}
              </div>
            </div>

            {/* Matka */}
            <div className="p-3.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 shadow-xs">
              <div className="flex items-center space-x-1.5 text-slate-500 dark:text-slate-400 text-xs mb-1">
                <MapPin className="w-3.5 h-3.5 text-emerald-500" />
                <span>Matka</span>
              </div>
              <div className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
                {totalDistanceKm} <span className="text-xs font-normal text-slate-500">km</span>
              </div>
            </div>

            {/* Hetkellinen Nopeus */}
            <div className="p-3.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 shadow-xs">
              <div className="flex items-center space-x-1.5 text-slate-500 dark:text-slate-400 text-xs mb-1">
                <Gauge className="w-3.5 h-3.5 text-amber-500" />
                <span>Nopeus</span>
              </div>
              <div className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white flex items-baseline space-x-1">
                <span>{currentSpeed}</span>
                <span className="text-xs font-normal text-slate-500">km/h</span>
                {maxSpeed > 0 && (
                  <span className="text-[10px] text-slate-400 ml-auto hidden sm:inline">
                    max {maxSpeed}
                  </span>
                )}
              </div>
            </div>

            {/* Sovelluksen Arvio Ajoympäristöstä */}
            <div className="p-3.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 shadow-xs">
              <div className="flex items-center space-x-1.5 text-slate-500 dark:text-slate-400 text-xs mb-1">
                <Sparkles className="w-3.5 h-3.5 text-purple-500" />
                <span>Arvioitu ympäristö</span>
              </div>
              <div className="flex items-center space-x-1.5">
                <span className={`text-xs px-2.5 py-1 rounded-lg font-semibold border ${currentEnvInfo.badgeClass}`}>
                  {currentEnvInfo.label.split(' / ')[0]}
                </span>
              </div>
            </div>

          </div>

          {/* Ympäristöjakaumapalkki ajon aikana */}
          {isDriving && routePoints.length > 2 && (
            <div className="mt-4 pt-3 border-t border-slate-200/60 dark:border-slate-700/60">
              <div className="flex items-center justify-between text-xs text-slate-500 mb-1.5">
                <span className="font-medium text-slate-700 dark:text-slate-300">
                  Sovelluksen analyysi ajoympäristöstä:
                </span>
                <span className="text-[11px]">
                  Maantie {liveEnvironment.distribution.maantie}% • Taajama {liveEnvironment.distribution.taajama}% • Kaupunki {liveEnvironment.distribution.kaupunki}% • Pysäköinti {liveEnvironment.distribution.pysakointi}%
                </span>
              </div>
              <div className="h-2 w-full bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden flex">
                <div 
                  style={{ width: `${liveEnvironment.distribution.maantie}%` }} 
                  className="bg-emerald-500 h-full transition-all duration-500" 
                  title={`Maantie: ${liveEnvironment.distribution.maantie}%`}
                />
                <div 
                  style={{ width: `${liveEnvironment.distribution.taajama}%` }} 
                  className="bg-blue-500 h-full transition-all duration-500" 
                  title={`Taajama: ${liveEnvironment.distribution.taajama}%`}
                />
                <div 
                  style={{ width: `${liveEnvironment.distribution.kaupunki}%` }} 
                  className="bg-amber-500 h-full transition-all duration-500" 
                  title={`Kaupunki: ${liveEnvironment.distribution.kaupunki}%`}
                />
                <div 
                  style={{ width: `${liveEnvironment.distribution.pysakointi}%` }} 
                  className="bg-purple-500 h-full transition-all duration-500" 
                  title={`Pysäköinti: ${liveEnvironment.distribution.pysakointi}%`}
                />
              </div>
            </div>
          )}
        </div>

        {/* Karttanäkymä */}
        <div className="relative h-64 sm:h-80 w-full bg-slate-100 dark:bg-slate-800">
          <div ref={mapContainerRef} className="w-full h-full" />

          {/* Kartan päällä oleva GPS-tarkkuustila */}
          {isDriving && (
            <div className="absolute top-3 left-3 z-20 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xs px-3 py-1.5 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 text-xs flex items-center space-x-2">
              <Radio className="w-3.5 h-3.5 text-emerald-500 animate-pulse" />
              <span className="text-slate-700 dark:text-slate-300">
                Pisteitä: <strong>{routePoints.length}</strong>
              </span>
              {gpsAccuracy !== null && (
                <span className="text-slate-400">
                  (Tarkkuus: ±{gpsAccuracy}m)
                </span>
              )}
            </div>
          )}
        </div>

      </div>

      {/* Tallennusmodali ajon päätyttyä */}
      {showSaveModal && finalDriveData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col">
            
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center space-x-2">
                <Save className="w-5 h-5 text-emerald-600" />
                <span>Tallenna ajokerta</span>
              </h3>
              <button
                onClick={() => setShowSaveModal(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 overflow-y-auto max-h-[80vh]">
              
              {/* Yhteenvetolaatikko */}
              <div className="grid grid-cols-3 gap-2 p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-center">
                <div>
                  <div className="text-[11px] text-slate-500">Kesto</div>
                  <div className="text-base font-bold text-slate-900 dark:text-white">
                    {Math.round(finalDriveData.durationSeconds / 60)} min
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-500">Matka</div>
                  <div className="text-base font-bold text-slate-900 dark:text-white">
                    {finalDriveData.distanceKm} km
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-500">Keskinopeus</div>
                  <div className="text-base font-bold text-slate-900 dark:text-white">
                    {finalDriveData.avgSpeed} km/h
                  </div>
                </div>
              </div>

              {/* Automaattinen arvio & valinta */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Sovelluksen arvio ajoympäristöstä (voit tarvittaessa vaihtaa):
                </label>
                
                <div className="grid grid-cols-2 gap-2">
                  {(Object.keys(ENVIRONMENT_CONFIG) as EnvironmentType[]).map((envKey) => {
                    const cfg = ENVIRONMENT_CONFIG[envKey];
                    const isSelected = selectedEnvOverride === envKey;
                    const isRecommended = finalDriveData.environment.primary === envKey;
                    const percent = finalDriveData.environment.distribution[envKey];

                    return (
                      <button
                        key={envKey}
                        type="button"
                        onClick={() => setSelectedEnvOverride(envKey)}
                        className={`p-3 rounded-xl border text-left transition flex flex-col justify-between ${
                          isSelected
                            ? 'border-indigo-600 bg-indigo-50/60 dark:bg-indigo-950/40 ring-2 ring-indigo-500/20'
                            : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                        }`}
                      >
                        <div className="flex items-center justify-between w-full mb-1">
                          <span className="font-semibold text-xs text-slate-900 dark:text-white">
                            {cfg.label.split(' / ')[0]}
                          </span>
                          {isRecommended && (
                            <span className="text-[10px] bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 px-1.5 py-0.2 rounded font-medium">
                              Arvio
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                          {percent}% ajasta
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Muistiinpanot ja aiheet */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Aiheet ja muistiinpanot (opetuslupaa varten):
                </label>
                <textarea
                  value={saveNotes}
                  onChange={(e) => setSaveNotes(e.target.value)}
                  placeholder="Esim. Liittymät, taskupysäköinti, kiertoliittymät, pimeän ajo..."
                  rows={3}
                  className="w-full text-xs sm:text-sm p-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-hidden"
                />
              </div>

            </div>

            <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-850/50 flex justify-end space-x-2">
              <button
                type="button"
                onClick={() => setShowSaveModal(false)}
                className="px-4 py-2 text-xs sm:text-sm font-medium rounded-xl text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              >
                Peruuta
              </button>
              <button
                type="button"
                onClick={handleConfirmSave}
                className="px-5 py-2 text-xs sm:text-sm font-bold rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-600/20 transition"
              >
                Tallenna ajopäiväkirjaan
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  );
};
