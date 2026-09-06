import React, { useState } from 'react';
import { 
  Table as TableIcon, 
  Download, 
  Printer, 
  Trash2, 
  CheckCircle2, 
  Clock, 
  Search, 
  Eye
} from 'lucide-react';
import type { DriveSession, AppUser, EnvironmentType } from '../types';
import { ENVIRONMENT_CONFIG } from '../services/environmentClassifier';
import { deleteDriveSession, exportDrivesToCSV, approveDriveSession } from '../services/db';

interface DriveTableProps {
  drives: DriveSession[];
  currentUser: AppUser | null;
  onSelectDrive: (drive: DriveSession) => void;
  onRefresh: () => void;
}

export const DriveTable: React.FC<DriveTableProps> = ({
  drives,
  currentUser,
  onSelectDrive,
  onRefresh,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [envFilter, setEnvFilter] = useState<EnvironmentType | 'all'>('all');
  const [approvingId, setApprovingId] = useState<string | null>(null);

  const isAdmin = currentUser?.role === 'admin';

  // Suodatus
  const filteredDrives = drives.filter((d) => {
    const matchesEnv = envFilter === 'all' || d.environment.primary === envFilter;
    const matchesSearch =
      (d.notes && d.notes.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (d.studentName && d.studentName.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (d.studentEmail && d.studentEmail.toLowerCase().includes(searchTerm.toLowerCase()));
    return matchesEnv && matchesSearch;
  });

  const handleDelete = async (driveId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Haluatko varmasti poistaa tämän ajokerran?')) {
      await deleteDriveSession(driveId);
      onRefresh();
    }
  };

  const handleQuickApprove = async (driveId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!currentUser) return;
    setApprovingId(driveId);
    try {
      await approveDriveSession(driveId, currentUser);
      onRefresh();
    } catch (err) {
      console.error(err);
    } finally {
      setApprovingId(null);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleExportCSV = () => {
    exportDrivesToCSV(filteredDrives);
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-md border border-slate-200 dark:border-slate-800 overflow-hidden">
      
      {/* Taulukon Yläpalkki: Hakukenttä, Suodattimet ja Vientipainikkeet */}
      <div className="p-4 sm:p-6 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 no-print">
        <div className="flex items-center space-x-2">
          <div className="p-2 rounded-xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400">
            <TableIcon className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
              Ajokertojen listaus ({filteredDrives.length})
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Kaikki tallennetut ajotunnit ja opettajan kuittaukset
            </p>
          </div>
        </div>

        {/* Työkalut & Viennit */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Haku */}
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Etsi aihetta / muistiinpanoa..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="text-xs pl-9 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white w-44 sm:w-56 focus:ring-2 focus:ring-blue-500 outline-hidden"
            />
          </div>

          {/* Ympäristösuodatin */}
          <div className="flex items-center space-x-1 border border-slate-200 dark:border-slate-700 rounded-xl p-1 bg-slate-50 dark:bg-slate-800">
            <select
              value={envFilter}
              onChange={(e) => setEnvFilter(e.target.value as EnvironmentType | 'all')}
              className="text-xs bg-transparent text-slate-700 dark:text-slate-300 font-medium px-2 py-1 outline-hidden"
            >
              <option value="all">Kaikki ympäristöt</option>
              <option value="maantie">Maantie</option>
              <option value="taajama">Taajama</option>
              <option value="kaupunki">Kaupunki</option>
              <option value="pysakointi">Pysäköinti</option>
            </select>
          </div>

          {/* CSV-vienti */}
          <button
            onClick={handleExportCSV}
            className="px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition flex items-center space-x-1.5"
            title="Lataa CSV-tiedostona"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Vie CSV</span>
          </button>

          {/* Tulosta */}
          <button
            onClick={handlePrint}
            className="px-3 py-2 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition flex items-center space-x-1.5"
            title="Tulosta virallinen opetuslupapäiväkirja"
          >
            <Printer className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Tulosta</span>
          </button>
        </div>
      </div>

      {/* Tulostusotsikko (Näkyy vain paperilla/PDF:ssä) */}
      <div className="hidden print-only p-4 border-b border-slate-300 text-black">
        <h1 className="text-xl font-bold">OPETUSLUVAN AJOPÄIVÄKIRJA</h1>
        <p className="text-sm">Traficom / Ajovarma -vaatimusten mukainen ajokertojen erittely</p>
        <p className="text-xs text-slate-600 mt-1">Tulostettu: {new Date().toLocaleDateString('fi-FI')} klo {new Date().toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit' })}</p>
      </div>

      {/* Varsinainen Taulukko */}
      {filteredDrives.length === 0 ? (
        <div className="text-center py-12 px-4">
          <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto mb-3 text-slate-400">
            <Clock className="w-6 h-6" />
          </div>
          <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-1">
            Ei ajokertoja
          </h4>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
            Aloita ensimmäinen ajo GPS-seurannalla yläpuolelta tai lisää suoritettu ajotunti käsin.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs sm:text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="px-4 py-3">Pvm & Aika</th>
                {isAdmin && <th className="px-4 py-3">Oppilas</th>}
                <th className="px-4 py-3">Kesto</th>
                <th className="px-4 py-3">Matka</th>
                <th className="px-4 py-3">Keskinopeus</th>
                <th className="px-4 py-3">Ajoympäristö</th>
                <th className="px-4 py-3">Aiheet / Muistiinpanot</th>
                <th className="px-4 py-3">Opettajan kuittaus</th>
                <th className="px-4 py-3 text-right no-print">Toiminnot</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-800 dark:text-slate-200">
              {filteredDrives.map((drive) => {
                const env = ENVIRONMENT_CONFIG[drive.environment.primary];
                const startDate = new Date(drive.startTime);
                const endDate = new Date(drive.endTime);
                const durationMinutes = Math.round(drive.durationSeconds / 60);

                return (
                  <tr
                    key={drive.id}
                    onClick={() => onSelectDrive(drive)}
                    className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 cursor-pointer transition"
                  >
                    {/* Päivämäärä ja kellonajat */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="font-semibold text-slate-900 dark:text-white">
                        {startDate.toLocaleDateString('fi-FI')}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        klo {startDate.toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit' })} – {endDate.toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </td>

                    {/* Oppilas (Opettajanäkymässä) */}
                    {isAdmin && (
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="font-medium text-slate-900 dark:text-slate-200">
                          {drive.studentName}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {drive.studentEmail}
                        </div>
                      </td>
                    )}

                    {/* Kesto */}
                    <td className="px-4 py-3 whitespace-nowrap font-medium">
                      <span>{durationMinutes} min</span>
                      <span className="text-[10px] text-slate-400 block">
                        ({(drive.durationSeconds / 3600).toFixed(1)} h)
                      </span>
                    </td>

                    {/* Matka */}
                    <td className="px-4 py-3 whitespace-nowrap font-medium">
                      <span>{drive.distanceKm} km</span>
                    </td>

                    {/* Keskinopeus */}
                    <td className="px-4 py-3 whitespace-nowrap text-slate-600 dark:text-slate-400">
                      {drive.avgSpeedKmH} km/h
                    </td>

                    {/* Ajoympäristö */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold border ${env.badgeClass}`}>
                        {env.label.split(' / ')[0]}
                      </span>
                    </td>

                    {/* Muistiinpanot */}
                    <td className="px-4 py-3 max-w-xs truncate text-xs text-slate-600 dark:text-slate-300">
                      {drive.notes || <span className="text-slate-400 italic">-</span>}
                    </td>

                    {/* Opettajan kuittaus */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      {drive.approvedByTeacher ? (
                        <div className="flex items-center space-x-1 text-emerald-600 dark:text-emerald-400 font-semibold text-xs">
                          <CheckCircle2 className="w-4 h-4" />
                          <span>Kuitattu</span>
                        </div>
                      ) : (
                        <div className="flex items-center space-x-2">
                          <span className="text-amber-600 dark:text-amber-400 text-xs font-medium">
                            Odottaa
                          </span>
                          {isAdmin && (
                            <button
                              onClick={(e) => handleQuickApprove(drive.id, e)}
                              disabled={approvingId === drive.id}
                              className="px-2 py-0.5 text-[11px] font-bold rounded-md bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 hover:bg-emerald-200 transition"
                              title="Kuittaa heti opetusajoksi"
                            >
                              {approvingId === drive.id ? '...' : 'Kuittaa'}
                            </button>
                          )}
                        </div>
                      )}
                    </td>

                    {/* Toiminnot */}
                    <td className="px-4 py-3 whitespace-nowrap text-right no-print">
                      <div className="flex items-center justify-end space-x-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectDrive(drive);
                          }}
                          className="p-1.5 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/40 rounded-lg transition"
                          title="Näytä kartta ja tiedot"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={(e) => handleDelete(drive.id, e)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition"
                          title="Poista ajokerta"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Tulostusalatunniste */}
      <div className="hidden print-only p-6 text-xs text-black border-t border-slate-300 mt-6 flex justify-between">
        <div>
          <div className="h-10 border-b border-black w-48 mb-1"></div>
          <div>Opettajan allekirjoitus ja nimenselvennys</div>
        </div>
        <div>
          <div className="h-10 border-b border-black w-48 mb-1"></div>
          <div>Oppilaan allekirjoitus ja nimenselvennys</div>
        </div>
      </div>

    </div>
  );
};
