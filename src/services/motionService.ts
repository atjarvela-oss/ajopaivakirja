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

// Kynnysarvot m/s² eri herkkyystasoilla (laskettuna 2 sekunnin liukuvana keskiarvona)
const THRESHOLDS = {
  low: {
    hardBrake: 3.6,      // vaatii voimakkaan 2 sekunnin jatkuvan jarrutuksen (~26 km/h pudotus)
    rapidAccel: 3.2,
    hardTurn: 3.6,
    stallJerk: 5.5,
  },
  normal: {
    hardBrake: 2.8,      // ~0.29 G jatkuvana 2 sekunnin ajan (~20 km/h pudotus)
    rapidAccel: 2.5,
    hardTurn: 2.8,
    stallJerk: 4.5,
  },
  high: {
    hardBrake: 2.2,      // herkempi havainnointi opetusvaiheessa (~16 km/h pudotus 2s aikana)
    rapidAccel: 2.0,
    hardTurn: 2.2,
    stallJerk: 3.5,
  },
};

interface MotionSample {
  timestamp: number;
  ax: number;
  ay: number;
  az: number;
  planar: number;
  total: number;
}

interface GpsSample {
  timestamp: number;
  speedKmH: number;
}

class MotionDetectionManager {
  private isRunning = false;
  private config: MotionConfig = DEFAULT_CONFIG;
  private events: DrivingEvent[] = [];
  private lastBrakeTime = 0;
  private lastAccelTime = 0;
  private lastTurnTime = 0;
  private lastStallTime = 0;

  // 2.0 sekunnin liukuva keskiarvoikkuna kiihtyvyysanturille
  private readonly WINDOW_DURATION_MS = 2000;
  private readonly MIN_SAMPLES_REQUIRED = 8;
  private readonly MIN_TIME_SPAN_MS = 1500;
  private motionSamples: MotionSample[] = [];

  // Painovoiman suodatus (low-pass gravity vector) jos event.acceleration ei poista painovoimaa
  private gravity = { x: 0, y: 0, z: 9.81 };
  private gravityInitialized = false;

  // GPS-nopeushistoria 2 sekunnin keskiarvoon
  private gpsSamples: GpsSample[] = [];
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
    this.motionSamples = [];
    this.gpsSamples = [];
    this.gravityInitialized = false;
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
    this.motionSamples = [];
    this.gpsSamples = [];
    return this.getDrivingBehaviorSummary();
  }

  /**
   * GPS-nopeuspäivitykset: käyttää 2 sekunnin aikaikkunaa todellisen kiihtyvyyden määrittämiseen
   */
  public updateGpsPosition(point: GeoPoint) {
    if (!this.isRunning) return;

    this.currentGpsPoint = point;
    this.currentSpeedKmH = point.speed || 0;

    const now = point.timestamp || Date.now();
    this.gpsSamples.push({ timestamp: now, speedKmH: this.currentSpeedKmH });

    // Pidetään vain viimeisen 2.5 sekunnin GPS-näytteet
    const cutoff = now - 2500;
    while (this.gpsSamples.length > 0 && this.gpsSamples[0].timestamp < cutoff) {
      this.gpsSamples.shift();
    }

    if (this.gpsSamples.length < 2) return;

    const oldest = this.gpsSamples[0];
    const newest = this.gpsSamples[this.gpsSamples.length - 1];
    const timeDeltaSec = (newest.timestamp - oldest.timestamp) / 1000;

    // Vaaditaan vähintään 1.5 sekunnin aikaero luotettavaan 2 sekunnin GPS-kiihtyvyyteen
    if (timeDeltaSec < 1.5 || timeDeltaSec > 4) return;

    const speedDeltaMs = ((newest.speedKmH - oldest.speedKmH) * 1000) / 3600;
    const accelMs2 = speedDeltaMs / timeDeltaSec;

    const thresholds = THRESHOLDS[this.config.sensitivity];

    // GPS-pohjainen varajärjestelmä äkkijarrutuksille 2 sekunnin ajalta
    if (accelMs2 < -thresholds.hardBrake && oldest.speedKmH > 22) {
      this.triggerEvent({
        type: 'hard_brake',
        severity: Math.abs(accelMs2) > 4.5 ? 'severe' : 'moderate',
        speedKmH: oldest.speedKmH,
        value: Math.round(Math.abs(accelMs2) * 10) / 10,
        description: `Äkkijarrutus nopeudesta ${Math.round(oldest.speedKmH)} km/h (2 s hidastuvuus ${Math.abs(accelMs2).toFixed(1)} m/s²)`,
      });
    }

    // GPS-pohjainen voimakas kiihdytys 2 sekunnin ajalta
    if (accelMs2 > thresholds.rapidAccel && newest.speedKmH > 18) {
      this.triggerEvent({
        type: 'rapid_accel',
        severity: accelMs2 > 4.0 ? 'severe' : 'moderate',
        speedKmH: newest.speedKmH,
        value: Math.round(accelMs2 * 10) / 10,
        description: `Voimakas kiihdytys (2 s kiihtyvyys ${accelMs2.toFixed(1)} m/s²)`,
      });
    }
  }

  /**
   * Käsittelee puhelimen sisäisen kiihtyvyysanturin datan laskemalla 2 sekunnin liukuvaa keskiarvoa.
   * Tämä suodattaa pois tien kuopat, töyssyt ja telineen tärinät.
   */
  private handleDeviceMotion(event: DeviceMotionEvent) {
    if (!this.isRunning) return;

    const now = Date.now();
    const thresholds = THRESHOLDS[this.config.sensitivity];

    let ax = 0;
    let ay = 0;
    let az = 0;

    // Ensisijaisesti käytetään lineaarista kiihtyvyyttä (ilman painovoimaa)
    const linAccel = event.acceleration;
    const rawAccel = event.accelerationIncludingGravity;

    if (linAccel && (linAccel.x !== null || linAccel.y !== null || linAccel.z !== null)) {
      ax = linAccel.x || 0;
      ay = linAccel.y || 0;
      az = linAccel.z || 0;
    } else if (rawAccel && (rawAccel.x !== null || rawAccel.y !== null || rawAccel.z !== null)) {
      const rx = rawAccel.x || 0;
      const ry = rawAccel.y || 0;
      const rz = rawAccel.z || 0;

      // Alustetaan tai päivitetään painovoimavektori (low-pass suodatus)
      if (!this.gravityInitialized) {
        this.gravity = { x: rx, y: ry, z: rz };
        this.gravityInitialized = true;
      } else {
        const alpha = 0.85;
        this.gravity.x = alpha * this.gravity.x + (1 - alpha) * rx;
        this.gravity.y = alpha * this.gravity.y + (1 - alpha) * ry;
        this.gravity.z = alpha * this.gravity.z + (1 - alpha) * rz;
      }

      // Poistetaan staattinen painovoimakomponentti
      ax = rx - this.gravity.x;
      ay = ry - this.gravity.y;
      az = rz - this.gravity.z;
    } else {
      return;
    }

    const planarMagnitude = Math.sqrt(ax * ax + ay * ay);
    const totalMagnitude = Math.sqrt(ax * ax + ay * ay + az * az);

    // Lisätään näyte 2 sekunnin liukuvaan puskuriin
    this.motionSamples.push({
      timestamp: now,
      ax,
      ay,
      az,
      planar: planarMagnitude,
      total: totalMagnitude,
    });

    // Poistetaan vanhemmat kuin 2000 ms (2 sekuntia) näytteet
    const cutoff = now - this.WINDOW_DURATION_MS;
    while (this.motionSamples.length > 0 && this.motionSamples[0].timestamp < cutoff) {
      this.motionSamples.shift();
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
        return;
      }
    }

    // Varmistetaan että puskurissa on tarpeeksi dataa 2 sekunnin keskiarvoon
    const oldest = this.motionSamples[0];
    const newest = this.motionSamples[this.motionSamples.length - 1];
    const timeSpan = newest.timestamp - oldest.timestamp;

    if (this.motionSamples.length < this.MIN_SAMPLES_REQUIRED || timeSpan < this.MIN_TIME_SPAN_MS) {
      return;
    }

    // Lasketaan 2 sekunnin keskiarvo
    let sumAx = 0;
    let sumAy = 0;
    let sumPlanar = 0;

    for (const sample of this.motionSamples) {
      sumAx += sample.ax;
      sumAy += sample.ay;
      sumPlanar += sample.planar;
    }

    const count = this.motionSamples.length;
    const avgAx = sumAx / count;
    const avgAy = sumAy / count;
    const avgPlanar = sumPlanar / count;

    // 1. Äkkijarrutus 2 sekunnin liukuvalla keskiarvolla
    // Yksittäinen kuoppa tai tärähdys ei riitä, vaan hidastuvuuden pitää säilyä korkeana koko 2 sekunnin ajan
    if (this.currentSpeedKmH > 18 && (avgAy < -thresholds.hardBrake || avgPlanar > thresholds.hardBrake)) {
      if (now - this.lastBrakeTime > 4000) {
        const brakeVal = Math.max(Math.abs(avgAy), avgPlanar);
        this.triggerEvent({
          type: 'hard_brake',
          severity: brakeVal > 4.2 ? 'severe' : 'moderate',
          speedKmH: this.currentSpeedKmH,
          value: Math.round(brakeVal * 10) / 10,
          description: `Voimakas jarrutus (2 s keskiarvo ${brakeVal.toFixed(1)} m/s²) nopeudessa ${Math.round(this.currentSpeedKmH)} km/h`,
        });
      }
    }

    // 2. Vauhdikas mutka 2 sekunnin liukuvalla keskiarvolla
    // Vaatii todellisen kaartamisen 2 sekunnin ajan
    if (this.currentSpeedKmH > 22 && (Math.abs(avgAx) > thresholds.hardTurn || avgPlanar > thresholds.hardTurn * 1.15)) {
      if (now - this.lastTurnTime > 4000) {
        const turnVal = Math.max(Math.abs(avgAx), avgPlanar);
        this.triggerEvent({
          type: 'hard_turn',
          severity: turnVal > 4.2 ? 'severe' : 'moderate',
          speedKmH: this.currentSpeedKmH,
          value: Math.round(turnVal * 10) / 10,
          description: `Vauhdikas mutka (2 s keskiarvo ${turnVal.toFixed(1)} m/s²) nopeudessa ${Math.round(this.currentSpeedKmH)} km/h`,
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
