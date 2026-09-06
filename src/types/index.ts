export type EnvironmentType = 'maantie' | 'taajama' | 'kaupunki' | 'pysakointi';

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
  notes: string;
  studentName?: string;
  teacherNotes?: string;
  createdAt: string;
}

export interface OverallStats {
  totalDrives: number;
  totalDurationSeconds: number;
  totalDistanceKm: number;
  byEnvironment: Record<EnvironmentType, { count: number; durationSeconds: number; distanceKm: number }>;
}

export interface BackupPayload {
  version: string;
  exportedAt: string;
  appName: string;
  totalDrives: number;
  drives: DriveSession[];
}
