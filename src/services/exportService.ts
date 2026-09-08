import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Share } from '@capacitor/share';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';
import type { DriveSession, OverallStats, TeachingInfo } from '../types';

/**
 * Muuntaa Blob-objektin Base64-merkkijonoksi (ilman data-URL etuliitettä)
 */
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.split(',')[1];
      resolve(base64);
    };
    reader.readAsDataURL(blob);
  });
}

/**
 * Jakaa tiedoston Androidin järjestelmäjakovalikkoon (Google Drive, WhatsApp, Tiedostot)
 * tai lataa selaimessa
 */
export async function shareOrDownloadFile(
  blob: Blob,
  filename: string,
  mimeType: string,
  dialogTitle = 'Jaa tai tallenna Google Driveen'
): Promise<void> {
  const isNative = Capacitor.isNativePlatform();

  if (isNative) {
    try {
      const base64Data = await blobToBase64(blob);

      // Tallennetaan laitteen Cache-kansioon
      const writeResult = await Filesystem.writeFile({
        path: filename,
        data: base64Data,
        directory: Directory.Cache,
      });

      // Tallennetaan myös Documents-kansioon pysyväksi laitevarmuuskopioksi
      try {
        await Filesystem.writeFile({
          path: filename,
          data: base64Data,
          directory: Directory.Documents,
        });
      } catch {
        // Ignored if permissions restrict Documents directory on some Android versions
      }

      // Avataan Androidin natiivi jako (jossa Google Drive, WhatsApp jne.)
      await Share.share({
        title: filename,
        text: 'Opetusluvan ajopäiväkirja',
        url: writeResult.uri,
        dialogTitle: dialogTitle,
      });
      return;
    } catch (err: any) {
      const msg = (err?.message || '').toLowerCase();
      if (msg.includes('cancel') || msg.includes('abort') || msg.includes('dismiss')) {
        return; // Käyttäjä sulki jakovalikon
      }
      console.warn('Capacitor Share epäonnistui:', err);
      return;
    }
  }

  // Web / Fallback
  if (navigator.share && navigator.canShare) {
    try {
      const file = new File([blob], filename, { type: mimeType });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: filename,
          text: 'Opetusluvan ajopäiväkirja',
          files: [file],
        });
        return;
      }
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      console.warn('Web Share epäonnistui, ladataan tiedostona:', err);
    }
  }

  // Selainlataus (Aina varma fallback)
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Luo virallisen Traficom E505sv Opetuskortin mukaisen PDF-tiedoston
 */
export async function exportTraficomPdf(
  drives: DriveSession[],
  stats: OverallStats,
  teachingInfo: TeachingInfo
): Promise<void> {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // 1. Ylätunniste (Opetuskortti opetuslupalaisille)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(0, 0, 0);
  doc.text('OPETUSKORTTI', 14, 18);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(60, 60, 60);
  doc.text('Opetuslupaopetuksen ajopäiväkirja', 14, 22);
  doc.text('Undervisningstillstånd körjournal', 14, 25.5);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(0, 0, 0);
  doc.text('Opetuskortti opetuslupalaisille', pageWidth - 14, 18, { align: 'right' });

  doc.setFont('helvetica', 'italic');
  doc.setFontSize(8.5);
  doc.setTextColor(70, 70, 70);
  doc.text('Undervisningskort för den som har', pageWidth - 14, 22, { align: 'right' });
  doc.text('beviljats undervisningstillstånd', pageWidth - 14, 25.5, { align: 'right' });

  // 2. Osapuolten tiedot (Kehystetty laatikko täsmälleen kuin Traficom E505sv)
  const boxTop = 29;
  const boxHeight = 27;
  const boxWidth = pageWidth - 28;

  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.3);
  doc.rect(14, boxTop, boxWidth, boxHeight);

  // Vaakaviivat
  doc.line(14, boxTop + 9, pageWidth - 14, boxTop + 9);
  doc.line(14, boxTop + 18, pageWidth - 14, boxTop + 18);

  // Pystyviivat
  const ssnSplitX = 14 + boxWidth * 0.68;
  doc.line(ssnSplitX, boxTop, ssnSplitX, boxTop + 18); // rivit 1 ja 2

  const classSplitX = 14 + boxWidth * 0.48;
  doc.line(classSplitX, boxTop + 18, classSplitX, boxTop + boxHeight); // rivi 3

  // Kenttätekstit (Suomi / Ruotsi)
  doc.setFontSize(6.5);
  doc.setTextColor(80, 80, 80);
  doc.setFont('helvetica', 'normal');

  // Rivi 1: Oppilas
  doc.text('Oppilaan nimi  Elevens namn', 16, boxTop + 3.5);
  doc.text('Henkilötunnus  Personbeteckning', ssnSplitX + 2, boxTop + 3.5);

  doc.setFontSize(8.5);
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'bold');
  doc.text(teachingInfo.studentName || '-', 16, boxTop + 7.5);
  doc.text(teachingInfo.studentSsn || '-', ssnSplitX + 2, boxTop + 7.5);

  // Rivi 2: Opettaja
  doc.setFontSize(6.5);
  doc.setTextColor(80, 80, 80);
  doc.setFont('helvetica', 'normal');
  doc.text('Opettajan nimi  Lärarens namn', 16, boxTop + 12.5);
  doc.text('Henkilötunnus  Personbeteckning', ssnSplitX + 2, boxTop + 12.5);

  doc.setFontSize(8.5);
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'bold');
  doc.text(teachingInfo.teacherName || '-', 16, boxTop + 16.5);
  doc.text(teachingInfo.teacherSsn || '-', ssnSplitX + 2, boxTop + 16.5);

  // Rivi 3: Ajokorttiluokka & Aloituspvm
  doc.setFontSize(6.5);
  doc.setTextColor(80, 80, 80);
  doc.setFont('helvetica', 'normal');
  doc.text('Haettava ajokorttiluokka  Körkortskategori', 16, boxTop + 21.5);
  doc.text('Opetuksen aloituspvm  Undervisningen har inletts', classSplitX + 2, boxTop + 21.5);

  doc.setFontSize(8.5);
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'bold');
  doc.text(teachingInfo.licenseClass || 'B', 16, boxTop + 25.5);
  doc.text(teachingInfo.startDate ? new Date(teachingInfo.startDate).toLocaleDateString('fi-FI') : '-', classSplitX + 2, boxTop + 25.5);

  // 3. Ajo-opetus -väliotsikko
  const sectionY = boxTop + boxHeight + 6;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(0, 0, 0);
  doc.text('Ajo-opetus  Körundervisning', 14, sectionY);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(40, 40, 40);
  doc.text('Ajotunnin pituus 50 min  Körlektionens längd 50 min', 14, sectionY + 4.5);

  // 4. Taulukko (Ajotunnit 1..22+)
  // Varmistetaan vähintään 22 riviä kuten virallisessa Traficom-lomakkeessa
  const totalRows = Math.max(22, drives.length);
  const tableRows = [];

  // Järjestetään ajot aikajärjestykseen
  const sortedDrives = [...drives].sort(
    (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
  );

  for (let i = 0; i < totalRows; i++) {
    const drive = sortedDrives[i];
    const lessonNumber = (i + 1).toString();

    if (drive) {
      const sDate = new Date(drive.startTime);
      const eDate = drive.endTime ? new Date(drive.endTime) : new Date(sDate.getTime() + drive.durationSeconds * 1000);
      const pvm = sDate.toLocaleDateString('fi-FI');
      const startKlo = sDate.toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit' });
      const endKlo = eDate.toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit' });
      const durationMin = Math.round(drive.durationSeconds / 60);
      const klo = `${startKlo}–${endKlo}\n(${durationMin} min)`;
      const aihe = `${drive.topicCode || 'A'}${drive.notes ? ' - ' + drive.notes : ''}`;
      const opettaja = teachingInfo.teacherName || 'Opettaja';

      tableRows.push([lessonNumber, pvm, klo, aihe, opettaja]);
    } else {
      // Tyhjä rivi lomakkeen pohjaan
      tableRows.push([lessonNumber, '', '', '', '']);
    }
  }

  autoTable(doc, {
    startY: sectionY + 6.5,
    margin: { left: 14, right: 14, top: 20, bottom: 26 },
    head: [[
      'Ajotunti\nKörlektion',
      'Pvm\nDatum',
      'Klo*\nKl*',
      'Aihe\nÄmne',
      'Opettaja\nLärare'
    ]],
    body: tableRows,
    theme: 'plain',
    styles: {
      fontSize: 8,
      cellPadding: 1.8,
      textColor: [0, 0, 0],
      lineColor: [0, 0, 0],
      lineWidth: 0.2,
      minCellHeight: 6,
    },
    headStyles: {
      fillColor: [255, 255, 255],
      textColor: [0, 0, 0],
      fontStyle: 'bold',
      lineColor: [0, 0, 0],
      lineWidth: 0.3,
      fontSize: 7.5,
    },
    columnStyles: {
      0: { cellWidth: 16, halign: 'center', fontStyle: 'bold' },
      1: { cellWidth: 24 },
      2: { cellWidth: 26, halign: 'center' },
      3: { cellWidth: 'auto' },
      4: { cellWidth: 36 },
    },
    didDrawPage: (data) => {
      // Jos taulukko jatkuu sivulle 2 tai pidemmälle, piirretään selkeä jatkosivun ylätunniste
      if (data.pageNumber > 1) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10.5);
        doc.setTextColor(0, 0, 0);
        doc.text('OPETUSKORTTI (Jatkosivu)  Undervisningskort', 14, 11);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(60, 60, 60);
        const student = teachingInfo.studentName || 'Oppilas';
        const teacher = teachingInfo.teacherName || 'Opettaja';
        const ssn = teachingInfo.studentSsn ? `(${teachingInfo.studentSsn})` : '';
        doc.text(`Oppilas: ${student} ${ssn}   •   Opettaja: ${teacher}   •   Luokka: ${teachingInfo.licenseClass || 'B'}`, 14, 15.5);

        doc.setDrawColor(0, 0, 0);
        doc.setLineWidth(0.2);
        doc.line(14, 17.5, pageWidth - 14, 17.5);
      }
    },
  });

  // 5. Alatunniste (Selitteet, kokonaistunnit ja sivunumerointi jokaiselle sivulle)
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    const footerY = pageHeight - 16;
    doc.setFontSize(7.5);
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'bold');
    doc.text('Ajo-opetuksen aiheet  Ämnen för körundervisningen:', 14, footerY);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.text('K = käsittelyopetus  manövreringsundervisning', 14, footerY + 3.8);
    doc.text('A = taajama-ajo  körning i tätort', 14, footerY + 7.2);
    doc.text('B = maantieajo  landsvägskörning', 14, footerY + 10.6);

    doc.text('*) Ajotunnin aika ja kesto / Körlektionens tid och längd', pageWidth - 14, footerY, { align: 'right' });
    doc.text(`Ajotunteja yht: ${stats.lessonHours50Min} h (50 min) • Matka yht: ${stats.totalDistanceKm} km`, pageWidth - 14, footerY + 4, { align: 'right' });

    doc.setFontSize(6.5);
    doc.setTextColor(100, 100, 100);
    if (totalPages > 1) {
      doc.text(`Sivu ${p} / ${totalPages} • Opetusluvan opetuskortti (E505sv)`, pageWidth - 14, footerY + 10, { align: 'right' });
    } else {
      doc.text('Opetusluvan opetuskortti / Undervisningskort (E505sv)', pageWidth - 14, footerY + 10, { align: 'right' });
    }
  }

  // Luodaan tiedosto ja jaetaan
  const pdfBlob = doc.output('blob');
  const filename = `opetuskortti_${new Date().toISOString().slice(0, 10)}.pdf`;

  await shareOrDownloadFile(pdfBlob, filename, 'application/pdf', 'Tallenna PDF Google Driveen tai jaa');
}
