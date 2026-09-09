import type { DriveSession, BackupPayload, TeachingInfo } from '../types';
import { getTeachingInfo } from './localDb';

export interface GoogleDriveBackupItem {
  id: string;
  name: string;
  size?: string;
  modifiedTime: string;
  createdTime?: string;
  description?: string;
}

const DRIVE_API_URL = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3';

/**
 * Listaa käyttäjän Google Drivesta sovelluksen tallentamat varmuuskopiot
 */
export async function listGoogleDriveBackups(accessToken: string): Promise<GoogleDriveBackupItem[]> {
  const query = "name contains 'ajopaivakirja_backup' and trashed = false";
  const url = `${DRIVE_API_URL}/files?q=${encodeURIComponent(query)}&fields=files(id,name,size,modifiedTime,createdTime,description)&orderBy=modifiedTime desc&pageSize=30`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData?.error?.message || `Google Drive -haku epäonnistui (koodi ${response.status})`);
  }

  const data = await response.json();
  return (data.files || []) as GoogleDriveBackupItem[];
}

/**
 * Lataa varmuuskopion sisällön Google Drivesta
 */
export async function downloadBackupFromGoogleDrive(accessToken: string, fileId: string): Promise<BackupPayload> {
  const url = `${DRIVE_API_URL}/files/${fileId}?alt=media`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData?.error?.message || `Google Drive -lataus epäonnistui (koodi ${response.status})`);
  }

  const content = await response.json();
  return content as BackupPayload;
}

/**
 * Tallentaa uuden JSON-varmuuskopion suoraan Google Driveen
 */
export async function uploadBackupToGoogleDrive(
  accessToken: string,
  drives: DriveSession[],
  teachingInfo: TeachingInfo,
  customName?: string
): Promise<GoogleDriveBackupItem> {
  const payload: BackupPayload = {
    version: '2.0',
    appName: 'Opetuslupa Ajopäiväkirja',
    exportedAt: new Date().toISOString(),
    teachingInfo: teachingInfo || getTeachingInfo(),
    drives,
  };

  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  const timeStr = now.toTimeString().slice(0, 5).replace(':', '');
  const filename = customName || `ajopaivakirja_backup_${dateStr}_${timeStr}.json`;
  const fileContent = JSON.stringify(payload, null, 2);

  const metadata = {
    name: filename,
    mimeType: 'application/json',
    description: `Opetuslupalaisen ajopäiväkirjan varmuuskopio (${drives.length} ajokertaa, tallennettu ${now.toLocaleString('fi-FI')})`,
  };

  const boundary = '-------314159265358979323846';
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;

  const multipartRequestBody =
    delimiter +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(metadata) +
    delimiter +
    'Content-Type: application/json\r\n\r\n' +
    fileContent +
    closeDelimiter;

  const response = await fetch(`${DRIVE_UPLOAD_URL}/files?uploadType=multipart`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body: multipartRequestBody,
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData?.error?.message || `Google Drive -tallennus epäonnistui (koodi ${response.status})`);
  }

  const result = await response.json();
  return result as GoogleDriveBackupItem;
}

/**
 * Poistaa tiedoston Google Drivesta
 * HUOMIO: Tätä kutsutaan aina vain käyttäjän eksplisiittisen vahvistuksen jälkeen!
 */
export async function deleteBackupFromGoogleDrive(accessToken: string, fileId: string): Promise<void> {
  const url = `${DRIVE_API_URL}/files/${fileId}`;

  const response = await fetch(url, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok && response.status !== 204) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData?.error?.message || `Google Drive -poisto epäonnistui (koodi ${response.status})`);
  }
}

/**
 * Tallentaa luodun PDF-opetuskortin suoraan käyttäjän Google Driveen
 */
export async function uploadPdfToGoogleDrive(
  accessToken: string,
  pdfBlob: Blob,
  filename: string
): Promise<GoogleDriveBackupItem> {
  const metadata = {
    name: filename,
    mimeType: 'application/pdf',
    description: `Traficom-opetuskortti luotu Opetuslupalaisen ajopäiväkirjasta (${new Date().toLocaleDateString('fi-FI')})`,
  };

  const boundary = '-------314159265358979323846';
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;

  const pdfArrayBuffer = await pdfBlob.arrayBuffer();
  const pdfBytes = new Uint8Array(pdfArrayBuffer);

  const metadataHeader = 
    delimiter +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(metadata) +
    delimiter +
    'Content-Type: application/pdf\r\n\r\n';

  const textEncoder = new TextEncoder();
  const headerBytes = textEncoder.encode(metadataHeader);
  const footerBytes = textEncoder.encode(closeDelimiter);

  // Combine metadata header, binary PDF bytes, and footer
  const combinedBody = new Uint8Array(headerBytes.length + pdfBytes.length + footerBytes.length);
  combinedBody.set(headerBytes, 0);
  combinedBody.set(pdfBytes, headerBytes.length);
  combinedBody.set(footerBytes, headerBytes.length + pdfBytes.length);

  const response = await fetch(`${DRIVE_UPLOAD_URL}/files?uploadType=multipart`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body: combinedBody,
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData?.error?.message || `Google Drive PDF-tallennus epäonnistui (koodi ${response.status})`);
  }

  const result = await response.json();
  return result as GoogleDriveBackupItem;
}
