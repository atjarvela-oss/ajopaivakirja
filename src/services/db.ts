import { 
  collection, 
  doc, 
  setDoc, 
  getDocs, 
  query, 
  where, 
  orderBy, 
  updateDoc, 
  deleteDoc 
} from 'firebase/firestore';
import { firestoreDb, isFirebaseConfigured } from './firebase';
import type { DriveSession, AppUser, OverallStats, EnvironmentType } from '../types';

const STORAGE_DRIVES_KEY = 'opetuslupa_drives_data';

const INITIAL_MOCK_DRIVES: DriveSession[] = [
  {
    id: 'drive-mock-1',
    studentId: 'student-demo-1',
    studentName: 'Matti Meikäläinen',
    studentEmail: 'oppilas.esimerkki@gmail.com',
    startTime: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(),
    endTime: new Date(Date.now() - 1000 * 60 * 60 * 48 + 1000 * 60 * 45).toISOString(),
    durationSeconds: 45 * 60,
    distanceKm: 34.2,
    avgSpeedKmH: 45.6,
    maxSpeedKmH: 84.0,
    environment: {
      primary: 'taajama',
      distribution: { maantie: 25, taajama: 55, kaupunki: 15, pysakointi: 5 },
    },
    routePoints: [
      { lat: 60.1699, lng: 24.9384, timestamp: Date.now() - 2700000, speed: 20 },
      { lat: 60.1800, lng: 24.9450, timestamp: Date.now() - 2100000, speed: 45 },
      { lat: 60.2100, lng: 24.9600, timestamp: Date.now() - 1500000, speed: 60 },
      { lat: 60.2300, lng: 24.9800, timestamp: Date.now() - 900000, speed: 80 },
      { lat: 60.2450, lng: 24.9950, timestamp: Date.now() - 300000, speed: 50 },
    ],
    notes: 'Kiertoliittymät ja kaistanvaihdot taajamassa, lyhyt pätkä Tuusulanväylää.',
    approvedByTeacher: true,
    teacherFeedback: 'Hyvää havainnointia ja vilkun käyttö ajoissa.',
    approvedAt: new Date(Date.now() - 1000 * 60 * 60 * 40).toISOString(),
    approvedByEmail: 'atjarvela@gmail.com',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(),
  },
  {
    id: 'drive-mock-2',
    studentId: 'student-demo-1',
    studentName: 'Matti Meikäläinen',
    studentEmail: 'oppilas.esimerkki@gmail.com',
    startTime: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
    endTime: new Date(Date.now() - 1000 * 60 * 60 * 24 + 1000 * 60 * 35).toISOString(),
    durationSeconds: 35 * 60,
    distanceKm: 2.4,
    avgSpeedKmH: 4.1,
    maxSpeedKmH: 14.5,
    environment: {
      primary: 'pysakointi',
      distribution: { maantie: 0, taajama: 10, kaupunki: 10, pysakointi: 80 },
    },
    routePoints: [
      { lat: 60.2010, lng: 24.9350, timestamp: Date.now() - 2100000, speed: 5 },
      { lat: 60.2012, lng: 24.9355, timestamp: Date.now() - 1500000, speed: 8 },
      { lat: 60.2015, lng: 24.9348, timestamp: Date.now() - 900000, speed: 4 },
      { lat: 60.2010, lng: 24.9352, timestamp: Date.now() - 300000, speed: 6 },
    ],
    notes: 'Prisman parkkialueella taskupysäköintiä ja peruuttamista ruutuun.',
    approvedByTeacher: true,
    teacherFeedback: 'Peruutus sujuu hyvin, muista tarkkailla peilien lisäksi olan yli.',
    approvedAt: new Date(Date.now() - 1000 * 60 * 60 * 20).toISOString(),
    approvedByEmail: 'atjarvela@gmail.com',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
  },
  {
    id: 'drive-mock-3',
    studentId: 'student-demo-1',
    studentName: 'Matti Meikäläinen',
    studentEmail: 'oppilas.esimerkki@gmail.com',
    startTime: new Date(Date.now() - 1000 * 60 * 60 * 6).toISOString(),
    endTime: new Date(Date.now() - 1000 * 60 * 60 * 6 + 1000 * 60 * 55).toISOString(),
    durationSeconds: 55 * 60,
    distanceKm: 48.0,
    avgSpeedKmH: 52.3,
    maxSpeedKmH: 105.0,
    environment: {
      primary: 'maantie',
      distribution: { maantie: 65, taajama: 25, kaupunki: 10, pysakointi: 0 },
    },
    routePoints: [
      { lat: 60.2000, lng: 24.9300, timestamp: Date.now() - 3300000, speed: 40 },
      { lat: 60.2600, lng: 25.0200, timestamp: Date.now() - 2500000, speed: 85 },
      { lat: 60.3500, lng: 25.1000, timestamp: Date.now() - 1500000, speed: 102 },
      { lat: 60.4000, lng: 25.1500, timestamp: Date.now() - 800000, speed: 95 },
      { lat: 60.4100, lng: 25.1800, timestamp: Date.now() - 200000, speed: 60 },
    ],
    notes: 'Moottoritielle liittyminen, turvavälit ja ajolinjat maantiellä.',
    approvedByTeacher: false,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 6).toISOString(),
  },
];

function getStoredLocalDrives(): DriveSession[] {
  try {
    const raw = localStorage.getItem(STORAGE_DRIVES_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error(e);
  }
  localStorage.setItem(STORAGE_DRIVES_KEY, JSON.stringify(INITIAL_MOCK_DRIVES));
  return INITIAL_MOCK_DRIVES;
}

function saveStoredLocalDrives(drives: DriveSession[]) {
  localStorage.setItem(STORAGE_DRIVES_KEY, JSON.stringify(drives));
}

export async function getDriveSessions(currentUser: AppUser | null, studentFilterId?: string): Promise<DriveSession[]> {
  if (!currentUser) return [];

  if (isFirebaseConfigured && firestoreDb) {
    const drivesRef = collection(firestoreDb, 'drives');
    let q;

    if (currentUser.role === 'admin') {
      if (studentFilterId && studentFilterId !== 'all') {
        q = query(drivesRef, where('studentId', '==', studentFilterId), orderBy('startTime', 'desc'));
      } else {
        q = query(drivesRef, orderBy('startTime', 'desc'));
      }
    } else {
      q = query(drivesRef, where('studentId', '==', currentUser.uid), orderBy('startTime', 'desc'));
    }

    try {
      const snap = await getDocs(q);
      return snap.docs.map(doc => ({ id: doc.id, ...doc.data() } as DriveSession));
    } catch (err) {
      console.warn('Virhe haettaessa Firestoresta, käytetään paikallista välimuistia:', err);
    }
  }

  const all = getStoredLocalDrives();
  if (currentUser.role === 'admin') {
    if (studentFilterId && studentFilterId !== 'all') {
      return all.filter(d => d.studentId === studentFilterId);
    }
    return all;
  }
  return all.filter(d => d.studentId === currentUser.uid);
}

export async function saveDriveSession(drive: DriveSession): Promise<void> {
  const localDrives = getStoredLocalDrives();
  const existingIdx = localDrives.findIndex(d => d.id === drive.id);
  if (existingIdx >= 0) {
    localDrives[existingIdx] = drive;
  } else {
    localDrives.unshift(drive);
  }
  saveStoredLocalDrives(localDrives);

  if (isFirebaseConfigured && firestoreDb) {
    try {
      const docRef = doc(firestoreDb, 'drives', drive.id);
      await setDoc(docRef, drive);
    } catch (e) {
      console.error('Virhe tallennettaessa Firestoreen:', e);
    }
  }
}

export async function updateDriveSession(driveId: string, updates: Partial<DriveSession>): Promise<void> {
  const localDrives = getStoredLocalDrives();
  const index = localDrives.findIndex(d => d.id === driveId);
  if (index >= 0) {
    localDrives[index] = { ...localDrives[index], ...updates };
    saveStoredLocalDrives(localDrives);
  }

  if (isFirebaseConfigured && firestoreDb) {
    try {
      const docRef = doc(firestoreDb, 'drives', driveId);
      await updateDoc(docRef, updates);
    } catch (e) {
      console.error('Virhe päivitettäessä Firestoreen:', e);
    }
  }
}

export async function approveDriveSession(
  driveId: string, 
  teacherUser: AppUser, 
  feedback?: string
): Promise<void> {
  const updates: Partial<DriveSession> = {
    approvedByTeacher: true,
    teacherFeedback: feedback || 'Ajokerta kuitattu ja hyväksytty opetusluvassa.',
    approvedAt: new Date().toISOString(),
    approvedByEmail: teacherUser.email || 'atjarvela@gmail.com',
  };

  await updateDriveSession(driveId, updates);
}

export async function deleteDriveSession(driveId: string): Promise<void> {
  const localDrives = getStoredLocalDrives().filter(d => d.id !== driveId);
  saveStoredLocalDrives(localDrives);

  if (isFirebaseConfigured && firestoreDb) {
    try {
      await deleteDoc(doc(firestoreDb, 'drives', driveId));
    } catch (e) {
      console.error('Virhe poistettaessa Firestoresta:', e);
    }
  }
}

export function calculateOverallStats(drives: DriveSession[]): OverallStats {
  const stats: OverallStats = {
    totalDrives: drives.length,
    totalDurationSeconds: 0,
    totalDistanceKm: 0,
    approvedDrives: 0,
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
    if (d.approvedByTeacher) stats.approvedDrives++;

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

export function exportDrivesToCSV(drives: DriveSession[]): void {
  const headers = [
    'Päivämäärä',
    'Oppilas',
    'Lähtöaika',
    'Lopetusaika',
    'Kesto (min)',
    'Kesto (tuntia)',
    'Matka (km)',
    'Keskinopeus (km/h)',
    'Huippunopeus (km/h)',
    'Ajoympäristö',
    'Ympäristöjakauma',
    'Opettajan kuittaus',
    'Opettajan palaute',
    'Aiheet / Huomiot'
  ];

  const rows = drives.map(d => {
    const startDate = new Date(d.startTime);
    const endDate = new Date(d.endTime);
    const dateStr = startDate.toLocaleDateString('fi-FI');
    const startTimeStr = startDate.toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit' });
    const endTimeStr = endDate.toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit' });
    const durationMin = Math.round(d.durationSeconds / 60);
    const durationHours = (d.durationSeconds / 3600).toFixed(2);
    
    const distSummary = `Maantie:${d.environment.distribution.maantie}% Taajama:${d.environment.distribution.taajama}% Kaupunki:${d.environment.distribution.kaupunki}% Pysäköinti:${d.environment.distribution.pysakointi}%`;

    return [
      `"${dateStr}"`,
      `"${d.studentName} (${d.studentEmail})"`,
      `"${startTimeStr}"`,
      `"${endTimeStr}"`,
      durationMin,
      `"${durationHours.replace('.', ',')}"`,
      `"${d.distanceKm.toString().replace('.', ',')}"`,
      `"${d.avgSpeedKmH.toString().replace('.', ',')}"`,
      `"${d.maxSpeedKmH.toString().replace('.', ',')}"`,
      `"${d.environment.primary.toUpperCase()}"`,
      `"${distSummary}"`,
      d.approvedByTeacher ? `"Kyllä (${d.approvedByEmail || 'Opettaja'})"` : '"Ei"',
      `"${(d.teacherFeedback || '').replace(/"/g, '""')}"`,
      `"${(d.notes || '').replace(/"/g, '""')}"`
    ].join(';');
  });

  const csvContent = '\uFEFF' + [headers.join(';'), ...rows].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `ajopaivakirja_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
