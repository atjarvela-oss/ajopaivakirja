import React, { useState } from 'react';
import { 
  X, 
  Settings, 
  Database, 
  Check, 
  RotateCcw,
  ShieldCheck
} from 'lucide-react';
import { 
  getStoredFirebaseConfig, 
  saveFirebaseConfig, 
  clearFirebaseConfig, 
  isFirebaseConfigured,
  SUPERADMIN_EMAIL 
} from '../services/firebase';
import type { FirebaseConfigState } from '../types';

interface FirebaseSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const FirebaseSettingsModal: React.FC<FirebaseSettingsModalProps> = ({
  isOpen,
  onClose,
}) => {
  const currentConfig = getStoredFirebaseConfig() || {
    apiKey: '',
    authDomain: '',
    projectId: '',
    storageBucket: '',
    messagingSenderId: '',
    appId: '',
  };

  const [form, setForm] = useState<FirebaseConfigState>(currentConfig);
  const [jsonInput, setJsonInput] = useState('');

  if (!isOpen) return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    saveFirebaseConfig(form);
  };

  const handleJsonParse = () => {
    try {
      // Käyttäjä voi liittää koko `const firebaseConfig = { ... }` -koodinpätkän suoraan
      const match = jsonInput.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        setForm({
          apiKey: parsed.apiKey || '',
          authDomain: parsed.authDomain || '',
          projectId: parsed.projectId || '',
          storageBucket: parsed.storageBucket || '',
          messagingSenderId: parsed.messagingSenderId || '',
          appId: parsed.appId || '',
        });
      }
    } catch (e) {
      alert('JSON-liitos epäonnistui. Tarkista muotoilu.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="bg-white dark:bg-slate-900 w-full max-w-xl rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-orange-100 dark:bg-orange-950/60 text-orange-600 dark:text-orange-400">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Firebase & Järjestelmäasetukset
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Google Authentication & Cloud Firestore
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Sisältö */}
        <div className="p-6 overflow-y-auto space-y-5 text-xs sm:text-sm">
          
          {/* Tilan näyttö */}
          <div className={`p-4 rounded-xl border flex items-start space-x-3 ${
            isFirebaseConfigured 
              ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200' 
              : 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200'
          }`}>
            <div className="mt-0.5">
              {isFirebaseConfigured ? <Check className="w-4 h-4 text-emerald-600" /> : <Settings className="w-4 h-4 text-amber-600" />}
            </div>
            <div>
              <div className="font-semibold text-xs sm:text-sm">
                {isFirebaseConfigured ? 'Firebase on aktiivinen ja kytketty' : 'Demotila / Paikallinen tila aktiivinen'}
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">
                {isFirebaseConfigured
                  ? `Käytetään pilvitallennusta ja Google-kirjautumista projektissa ${currentConfig.projectId}.`
                  : 'Voit käyttää ja kokeilla sovellusta heti ilman omia avaimia. Kun haluat viedä sovelluksen virallisesti käyttöön, syötä omat Firebase-avaimesi alle.'}
              </p>
            </div>
          </div>

          {/* Pääkäyttäjätieto */}
          <div className="p-3.5 rounded-xl bg-indigo-50/60 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 flex items-center justify-between text-xs">
            <div className="flex items-center space-x-2 text-indigo-900 dark:text-indigo-300">
              <ShieldCheck className="w-4 h-4 text-indigo-600 shrink-0" />
              <span>Pääkäyttäjän sähköposti: <strong>{SUPERADMIN_EMAIL}</strong></span>
            </div>
            <span className="text-[10px] bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300 px-2 py-0.5 rounded font-bold">
              SUPERADMIN
            </span>
          </div>

          {/* Pikaliitos JSON:sta */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
              Liitä Firebase Config -objekti (Helpoin tapa):
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder='Liitä esim: { apiKey: "...", projectId: "..." }'
                value={jsonInput}
                onChange={(e) => setJsonInput(e.target.value)}
                className="flex-1 p-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
              />
              <button
                type="button"
                onClick={handleJsonParse}
                className="px-3 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-semibold transition"
              >
                Täytä
              </button>
            </div>
          </div>

          {/* Manuaalinen kenttälomake */}
          <form onSubmit={handleSave} className="space-y-3 pt-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-0.5">apiKey</label>
                <input
                  type="text"
                  required
                  value={form.apiKey}
                  onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
                  placeholder="AIzaSy..."
                  className="w-full p-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-0.5">projectId</label>
                <input
                  type="text"
                  required
                  value={form.projectId}
                  onChange={(e) => setForm({ ...form, projectId: e.target.value })}
                  placeholder="ajopaivakirja-app"
                  className="w-full p-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-0.5">authDomain</label>
                <input
                  type="text"
                  value={form.authDomain}
                  onChange={(e) => setForm({ ...form, authDomain: e.target.value })}
                  placeholder="ajopaivakirja-app.firebaseapp.com"
                  className="w-full p-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-0.5">appId</label>
                <input
                  type="text"
                  value={form.appId}
                  onChange={(e) => setForm({ ...form, appId: e.target.value })}
                  placeholder="1:123456:web:..."
                  className="w-full p-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>
            </div>

            <div className="pt-3 flex items-center justify-between">
              {isFirebaseConfigured && (
                <button
                  type="button"
                  onClick={clearFirebaseConfig}
                  className="text-xs text-rose-600 hover:text-rose-700 flex items-center space-x-1"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Palauta demotila</span>
                </button>
              )}
              <div className="flex space-x-2 ml-auto">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-3 py-2 text-xs rounded-lg text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Sulje
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-bold rounded-lg bg-blue-600 hover:bg-blue-500 text-white shadow-xs"
                >
                  Tallenna & Käynnistä uudelleen
                </button>
              </div>
            </div>
          </form>

        </div>

      </div>
    </div>
  );
};
