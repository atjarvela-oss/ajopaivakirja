export type UserRole = 'admin' | 'student';

export interface AppUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  role: UserRole;
  createdAt?: string;
  lastLoginAt?: string;
}

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
  studentId: string;
  studentName: string;
  studentEmail: string;
  startTime: string; // ISO 8601
  endTime: string;   // ISO 8601
  durationSeconds: number;
  distanceKm: number;
  avgSpeedKmH: number;
  maxSpeedKmH: number;
  environment: DriveEnvironment;
  routePoints: GeoPoint[];
  notes: string;
  approvedByTeacher: boolean;
  teacherFeedback?: string;
  approvedAt?: string;
  approvedByEmail?: string;
  createdAt: string;
}

export interface DriveFilter {
  studentId?: string;
  environment?: EnvironmentType | 'all';
  startDate?: string;
  endDate?: string;
  searchQuery?: string;
}

export interface OverallStats {
  totalDrives: number;
  totalDurationSeconds: number;
  totalDistanceKm: number;
  approvedDrives: number;
  byEnvironment: Record<EnvironmentType, { count: number; durationSeconds: number; distanceKm: number }>;
}

export interface FirebaseConfigState {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}
