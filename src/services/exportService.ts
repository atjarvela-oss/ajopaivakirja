import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { toPng } from 'html-to-image';
import type { DriveSession, OverallStats } from '../types';
import { ENVIRONMENT_CONFIG } from './environmentClassifier';

/**
 * Jakaa tiedoston Androidin järjestelmäjakovalikkoon (tai lataa selaimessa)
 */
export async function shareOrDownloadFile(file: File, fallbackFilename: string, blob: Blob) {
  if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({
        title: file.name,
        text: 'Opetusluvan ajopäiväkirja',
        files: [file],
      });
      return;
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.warn('Jako epäonnistui, ladataan tiedosto:', err);
      } else {
        return; // Käyttäjä peruutti jaon
      }
    }
  }

  // Fallback: Suora lataus tiedostona
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fallbackFilename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Luo virallisen A4 PDF -ajopäiväkirjan Traficom/Ajovarma -vaatimusten mukaisesti
 */
export async function exportDrivesToPdf(
  drives: DriveSession[],
  stats: OverallStats,
  studentName = 'Opetuslupaoppilas',
  teacherName = 'Opettaja'
) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const todayStr = new Date().toLocaleDateString('fi-FI');

  // 1. Otsikkoalue
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(30, 41, 59); // Slate-800
  doc.text('OPETUSLUVAN AJOPÄIVÄKIRJA', 14, 20);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(100, 116, 139); // Slate-500
  doc.text('Kuljettajaopetuksen ajokertojen ja ajoympäristöjen virallinen erittely', 14, 26);
  doc.text(`Luotu: ${todayStr}`, pageWidth - 14, 26, { align: 'right' });

  // Vaakaviiva
  doc.setDrawColor(203, 213, 225);
  doc.line(14, 29, pageWidth - 14, 29);

  // 2. Osapuolten tiedot
  doc.setFontSize(10);
  doc.setTextColor(51, 65, 85);
  doc.text(`Oppilas: ${studentName}`, 14, 36);
  doc.text(`Opettaja: ${teacherName}`, 105, 36);

  // 3. Yhteenvetolaatikko (Tunnit & Ajoympäristöt)
  const totalHours = (stats.totalDurationSeconds / 3600).toFixed(1);
  const maantieHours = (stats.byEnvironment.maantie.durationSeconds / 3600).toFixed(1);
  const taajamaHours = (stats.byEnvironment.taajama.durationSeconds / 3600).toFixed(1);
  const kaupunkiHours = (stats.byEnvironment.kaupunki.durationSeconds / 3600).toFixed(1);
  const parkHours = (stats.byEnvironment.pysakointi.durationSeconds / 3600).toFixed(1);

  doc.setFillColor(248, 250, 252);
  doc.roundedRect(14, 41, pageWidth - 28, 26, 3, 3, 'F');
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(14, 41, pageWidth - 28, 26, 3, 3, 'D');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text('OPETUSTUNTIEN YHTEENVETO', 18, 48);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);

  const col1X = 18;
  const col2X = 75;
  const col3X = 135;

  doc.text(`Ajoaika yhteensä: ${totalHours} h (${stats.totalDrives} ajokertaa)`, col1X, 55);
  doc.text(`Ajettu matka: ${stats.totalDistanceKm} km`, col1X, 61);

  doc.text(`• Maantie / Moottoritie: ${maantieHours} h (${stats.byEnvironment.maantie.distanceKm} km)`, col2X, 55);
  doc.text(`• Taajama (40-60 km/h): ${taajamaHours} h (${stats.byEnvironment.taajama.distanceKm} km)`, col2X, 61);

  doc.text(`• Kaupunki / Keskusta: ${kaupunkiHours} h (${stats.byEnvironment.kaupunki.distanceKm} km)`, col3X, 55);
  doc.text(`• Pysäköinti / Käsittely: ${parkHours} h (${stats.byEnvironment.pysakointi.distanceKm} km)`, col3X, 61);

  // 4. Ajokertojen Taulukko
  const tableData = drives.map((d, index) => {
    const sDate = new Date(d.startTime);
    const eDate = new Date(d.endTime);
    const pvm = sDate.toLocaleDateString('fi-FI');
    const kellonaika = `${sDate.toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit' })} - ${eDate.toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit' })}`;
    const kesto = `${Math.round(d.durationSeconds / 60)} min\n(${(d.durationSeconds / 3600).toFixed(1)} h)`;
    const matka = `${d.distanceKm} km`;
    const ymparisto = ENVIRONMENT_CONFIG[d.environment.primary]?.label.split(' / ')[0] || d.environment.primary;
    const aiheet = d.notes ? `${d.notes}${d.teacherNotes ? '\nOpettaja: ' + d.teacherNotes : ''}` : '-';

    return [
      (index + 1).toString(),
      pvm,
      kellonaika,
      kesto,
      matka,
      ymparisto,
      aiheet,
    ];
  });

  autoTable(doc, {
    startY: 72,
    head: [['#', 'Päivämäärä', 'Aika', 'Kesto', 'Matka', 'Ajoympäristö', 'Aiheet ja opettajan huomiot']],
    body: tableData,
    theme: 'grid',
    styles: {
      fontSize: 8,
      cellPadding: 2.5,
      textColor: [30, 41, 59],
      lineColor: [226, 232, 240],
      lineWidth: 0.2,
    },
    headStyles: {
      fillColor: [37, 99, 235], // Blue-600
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      halign: 'left',
    },
    columnStyles: {
      0: { cellWidth: 8, halign: 'center' },
      1: { cellWidth: 20 },
      2: { cellWidth: 26 },
      3: { cellWidth: 18, halign: 'right' },
      4: { cellWidth: 18, halign: 'right' },
      5: { cellWidth: 28 },
      6: { cellWidth: 'auto' },
    },
    didDrawPage: (data) => {
      // Sivunumero
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184);
      doc.text(
        `Sivu ${data.pageNumber}`,
        pageWidth - 14,
        doc.internal.pageSize.getHeight() - 8,
        { align: 'right' }
      );
    },
  });

  // 5. Allekirjoitukset viimeisen sivun loppuun
  const finalY = (doc as any).lastAutoTable.finalY + 14;
  const pageHeight = doc.internal.pageSize.getHeight();

  // Jos tila loppuu sivulta, lisätään sivu allekirjoituksille
  if (finalY + 30 > pageHeight) {
    doc.addPage();
  }

  const signY = (finalY + 30 > pageHeight) ? 30 : finalY;

  doc.setDrawColor(71, 85, 105);
  doc.setLineWidth(0.3);
  doc.line(14, signY + 15, 80, signY + 15);
  doc.line(115, signY + 15, 185, signY + 15);

  doc.setFontSize(9);
  doc.setTextColor(51, 65, 85);
  doc.text('Opettajan allekirjoitus ja nimenselvennys', 14, signY + 20);
  doc.text('Oppilaan allekirjoitus ja nimenselvennys', 115, signY + 20);

  // Tallennus ja Jako
  const pdfBlob = doc.output('blob');
  const filename = `ajopaivakirja_${new Date().toISOString().slice(0, 10)}.pdf`;
  const file = new File([pdfBlob], filename, { type: 'application/pdf' });

  await shareOrDownloadFile(file, filename, pdfBlob);
}

/**
 * Ottaa korkealaatuisen PNG-kuvan valitusta HTML-elementistä (esim. ajopäiväkirjasta)
 */
export async function exportElementToPng(elementId: string, filenamePrefix = 'ajopaivakirja'): Promise<void> {
  const element = document.getElementById(elementId);
  if (!element) {
    alert('Exportattavaa näkymää ei löytynyt.');
    return;
  }

  try {
    const dataUrl = await toPng(element, {
      quality: 0.95,
      pixelRatio: 2, // Korkea resoluutio
      backgroundColor: '#ffffff',
    });

    const res = await fetch(dataUrl);
    const blob = await res.blob();
    const filename = `${filenamePrefix}_${new Date().toISOString().slice(0, 10)}.png`;
    const file = new File([blob], filename, { type: 'image/png' });

    await shareOrDownloadFile(file, filename, blob);
  } catch (error) {
    console.error('PNG-vienti epäonnistui:', error);
    alert('Kuvatiedoston luonti epäonnistui.');
  }
}
