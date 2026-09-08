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
  byTopicCode: Record<TraficomTopicCode, { count: number; durationSeconds: number }>;
}

export interface BackupPayload {
  version: string;
  exportedAt: string;
  appName: string;
  teachingInfo: TeachingInfo;
  drives: DriveSession[];
}
