import type { DriveSession, OverallStats, TeachingInfo, EnvironmentType } from '../types';

const STORAGE_DRIVES_KEY = 'opetuslupa_android_drives_clean_v2';
const STORAGE_INFO_KEY = 'opetuslupa_android_teaching_info_v2';

const DEFAULT_INFO: TeachingInfo = {
  studentName: '',
  studentSsn: '',
  teacherName: '',
  teacherSsn: '',
  licenseClass: 'B',
  startDate: new Date().toISOString().slice(0, 10),
};

export function getTeachingInfo(): TeachingInfo {
  try {
    const raw = localStorage.getItem(STORAGE_INFO_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error(e);
  }
  return DEFAULT_INFO;
}

export function saveTeachingInfo(info: TeachingInfo): void {
  localStorage.setItem(STORAGE_INFO_KEY, JSON.stringify(info));
}

export function getLocalDrives(): DriveSession[] {
  try {
    const raw = localStorage.getItem(STORAGE_DRIVES_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (e) {
    console.error('Virhe ladattaessa ajokertoja laitteen muistista:', e);
  }
  // ALUSTETAAN TYHJÄNÄ - Ei valmiita testiajoja!
  return [];
}

export function saveLocalDrive(drive: DriveSession): DriveSession[] {
  const drives = getLocalDrives();
  const existingIdx = drives.findIndex(d => d.id === drive.id);
  if (existingIdx >= 0) {
    drives[existingIdx] = drive;
  } else {
    drives.unshift(drive);
  }
  localStorage.setItem(STORAGE_DRIVES_KEY, JSON.stringify(drives));
  return drives;
}

export function updateLocalDrive(driveId: string, updates: Partial<DriveSession>): DriveSession[] {
  const drives = getLocalDrives();
  const index = drives.findIndex(d => d.id === driveId);
  if (index >= 0) {
    drives[index] = { ...drives[index], ...updates };
    localStorage.setItem(STORAGE_DRIVES_KEY, JSON.stringify(drives));
  }
  return drives;
}

export function deleteLocalDrive(driveId: string): DriveSession[] {
  const drives = getLocalDrives().filter(d => d.id !== driveId);
  localStorage.setItem(STORAGE_DRIVES_KEY, JSON.stringify(drives));
  return drives;
}

export function clearAllDrives(): void {
  localStorage.setItem(STORAGE_DRIVES_KEY, JSON.stringify([]));
}

export function importDrives(importedDrives: DriveSession[]): DriveSession[] {
  const current = getLocalDrives();
  const idMap = new Map<string, DriveSession>();

  importedDrives.forEach(d => idMap.set(d.id, d));
  current.forEach(d => {
    if (!idMap.has(d.id)) {
      idMap.set(d.id, d);
    }
  });

  const merged = Array.from(idMap.values()).sort(
    (a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime()
  );

  localStorage.setItem(STORAGE_DRIVES_KEY, JSON.stringify(merged));
  return merged;
}

export function calculateOverallStats(drives: DriveSession[]): OverallStats {
  const stats: OverallStats = {
    totalDrives: drives.length,
    totalDurationSeconds: 0,
    totalDistanceKm: 0,
    lessonHours50Min: 0,
    byEnvironment: {
      maantie: { count: 0, durationSeconds: 0, distanceKm: 0 },
      taajama: { count: 0, durationSeconds: 0, distanceKm: 0 },
      kaupunki: { count: 0, durationSeconds: 0, distanceKm: 0 },
      pysakointi: { count: 0, durationSeconds: 0, distanceKm: 0 },
    },
    byTopicCode: {
      K: { count: 0, durationSeconds: 0 },
      A: { count: 0, durationSeconds: 0 },
      B: { count: 0, durationSeconds: 0 },
    },
  };

  drives.forEach(d => {
    stats.totalDurationSeconds += d.durationSeconds;
    stats.totalDistanceKm += d.distanceKm;

    const env = d.environment.primary;
    if (stats.byEnvironment[env]) {
      stats.byEnvironment[env].count++;
      stats.byEnvironment[env].durationSeconds += d.durationSeconds;
      stats.byEnvironment[env].distanceKm += d.distanceKm;
    }

    const topic = d.topicCode || 'A';
    if (stats.byTopicCode[topic]) {
      stats.byTopicCode[topic].count++;
      stats.byTopicCode[topic].durationSeconds += d.durationSeconds;
    }
  });

  // Opetusluvassa 1 ajotunti = 50 min
  stats.lessonHours50Min = Number((stats.totalDurationSeconds / (50 * 60)).toFixed(1));
  stats.totalDistanceKm = Number(stats.totalDistanceKm.toFixed(1));
  for (const key of Object.keys(stats.byEnvironment) as EnvironmentType[]) {
    stats.byEnvironment[key].distanceKm = Number(stats.byEnvironment[key].distanceKm.toFixed(1));
  }

  return stats;
}
