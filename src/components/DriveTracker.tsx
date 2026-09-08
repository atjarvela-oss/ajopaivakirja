import React, { useState, useEffect, useRef } from 'react';
import { 
  Play, 
  Square, 
  Navigation, 
  Gauge, 
  Timer, 
  MapPin, 
  Sparkles,
  CloudUpload, 
  Radio, 
  Save, 
  X,
  Pause,
  PauseCircle
} from 'lucide-react';
import L from 'leaflet';
import type { GeoPoint, DriveSession, EnvironmentType, DriveEnvironment, TraficomTopicCode } from '../types';
import { classifyEnvironment, calculateDistanceKm, ENVIRONMENT_CONFIG, mapEnvironmentToTraficomCode, TRAFICOM_TOPIC_CONFIG } from '../services/environmentClassifier';
import { saveLocalDrive } from '../services/localDb';
import { startLocationWatcher, stopLocationWatcher, acquireWakeLock, releaseWakeLock } from '../services/trackingService';

interface DriveTrackerProps {
  onDriveSaved: (drive: DriveSession) => void;
  onOpenManualEntry: () => void;
  onDrivingStatusChange?: (isDriving: boolean, isPaused?: boolean) => void;
  isActiveTab?: boolean;
}

export const DriveTracker: React.FC<DriveTrackerProps> = ({
  onDriveSaved,
  onOpenManualEntry,
  onDrivingStatusChange,
  isActiveTab = true,
}) => {
  const [isDriving, setIsDriving] = useState(false);
  const [isPaused, setIsPaused] = useState(false);

  // Viitteet sulkeumien (closure) ajantasaisuuden varmistamiseksi taustapaikannuksessa ja ajastimissa
  const isPausedRef = useRef(false);
  const totalPausedMsRef = useRef(0);
  const pauseStartTimeRef = useRef<number | null>(null);

  useEffect(() => {
    onDrivingStatusChange?.(isDriving, isPaused);
  }, [isDriving, isPaused, onDrivingStatusChange]);
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
  const [selectedTopicCode, setSelectedTopicCode] = useState<TraficomTopicCode>('A');
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

  // Seurantaintervalli
  const timerIntervalRef = useRef<any>(null);

  // Alustetaan Leaflet-kartta
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const defaultCenter: [number, number] = [60.1699, 24.9384]; // Helsinki
      const map = L.map(mapContainerRef.current, {
        center: defaultCenter,
        zoom: 15,
        zoomControl: false,
      });

      L.control.zoom({ position: 'bottomright' }).addTo(map);

      // Käytetään erittäin nopeaa ja luotettavaa CartoDB Voyager -karttapalvelua käyttäjän API-avaimella
      L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png?key=cb1_2zol_1_eeae5b3125b861ead072afd6', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 20,
        crossOrigin: true,
        keepBuffer: 6,
        updateWhenIdle: false,
        updateWhenZooming: true,
      }).addTo(map);

      const polyline = L.polyline([], {
        color: '#2563eb',
        weight: 6,
        opacity: 0.9,
        lineJoin: 'round',
        lineCap: 'round',
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

      // Yritetään keskittää kartta käyttäjän nykyiseen sijaintiin heti avattaessa
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const userLoc: [number, number] = [pos.coords.latitude, pos.coords.longitude];
            map.setView(userLoc, 15);
            marker.setLatLng(userLoc);
            map.invalidateSize();
          },
          (err) => {
            console.warn('Alkusijaintia ei saatu:', err);
          },
          { timeout: 8000, maximumAge: 60000 }
        );
      }

      // Varmistetaan karttaruutujen täysi lataus alkulatauksessa
      map.whenReady(() => {
        setTimeout(() => map.invalidateSize(), 100);
        setTimeout(() => map.invalidateSize(), 400);
      });
    }

    return () => {
      // Clean up map when component unmounts
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // ResizeObserver: Päivittää kartan mitat välittömästi aina kun elementin koko muuttuu
  useEffect(() => {
    if (!mapContainerRef.current) return;
    const observer = new ResizeObserver(() => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.invalidateSize();
      }
    });
    observer.observe(mapContainerRef.current);
    return () => observer.disconnect();
  }, []);

  // Päivitetään kartan koko aina kun välilehti aktivoituu
  useEffect(() => {
    if (isActiveTab && mapInstanceRef.current) {
      const t1 = setTimeout(() => mapInstanceRef.current?.invalidateSize(), 60);
      const t2 = setTimeout(() => mapInstanceRef.current?.invalidateSize(), 250);
      const t3 = setTimeout(() => mapInstanceRef.current?.invalidateSize(), 600);
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
        clearTimeout(t3);
      };
    }
  }, [isActiveTab]);

  // Päivitetään kartan koko kun ajotila muuttuu tai tilastopalkit ilmestyvät
  useEffect(() => {
    if (mapInstanceRef.current) {
      const timer = setTimeout(() => {
        mapInstanceRef.current?.invalidateSize();
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [isDriving, isPaused]);

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

  // Päivitetään ajoympäristön arvio reaaliajassa ajon aikana (vain kun ajo ei ole tauolla)
  useEffect(() => {
    if (isDriving && !isPaused && routePoints.length >= 2) {
      const result = classifyEnvironment(routePoints, elapsedSeconds);
      setLiveEnvironment(result);
    }
  }, [routePoints, elapsedSeconds, isDriving, isPaused]);

  // Sekuntikello — lasketaan todellisesta alkuajasta vähentäen kertyneet tauot.
  // Näin kello pysyy tarkasti oikeassa myös lepotilassa eikä laske taukoja ajoajaksi.
  useEffect(() => {
    if (isDriving && !isPaused && startTime) {
      timerIntervalRef.current = setInterval(() => {
        const activeSeconds = Math.floor((Date.now() - startTime.getTime() - totalPausedMsRef.current) / 1000);
        setElapsedSeconds(Math.max(0, activeSeconds));
      }, 1000);
    } else {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    }
    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, [isDriving, isPaused, startTime]);

  // Käynnistä ajo oikealla GPS:llä
  const startRealDrive = async () => {
    const now = new Date();
    setStartTime(now);
    setElapsedSeconds(0);
    setCurrentSpeed(0);
    setMaxSpeed(0);
    setTotalDistanceKm(0);
    setRoutePoints([]);
    setIsDriving(true);
    setIsPaused(false);
    isPausedRef.current = false;
    pauseStartTimeRef.current = null;
    totalPausedMsRef.current = 0;

    // Pidä näyttö päällä koko ajon ajan (jos käyttäjä ei ole poistunut käytöstä asetuksista)
    const keepAwakePref = localStorage.getItem('opetuslupa_keep_awake');
    if (keepAwakePref !== 'false') {
      await acquireWakeLock();
    }

    // Käynnistä taustapaikannus (Foreground Service Androidilla)
    await startLocationWatcher(
      (point) => {
        setGpsAccuracy(point.accuracy ?? null);

        // Jos ajo on tauolla, älä kerrytä matkaa tai reittiä, mutta päivitä nykyinen sijaintimerkki kartalla
        if (isPausedRef.current) {
          if (currentMarkerRef.current) {
            currentMarkerRef.current.setLatLng([point.lat, point.lng]);
          }
          return;
        }

        // Suodatetaan epätarkat GPS-hyppäykset
        if ((point.accuracy ?? 0) > 35) return;

        setRoutePoints((prev) => {
          if (prev.length > 0) {
            const last = prev[prev.length - 1];
            const dist = calculateDistanceKm(last.lat, last.lng, point.lat, point.lng);
            // Vain jos siirrytty yli 3 metriä
            if (dist > 0.003) {
              setTotalDistanceKm((d) => Number((d + dist).toFixed(2)));
              const spd = point.speed !== null
                ? point.speed
                : Math.round(dist / ((point.timestamp - last.timestamp) / 3600000));
              setCurrentSpeed(spd);
              setMaxSpeed((m) => Math.max(m, spd));
              return [...prev, point];
            }
            return prev;
          } else {
            return [point];
          }
        });
      },
      (errCode) => {
        console.warn('GPS-virhe:', errCode);
      },
    );
  };

  // Aseta ajo tauolle
  const pauseDrive = () => {
    if (!isDriving || isPaused) return;
    const now = Date.now();
    setIsPaused(true);
    isPausedRef.current = true;
    pauseStartTimeRef.current = now;
    setCurrentSpeed(0);
  };

  // Jatka ajoa tauon jälkeen
  const resumeDrive = () => {
    if (!isDriving || !isPaused) return;
    if (pauseStartTimeRef.current) {
      const segmentMs = Date.now() - pauseStartTimeRef.current;
      totalPausedMsRef.current += segmentMs;
      pauseStartTimeRef.current = null;
    }
    setIsPaused(false);
    isPausedRef.current = false;
  };

  // Lopeta ajo ja avaa koontitiedot tallennusta varten
  const stopDrive = async () => {
    // Pysäytä taustapaikannus ja salli näytön sammuminen
    await stopLocationWatcher();
    await releaseWakeLock();

    // Huomioidaan mahdollinen aktiivinen taukojakso
    let allPausedMs = totalPausedMsRef.current;
    if (isPausedRef.current && pauseStartTimeRef.current) {
      allPausedMs += Date.now() - pauseStartTimeRef.current;
    }

    setIsDriving(false);
    setIsPaused(false);
    isPausedRef.current = false;
    pauseStartTimeRef.current = null;
    totalPausedMsRef.current = 0;

    const endTime = new Date();
    // Käytetään todellista seinäkelloaikaa vähennettynä taukoajoilla,
    // jotta kesto on tarkka myös lepotilassa eikä sisällä taukoaikaa.
    const realDurationSeconds = startTime
      ? Math.floor((endTime.getTime() - startTime.getTime() - allPausedMs) / 1000)
      : elapsedSeconds;
    const duration = Math.max(1, realDurationSeconds);
    const avgSpeed = duration > 0 ? Number(((totalDistanceKm / (duration / 3600))).toFixed(1)) : 0;
    
    // Lopullinen analyysi ajoympäristöstä
    const finalEnv = classifyEnvironment(routePoints, duration);
    setSelectedEnvOverride(finalEnv.primary);
    setSelectedTopicCode(mapEnvironmentToTraficomCode(finalEnv.primary));

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
      topicCode: selectedTopicCode,
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
            <div className={`p-3 rounded-xl flex items-center justify-center transition-colors ${
              !isDriving 
                ? 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                : isPaused
                ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400'
                : 'bg-rose-100 dark:bg-rose-950/60 text-rose-600 animate-pulse'
            }`}>
              {isPaused ? (
                <Pause className="w-6 h-6" />
              ) : (
                <Navigation className="w-6 h-6" />
              )}
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                  {!isDriving 
                    ? 'Valmiina ajoon'
                    : isPaused
                    ? 'Ajo tauolla'
                    : 'Ajoseuranta käynnissä'}
                </h2>
                {isDriving && (
                  <span className="flex h-2.5 w-2.5 relative">
                    {isPaused ? (
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500"></span>
                    ) : (
                      <>
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-500"></span>
                      </>
                    )}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {!isDriving
                  ? 'Käynnistä seuranta aloittaessasi ajotunnin'
                  : isPaused
                  ? 'Ajo on keskeytetty – aika ja matka eivät kerry'
                  : 'GPS tallentaa reittiä, nopeutta ja ajoympäristöä'}
              </p>
            </div>
          </div>

          {/* Toimintopainikkeet */}
          <div className="flex flex-wrap items-center gap-2">
            {!isDriving ? (
              <>
                <button
                  onClick={onOpenManualEntry}
                  className="px-3 py-2 text-xs sm:text-sm font-medium rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 transition cursor-pointer"
                >
                  Lisää ajo manuaalisesti
                </button>

                <button
                  onClick={startRealDrive}
                  className="px-5 py-2.5 text-sm font-bold rounded-xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white shadow-md shadow-emerald-600/20 active:scale-95 transition flex items-center space-x-2 cursor-pointer"
                >
                  <Play className="w-4 h-4 fill-white" />
                  <span>Aloita ajo (GPS)</span>
                </button>
              </>
            ) : (
              <div className="flex items-center gap-2">
                {!isPaused ? (
                  <button
                    onClick={pauseDrive}
                    className="px-4 py-2.5 text-xs sm:text-sm font-bold rounded-xl bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-white shadow-md shadow-amber-500/20 active:scale-95 transition flex items-center space-x-1.5 cursor-pointer"
                    title="Aseta ajo tauolle (pysäyttää ajan ja matkan kertymisen)"
                  >
                    <Pause className="w-4 h-4 fill-white" />
                    <span>Tauko</span>
                  </button>
                ) : (
                  <button
                    onClick={resumeDrive}
                    className="px-4 sm:px-5 py-2.5 text-xs sm:text-sm font-bold rounded-xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white shadow-lg shadow-emerald-600/30 active:scale-95 transition flex items-center space-x-1.5 animate-pulse cursor-pointer"
                    title="Jatka ajoseurantaa"
                  >
                    <Play className="w-4 h-4 fill-white" />
                    <span>Jatka ajoa</span>
                  </button>
                )}

                <button
                  onClick={stopDrive}
                  className="px-4 sm:px-5 py-2.5 text-xs sm:text-sm font-bold rounded-xl bg-rose-600 hover:bg-rose-500 active:bg-rose-700 text-white shadow-md shadow-rose-600/25 active:scale-95 transition flex items-center space-x-1.5 cursor-pointer"
                  title="Päätä ajo ja siirry tallennukseen"
                >
                  <Square className="w-4 h-4 fill-white" />
                  <span>Päätä ajo</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Telemetria ja Mittarit (Ajon aikana) */}
        <div className="p-4 sm:p-6 bg-slate-50/70 dark:bg-slate-850/50 border-b border-slate-100 dark:border-slate-800">
          
          {/* Tauko-ilmoituspalkki */}
          {isDriving && isPaused && (
            <div className="mb-4 px-4 py-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200/80 dark:border-amber-800/60 flex items-center justify-between gap-3 animate-in fade-in duration-200">
              <div className="flex items-center space-x-2.5 text-amber-900 dark:text-amber-200 text-xs sm:text-sm">
                <PauseCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0" />
                <span>Ajo on <strong>tauolla</strong> – aika ja matka eivät kerry. Paina <strong>"Jatka ajoa"</strong> kun jatkatte matkaa.</span>
              </div>
              <button
                onClick={resumeDrive}
                className="shrink-0 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white rounded-lg text-xs font-bold transition flex items-center space-x-1 shadow-sm cursor-pointer"
              >
                <Play className="w-3.5 h-3.5 fill-white" />
                <span>Jatka</span>
              </button>
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
            
            {/* Kesto */}
            <div className="p-3.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 shadow-xs">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center space-x-1.5 text-slate-500 dark:text-slate-400 text-xs">
                  <Timer className="w-3.5 h-3.5 text-blue-500" />
                  <span>Ajoaika</span>
                </div>
                {isDriving && isPaused && (
                  <span className="text-[10px] font-semibold text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-950/60 px-1.5 py-0.5 rounded">
                    Tauko
                  </span>
                )}
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
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center space-x-1.5 text-slate-500 dark:text-slate-400 text-xs">
                  <Gauge className="w-3.5 h-3.5 text-amber-500" />
                  <span>Nopeus</span>
                </div>
                {isDriving && isPaused && (
                  <span className="text-[10px] font-semibold text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-950/60 px-1.5 py-0.5 rounded">
                    Pysäytetty
                  </span>
                )}
              </div>
              <div className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white flex items-baseline space-x-1">
                {isDriving && isPaused ? (
                  <span className="text-amber-600 dark:text-amber-400 text-lg sm:text-xl font-medium">0 km/h</span>
                ) : (
                  <>
                    <span>{currentSpeed}</span>
                    <span className="text-xs font-normal text-slate-500">km/h</span>
                    {maxSpeed > 0 && (
                      <span className="text-[10px] text-slate-400 ml-auto hidden sm:inline">
                        max {maxSpeed}
                      </span>
                    )}
                  </>
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

              {/* Opetusaihe */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Opetusaihe:
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['K', 'A', 'B'] as TraficomTopicCode[]).map((code) => {
                    const cfg = TRAFICOM_TOPIC_CONFIG[code];
                    const isSelected = selectedTopicCode === code;
                    return (
                      <button
                        key={code}
                        type="button"
                        onClick={() => setSelectedTopicCode(code)}
                        className={`p-2.5 rounded-xl border text-center transition flex flex-col items-center justify-center ${
                          isSelected
                            ? 'border-blue-600 bg-blue-50 dark:bg-blue-950/50 text-blue-900 dark:text-blue-100 ring-2 ring-blue-500/20 font-bold'
                            : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/40 text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        <span className="text-sm font-extrabold">{code}</span>
                        <span className="text-[10px] leading-tight text-slate-500 dark:text-slate-400 mt-0.5">
                          {cfg.label.split(' ')[0]}
                        </span>
                      </button>
                    );
                  })}
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
                        onClick={() => {
                          setSelectedEnvOverride(envKey);
                          setSelectedTopicCode(mapEnvironmentToTraficomCode(envKey));
                        }}
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

              {/* Automaattinen Google Drive -varmuuskopiointi -info */}
              <div className="flex items-center space-x-2.5 p-3 rounded-xl bg-blue-50/80 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/60 text-xs text-blue-700 dark:text-blue-300">
                <CloudUpload className="w-4 h-4 shrink-0 text-blue-600 dark:text-blue-400" />
                <span>Ajokerta varmuuskopioidaan automaattisesti Google Driveen tallennuksen yhteydessä.</span>
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
