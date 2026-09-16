import React, { useState, useEffect, useRef } from 'react';
import { 
  Play, 
  Square, 
  Navigation, 
  Gauge, 
  Timer, 
  MapPin, 
  Sparkles,
  ShieldCheck, 
  Radio, 
  Save, 
  X,
  Pause,
  PauseCircle,
  Activity,
  AlertTriangle,
  Volume2,
  VolumeX,
  Fuel,
  Bluetooth,
  Share2
} from 'lucide-react';
import L from 'leaflet';
import type { 
  GeoPoint, 
  DriveSession, 
  EnvironmentType, 
  DriveEnvironment, 
  TraficomTopicCode,
  DrivingBehavior,
  DrivingEvent,
  ObdDriveData
} from '../types';
import { classifyEnvironment, calculateDistanceKm, ENVIRONMENT_CONFIG, mapEnvironmentToTraficomCode, TRAFICOM_TOPIC_CONFIG } from '../services/environmentClassifier';
import { saveLocalDrive } from '../services/localDb';
import { startLocationWatcher, stopLocationWatcher, acquireWakeLock, releaseWakeLock } from '../services/trackingService';
import { motionManager } from '../services/motionService';
import { obdManager, type ObdLiveMetrics } from '../services/obdService';
import { 
  generateVerbalDrivingReport, 
  speakDrivingReport, 
  stopSpeakingReport, 
  type DrivingReportSummary 
} from '../services/drivingReportService';
import { DriveShareModal } from './DriveShareModal';

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

  // Ajotapa-, anturi- ja OBD-tilat
  const [liveEvents, setLiveEvents] = useState<DrivingEvent[]>([]);
  const [latestEventBanner, setLatestEventBanner] = useState<DrivingEvent | null>(null);
  const [obdMetrics, setObdMetrics] = useState<ObdLiveMetrics>(obdManager.getLiveMetrics());
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [verbalReportSummary, setVerbalReportSummary] = useState<DrivingReportSummary | null>(null);
  const [showShareModal, setShowShareModal] = useState(false);

  // OBD-tilauksen kuuntelija
  useEffect(() => {
    const unsub = obdManager.subscribe((metrics) => {
      setObdMetrics(metrics);
    });
    return () => unsub();
  }, []);

  // Päivitetään ajettu matka ja nopeus OBD-palvelulle kulutuslaskentaa varten
  useEffect(() => {
    if (isDriving && !isPaused) {
      obdManager.updateDistance(totalDistanceKm, currentSpeed);
    }
  }, [isDriving, isPaused, totalDistanceKm, currentSpeed]);

  // Häivytetään viimeisin tapahtumabanneri 4 sekunnin kuluttua
  useEffect(() => {
    if (!latestEventBanner) return;
    const timer = setTimeout(() => {
      setLatestEventBanner(null);
    }, 4000);
    return () => clearTimeout(timer);
  }, [latestEventBanner]);

  const [finalDriveData, setFinalDriveData] = useState<{
    startTime: Date;
    endTime: Date;
    durationSeconds: number;
    distanceKm: number;
    avgSpeed: number;
    maxSpeed: number;
    points: GeoPoint[];
    environment: DriveEnvironment;
    behavior?: DrivingBehavior;
    obdData?: ObdDriveData;
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

    let isMounted = true;
    let t1: any = null;
    let t2: any = null;

    if (!mapInstanceRef.current) {
      // Varmistetaan puhdas säiliö (esim. React StrictMode -uudelleenkiinnityksessä)
      if ((mapContainerRef.current as any)._leaflet_id) {
        delete (mapContainerRef.current as any)._leaflet_id;
      }

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
            if (!isMounted || !mapInstanceRef.current) return;
            const userLoc: [number, number] = [pos.coords.latitude, pos.coords.longitude];
            try {
              map.setView(userLoc, 15, { animate: false });
              marker.setLatLng(userLoc);
              map.invalidateSize({ pan: false });
            } catch (e) {
              console.warn('Virhe alkusijainnin asetuksessa:', e);
            }
          },
          (err) => {
            console.warn('Alkusijaintia ei saatu:', err);
          },
          { timeout: 8000, maximumAge: 60000 }
        );
      }

      // Varmistetaan karttaruutujen täysi lataus alkulatauksessa
      map.whenReady(() => {
        t1 = setTimeout(() => {
          if (isMounted && mapInstanceRef.current && mapContainerRef.current?.clientWidth) {
            try {
              map.invalidateSize({ pan: false });
            } catch {}
          }
        }, 100);
        t2 = setTimeout(() => {
          if (isMounted && mapInstanceRef.current && mapContainerRef.current?.clientWidth) {
            try {
              map.invalidateSize({ pan: false });
            } catch {}
          }
        }, 400);
      });
    }

    return () => {
      isMounted = false;
      if (t1) clearTimeout(t1);
      if (t2) clearTimeout(t2);
      if (mapInstanceRef.current) {
        try {
          mapInstanceRef.current.stop();
          mapInstanceRef.current.remove();
        } catch {}
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // ResizeObserver: Päivittää kartan mitat välittömästi aina kun elementin koko muuttuu
  useEffect(() => {
    if (!mapContainerRef.current) return;
    const observer = new ResizeObserver(() => {
      if (mapInstanceRef.current && mapContainerRef.current) {
        if (mapContainerRef.current.clientWidth > 0 && mapContainerRef.current.clientHeight > 0) {
          try {
            mapInstanceRef.current.invalidateSize({ pan: false });
          } catch {}
        }
      }
    });
    observer.observe(mapContainerRef.current);
    return () => observer.disconnect();
  }, []);

  // Päivitetään kartan koko aina kun välilehti aktivoituu
  useEffect(() => {
    if (isActiveTab && mapInstanceRef.current) {
      const updateSize = () => {
        if (mapInstanceRef.current && mapContainerRef.current && mapContainerRef.current.clientWidth > 0) {
          try {
            mapInstanceRef.current.invalidateSize({ pan: false });
          } catch {}
        }
      };
      updateSize();
      const t1 = setTimeout(updateSize, 60);
      const t2 = setTimeout(updateSize, 250);
      const t3 = setTimeout(updateSize, 600);
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
        clearTimeout(t3);
      };
    }
  }, [isActiveTab]);

  // Päivitetään kartan koko kun ajotila muuttuu tai tilastopalkit ilmestyvät
  useEffect(() => {
    if (mapInstanceRef.current && mapContainerRef.current && mapContainerRef.current.clientWidth > 0) {
      const timer = setTimeout(() => {
        try {
          mapInstanceRef.current?.invalidateSize({ pan: false });
        } catch {}
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [isDriving, isPaused]);

  const centerMapOnUser = () => {
    if (mapInstanceRef.current && currentMarkerRef.current) {
      try {
        mapInstanceRef.current.setView(currentMarkerRef.current.getLatLng(), 16, { animate: false });
      } catch {}
    } else if (navigator.geolocation && mapInstanceRef.current) {
      navigator.geolocation.getCurrentPosition((pos) => {
        if (!mapInstanceRef.current) return;
        const userLoc: [number, number] = [pos.coords.latitude, pos.coords.longitude];
        try {
          mapInstanceRef.current.setView(userLoc, 16, { animate: false });
        } catch {}
      });
    }
  };

  // Päivitetään kartan reitti ja sijainti
  useEffect(() => {
    if (!mapInstanceRef.current || routePoints.length === 0) return;

    const latLngs = routePoints.map((p) => [p.lat, p.lng] as [number, number]);
    const latest = latLngs[latLngs.length - 1];

    if (polylineRef.current) {
      try {
        polylineRef.current.setLatLngs(latLngs);
      } catch {}
    }

    if (currentMarkerRef.current) {
      try {
        currentMarkerRef.current.setLatLng(latest);
      } catch {}
    }

    // Keskitetään kartta viimeisimpään pisteeseen
    if (mapContainerRef.current && mapContainerRef.current.clientWidth > 0) {
      try {
        mapInstanceRef.current.panTo(latest, { animate: false });
      } catch {}
    }
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

    // Alustetaan kiihtyvyysanturin ja OBD:n seuranta
    setLiveEvents([]);
    setLatestEventBanner(null);
    obdManager.resetSession();

    motionManager.setEventListener((event) => {
      setLiveEvents((prev) => [...prev, event]);
      setLatestEventBanner(event);
    });
    await motionManager.startTracking();

    // Pidä näyttö päällä koko ajon ajan (jos käyttäjä ei ole poistunut käytöstä asetuksista)
    const keepAwakePref = localStorage.getItem('opetuslupa_keep_awake');
    if (keepAwakePref !== 'false') {
      await acquireWakeLock();
    }

    // Käynnistä taustapaikannus (Foreground Service Androidilla)
    await startLocationWatcher(
      (point) => {
        setGpsAccuracy(point.accuracy ?? null);

        // Välitetään sijainti ja nopeus kiihtyvyysanturifuusiolle
        motionManager.updateGpsPosition(point);

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

    // Pysäytetään kiihtyvyysanturi ja kerätään ajotapadata
    motionManager.stopTracking();

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
    const targetTopicCode = mapEnvironmentToTraficomCode(finalEnv.primary);
    setSelectedEnvOverride(finalEnv.primary);
    setSelectedTopicCode(targetTopicCode);

    // Kerätään ajotapa- ja OBD-yhteenveto
    const behaviorSummary = motionManager.getDrivingBehaviorSummary(duration, totalDistanceKm);
    const obdSummary = obdManager.getDriveSummary();

    // Luodaan pedagoginen sanallinen ajotaparaportti
    const report = generateVerbalDrivingReport(behaviorSummary, obdSummary, {
      distanceKm: totalDistanceKm,
      durationSeconds: duration,
      avgSpeedKmH: isNaN(avgSpeed) ? 0 : avgSpeed,
      environmentPrimary: finalEnv.primary,
      topicCode: targetTopicCode,
    });
    behaviorSummary.verbalReport = report.fullReportText;
    setVerbalReportSummary(report);

    setFinalDriveData({
      startTime: startTime || new Date(Date.now() - duration * 1000),
      endTime,
      durationSeconds: duration,
      distanceKm: totalDistanceKm,
      avgSpeed: isNaN(avgSpeed) ? 0 : avgSpeed,
      maxSpeed,
      points: routePoints,
      environment: finalEnv,
      behavior: behaviorSummary,
      obdData: obdSummary,
    });

    setShowSaveModal(true);
  };

  // Tallennetaan ajokerta
  const handleConfirmSave = async () => {
    if (!finalDriveData) return;

    // Pysäytetään puhesynteesi jos oli päällä
    stopSpeakingReport();
    setIsSpeaking(false);

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
      drivingBehavior: finalDriveData.behavior,
      obdData: finalDriveData.obdData,
      createdAt: new Date().toISOString(),
    };

    saveLocalDrive(newDrive);
    onDriveSaved(newDrive);
    setShowSaveModal(false);
    setSaveNotes('');
    setRoutePoints([]);
    setTotalDistanceKm(0);
    setElapsedSeconds(0);
    setLiveEvents([]);
    setLatestEventBanner(null);
    setVerbalReportSummary(null);
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
    <div className="flex-1 flex flex-col min-h-0 h-full w-full max-w-4xl mx-auto">
      {/* Ajotilan Pääpaneeli */}
      <div className="flex-1 flex flex-col min-h-0 h-full w-full bg-white dark:bg-slate-900 rounded-xl sm:rounded-2xl shadow-sm sm:shadow-md border border-slate-200 dark:border-slate-800 overflow-hidden">
        
        {/* Yläpalkki: Tila (Rivi 1) ja Painikkeet (Rivi 2) */}
        <div className="shrink-0 px-3.5 py-2.5 sm:px-5 sm:py-3 border-b border-slate-100 dark:border-slate-800 space-y-2.5">
          
          {/* Rivi 1: Tilakuvake, Otsikko ja Tilan kuvaus */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center space-x-2.5 min-w-0">
              <div className={`p-2 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                !isDriving 
                  ? 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                  : isPaused
                  ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400'
                  : 'bg-rose-100 dark:bg-rose-950/60 text-rose-600 animate-pulse'
              }`}>
                {isPaused ? (
                  <Pause className="w-4.5 h-4.5 text-amber-600 dark:text-amber-400" />
                ) : (
                  <Navigation className="w-4.5 h-4.5" />
                )}
              </div>
              <div className="min-w-0">
                <div className="flex items-center space-x-2">
                  <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white leading-tight">
                    {!isDriving 
                      ? 'Valmiina ajoon'
                      : isPaused
                      ? 'Ajo tauolla'
                      : 'Ajoseuranta käynnissä'}
                  </h2>
                  {isDriving && (
                    <span className="flex h-2.5 w-2.5 relative shrink-0">
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
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                  {!isDriving
                    ? 'Käynnistä seuranta aloittaessasi ajotunnin'
                    : isPaused
                    ? 'Ajo keskeytetty – aika ja matka eivät kerry'
                    : 'GPS tallentaa reittiä ja ajoympäristöä'}
                </p>
              </div>
            </div>

            {/* GPS-indikaattori ajon aikana */}
            {isDriving && (
              <div className="shrink-0 flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-[11px] text-slate-600 dark:text-slate-300 font-medium">
                <Radio className="w-3 h-3 text-emerald-500 animate-pulse" />
                <span>{routePoints.length} pistettä</span>
              </div>
            )}
          </div>

          {/* Rivi 2: Toimintopainikkeet jaettu omalle rivilleen */}
          <div className="grid grid-cols-2 gap-2 pt-0.5">
            {!isDriving ? (
              <>
                <button
                  onClick={onOpenManualEntry}
                  className="w-full py-2 px-3 text-xs sm:text-sm font-medium rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 transition cursor-pointer flex items-center justify-center space-x-1.5 shadow-2xs"
                >
                  <span>Lisää ajo manuaalisesti</span>
                </button>

                <button
                  onClick={startRealDrive}
                  className="w-full py-2 px-3 text-xs sm:text-sm font-bold rounded-lg bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white shadow-sm shadow-emerald-600/20 active:scale-98 transition flex items-center justify-center space-x-1.5 cursor-pointer"
                >
                  <Play className="w-4 h-4 fill-white" />
                  <span>Aloita ajo (GPS)</span>
                </button>
              </>
            ) : (
              <>
                {!isPaused ? (
                  <button
                    onClick={pauseDrive}
                    className="w-full py-2 px-3 text-xs sm:text-sm font-bold rounded-lg bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-white shadow-sm active:scale-98 transition flex items-center justify-center space-x-1.5 cursor-pointer"
                    title="Aseta ajo tauolle"
                  >
                    <Pause className="w-4 h-4 fill-white" />
                    <span>Tauko</span>
                  </button>
                ) : (
                  <button
                    onClick={resumeDrive}
                    className="w-full py-2 px-3 text-xs sm:text-sm font-bold rounded-lg bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white shadow-sm shadow-emerald-600/30 active:scale-98 transition flex items-center justify-center space-x-1.5 animate-pulse cursor-pointer"
                    title="Jatka ajoseurantaa"
                  >
                    <Play className="w-4 h-4 fill-white" />
                    <span>Jatka</span>
                  </button>
                )}

                <button
                  onClick={stopDrive}
                  className="w-full py-2 px-3 text-xs sm:text-sm font-bold rounded-lg bg-rose-600 hover:bg-rose-500 active:bg-rose-700 text-white shadow-sm active:scale-98 transition flex items-center justify-center space-x-1.5 cursor-pointer"
                  title="Päätä ajo ja siirry tallennukseen"
                >
                  <Square className="w-4 h-4 fill-white" />
                  <span>Päätä ajo</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* Telemetria ja Mittarit (Ajon aikana ja valmiustilassa) */}
        <div className="shrink-0 p-2.5 sm:p-3.5 bg-slate-50/80 dark:bg-slate-850/60 border-b border-slate-100 dark:border-slate-800">
          
          {/* Tauko-ilmoituspalkki */}
          {isDriving && isPaused && (
            <div className="mb-2 px-3 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200/80 dark:border-amber-800/60 flex items-center justify-between gap-2 animate-in fade-in duration-200">
              <div className="flex items-center space-x-1.5 text-amber-900 dark:text-amber-200 text-xs min-w-0 truncate">
                <PauseCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                <span className="truncate">Ajo on <strong>tauolla</strong> – aika ja matka eivät kerry.</span>
              </div>
              <button
                onClick={resumeDrive}
                className="shrink-0 px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-[11px] font-bold transition flex items-center space-x-1 cursor-pointer"
              >
                <Play className="w-2.5 h-2.5 fill-white" />
                <span>Jatka</span>
              </button>
            </div>
          )}

          <div className="grid grid-cols-4 gap-1.5 sm:gap-3">
            
            {/* Kesto */}
            <div className="p-2 sm:p-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 shadow-2xs flex flex-col justify-center min-w-0">
              <div className="flex items-center justify-between mb-0.5 text-slate-500 dark:text-slate-400 text-[10px] sm:text-xs">
                <span className="flex items-center space-x-1 truncate">
                  <Timer className="w-3 h-3 text-blue-500 shrink-0" />
                  <span className="font-medium truncate">Aika</span>
                </span>
                {isDriving && isPaused && (
                  <span className="text-[9px] font-semibold text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-950/60 px-1 py-0.2 rounded hidden sm:inline">
                    Tauko
                  </span>
                )}
              </div>
              <div className="text-sm xs:text-base sm:text-xl font-bold font-mono text-slate-900 dark:text-white truncate">
                {formatTime(elapsedSeconds)}
              </div>
            </div>

            {/* Matka */}
            <div className="p-2 sm:p-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 shadow-2xs flex flex-col justify-center min-w-0">
              <div className="flex items-center space-x-1 text-slate-500 dark:text-slate-400 text-[10px] sm:text-xs mb-0.5 truncate">
                <MapPin className="w-3 h-3 text-emerald-500 shrink-0" />
                <span className="font-medium truncate">Matka</span>
              </div>
              <div className="text-sm xs:text-base sm:text-xl font-bold text-slate-900 dark:text-white truncate">
                {totalDistanceKm} <span className="text-[10px] sm:text-xs font-normal text-slate-500">km</span>
              </div>
            </div>

            {/* Hetkellinen Nopeus */}
            <div className="p-2 sm:p-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 shadow-2xs flex flex-col justify-center min-w-0">
              <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-[10px] sm:text-xs mb-0.5 truncate">
                <span className="flex items-center space-x-1 truncate">
                  <Gauge className="w-3 h-3 text-amber-500 shrink-0" />
                  <span className="font-medium truncate">Nopeus</span>
                </span>
                {maxSpeed > 0 && (
                  <span className="hidden sm:inline text-[9px] text-slate-400">
                    max {maxSpeed}
                  </span>
                )}
              </div>
              <div className="text-sm xs:text-base sm:text-xl font-bold text-slate-900 dark:text-white truncate">
                {isDriving && isPaused ? (
                  <span className="text-amber-600 dark:text-amber-400">0 km/h</span>
                ) : (
                  <>
                    <span>{currentSpeed}</span>{' '}
                    <span className="text-[10px] sm:text-xs font-normal text-slate-500">km/h</span>
                  </>
                )}
              </div>
            </div>

            {/* Sovelluksen Arvio Ajoympäristöstä */}
            <div className="p-2 sm:p-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 shadow-2xs flex flex-col justify-center min-w-0">
              <div className="flex items-center space-x-1 text-slate-500 dark:text-slate-400 text-[10px] sm:text-xs mb-0.5 truncate">
                <Sparkles className="w-3 h-3 text-purple-500 shrink-0" />
                <span className="font-medium truncate">Ympäristö</span>
              </div>
              <div className="flex items-center">
                <span className={`text-[10px] sm:text-xs px-1.5 py-0.5 rounded-md font-semibold border ${currentEnvInfo.badgeClass} truncate max-w-full`}>
                  {currentEnvInfo.label.split(' / ')[0]}
                </span>
              </div>
            </div>

          </div>

          {/* Ympäristöjakaumapalkki ajon aikana */}
          {isDriving && routePoints.length > 2 && (
            <div className="mt-2 pt-1.5 border-t border-slate-200/60 dark:border-slate-700/60">
              <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                <span className="font-medium text-slate-700 dark:text-slate-300 truncate text-[11px]">
                  Ympäristöjakauma:
                </span>
                <span className="text-[10px] truncate ml-1 text-slate-600 dark:text-slate-300">
                  M {liveEnvironment.distribution.maantie}% • T {liveEnvironment.distribution.taajama}% • K {liveEnvironment.distribution.kaupunki}%
                </span>
              </div>
              <div className="h-1.5 w-full bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden flex">
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

          {/* Ajotapa-anturit & OBD-tila (Kiihtyvyysmittari, Äkkijarrutukset, Kulutus) */}
          <div className="mt-2 pt-2 border-t border-slate-200/60 dark:border-slate-700/60 flex flex-wrap items-center justify-between gap-2">
            
            {/* Ajotapa-antureiden tapahtumalaskurit */}
            <div className="flex items-center space-x-1.5 text-xs">
              <span className="flex items-center space-x-1 text-slate-600 dark:text-slate-300 font-medium text-[11px]">
                <Activity className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                <span className="hidden xs:inline">Ajotapa:</span>
              </span>

              {/* Äkkijarrutukset */}
              <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold flex items-center space-x-1 border ${
                liveEvents.filter(e => e.type === 'hard_brake').length > 0
                  ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700'
              }`}>
                <span>Jarrutukset:</span>
                <strong>{liveEvents.filter(e => e.type === 'hard_brake').length}</strong>
              </span>

              {/* Vauhdikkaat mutkat */}
              <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold flex items-center space-x-1 border ${
                liveEvents.filter(e => e.type === 'hard_turn').length > 0
                  ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700'
              }`}>
                <span>Mutkat:</span>
                <strong>{liveEvents.filter(e => e.type === 'hard_turn').length}</strong>
              </span>

              {/* Moottorin sammumiset */}
              <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold flex items-center space-x-1 border ${
                liveEvents.filter(e => e.type === 'engine_stall').length > 0
                  ? 'bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700'
              }`}>
                <span>Sammumiset:</span>
                <strong>{liveEvents.filter(e => e.type === 'engine_stall').length}</strong>
              </span>
            </div>

            {/* OBD2 Bluetooth -tila ja kulutusmittari */}
            <div className="flex items-center space-x-1.5 ml-auto">
              {obdMetrics.connected ? (
                <div className="flex items-center space-x-1.5 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 px-2 py-0.5 rounded-lg text-[11px] font-medium">
                  <Bluetooth className="w-3 h-3 text-emerald-600 animate-pulse" />
                  <span>
                    OBD: <strong>{obdMetrics.rpm} rpm</strong>
                  </span>
                  <span className="text-emerald-300 dark:text-emerald-700">|</span>
                  <span className="flex items-center space-x-1" title={obdMetrics.fuelRateSupported ? 'EOBD PID 5E Engine Fuel Rate aktiivinen' : 'Arvioitu polttoainevirtaus'}>
                    <Fuel className="w-3 h-3 text-emerald-600" />
                    <span>
                      {currentSpeed > 3 ? (
                        <>
                          <strong>{obdMetrics.instantConsumptionL100Km > 0 ? obdMetrics.instantConsumptionL100Km : obdMetrics.averageConsumptionL100Km}</strong> l/100km
                          <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-normal ml-0.5">({obdMetrics.fuelRateLitersPerHour} L/h)</span>
                        </>
                      ) : (
                        <>
                          <strong>{obdMetrics.fuelRateLitersPerHour}</strong> L/h
                          {obdMetrics.averageConsumptionL100Km > 0 && (
                            <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-normal ml-0.5">(ka. {obdMetrics.averageConsumptionL100Km})</span>
                          )}
                        </>
                      )}
                    </span>
                    {obdMetrics.fuelRateSupported && (
                      <span className="px-1 py-0.2 text-[8px] font-bold rounded bg-emerald-200/80 dark:bg-emerald-800 text-emerald-900 dark:text-emerald-100 uppercase tracking-wider">
                        5E
                      </span>
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={() => obdManager.disconnect()}
                    className="ml-1 text-[10px] text-slate-400 hover:text-rose-500 transition cursor-pointer"
                    title="Katkaise OBD-yhteys"
                  >
                    katkaise
                  </button>
                </div>
              ) : (
                <div className="flex items-center space-x-1">
                  <button
                    type="button"
                    onClick={async () => {
                      const res = await obdManager.connectBluetooth();
                      if (!res.success && !res.message.includes('User cancelled')) {
                        // Tarjotaan simulaattoria jos laitetta ei löydy tai Web Bluetooth ei ole tuettu
                        if (confirm(`${res.message}\n\nHaluatko käynnistää OBD-simulaattorin testitilaan?`)) {
                          obdManager.startSimulator();
                        }
                      }
                    }}
                    className="px-2 py-0.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-300 text-[11px] font-medium flex items-center space-x-1 cursor-pointer transition shadow-2xs"
                    title="Yhdistä OBD2 Bluetooth -laitteeseen"
                  >
                    <Bluetooth className="w-3 h-3 text-blue-500" />
                    <span>Yhdistä OBD</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => obdManager.startSimulator()}
                    className="px-1.5 py-0.5 rounded-lg border border-indigo-200 dark:border-indigo-800 bg-indigo-50/60 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 text-[10px] font-medium transition cursor-pointer"
                    title="Testaa OBD-polttoaineenkulutusta simulaattorilla"
                  >
                    Simulaattori
                  </button>
                </div>
              )}
            </div>

          </div>
        </div>

        {/* Karttanäkymä (Täyttää dynaamisesti aina kaiken jäljellä olevan tilan) */}
        <div className="relative flex-1 min-h-[140px] h-full w-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
          <div ref={mapContainerRef} className="w-full h-full" />

          {/* Reaaliaikainen varoitustoast kartan yllä kun äkkijarrutus tai mutka tapahtuu */}
          {latestEventBanner && (
            <div className="absolute top-3 inset-x-4 z-30 flex justify-center pointer-events-none animate-in fade-in slide-in-from-top duration-300">
              <div className={`px-4 py-2 rounded-xl shadow-lg border backdrop-blur-md flex items-center space-x-2 text-xs font-bold ${
                latestEventBanner.type === 'hard_brake'
                  ? 'bg-rose-600/90 border-rose-400 text-white shadow-rose-600/30'
                  : latestEventBanner.type === 'hard_turn'
                  ? 'bg-amber-600/90 border-amber-400 text-white shadow-amber-600/30'
                  : latestEventBanner.type === 'engine_stall'
                  ? 'bg-purple-600/90 border-purple-400 text-white shadow-purple-600/30'
                  : 'bg-blue-600/90 border-blue-400 text-white shadow-blue-600/30'
              }`}>
                <AlertTriangle className="w-4 h-4 shrink-0 text-white animate-bounce" />
                <span>{latestEventBanner.description}</span>
              </div>
            </div>
          )}

          {/* Kartan päällä oleva GPS-tarkkuustila ajon aikana */}
          {isDriving && (
            <div className="absolute top-2.5 left-2.5 z-20 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xs px-2.5 py-1 rounded-md shadow-xs border border-slate-200 dark:border-slate-700 text-[11px] flex items-center space-x-1.5">
              <Radio className="w-3 h-3 text-emerald-500 animate-pulse" />
              <span className="text-slate-700 dark:text-slate-300 font-medium">
                Pisteitä: <strong>{routePoints.length}</strong>
              </span>
              {gpsAccuracy !== null && (
                <span className="text-slate-400">
                  (±{gpsAccuracy}m)
                </span>
              )}
            </div>
          )}

          {/* Keskitä sijaintiin -painike */}
          <button
            type="button"
            onClick={centerMapOnUser}
            className="absolute bottom-3 right-3 z-20 p-2 sm:px-3 sm:py-2 rounded-lg bg-white/95 dark:bg-slate-900/95 shadow-md border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer transition active:scale-95 flex items-center space-x-1.5 text-xs font-medium"
            title="Keskitä sijaintiin"
          >
            <Navigation className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <span className="hidden xs:inline">Keskitä</span>
          </button>
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

              {/* Sanallinen ajotaparaportti ja anturi-analyysi */}
              {finalDriveData.behavior && (
                <div className="p-4 rounded-xl bg-linear-to-br from-indigo-50/70 to-blue-50/50 dark:from-indigo-950/40 dark:to-slate-850/60 border border-indigo-200/80 dark:border-indigo-800/60 space-y-3">
                  
                  {/* Otsikkorivi ja puhepainike */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Sparkles className="w-4.5 h-4.5 text-indigo-600 dark:text-indigo-400" />
                      <h4 className="text-xs sm:text-sm font-bold text-indigo-950 dark:text-indigo-200">
                        Sanallinen ajotaparaportti
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

                      {verbalReportSummary && (
                        <button
                          type="button"
                          onClick={() => {
                            if (isSpeaking) {
                              stopSpeakingReport();
                              setIsSpeaking(false);
                            } else {
                              const ok = speakDrivingReport(verbalReportSummary.fullReportText);
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

                  {/* Arvosana ja tasaisuusindeksi */}
                  <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-lg bg-white/80 dark:bg-slate-900/80 border border-indigo-100 dark:border-indigo-900/50">
                    <div className="flex items-center space-x-2">
                      <span className="text-xs text-slate-500">Arvosana:</span>
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                        verbalReportSummary?.grade === 'Erinomainen'
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                          : verbalReportSummary?.grade === 'Hyvä'
                          ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                          : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                      }`}>
                        {verbalReportSummary?.grade || 'Hyvä'}
                      </span>
                    </div>

                    <div className="flex items-center space-x-1.5 text-xs">
                      <span className="text-slate-500">Tasaisuus:</span>
                      <span className="font-bold text-slate-900 dark:text-white">
                        {finalDriveData.behavior.smoothnessScore}/100
                      </span>
                    </div>
                  </div>

                  {/* Tapahtumatunnistuksen mittarit */}
                  <div className="grid grid-cols-3 gap-2 text-center text-xs">
                    <div className="p-2 rounded-lg bg-white/70 dark:bg-slate-900/60 border border-slate-200/60 dark:border-slate-800">
                      <div className="text-[10px] text-slate-500">Äkkijarrutukset</div>
                      <div className={`font-bold text-sm ${finalDriveData.behavior.hardBrakesCount > 0 ? 'text-rose-600' : 'text-slate-800 dark:text-slate-200'}`}>
                        {finalDriveData.behavior.hardBrakesCount} kpl
                      </div>
                    </div>
                    <div className="p-2 rounded-lg bg-white/70 dark:bg-slate-900/60 border border-slate-200/60 dark:border-slate-800">
                      <div className="text-[10px] text-slate-500">Vauhdikkaat mutkat</div>
                      <div className={`font-bold text-sm ${finalDriveData.behavior.hardTurnsCount > 0 ? 'text-amber-600' : 'text-slate-800 dark:text-slate-200'}`}>
                        {finalDriveData.behavior.hardTurnsCount} kpl
                      </div>
                    </div>
                    <div className="p-2 rounded-lg bg-white/70 dark:bg-slate-900/60 border border-slate-200/60 dark:border-slate-800">
                      <div className="text-[10px] text-slate-500">Sammumiset</div>
                      <div className={`font-bold text-sm ${finalDriveData.behavior.engineStallsCount > 0 ? 'text-purple-600' : 'text-slate-800 dark:text-slate-200'}`}>
                        {finalDriveData.behavior.engineStallsCount} kpl
                      </div>
                    </div>
                  </div>

                  {/* OBD-polttoainetieto jos kytketty */}
                  {finalDriveData.obdData && finalDriveData.obdData.connected && (
                    <div className="p-2.5 rounded-lg bg-emerald-50/80 dark:bg-emerald-950/40 border border-emerald-200/80 dark:border-emerald-800/60 flex items-center justify-between text-xs text-emerald-900 dark:text-emerald-200">
                      <div className="flex items-center space-x-1.5">
                        <Fuel className="w-3.5 h-3.5 text-emerald-600" />
                        <span className="font-medium">Keskikulutus:</span>
                        <strong>{finalDriveData.obdData.avgFuelConsumptionL100Km || '—'} l/100 km</strong>
                        {finalDriveData.obdData.avgFuelRateLitersPerHour !== undefined && (
                          <span className="text-[11px] text-emerald-700 dark:text-emerald-300">
                            (virtaus {finalDriveData.obdData.avgFuelRateLitersPerHour} L/h{finalDriveData.obdData.fuelRateSupported ? ' PID 5E' : ''})
                          </span>
                        )}
                      </div>
                      {finalDriveData.obdData.totalFuelUsedLiters !== undefined && (
                        <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
                          yht. {finalDriveData.obdData.totalFuelUsedLiters} L
                        </span>
                      )}
                    </div>
                  )}

                  {/* Sanallinen tekstiraportti */}
                  <div className="p-3 rounded-lg bg-white/90 dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-700/80 text-xs text-slate-700 dark:text-slate-200 leading-relaxed font-sans">
                    {verbalReportSummary?.fullReportText || finalDriveData.behavior.verbalReport}
                  </div>

                </div>
              )}

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

              {/* Paikallinen tallennus -info */}
              <div className="flex items-center space-x-2.5 p-3 rounded-xl bg-teal-50/80 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-800/60 text-xs text-teal-800 dark:text-teal-300">
                <ShieldCheck className="w-4 h-4 shrink-0 text-teal-600 dark:text-teal-400" />
                <span>Ajokerta, reitti ja tilastot tallentuvat suoraan puhelimesi omaan muistiin.</span>
              </div>

            </div>

            <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-850/50 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setShowShareModal(true)}
                className="px-3.5 py-2 text-xs sm:text-sm font-semibold rounded-xl bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 transition flex items-center space-x-1.5 cursor-pointer"
              >
                <Share2 className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <span>Jaa kooste (PNG)</span>
              </button>

              <div className="flex items-center space-x-2">
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
        </div>
      )}

      {/* Jaettavan ajotapakoosteen modaali */}
      <DriveShareModal
        isOpen={showShareModal}
        onClose={() => setShowShareModal(false)}
        data={finalDriveData ? {
          startTime: finalDriveData.startTime,
          endTime: finalDriveData.endTime,
          durationSeconds: finalDriveData.durationSeconds,
          distanceKm: finalDriveData.distanceKm,
          avgSpeedKmH: finalDriveData.avgSpeed,
          topicCode: selectedTopicCode,
          environment: {
            primary: selectedEnvOverride,
            distribution: finalDriveData.environment.distribution,
          },
          behavior: finalDriveData.behavior,
          obdData: finalDriveData.obdData,
          verbalReport: verbalReportSummary?.fullReportText || finalDriveData.behavior?.verbalReport,
          notes: saveNotes,
          studentName: 'Opetuslupaoppilas',
        } : null}
      />
    </div>
  );
};
