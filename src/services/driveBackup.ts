import type { DriveSession, BackupPayload, TeachingInfo } from '../types';
import { importDrives, getTeachingInfo, saveTeachingInfo } from './localDb';
import { shareOrDownloadFile } from './exportService';
import { getAccessToken } from './googleAuth';
import { uploadBackupToGoogleDrive } from './googleDriveService';

/**
 * Luo täyden JSON-varmuuskopion.
 * Jos käyttäjä on kirjautunut Google Driveen, tallentaa suoraan pilveen.
 * Muutoin avaa laitteen järjestelmäjaon / lataa tiedoston.
 */
export async function backupToGoogleDrive(
  drives: DriveSession[], 
  teachingInfo: TeachingInfo
): Promise<{ directCloud: boolean; filename: string }> {
  const token = await getAccessToken();

  if (token) {
    // Suora Google Drive -tallennus REST API:lla
    const result = await uploadBackupToGoogleDrive(token, drives, teachingInfo);
    return { directCloud: true, filename: result.name };
  }

  // Paikallinen / jakovalikon varatoiminto
  const payload: BackupPayload = {
    version: '2.0',
    appName: 'Opetuslupa Ajopäiväkirja',
    exportedAt: new Date().toISOString(),
    teachingInfo: teachingInfo || getTeachingInfo(),
    drives,
  };

  const jsonStr = JSON.stringify(payload, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const filename = `ajopaivakirja_backup_${new Date().toISOString().slice(0, 10)}.json`;

  await shareOrDownloadFile(blob, filename, 'application/json', 'Tallenna varmuuskopio Google Driveen');
  return { directCloud: false, filename };
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
      if (data.teachingInfo) {
        saveTeachingInfo(data.teachingInfo);
      }
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
