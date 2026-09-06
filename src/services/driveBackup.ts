import type { DriveSession, BackupPayload } from '../types';
import { importDrives } from './localDb';
import { shareOrDownloadFile } from './exportService';

/**
 * Luo täyden JSON-varmuuskopion ja avaa Androidin järjestelmäjaon
 * (käyttäjä voi valita suoraan "Tallenna Google Driveen")
 */
export async function backupToGoogleDrive(drives: DriveSession[]): Promise<void> {
  const payload: BackupPayload = {
    version: '1.0',
    appName: 'Opetuslupa Ajopäiväkirja',
    exportedAt: new Date().toISOString(),
    totalDrives: drives.length,
    drives,
  };

  const jsonStr = JSON.stringify(payload, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const filename = `ajopaivakirja_backup_${new Date().toISOString().slice(0, 10)}.json`;
  const file = new File([blob], filename, { type: 'application/json' });

  await shareOrDownloadFile(file, filename, blob);
}

/**
 * Palauttaa ajokerrat aiemmin luodusta varmuuskopiotiedostosta
 */
export async function restoreFromBackupFile(file: File): Promise<{ success: boolean; count: number; error?: string }> {
  try {
    const text = await file.text();
    const data = JSON.parse(text);

    let driveList: DriveSession[] = [];

    if (Array.isArray(data)) {
      driveList = data;
    } else if (data.drives && Array.isArray(data.drives)) {
      driveList = data.drives;
    } else {
      return { success: false, count: 0, error: 'Tiedosto ei sisällä kelvollista ajopäiväkirjan varmuuskopiota.' };
    }

    if (driveList.length === 0) {
      return { success: false, count: 0, error: 'Varmuuskopiotiedosto oli tyhjä.' };
    }

    importDrives(driveList);
    return { success: true, count: driveList.length };
  } catch (err: any) {
    console.error('Varmuuskopion lukuvirhe:', err);
    return { success: false, count: 0, error: 'Tiedoston lukeminen epäonnistui: ' + err.message };
  }
}
