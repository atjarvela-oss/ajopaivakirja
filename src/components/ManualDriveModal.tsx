import React, { useState } from 'react';
import { X, PlusCircle } from 'lucide-react';
import type { DriveSession, AppUser, EnvironmentType } from '../types';
import { ENVIRONMENT_CONFIG } from '../services/environmentClassifier';
import { saveDriveSession } from '../services/db';

interface ManualDriveModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: AppUser | null;
  onDriveSaved: (drive: DriveSession) => void;
}

export const ManualDriveModal: React.FC<ManualDriveModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onDriveSaved,
}) => {
  const todayStr = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(todayStr);
  const [startTime, setStartTime] = useState('14:00');
  const [endTime, setEndTime] = useState('14:45');
  const [distanceKm, setDistanceKm] = useState('25');
  const [environment, setEnvironment] = useState<EnvironmentType>('taajama');
  const [notes, setNotes] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;

    try {
      setIsSaving(true);
      const startDateTime = new Date(`${date}T${startTime}:00`);
      const endDateTime = new Date(`${date}T${endTime}:00`);
      
      let durationSeconds = Math.max(60, Math.round((endDateTime.getTime() - startDateTime.getTime()) / 1000));
      if (durationSeconds <= 0) {
        durationSeconds = 45 * 60; // Oletus 45 min jos ajat väärinpäin
      }

      const dist = parseFloat(distanceKm) || 0;
      const avgSpeed = durationSeconds > 0 ? Number(((dist / (durationSeconds / 3600))).toFixed(1)) : 0;

      const distObj = { maantie: 0, taajama: 0, kaupunki: 0, pysakointi: 0 };
      distObj[environment] = 100;

      const newDrive: DriveSession = {
        id: 'manual-' + Date.now(),
        studentId: currentUser.uid,
        studentName: currentUser.displayName || 'Oppilas',
        studentEmail: currentUser.email || '',
        startTime: startDateTime.toISOString(),
        endTime: endDateTime.toISOString(),
        durationSeconds,
        distanceKm: dist,
        avgSpeedKmH: avgSpeed,
        maxSpeedKmH: Number((avgSpeed * 1.3).toFixed(1)),
        environment: {
          primary: environment,
          distribution: distObj,
          manualOverride: true,
        },
        routePoints: [],
        notes,
        approvedByTeacher: currentUser.role === 'admin',
        createdAt: new Date().toISOString(),
      };

      await saveDriveSession(newDrive);
      onDriveSaved(newDrive);
      onClose();
    } catch (err) {
      console.error(err);
      alert('Tallennus epäonnistui.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center space-x-2">
            <PlusCircle className="w-5 h-5 text-blue-600" />
            <span>Lisää ajokerta manuaalisesti</span>
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs sm:text-sm">
          
          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Päivämäärä
            </label>
            <input
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full p-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-hidden"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Lähtöaika
              </label>
              <input
                type="time"
                required
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full p-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-hidden"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Lopetusaika
              </label>
              <input
                type="time"
                required
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full p-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-hidden"
              />
            </div>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Ajettu matka (km)
            </label>
            <input
              type="number"
              step="0.1"
              required
              value={distanceKm}
              onChange={(e) => setDistanceKm(e.target.value)}
              className="w-full p-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-hidden"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Pääasiallinen ajoympäristö
            </label>
            <select
              value={environment}
              onChange={(e) => setEnvironment(e.target.value as EnvironmentType)}
              className="w-full p-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-hidden"
            >
              {(Object.keys(ENVIRONMENT_CONFIG) as EnvironmentType[]).map((key) => (
                <option key={key} value={key}>
                  {ENVIRONMENT_CONFIG[key].label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Aiheet ja muistiinpanot
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Esim. Kaupunkiajoa, pysäköintiruutuun peruutus..."
              className="w-full p-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-hidden"
            />
          </div>

          <div className="pt-2 flex justify-end space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              Peruuta
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold transition"
            >
              {isSaving ? 'Tallennetaan...' : 'Tallenna'}
            </button>
          </div>

        </form>

      </div>
    </div>
  );
};
