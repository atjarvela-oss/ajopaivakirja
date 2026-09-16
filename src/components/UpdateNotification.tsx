import React from 'react';
import { DownloadCloud, X, Sparkles, ExternalLink, EyeOff } from 'lucide-react';
import type { UpdateCheckResult } from '../services/updateService';
import { openUpdateDownload, isDevEnvironment, dismissUpdate } from '../services/updateService';

interface UpdateNotificationProps {
  updateInfo: UpdateCheckResult | null;
  onDismiss: () => void;
  isDriving?: boolean;
}

export const UpdateNotification: React.FC<UpdateNotificationProps> = ({
  updateInfo,
  onDismiss,
  isDriving = false,
}) => {
  // Kehitysympäristössä (Vite dev, Cloud Run -esikatselu) tai ajon aikana ei näytetä ilmoitusta lainkaan
  if (isDevEnvironment() || isDriving) return null;
  if (!updateInfo || !updateInfo.hasUpdate) return null;

  const handleDismiss = () => {
    if (updateInfo.latestVersion) {
      dismissUpdate(updateInfo.latestVersion);
    }
    onDismiss();
  };

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
            onClick={handleDismiss}
            className="text-white/80 hover:text-white p-1.5 rounded-xl bg-white/10 hover:bg-white/20 transition cursor-pointer shrink-0"
            title="Sulje ja älä näytä uudelleen"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="mt-3.5 pt-3 border-t border-white/15 flex items-center justify-between gap-2">
          <button
            onClick={handleDismiss}
            className="text-[11px] text-blue-200 hover:text-white flex items-center space-x-1 cursor-pointer py-1"
          >
            <EyeOff className="w-3.5 h-3.5" />
            <span>Hylkää tämä versio</span>
          </button>
          
          <button
            onClick={() => openUpdateDownload(updateInfo.downloadUrl)}
            className="px-3.5 py-1.5 rounded-xl bg-white text-blue-900 hover:bg-blue-50 font-extrabold text-xs shadow-md transition flex items-center space-x-1.5 cursor-pointer active:scale-95"
          >
            <DownloadCloud className="w-4 h-4 text-blue-700" />
            <span>Lataa APK</span>
            <ExternalLink className="w-3 h-3 text-blue-500" />
          </button>
        </div>
      </div>
    </div>
  );
};
