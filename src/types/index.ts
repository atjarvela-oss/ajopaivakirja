export type EnvironmentType = 'maantie' | 'taajama' | 'kaupunki' | 'pysakointi';
export type TraficomTopicCode = 'K' | 'A' | 'B';

export interface EnvironmentDistribution {
  maantie: number;
  taajama: number;
  kaupunki: number;
  pysakointi: number;
}

export interface GeoPoint {
  lat: number;
  lng: number;
  timestamp: number;
  speed: number | null; // km/h
  accuracy?: number; // meters
}

export interface DriveEnvironment {
  primary: EnvironmentType;
  distribution: EnvironmentDistribution;
  manualOverride?: boolean;
}

export interface DrivingEvent {
  id: string;
  type: 'hard_brake' | 'rapid_accel' | 'hard_turn' | 'engine_stall';
  timestamp: number;
  severity?: 'mild' | 'moderate' | 'severe';
  speedKmH?: number;
  lat?: number;
  lng?: number;
  value?: number; // esim. jarrutuskiihtyvyys m/s² tai G-voima
  description: string;
}

export interface DrivingBehavior {
  smoothnessScore: number; // 0 - 100
  ecoScore: number;        // 0 - 100
  hardBrakesCount: number;
  rapidAccelsCount: number;
  hardTurnsCount: number;
  engineStallsCount: number;
  events: DrivingEvent[];
  verbalReport?: string;   // Sanallinen pedagoginen arvio
}

export interface ObdDriveData {
  connected: boolean;
  deviceName?: string;
  isSimulated?: boolean;
  avgFuelConsumptionL100Km?: number; // l/100km
  totalFuelUsedLiters?: number;       // litraa
  avgFuelRateLitersPerHour?: number;  // L/h (EOBD PID 5E Engine Fuel Rate)
  maxFuelRateLitersPerHour?: number;  // L/h
  fuelRateSupported?: boolean;        // Onko auton ECU palauttanut PID 5E Engine Fuel Rate -arvon
  avgRpm?: number;
  maxRpm?: number;
  fuelType?: 'gasoline' | 'diesel';
}

export interface DriveSession {
  id: string;
  startTime: string; // ISO 8601
  endTime: string;   // ISO 8601
  durationSeconds: number;
  distanceKm: number;
  avgSpeedKmH: number;
  maxSpeedKmH: number;
  environment: DriveEnvironment;
  routePoints: GeoPoint[];
  topicCode: TraficomTopicCode; // K, A tai B
  notes: string;                // Aiheen tarkennus (esim. "Taskupysäköinti" tai "Liittymät")
  teacherNotes?: string;
  studentName?: string;
  drivingBehavior?: DrivingBehavior;
  obdData?: ObdDriveData;
  createdAt: string;
}

export interface TeachingInfo {
  studentName: string;
  studentSsn: string;
  teacherName: string;
  teacherSsn: string;
  licenseClass: string;
  startDate: string;
}

export interface OverallStats {
  totalDrives: number;
  totalDurationSeconds: number;
  totalDistanceKm: number;
  lessonHours50Min: number; // Ajotunnit (50 min / tunti)
  byEnvironment: Record<EnvironmentType, { count: number; durationSeconds: number; distanceKm: number }>;
  byTopicCode: Record<TraficomTopicCode, { count: number; durationSeconds: number; distanceKm: number }>;
}

export interface BackupPayload {
  version: string;
  exportedAt: string;
  appName: string;
  teachingInfo: TeachingInfo;
  drives: DriveSession[];
}
