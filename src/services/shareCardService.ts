import { toBlob } from 'html-to-image';
import { shareOrDownloadFile } from './exportService';
import type { 
  DriveEnvironment, 
  DrivingBehavior, 
  ObdDriveData, 
  TraficomTopicCode 
} from '../types';
import { ENVIRONMENT_CONFIG, TRAFICOM_TOPIC_CONFIG } from './environmentClassifier';

export interface DriveShareData {
  startTime: string | Date;
  endTime?: string | Date;
  durationSeconds: number;
  distanceKm: number;
  avgSpeedKmH: number;
  topicCode?: TraficomTopicCode;
  environment?: DriveEnvironment;
  behavior?: DrivingBehavior;
  obdData?: ObdDriveData;
  verbalReport?: string;
  notes?: string;
  teacherNotes?: string;
  studentName?: string;
}

/**
 * Muodostaa selkeän, hymiöillä ja väliotsikoilla jäsennellyn tekstikoosteen 
 * leikepöydälle kopioitavaksi tai WhatsAppiin lähetettäväksi.
 */
export function formatDriveShareText(data: DriveShareData): string {
  const startDate = typeof data.startTime === 'string' ? new Date(data.startTime) : data.startTime;
  const dateStr = startDate.toLocaleDateString('fi-FI', {
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
  });
  const timeStr = startDate.toLocaleTimeString('fi-FI', {
    hour: '2-digit',
    minute: '2-digit',
  });

  const durationMin = Math.round(data.durationSeconds / 60);
  const topicCfg = data.topicCode ? TRAFICOM_TOPIC_CONFIG[data.topicCode] : null;
  const envCfg = data.environment?.primary ? ENVIRONMENT_CONFIG[data.environment.primary] : null;

  const lines: string[] = [];
  lines.push('🚗 OPETUSLUVAN AJOPÄIVÄKIRJA – AJOTAPAKOOSTE');
  lines.push(`📅 ${dateStr} klo ${timeStr}`);
  lines.push(`⏱️ Kesto: ${durationMin} min | 📍 Matka: ${data.distanceKm.toFixed(1)} km | ⚡ Keskinop.: ${Math.round(data.avgSpeedKmH)} km/h`);
  
  if (topicCfg || envCfg) {
    const parts: string[] = [];
    if (topicCfg) parts.push(`Aihe ${topicCfg.code} (${topicCfg.label})`);
    if (envCfg) parts.push(envCfg.label.split(' / ')[0]);
    lines.push(`🎯 ${parts.join(' • ')}`);
  }

  if (data.behavior) {
    const grade = 
      data.behavior.smoothnessScore >= 88 ? 'Erinomainen' :
      data.behavior.smoothnessScore >= 75 ? 'Hyvä' :
      data.behavior.smoothnessScore >= 60 ? 'Kohtalainen' : 'Harjoiteltavaa';

    lines.push('');
    lines.push(`⭐ Tasaisuusindeksi: ${data.behavior.smoothnessScore}/100 (${grade})`);
    lines.push(`🛑 Äkkijarrutukset: ${data.behavior.hardBrakesCount} kpl`);
    lines.push(`🔄 Vauhdikkaat mutkat: ${data.behavior.hardTurnsCount} kpl`);
    lines.push(`⚠️ Moottorin sammumiset: ${data.behavior.engineStallsCount} kpl`);
  }

  if (data.obdData && data.obdData.connected && data.obdData.avgFuelConsumptionL100Km) {
    let fuelLine = `⛽ Keskikulutus (OBD): ${data.obdData.avgFuelConsumptionL100Km} l/100 km`;
    if (data.obdData.avgFuelRateLitersPerHour) {
      fuelLine += ` (virtaus ${data.obdData.avgFuelRateLitersPerHour} L/h${data.obdData.fuelRateSupported ? ', PID 5E' : ''})`;
    }
    if (data.obdData.totalFuelUsedLiters) {
      fuelLine += ` (${data.obdData.totalFuelUsedLiters} L yht.)`;
    }
    lines.push(fuelLine);
  }

  const reportText = data.verbalReport || data.behavior?.verbalReport;
  if (reportText) {
    lines.push('');
    lines.push('💬 Pedagoginen palaute & vinkit:');
    lines.push(reportText.trim());
  }

  if (data.notes && data.notes.trim()) {
    lines.push('');
    lines.push(`📝 Oppilaan/opettajan aiheet: ${data.notes.trim()}`);
  }

  lines.push('');
  lines.push('Tallennettu Opetusluvan ajopäiväkirjalla • Traficom-yhteensopiva');
  return lines.join('\n');
}

/**
 * Kaappaa DOM-elementin PNG Blobiksi html-to-image -kirjastolla
 */
export async function captureElementToBlob(element: HTMLElement): Promise<Blob> {
  const blob = await toBlob(element, {
    quality: 0.96,
    pixelRatio: 2, // 2x Retina-resoluutio
    cacheBust: true,
    skipFonts: false,
  });

  if (!blob) {
    throw new Error('Kuvan muodostus epäonnistui (null blob)');
  }
  return blob;
}

/**
 * Fallback Canvas -kuvanpiirto, jos DOM-kaappaus epäonnistuisi jossain selaimessa/näkymässä.
 * Piirtää korkearesoluutioisen (840x1100) PNG-koostekortin.
 */
export async function generateCanvasFallbackBlob(data: DriveShareData): Promise<Blob> {
  return new Promise((resolve, reject) => {
    try {
      const width = 840;
      const height = 1120;
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas 2D context ei saatavilla'));
        return;
      }

      // Taustagradientti
      const grad = ctx.createLinearGradient(0, 0, 0, height);
      grad.addColorStop(0, '#0f172a');
      grad.addColorStop(0.5, '#1e1b4b');
      grad.addColorStop(1, '#090d16');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);

      // Koristerengas taustalle
      ctx.strokeStyle = 'rgba(99, 102, 241, 0.15)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(width - 80, 120, 160, 0, Math.PI * 2);
      ctx.stroke();

      // Yläotsikko & Brändi
      ctx.fillStyle = '#818cf8';
      ctx.font = 'bold 16px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.fillText('OPETUSLUVAN AJOPÄIVÄKIRJA', 40, 56);

      const startDate = typeof data.startTime === 'string' ? new Date(data.startTime) : data.startTime;
      const dateStr = startDate.toLocaleDateString('fi-FI', { day: 'numeric', month: 'long', year: 'numeric' });
      const timeStr = startDate.toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit' });

      ctx.fillStyle = '#94a3b8';
      ctx.font = '14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.fillText(`${dateStr} klo ${timeStr}`, width - 40 - ctx.measureText(`${dateStr} klo ${timeStr}`).width, 56);

      // Pääotsikko
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 28px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.fillText('Ajotapa & Ajon Yhteenveto', 40, 105);

      // Aihemerkki
      const topicCfg = data.topicCode ? TRAFICOM_TOPIC_CONFIG[data.topicCode] : null;
      if (topicCfg) {
        ctx.fillStyle = 'rgba(59, 130, 246, 0.2)';
        ctx.beginPath();
        ctx.roundRect(40, 122, 240, 32, 16);
        ctx.fill();
        ctx.fillStyle = '#93c5fd';
        ctx.font = 'bold 13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        ctx.fillText(`Aihe ${topicCfg.code} • ${topicCfg.label}`, 55, 143);
      }

      // 4 Tunnuslukulaatikkoa
      const statY = 175;
      const statW = 175;
      const statH = 95;
      const statGap = 20;

      const stats = [
        { label: 'KESTO', val: `${Math.round(data.durationSeconds / 60)} min` },
        { label: 'MATKA', val: `${data.distanceKm.toFixed(1)} km` },
        { label: 'KESKINOPEUS', val: `${Math.round(data.avgSpeedKmH)} km/h` },
        { 
          label: 'YMPÄRISTÖ', 
          val: data.environment?.primary ? ENVIRONMENT_CONFIG[data.environment.primary].label.split(' / ')[0] : 'Taajama' 
        },
      ];

      stats.forEach((s, i) => {
        const x = 40 + i * (statW + statGap);
        ctx.fillStyle = 'rgba(30, 41, 59, 0.7)';
        ctx.beginPath();
        ctx.roundRect(x, statY, statW, statH, 14);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.stroke();

        ctx.fillStyle = '#94a3b8';
        ctx.font = 'bold 11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        ctx.fillText(s.label, x + 16, statY + 30);

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 22px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        ctx.fillText(s.val, x + 16, statY + 68);
      });

      // Tasaisuusindeksi -hero-osio
      const scoreY = 295;
      const scoreH = 175;
      ctx.fillStyle = 'rgba(99, 102, 241, 0.12)';
      ctx.beginPath();
      ctx.roundRect(40, scoreY, width - 80, scoreH, 20);
      ctx.fill();
      ctx.strokeStyle = 'rgba(99, 102, 241, 0.3)';
      ctx.stroke();

      const score = data.behavior?.smoothnessScore ?? 85;
      ctx.fillStyle = '#c7d2fe';
      ctx.font = 'bold 14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.fillText('AJOTAVAN TASAISUUSINDEKSI', 65, scoreY + 40);

      ctx.fillStyle = '#38bdf8';
      ctx.font = 'extrabold 56px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.fillText(`${score}`, 65, scoreY + 105);

      ctx.fillStyle = '#94a3b8';
      ctx.font = 'bold 22px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.fillText('/ 100', 65 + ctx.measureText(`${score}`).width + 8, scoreY + 95);

      // Tapahtumalaskurit oikealla puolella
      const evY = scoreY + 30;
      const events = [
        { label: 'Äkkijarrutukset', count: data.behavior?.hardBrakesCount ?? 0, col: '#f43f5e' },
        { label: 'Vauhdikkaat mutkat', count: data.behavior?.hardTurnsCount ?? 0, col: '#f59e0b' },
        { label: 'Sammumiset', count: data.behavior?.engineStallsCount ?? 0, col: '#c084fc' },
      ];

      events.forEach((ev, i) => {
        const evX = 420 + i * 125;
        ctx.fillStyle = 'rgba(15, 23, 42, 0.6)';
        ctx.beginPath();
        ctx.roundRect(evX, evY, 115, 115, 14);
        ctx.fill();

        ctx.fillStyle = ev.col;
        ctx.font = 'bold 30px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        ctx.fillText(`${ev.count}`, evX + 20, evY + 50);

        ctx.fillStyle = '#cbd5e1';
        ctx.font = '11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        ctx.fillText(ev.label.split(' ')[0], evX + 16, evY + 80);
        if (ev.label.split(' ')[1]) {
          ctx.fillText(ev.label.split(' ')[1], evX + 16, evY + 96);
        }
      });

      // OBD-kulutusrivi jos saatavilla
      let contentY = 495;
      if (data.obdData && data.obdData.connected && data.obdData.avgFuelConsumptionL100Km) {
        ctx.fillStyle = 'rgba(16, 185, 129, 0.12)';
        ctx.beginPath();
        ctx.roundRect(40, contentY, width - 80, 52, 14);
        ctx.fill();
        ctx.strokeStyle = 'rgba(16, 185, 129, 0.3)';
        ctx.stroke();

        ctx.fillStyle = '#6ee7b7';
        ctx.font = 'bold 15px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        const rateSuffix = data.obdData.avgFuelRateLitersPerHour 
          ? ` (${data.obdData.avgFuelRateLitersPerHour} L/h${data.obdData.fuelRateSupported ? ' PID 5E' : ''})` 
          : '';
        ctx.fillText(`⛽ Polttoaineen kulutus: ${data.obdData.avgFuelConsumptionL100Km} l/100 km${rateSuffix}`, 60, contentY + 32);

        if (data.obdData.totalFuelUsedLiters) {
          ctx.fillStyle = '#a7f3d0';
          ctx.font = '13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
          const txt = `Yhteensä ${data.obdData.totalFuelUsedLiters} litraa`;
          ctx.fillText(txt, width - 60 - ctx.measureText(txt).width, contentY + 32);
        }

        contentY += 70;
      }

      // Pedagoginen palaute
      const reportText = data.verbalReport || data.behavior?.verbalReport || 'Ajo sujui rauhallisesti ja hallitusti.';
      const boxH = 260;
      ctx.fillStyle = 'rgba(30, 41, 59, 0.6)';
      ctx.beginPath();
      ctx.roundRect(40, contentY, width - 80, boxH, 18);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.stroke();

      ctx.fillStyle = '#93c5fd';
      ctx.font = 'bold 16px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.fillText('💬 Pedagoginen palaute & kehitysvinkit:', 65, contentY + 38);

      // Tekstin rivitys
      ctx.fillStyle = '#e2e8f0';
      ctx.font = '15px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      const words = reportText.split(' ');
      let currentLine = '';
      let textY = contentY + 75;
      const maxW = width - 130;

      for (let n = 0; n < words.length; n++) {
        const testLine = currentLine + words[n] + ' ';
        const metrics = ctx.measureText(testLine);
        if (metrics.width > maxW && n > 0) {
          ctx.fillText(currentLine, 65, textY);
          currentLine = words[n] + ' ';
          textY += 26;
          if (textY > contentY + boxH - 30) {
            ctx.fillText(currentLine + '...', 65, textY);
            currentLine = '';
            break;
          }
        } else {
          currentLine = testLine;
        }
      }
      if (currentLine) {
        ctx.fillText(currentLine, 65, textY);
      }

      // Alapalkki / Vesileima
      ctx.fillStyle = '#64748b';
      ctx.font = '13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.fillText('Tallennettu Opetusluvan ajopäiväkirjalla • Traficom-yhteensopiva opetuskortti', 40, height - 35);

      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Canvas toBlob palautti tyhjän tiedoston'));
      }, 'image/png');
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Jakaa ajotapakoosteen PNG-kuvana laitteen jakovalikkoon (Android / Web Share / Lataus)
 */
export async function shareDriveSummaryImage(blob: Blob, filenamePrefix = 'ajotapa'): Promise<void> {
  const timestamp = new Date().toISOString().slice(0, 10);
  const filename = `${filenamePrefix}_${timestamp}.png`;
  await shareOrDownloadFile(blob, filename, 'image/png', 'Jaa ajotapakooste');
}

/**
 * Lataa PNG-tiedoston suoraan selaimessa / laitteelle
 */
export function downloadImageBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Kopioi kuva-blobin leikepöydälle (jos selain tukee ClipboardItem APIa)
 */
export async function copyImageBlobToClipboard(blob: Blob): Promise<boolean> {
  if (typeof window === 'undefined' || !navigator.clipboard || !window.ClipboardItem) {
    return false;
  }
  try {
    await navigator.clipboard.write([
      new ClipboardItem({
        'image/png': blob,
      }),
    ]);
    return true;
  } catch (err) {
    console.warn('Kuvan kopiointi leikepöydälle epäonnistui:', err);
    return false;
  }
}
