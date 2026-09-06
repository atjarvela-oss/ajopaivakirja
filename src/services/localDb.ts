import type { DriveSession, OverallStats, EnvironmentType } from '../types';

const STORAGE_KEY = 'opetuslupa_android_drives_v1';

const INITIAL_SAMPLE_DRIVES: DriveSession[] = [
  {
    id: 'drive-demo-1',
    startTime: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(),
    endTime: new Date(Date.now() - 1000 * 60 * 60 * 48 + 1000 * 60 * 50).toISOString(),
    durationSeconds: 50 * 60,
    distanceKm: 38.5,
    avgSpeedKmH: 46.2,
    maxSpeedKmH: 85.0,
    environment: {
      primary: 'taajama',
      distribution: { maantie: 25, taajama: 55, kaupunki: 15, pysakointi: 5 },
    },
    routePoints: [
      { lat: 60.1699, lng: 24.9384, timestamp: Date.now() - 3000000, speed: 20 },
      { lat: 60.1800, lng: 24.9450, timestamp: Date.now() - 2400000, speed: 45 },
      { lat: 60.2100, lng: 24.9600, timestamp: Date.now() - 1800000, speed: 60 },
      { lat: 60.2300, lng: 24.9800, timestamp: Date.now() - 1200000, speed: 80 },
      { lat: 60.2500, lng: 25.0100, timestamp: Date.now() - 600000, speed: 50 },
    ],
    notes: 'Kiertoliittymät, ryhmittyminen ja kaistanvaihdot taajamassa.',
    studentName: 'Opetuslupaoppilas',
    teacherNotes: 'Hyvää havainnointia ja vilkun käyttö ajoissa.',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(),
  },
  {
    id: 'drive-demo-2',
    startTime: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
    endTime: new Date(Date.now() - 1000 * 60 * 60 * 24 + 1000 * 60 * 35).toISOString(),
    durationSeconds: 35 * 60,
    distanceKm: 3.2,
    avgSpeedKmH: 5.5,
    maxSpeedKmH: 16.0,
    environment: {
      primary: 'pysakointi',
      distribution: { maantie: 0, taajama: 10, kaupunki: 15, pysakointi: 75 },
    },
    routePoints: [
      { lat: 60.2010, lng: 24.9350, timestamp: Date.now() - 2100000, speed: 5 },
      { lat: 60.2012, lng: 24.9355, timestamp: Date.now() - 1500000, speed: 8 },
      { lat: 60.2015, lng: 24.9348, timestamp: Date.now() - 900000, speed: 4 },
      { lat: 60.2010, lng: 24.9352, timestamp: Date.now() - 300000, speed: 6 },
    ],
    notes: 'Taskupysäköinti, ruutuun peruutus peilejä ja pään kääntöä käyttäen.',
    studentName: 'Opetuslupaoppilas',
    teacherNotes: 'Kytkintuntuma hyvä, rauhallinen peruutus.',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
  },
  {
    id: 'drive-demo-3',
    startTime: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(),
    endTime: new Date(Date.now() - 1000 * 60 * 60 * 5 + 1000 * 60 * 60).toISOString(),
    durationSeconds: 60 * 60,
    distanceKm: 56.4,
    avgSpeedKmH: 56.4,
    maxSpeedKmH: 104.0,
    environment: {
      primary: 'maantie',
      distribution: { maantie: 70, taajama: 20, kaupunki: 10, pysakointi: 0 },
    },
    routePoints: [
      { lat: 60.2000, lng: 24.9300, timestamp: Date.now() - 3600000, speed: 45 },
      { lat: 60.2600, lng: 25.0200, timestamp: Date.now() - 2700000, speed: 85 },
      { lat: 60.3600, lng: 25.1200, timestamp: Date.now() - 1800000, speed: 100 },
      { lat: 60.4200, lng: 25.2000, timestamp: Date.now() - 900000, speed: 95 },
      { lat: 60.4400, lng: 25.2200, timestamp: Date.now() - 100000, speed: 60 },
    ],
    notes: 'Moottoritielle liittyminen, turvavälin säilyttäminen ja ohitustilanteet.',
    studentName: 'Opetuslupaoppilas',
    teacherNotes: 'Reipas kiihdytys liittymiskaistalla, varma ajo.',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(),
  },
];

export function getLocalDrives(): DriveSession[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (e) {
    console.error('Virhe ladattaessa ajokertoja laitteen muistista:', e);
  }
  // Alustetaan esimerkkiajoilla jos tyhjä
  localStorage.setItem(STORAGE_KEY, JSON.stringify(INITIAL_SAMPLE_DRIVES));
  return INITIAL_SAMPLE_DRIVES;
}

export function saveLocalDrive(drive: DriveSession): DriveSession[] {
  const drives = getLocalDrives();
  const existingIdx = drives.findIndex(d => d.id === drive.id);
  if (existingIdx >= 0) {
    drives[existingIdx] = drive;
  } else {
    drives.unshift(drive);
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(drives));
  return drives;
}

export function updateLocalDrive(driveId: string, updates: Partial<DriveSession>): DriveSession[] {
  const drives = getLocalDrives();
  const index = drives.findIndex(d => d.id === driveId);
  if (index >= 0) {
    drives[index] = { ...drives[index], ...updates };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(drives));
  }
  return drives;
}

export function deleteLocalDrive(driveId: string): DriveSession[] {
  const drives = getLocalDrives().filter(d => d.id !== driveId);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(drives));
  return drives;
}

export function importDrives(importedDrives: DriveSession[]): DriveSession[] {
  const current = getLocalDrives();
  const idMap = new Map<string, DriveSession>();

  // Yhdistetään olemassa olevat ja tuodut
  importedDrives.forEach(d => idMap.set(d.id, d));
  current.forEach(d => {
    if (!idMap.has(d.id)) {
      idMap.set(d.id, d);
    }
  });

  const merged = Array.from(idMap.values()).sort(
    (a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime()
  );

  localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
  return merged;
}

export function calculateOverallStats(drives: DriveSession[]): OverallStats {
  const stats: OverallStats = {
    totalDrives: drives.length,
    totalDurationSeconds: 0,
    totalDistanceKm: 0,
    byEnvironment: {
      maantie: { count: 0, durationSeconds: 0, distanceKm: 0 },
      taajama: { count: 0, durationSeconds: 0, distanceKm: 0 },
      kaupunki: { count: 0, durationSeconds: 0, distanceKm: 0 },
      pysakointi: { count: 0, durationSeconds: 0, distanceKm: 0 },
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
  });

  stats.totalDistanceKm = Number(stats.totalDistanceKm.toFixed(1));
  for (const key of Object.keys(stats.byEnvironment) as EnvironmentType[]) {
    stats.byEnvironment[key].distanceKm = Number(stats.byEnvironment[key].distanceKm.toFixed(1));
  }

  return stats;
}
