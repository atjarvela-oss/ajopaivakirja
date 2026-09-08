import React, { useState } from 'react';
import { 
  FileDown, 
  Printer, 
  Trash2, 
  Eye, 
  Edit3, 
  Check, 
  X, 
  Plus
} from 'lucide-react';
import type { DriveSession, TeachingInfo } from '../types';
import { TRAFICOM_TOPIC_CONFIG } from '../services/environmentClassifier';

interface TraficomCardProps {
  drives: DriveSession[];
  teachingInfo: TeachingInfo;
  onUpdateTeachingInfo: (info: TeachingInfo) => void;
  onSelectDrive: (drive: DriveSession) => void;
  onDeleteDrive: (id: string) => void;
  onExportPdf: () => void;
  onOpenManualEntry: () => void;
}

export const TraficomCard: React.FC<TraficomCardProps> = ({
  drives,
  teachingInfo,
  onUpdateTeachingInfo,
  onSelectDrive,
  onDeleteDrive,
  onExportPdf,
  onOpenManualEntry,
}) => {
  const [isEditingInfo, setIsEditingInfo] = useState(false);
  const [tempInfo, setTempInfo] = useState<TeachingInfo>(teachingInfo);

  const handleSaveInfo = () => {
    onUpdateTeachingInfo(tempInfo);
    setIsEditingInfo(false);
  };

  // Lajitellaan ajot aikajärjestykseen
  const sortedDrives = [...drives].sort(
    (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
  );

  // Vähintään 15 riviä kuten virallisessa Traficom-lomakkeessa
  const rowCount = Math.max(15, sortedDrives.length);
  const rows = [];
  for (let i = 0; i < rowCount; i++) {
    rows.push({
      index: i + 1,
      drive: sortedDrives[i] || null,
    });
  }

  // Lasketaan 50 min ajotuntien määrä
  const totalSeconds = drives.reduce((acc, d) => acc + d.durationSeconds, 0);
  const lessonCount50Min = (totalSeconds / (50 * 60)).toFixed(1);

  return (
    <div className="space-y-4">
      
      {/* Työkalupalkki lomakkeen yläpuolella */}
      <div className="flex flex-wrap items-center justify-between gap-2 no-print bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200 dark:border-slate-800">
        <div className="flex items-center space-x-2">
          <span className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wide">
            Opetuskortti opetuslupalaisille
          </span>
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 font-semibold">
            {lessonCount50Min} / 10 h suoritettu (50 min/tunti)
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => setIsEditingInfo(!isEditingInfo)}
            className="px-2.5 py-1.5 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center space-x-1"
          >
            <Edit3 className="w-3.5 h-3.5" />
            <span>{isEditingInfo ? 'Sulje muokkaus' : 'Muokkaa oppilastietoja'}</span>
          </button>

          <button
            onClick={onOpenManualEntry}
            className="px-2.5 py-1.5 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center space-x-1"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Lisää ajotunti</span>
          </button>

          <button
            onClick={onExportPdf}
            className="px-3 py-1.5 text-xs font-bold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white shadow-xs flex items-center space-x-1 cursor-pointer"
          >
            <FileDown className="w-3.5 h-3.5" />
            <span>Vie PDF</span>
          </button>

          <button
            onClick={() => window.print()}
            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
            title="Tulosta"
          >
            <Printer className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Oppilas- ja opettajatietojen muokkauslomake */}
      {isEditingInfo && (
        <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-700 space-y-3 no-print text-xs">
          <div className="font-bold text-slate-800 dark:text-white flex items-center justify-between">
            <span>Opetuskortin perustiedot</span>
            <button onClick={() => setIsEditingInfo(false)} className="text-slate-400">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold mb-1">Oppilaan nimi (Elevens namn)</label>
              <input
                type="text"
                value={tempInfo.studentName}
                onChange={(e) => setTempInfo({ ...tempInfo, studentName: e.target.value })}
                placeholder="Esim. Matti Meikäläinen"
                className="w-full p-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block font-semibold mb-1">Oppilaan henkilötunnus (valinnainen)</label>
              <input
                type="text"
                value={tempInfo.studentSsn}
                onChange={(e) => setTempInfo({ ...tempInfo, studentSsn: e.target.value })}
                placeholder="PPKKVV-XXXX"
                className="w-full p-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block font-semibold mb-1">Opettajan nimi (Lärarens namn)</label>
              <input
                type="text"
                value={tempInfo.teacherName}
                onChange={(e) => setTempInfo({ ...tempInfo, teacherName: e.target.value })}
                placeholder="Esim. Antti Järvelä"
                className="w-full p-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block font-semibold mb-1">Opettajan henkilötunnus (valinnainen)</label>
              <input
                type="text"
                value={tempInfo.teacherSsn}
                onChange={(e) => setTempInfo({ ...tempInfo, teacherSsn: e.target.value })}
                placeholder="PPKKVV-XXXX"
                className="w-full p-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block font-semibold mb-1">Haettava ajokorttiluokka</label>
              <input
                type="text"
                value={tempInfo.licenseClass}
                onChange={(e) => setTempInfo({ ...tempInfo, licenseClass: e.target.value })}
                className="w-full p-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block font-semibold mb-1">Opetuksen aloituspvm</label>
              <input
                type="date"
                value={tempInfo.startDate}
                onChange={(e) => setTempInfo({ ...tempInfo, startDate: e.target.value })}
                className="w-full p-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
              />
            </div>
          </div>

          <div className="flex justify-end pt-1">
            <button
              onClick={handleSaveInfo}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-bold flex items-center space-x-1.5 shadow-xs"
            >
              <Check className="w-4 h-4" />
              <span>Tallenna tiedot</span>
            </button>
          </div>
        </div>
      )}

      {/* VARSINAINEN OPETUSKORTTI */}
      <div 
        id="traficom-card-container" 
        className="bg-white text-black p-4 sm:p-8 rounded-2xl shadow-lg border border-slate-300 font-sans max-w-4xl mx-auto"
      >
        
        {/* 1. Yläotsikko */}
        <div className="flex items-start justify-between border-b-2 border-black pb-3 mb-3">
          <div>
            <p className="text-[10px] sm:text-xs text-slate-700 leading-tight">
              Opetuslupaopetuksen ajopäiväkirja<br />
              <span className="italic">Undervisningstillstånd körjournal</span>
            </p>
          </div>

          <div className="text-right">
            <h2 className="text-base sm:text-lg font-bold text-black leading-tight">
              Opetuskortti opetuslupalaisille
            </h2>
            <p className="text-[10px] text-slate-700 italic leading-tight">
              Undervisningskort för den som har<br />
              beviljats undervisningstillstånd
            </p>
          </div>
        </div>

        {/* 2. Kehystetty tietolaatikko (Oppilas, Opettaja, Luokka) */}
        <div className="border-2 border-black mb-4 text-[11px]">
          
          {/* Rivi 1: Oppilas */}
          <div className="grid grid-cols-12 border-b border-black">
            <div className="col-span-8 p-1.5 border-r border-black">
              <span className="text-[9px] text-slate-600 block">Oppilaan nimi  Elevens namn</span>
              <span className="font-bold text-sm text-black">
                {teachingInfo.studentName || <span className="text-slate-400 font-normal italic">Ei asetettu (napauta 'Muokkaa')</span>}
              </span>
            </div>
            <div className="col-span-4 p-1.5">
              <span className="text-[9px] text-slate-600 block">Henkilötunnus  Personbeteckning</span>
              <span className="font-semibold text-black">
                {teachingInfo.studentSsn || '-'}
              </span>
            </div>
          </div>

          {/* Rivi 2: Opettaja */}
          <div className="grid grid-cols-12 border-b border-black">
            <div className="col-span-8 p-1.5 border-r border-black">
              <span className="text-[9px] text-slate-600 block">Opettajan nimi  Lärarens namn</span>
              <span className="font-bold text-sm text-black">
                {teachingInfo.teacherName || <span className="text-slate-400 font-normal italic">Ei asetettu</span>}
              </span>
            </div>
            <div className="col-span-4 p-1.5">
              <span className="text-[9px] text-slate-600 block">Henkilötunnus  Personbeteckning</span>
              <span className="font-semibold text-black">
                {teachingInfo.teacherSsn || '-'}
              </span>
            </div>
          </div>

          {/* Rivi 3: Korttiluokka & Aloituspvm */}
          <div className="grid grid-cols-12">
            <div className="col-span-6 p-1.5 border-r border-black">
              <span className="text-[9px] text-slate-600 block">Haettava ajokorttiluokka  Körkortskategori</span>
              <span className="font-bold text-black">{teachingInfo.licenseClass || 'B'}</span>
            </div>
            <div className="col-span-6 p-1.5">
              <span className="text-[9px] text-slate-600 block">Opetuksen aloituspvm  Undervisningen har inletts</span>
              <span className="font-semibold text-black">
                {teachingInfo.startDate ? new Date(teachingInfo.startDate).toLocaleDateString('fi-FI') : '-'}
              </span>
            </div>
          </div>

        </div>

        {/* 3. Ajo-opetus otsikko */}
        <div className="mb-2">
          <h3 className="font-bold text-xs sm:text-sm uppercase tracking-wide text-black">
            Ajo-opetus  <span className="normal-case font-normal text-slate-700">Körundervisning</span>
          </h3>
          <p className="text-[11px] text-slate-800">
            Ajotunnin pituus 50 min  <span className="italic text-slate-600">Körlektionens längd 50 min</span>
          </p>
        </div>

        {/* 4. Traficom-taulukko */}
        <div className="overflow-x-auto border-t-2 border-l-2 border-r-2 border-black">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b-2 border-black bg-slate-50 font-bold text-[10px] text-black">
                <th className="border-r border-black p-1 text-center w-12">
                  Ajotunti<br /><span className="font-normal italic">Körlektion</span>
                </th>
                <th className="border-r border-black p-1 w-24">
                  Pvm<br /><span className="font-normal italic">Datum</span>
                </th>
                <th className="border-r border-black p-1 w-24 sm:w-28">
                  Klo*<br /><span className="font-normal italic">Kl*</span>
                </th>
                <th className="border-r border-black p-1">
                  Aihe<br /><span className="font-normal italic">Ämne</span>
                </th>
                <th className="border-r border-black p-1 w-32">
                  Opettaja<br /><span className="font-normal italic">Lärare</span>
                </th>
                <th className="p-1 w-16 text-right no-print">
                  Kartta
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ index, drive }) => {
                const sDate = drive ? new Date(drive.startTime) : null;
                const eDate = drive?.endTime ? new Date(drive.endTime) : (drive && sDate ? new Date(sDate.getTime() + drive.durationSeconds * 1000) : null);
                const topicCfg = drive ? TRAFICOM_TOPIC_CONFIG[drive.topicCode || 'A'] : null;

                return (
                  <tr 
                    key={index} 
                    className="border-b border-black text-black hover:bg-slate-50/80 transition"
                  >
                    {/* Ajotunnin numero 1, 2, 3... */}
                    <td className="border-r border-black p-1 text-center font-bold text-xs bg-slate-50/40">
                      {index}
                    </td>

                    {/* Pvm */}
                    <td className="border-r border-black p-1 font-medium whitespace-nowrap">
                      {sDate ? sDate.toLocaleDateString('fi-FI') : ''}
                    </td>

                    {/* Klo (Aika ja kesto) */}
                    <td className="border-r border-black p-1 font-medium whitespace-nowrap text-[11px]">
                      {drive && sDate && eDate ? (
                        <div>
                          <span>
                            {sDate.toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit' })}–{eDate.toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          <span className="text-[10px] text-slate-500 block leading-tight font-normal">
                            ({Math.round(drive.durationSeconds / 60)} min)
                          </span>
                        </div>
                      ) : ''}
                    </td>

                    {/* Aihe (K, A tai B + huomiot) */}
                    <td className="border-r border-black p-1">
                      {drive ? (
                        <div className="flex items-center space-x-1.5">
                          <span className={`px-1.5 py-0.2 rounded font-black text-xs border ${topicCfg?.badgeClass}`}>
                            {drive.topicCode || 'A'}
                          </span>
                          <span className="truncate max-w-[240px]">
                            {drive.notes || topicCfg?.title}
                          </span>
                          <span className="text-[10px] text-slate-500 ml-auto hidden sm:inline">
                            ({Math.round(drive.durationSeconds / 60)} min / {drive.distanceKm} km)
                          </span>
                        </div>
                      ) : ''}
                    </td>

                    {/* Opettajan kuittaus */}
                    <td className="border-r border-black p-1 whitespace-nowrap font-medium text-[11px]">
                      {drive ? (teachingInfo.teacherName || 'Opettaja') : ''}
                    </td>

                    {/* Kartta ja toiminnot (vain näytöllä) */}
                    <td className="p-1 text-right no-print whitespace-nowrap">
                      {drive && (
                        <div className="flex items-center justify-end space-x-1">
                          <button
                            onClick={() => onSelectDrive(drive)}
                            className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                            title="Näytä reitti kartalla"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => onDeleteDrive(drive.id)}
                            className="p-1 text-slate-400 hover:text-rose-600 rounded"
                            title="Poista ajotunti"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* 5. Alatunniste (Selitteet kuten Traficom E505sv:ssä) */}
        <div className="mt-4 pt-2 border-t border-black text-[10px] grid grid-cols-1 sm:grid-cols-2 gap-2 leading-tight">
          <div>
            <span className="font-bold block text-black">Ajo-opetuksen aiheet  Ämnen för körundervisningen:</span>
            <div className="mt-1 space-y-0.5 text-slate-800">
              <div><strong>K</strong> = käsittelyopetus  <span className="italic text-slate-600">manövreringsundervisning</span></div>
              <div><strong>A</strong> = taajama-ajo  <span className="italic text-slate-600">körning i tätort</span></div>
              <div><strong>B</strong> = maantieajo  <span className="italic text-slate-600">landsvägskörning</span></div>
            </div>
          </div>

          <div className="sm:text-right flex flex-col justify-between">
            <div className="text-slate-600">
              *) Ajotunnin alkamisaika / Starttid för körlektion
            </div>
            <div className="mt-2 text-[9px] text-slate-500">
              Opetusluvan opetuskortti
            </div>
          </div>
        </div>

      </div>

    </div>
  );
};
