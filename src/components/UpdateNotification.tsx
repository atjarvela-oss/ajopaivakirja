import React from 'react';
import { DownloadCloud, X, Sparkles, ExternalLink } from 'lucide-react';
import type { UpdateCheckResult } from '../services/updateService';
import { openUpdateDownload } from '../services/updateService';

interface UpdateNotificationProps {
  updateInfo: UpdateCheckResult | null;
  onDismiss: () => void;
}

export const UpdateNotification: React.FC<UpdateNotificationProps> = ({
  updateInfo,
  onDismiss,
}) => {
  if (!updateInfo || !updateInfo.hasUpdate) return null;

  return (
    <div className="fixed bottom-20 sm:bottom-6 right-4 left-4 sm:left-auto sm:max-w-md z-50 animate-in slide-in-from-bottom-5 duration-300">
      <div className="bg-gradient-to-r from-blue-700 via-indigo-700 to-purple-800 text-white p-4 rounded-2xl shadow-2xl border border-white/20 backdrop-blur-md">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start space-x-3">
            <div className="p-2.5 rounded-xl bg-white/15 shrink-0 mt-0.5">
              <Sparkles className="w-5 h-5 text-amber-300 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h4 className="text-sm font-extrabold text-white">Uusi versio saatavilla!</h4>
                <span className="text-[10px] font-mono font-bold bg-white/25 px-2 py-0.5 rounded-full">
                  {updateInfo.latestVersion}
                </span>
              </div>
              <p className="text-xs text-blue-100 mt-1 leading-snug">
                {updateInfo.releaseName || 'Uusi päivitys opetuslupalaisen ajopäiväkirjaan.'}
              </p>
              {updateInfo.releaseNotes && (
                <p className="text-[11px] text-blue-200/90 mt-1 line-clamp-2 italic">
                  {updateInfo.releaseNotes}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={onDismiss}
            className="text-white/70 hover:text-white p-1 rounded-lg hover:bg-white/10 transition cursor-pointer"
            title="Sulje ilmoitus"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="mt-3.5 pt-3 border-t border-white/15 flex items-center justify-between gap-2">
          <span className="text-[11px] text-blue-200">
            Nykyinen: <span className="font-mono font-semibold">{updateInfo.currentVersion}</span>
          </span>
          <button
            onClick={() => openUpdateDownload(updateInfo.downloadUrl)}
            className="px-3.5 py-1.5 rounded-xl bg-white text-blue-900 hover:bg-blue-50 font-extrabold text-xs shadow-md transition flex items-center space-x-1.5 cursor-pointer active:scale-95"
          >
            <DownloadCloud className="w-4 h-4 text-blue-700" />
            <span>Päivitä nyt</span>
            <ExternalLink className="w-3 h-3 text-blue-500" />
          </button>
        </div>
      </div>
    </div>
  );
};
