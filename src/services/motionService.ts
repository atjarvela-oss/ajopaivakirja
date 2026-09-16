import type { DrivingEvent, DrivingBehavior, GeoPoint } from '../types';

export type MotionSensitivity = 'low' | 'normal' | 'high';

export interface MotionConfig {
  sensitivity: MotionSensitivity;
  soundEnabled: boolean;
}

const DEFAULT_CONFIG: MotionConfig = {
  sensitivity: 'normal',
  soundEnabled: true,
};

// Kynnysarvot m/s² eri herkkyystasoilla
const THRESHOLDS = {
  low: {
    hardBrake: 4.2,      // vaatii todella kovan jarrutuksen
    rapidAccel: 3.8,
    hardTurn: 4.2,
    stallJerk: 6.0,
  },
  normal: {
    hardBrake: 3.3,      // ~0.34 G, normaali äkkijarrutus
    rapidAccel: 3.0,
    hardTurn: 3.3,
    stallJerk: 4.8,
  },
  high: {
    hardBrake: 2.6,      // herkempi havainnointi harjoitteluvaiheessa
    rapidAccel: 2.4,
    hardTurn: 2.6,
    stallJerk: 3.8,
  },
};

class MotionDetectionManager {
  private isRunning = false;
  private config: MotionConfig = DEFAULT_CONFIG;
  private events: DrivingEvent[] = [];
  private lastBrakeTime = 0;
  private lastAccelTime = 0;
  private lastTurnTime = 0;
  private lastStallTime = 0;

  private lastGpsPoint: GeoPoint | null = null;
  private currentGpsPoint: GeoPoint | null = null;
  private currentSpeedKmH = 0;

  private onEventDetectedCallback: ((event: DrivingEvent) => void) | null = null;
  private motionListener: ((e: DeviceMotionEvent) => void) | null = null;

  constructor() {
    const saved = localStorage.getItem('opetuslupa_motion_config');
    if (saved) {
      try {
        this.config = { ...DEFAULT_CONFIG, ...JSON.parse(saved) };
      } catch {
        this.config = DEFAULT_CONFIG;
      }
    }
  }

  public setConfig(newConfig: Partial<MotionConfig>) {
    this.config = { ...this.config, ...newConfig };
    localStorage.setItem('opetuslupa_motion_config', JSON.stringify(this.config));
  }

  public getConfig(): MotionConfig {
    return this.config;
  }

  public setEventListener(cb: (event: DrivingEvent) => void) {
    this.onEventDetectedCallback = cb;
  }

  public async startTracking(): Promise<boolean> {
    if (this.isRunning) return true;
    this.events = [];
    this.isRunning = true;
    this.lastBrakeTime = 0;
    this.lastAccelTime = 0;
    this.lastTurnTime = 0;
    this.lastStallTime = 0;

    // Tarkistetaan anturilupa (erityisesti iOS / tietyt Android-selaimet)
    if (typeof (DeviceMotionEvent as any)?.requestPermission === 'function') {
      try {
        const perm = await (DeviceMotionEvent as any).requestPermission();
        if (perm !== 'granted') {
          console.warn('Liiketunnistimen oikeutta ei myönnetty, käytetään GPS-pohjaista havainnointia.');
        }
      } catch (err) {
        console.warn('DeviceMotionEvent lupaepäonnistuminen:', err);
      }
    }

    this.motionListener = (event: DeviceMotionEvent) => {
      this.handleDeviceMotion(event);
    };

    try {
      window.addEventListener('devicemotion', this.motionListener, { passive: true });
    } catch (e) {
      console.warn('Ei voitu liittää devicemotion-kuuntelijaa:', e);
    }

    return true;
  }

  public stopTracking(): DrivingBehavior {
    this.isRunning = false;
    if (this.motionListener) {
      window.removeEventListener('devicemotion', this.motionListener);
      this.motionListener = null;
    }
    return this.getDrivingBehaviorSummary();
  }

  public updateGpsPosition(point: GeoPoint) {
    if (!this.isRunning) return;

    this.lastGpsPoint = this.currentGpsPoint;
    this.currentGpsPoint = point;
    const prevSpeed = this.currentSpeedKmH;
    this.currentSpeedKmH = point.speed || 0;

    if (!this.lastGpsPoint) return;

    const timeDeltaSec = (point.timestamp - this.lastGpsPoint.timestamp) / 1000;
    if (timeDeltaSec <= 0 || timeDeltaSec > 4) return;

    // Lasketaan GPS-kiihtyvyys (m/s²)
    const speedDeltaMs = ((this.currentSpeedKmH - prevSpeed) * 1000) / 3600;
    const accelMs2 = speedDeltaMs / timeDeltaSec;

    const thresholds = THRESHOLDS[this.config.sensitivity];

    // GPS-pohjainen varajärjestelmä äkkijarrutuksille
    // Esim. nopeus putoaa 50 km/h -> 20 km/h 2 sekunnissa (accel = -4.1 m/s²)
    if (accelMs2 < -thresholds.hardBrake && prevSpeed > 20) {
      this.triggerEvent({
        type: 'hard_brake',
        severity: Math.abs(accelMs2) > 5.0 ? 'severe' : 'moderate',
        speedKmH: prevSpeed,
        value: Math.round(Math.abs(accelMs2) * 10) / 10,
        description: `Äkkijarrutus nopeudesta ${Math.round(prevSpeed)} km/h (hidastuvuus ${Math.abs(accelMs2).toFixed(1)} m/s²)`,
      });
    }

    // GPS-pohjainen voimakas kiihdytys
    if (accelMs2 > thresholds.rapidAccel && this.currentSpeedKmH > 15) {
      this.triggerEvent({
        type: 'rapid_accel',
        severity: accelMs2 > 4.5 ? 'severe' : 'moderate',
        speedKmH: this.currentSpeedKmH,
        value: Math.round(accelMs2 * 10) / 10,
        description: `Voimakas kiihdytys (${accelMs2.toFixed(1)} m/s²)`,
      });
    }
  }

  /**
   * Käsittelee puhelimen sisäisen kiihtyvyysanturin datan
   */
  private handleDeviceMotion(event: DeviceMotionEvent) {
    if (!this.isRunning) return;

    const now = Date.now();
    const thresholds = THRESHOLDS[this.config.sensitivity];

    // Otetaan kiihtyvyys ilman painovoimaa jos saatavilla, muuten mukaan lukien painovoima
    const accel = event.acceleration || event.accelerationIncludingGravity;
    if (!accel) return;

    const ax = accel.x || 0;
    const ay = accel.y || 0;
    const az = accel.z || 0;

    // Kokonaisvoima kiihtyvyydelle tasossa
    const planarMagnitude = Math.sqrt(ax * ax + ay * ay);
    const totalMagnitude = Math.sqrt(ax * ax + ay * ay + az * az);

    // 1. Äkkijarrutus kiihtyvyysanturilla (kun auto liikkuu eteenpäin)
    if (this.currentSpeedKmH > 18 && (ay < -thresholds.hardBrake || planarMagnitude > thresholds.hardBrake * 1.2)) {
      if (now - this.lastBrakeTime > 4000) {
        this.triggerEvent({
          type: 'hard_brake',
          severity: planarMagnitude > 5.2 ? 'severe' : 'moderate',
          speedKmH: this.currentSpeedKmH,
          value: Math.round(planarMagnitude * 10) / 10,
          description: `Voimakas jarrutus (${planarMagnitude.toFixed(1)} m/s²) nopeudessa ${Math.round(this.currentSpeedKmH)} km/h`,
        });
      }
    }

    // 2. Vauhdikas mutka (sivuttaisvoima kun auto liikkuu mutkaan)
    if (this.currentSpeedKmH > 22 && Math.abs(ax) > thresholds.hardTurn) {
      if (now - this.lastTurnTime > 4000) {
        this.triggerEvent({
          type: 'hard_turn',
          severity: Math.abs(ax) > 5.0 ? 'severe' : 'moderate',
          speedKmH: this.currentSpeedKmH,
          value: Math.round(Math.abs(ax) * 10) / 10,
          description: `Vauhdikas mutka (${Math.abs(ax).toFixed(1)} m/s²) nopeudessa ${Math.round(this.currentSpeedKmH)} km/h`,
        });
      }
    }

    // 3. Moottorin sammuminen (kytkimen lipsahdus pysähdyksissä / liikkeellelähdössä)
    // Tunnistetaan voimakas nykäisy (jerk) kun nopeus on lähes nolla (0 - 8 km/h)
    if (this.currentSpeedKmH < 8 && totalMagnitude > thresholds.stallJerk) {
      if (now - this.lastStallTime > 6000 && now - this.lastBrakeTime > 3000) {
        this.triggerEvent({
          type: 'engine_stall',
          severity: 'moderate',
          speedKmH: this.currentSpeedKmH,
          value: Math.round(totalMagnitude * 10) / 10,
          description: 'Moottorin sammuminen tai nykäisevä liikkeellelähtö',
        });
      }
    }
  }

  /**
   * Rekisteröi tapahtuman cooldown-suojauksella
   */
  public triggerEvent(eventData: Omit<DrivingEvent, 'id' | 'timestamp' | 'lat' | 'lng'>) {
    const now = Date.now();

    // Estetään saman tapahtumatyypin monistuminen sekunnin sisällä
    if (eventData.type === 'hard_brake') {
      if (now - this.lastBrakeTime < 3500) return;
      this.lastBrakeTime = now;
    } else if (eventData.type === 'rapid_accel') {
      if (now - this.lastAccelTime < 3500) return;
      this.lastAccelTime = now;
    } else if (eventData.type === 'hard_turn') {
      if (now - this.lastTurnTime < 3500) return;
      this.lastTurnTime = now;
    } else if (eventData.type === 'engine_stall') {
      if (now - this.lastStallTime < 5000) return;
      this.lastStallTime = now;
    }

    const event: DrivingEvent = {
      id: `evt_${now}_${Math.random().toString(36).slice(2, 7)}`,
      timestamp: now,
      lat: this.currentGpsPoint?.lat,
      lng: this.currentGpsPoint?.lng,
      ...eventData,
    };

    this.events.push(event);

    // Kutsutaan reaaliaikaista kuuntelijaa UI:lle
    if (this.onEventDetectedCallback) {
      this.onEventDetectedCallback(event);
    }
  }

  public getEvents(): DrivingEvent[] {
    return [...this.events];
  }

  /**
   * Laskee ajokerran tasaisuus- ja taloudellisuuspisteet (0 - 100)
   */
  public getDrivingBehaviorSummary(_durationSeconds = 0, distanceKm = 0): DrivingBehavior {
    let hardBrakesCount = 0;
    let rapidAccelsCount = 0;
    let hardTurnsCount = 0;
    let engineStallsCount = 0;

    for (const evt of this.events) {
      if (evt.type === 'hard_brake') hardBrakesCount++;
      else if (evt.type === 'rapid_accel') rapidAccelsCount++;
      else if (evt.type === 'hard_turn') hardTurnsCount++;
      else if (evt.type === 'engine_stall') engineStallsCount++;
    }

    // Lähtöpisteet 100
    let smoothnessScore = 100;
    smoothnessScore -= hardBrakesCount * 8;
    smoothnessScore -= hardTurnsCount * 6;
    smoothnessScore -= rapidAccelsCount * 4;
    smoothnessScore -= engineStallsCount * 7;

    // Suhteutetaan ajomatkaan: pidemmällä ajolla yksittäinen tapahtuma painaa vähemmän
    if (distanceKm > 10) {
      const bonus = Math.min(10, Math.floor(distanceKm / 5));
      smoothnessScore += bonus;
    }

    smoothnessScore = Math.max(25, Math.min(100, Math.round(smoothnessScore)));

    // Eco-score: painottaa jarrutuksia ja rajuja kiihdytyksiä
    let ecoScore = 100;
    ecoScore -= rapidAccelsCount * 10;
    ecoScore -= hardBrakesCount * 7;
    ecoScore = Math.max(30, Math.min(100, Math.round(ecoScore)));

    return {
      smoothnessScore,
      ecoScore,
      hardBrakesCount,
      rapidAccelsCount,
      hardTurnsCount,
      engineStallsCount,
      events: [...this.events],
    };
  }
}

export const motionManager = new MotionDetectionManager();
