import React, { useState, useEffect } from 'react';
import { 
  X, 
  ShieldCheck, 
  GraduationCap, 
  Users, 
  Check, 
  AlertCircle
} from 'lucide-react';
import type { AppUser, UserRole } from '../types';
import { fetchAllUsers, updateUserRole } from '../services/auth';
import { SUPERADMIN_EMAIL } from '../services/firebase';

interface AdminPanelModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectStudent: (student: AppUser) => void;
  selectedStudentId?: string;
}

export const AdminPanelModal: React.FC<AdminPanelModalProps> = ({
  isOpen,
  onClose,
  onSelectStudent,
  selectedStudentId,
}) => {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadUsers();
    }
  }, [isOpen]);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const data = await fetchAllUsers();
      setUsers(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleRoleChange = async (userId: string, targetEmail: string | null, newRole: UserRole) => {
    if (targetEmail?.toLowerCase() === SUPERADMIN_EMAIL && newRole !== 'admin') {
      alert(`Käyttäjä ${SUPERADMIN_EMAIL} on järjestelmän pääkäyttäjä, eikä hänen rooliaan voi laskea.`);
      return;
    }

    try {
      await updateUserRole(userId, newRole);
      setStatusMessage('Rooli päivitetty onnistuneesti!');
      setTimeout(() => setStatusMessage(null), 3000);
      await loadUsers();
    } catch (e) {
      console.error(e);
      alert('Roolin päivitys epäonnistui.');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="bg-white dark:bg-slate-900 w-full max-w-3xl rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-850/50">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-xl bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-400">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                Pääkäyttäjän hallintapaneeli
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Pääkäyttäjä: <strong className="text-indigo-600 dark:text-indigo-400">{SUPERADMIN_EMAIL}</strong>
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-6">
          {statusMessage && (
            <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 text-sm flex items-center space-x-2">
              <Check className="w-4 h-4" />
              <span>{statusMessage}</span>
            </div>
          )}

          {/* Info Banner */}
          <div className="p-4 rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/50 text-xs text-blue-900 dark:text-blue-300 space-y-1">
            <div className="flex items-center space-x-1.5 font-semibold">
              <AlertCircle className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
              <span>Käyttöoikeudet ja roolit:</span>
            </div>
            <ul className="list-disc list-inside space-y-0.5 ml-1 text-slate-700 dark:text-slate-300">
              <li><strong>Pääkäyttäjä / Opettaja (admin):</strong> Voi tarkastella kaikkien oppilaiden ajoja, kuitata ajot hyväksytyksi opetuslupaan ja muuttaa käyttäjärooleja.</li>
              <li><strong>Oppilas (student):</strong> Voi tallentaa ja hallinnoida vain omia ajokertojaan.</li>
            </ul>
          </div>

          {/* Users Table */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center space-x-2">
                <Users className="w-4 h-4 text-slate-500" />
                <span>Rekisteröityneet käyttäjät ({users.length})</span>
              </h3>
              <button
                onClick={loadUsers}
                className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
              >
                Päivitä lista
              </button>
            </div>

            {loading ? (
              <div className="text-center py-8 text-sm text-slate-500">Ladataan käyttäjiä...</div>
            ) : users.length === 0 ? (
              <div className="text-center py-8 text-sm text-slate-500">Ei vielä rekisteröityneitä käyttäjiä.</div>
            ) : (
              <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-xs">
                <table className="w-full text-left text-xs sm:text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-800">
                    <tr>
                      <th className="px-4 py-3">Käyttäjä</th>
                      <th className="px-4 py-3">Rooli</th>
                      <th className="px-4 py-3 text-right">Toiminnot</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-800 dark:text-slate-200">
                    {users.map((u) => {
                      const isSuper = u.email?.toLowerCase() === SUPERADMIN_EMAIL;
                      const isSelected = selectedStudentId === u.uid;

                      return (
                        <tr key={u.uid} className={`hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition ${isSelected ? 'bg-indigo-50/40 dark:bg-indigo-950/20' : ''}`}>
                          <td className="px-4 py-3">
                            <div className="flex items-center space-x-3">
                              {u.photoURL ? (
                                <img src={u.photoURL} alt="" className="w-8 h-8 rounded-lg object-cover" />
                              ) : (
                                <div className="w-8 h-8 rounded-lg bg-slate-200 dark:bg-slate-700 flex items-center justify-center font-bold text-slate-600 dark:text-slate-300 text-xs">
                                  {(u.displayName || u.email || 'K')[0].toUpperCase()}
                                </div>
                              )}
                              <div>
                                <div className="font-semibold text-slate-900 dark:text-white flex items-center space-x-1.5">
                                  <span>{u.displayName || 'Nimetön'}</span>
                                  {isSuper && (
                                    <span className="text-[10px] bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-300 px-1.5 py-0.2 rounded font-bold">
                                      SUPERADMIN
                                    </span>
                                  )}
                                </div>
                                <div className="text-xs text-slate-500 dark:text-slate-400">
                                  {u.email}
                                </div>
                              </div>
                            </div>
                          </td>

                          <td className="px-4 py-3">
                            <select
                              value={u.role}
                              disabled={isSuper}
                              onChange={(e) => handleRoleChange(u.uid, u.email, e.target.value as UserRole)}
                              className={`text-xs px-2.5 py-1.5 rounded-lg font-medium border ${
                                isSuper 
                                  ? 'bg-slate-100 dark:bg-slate-800 text-slate-500 border-transparent cursor-not-allowed'
                                  : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-indigo-500'
                              }`}
                            >
                              <option value="admin">Pääkäyttäjä / Opettaja</option>
                              <option value="student">Oppilas</option>
                            </select>
                          </td>

                          <td className="px-4 py-3 text-right">
                            <button
                              onClick={() => {
                                onSelectStudent(u);
                                onClose();
                              }}
                              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition inline-flex items-center space-x-1 ${
                                isSelected
                                  ? 'bg-indigo-600 text-white'
                                  : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-indigo-50 hover:text-indigo-600 dark:hover:bg-indigo-950 dark:hover:text-indigo-300'
                              }`}
                            >
                              <GraduationCap className="w-3.5 h-3.5" />
                              <span>{isSelected ? 'Valittu' : 'Tarkastele ajoja'}</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-850/50 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium rounded-xl bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200 hover:bg-slate-300 dark:hover:bg-slate-700 transition"
          >
            Sulje
          </button>
        </div>

      </div>
    </div>
  );
};
