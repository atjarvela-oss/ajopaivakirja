import React, { useRef, useState } from 'react';
import { 
  X, 
  Share2, 
  Download, 
  Copy, 
  Check, 
  Sparkles, 
  Clock, 
  Navigation, 
  Gauge, 
  Fuel, 
  AlertTriangle, 
  RotateCw, 
  PowerOff,
  Car,
  Image as ImageIcon
} from 'lucide-react';
import type { 
  DriveShareData 
} from '../services/shareCardService';
import { 
  formatDriveShareText, 
  captureElementToBlob, 
  generateCanvasFallbackBlob, 
  shareDriveSummaryImage,
  downloadImageBlob,
  copyImageBlobToClipboard
} from '../services/shareCardService';
import { ENVIRONMENT_CONFIG, TRAFICOM_TOPIC_CONFIG } from '../services/environmentClassifier';

interface DriveShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: DriveShareData | null;
}

export const DriveShareModal: React.FC<DriveShareModalProps> = ({
  isOpen,
  onClose,
  data,
}) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [copiedText, setCopiedText] = useState(false);
  const [copiedImage, setCopiedImage] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  if (!isOpen || !data) return null;

  const startDate = typeof data.startTime === 'string' ? new Date(data.startTime) : data.startTime;
  const dateFormatted = startDate.toLocaleDateString('fi-FI', {
    weekday: 'short',
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
  });
  const timeFormatted = startDate.toLocaleTimeString('fi-FI', {
    hour: '2-digit',
    minute: '2-digit',
  });

  const durationMin = Math.round(data.durationSeconds / 60);
  const topicCfg = data.topicCode ? TRAFICOM_TOPIC_CONFIG[data.topicCode] : null;
  const envCfg = data.environment?.primary ? ENVIRONMENT_CONFIG[data.environment.primary] : null;

  const score = data.behavior?.smoothnessScore ?? 85;
  const grade = 
    score >= 88 ? 'Erinomainen' :
    score >= 75 ? 'Hyvä' :
    score >= 60 ? 'Kohtalainen' : 'Harjoiteltavaa';

  const reportText = data.verbalReport || data.behavior?.verbalReport || 'Ajo sujui rauhallisesti ja hallitusti.';

  // Muodostaa PNG-kuvan joko HTML DOM-kaappauksella tai Canvas-fallbackilla
  const getShareBlob = async (): Promise<Blob> => {
    try {
      if (cardRef.current) {
        return await captureElementToBlob(cardRef.current);
      }
    } catch (domErr) {
      console.warn('DOM-kaappaus epäonnistui, käytetään Canvas-fallbackia:', domErr);
    }
    return await generateCanvasFallbackBlob(data);
  };

  // 1. Jaa laitteen jakovalikkoon (WhatsApp, Drive, jne.)
  const handleNativeShare = async () => {
    setIsProcessing(true);
    setStatusMessage('Valmistellaan jakoa...');
    try {
      const blob = await getShareBlob();
      const dateStr = startDate.toISOString().slice(0, 10);
      await shareDriveSummaryImage(blob, `ajotapakooste_${dateStr}`);
      setStatusMessage('Jaettu onnistuneesti!');
      setTimeout(() => setStatusMessage(null), 3000);
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        console.error('Jako epäonnistui:', err);
        setStatusMessage('Jako epäonnistui');
        setTimeout(() => setStatusMessage(null), 3000);
      }
    } finally {
      setIsProcessing(false);
    }
  };

  // 2. Lataa PNG-tiedosto
  const handleDownload = async () => {
    setIsProcessing(true);
    setStatusMessage('Luodaan PNG-kuvaa...');
    try {
      const blob = await getShareBlob();
      const dateStr = startDate.toISOString().slice(0, 10);
      downloadImageBlob(blob, `ajotapakooste_${dateStr}.png`);
      setStatusMessage('Kuva ladattu laitteelle!');
      setTimeout(() => setStatusMessage(null), 3000);
    } catch (err) {
      console.error('Lataus epäonnistui:', err);
      setStatusMessage('Lataus epäonnistui');
      setTimeout(() => setStatusMessage(null), 3000);
    } finally {
      setIsProcessing(false);
    }
  };

  // 3. Kopioi tekstikooste leikepöydälle
  const handleCopyText = async () => {
    try {
      const text = formatDriveShareText(data);
      await navigator.clipboard.writeText(text);
      setCopiedText(true);
      setStatusMessage('Tekstikooste kopioitu leikepöydälle!');
      setTimeout(() => {
        setCopiedText(false);
        setStatusMessage(null);
      }, 3000);
    } catch (err) {
      console.error('Kopiointi epäonnistui:', err);
    }
  };

  // 4. Kopioi kuva leikepöydälle
  const handleCopyImage = async () => {
    setIsProcessing(true);
    setStatusMessage('Kopioidaan kuvaa...');
    try {
      const blob = await getShareBlob();
      const success = await copyImageBlobToClipboard(blob);
      if (success) {
        setCopiedImage(true);
        setStatusMessage('PNG-kuva kopioitu leikepöydälle!');
        setTimeout(() => {
          setCopiedImage(false);
          setStatusMessage(null);
        }, 3000);
      } else {
        // Jos leikepöytä ei tue suoraa kuvankopiointia, ladataan tiedostona
        downloadImageBlob(blob, `ajotapakooste.png`);
        setStatusMessage('Kuva ladattiin tiedostona (selain ei tue kuvaleikepöytää)');
        setTimeout(() => setStatusMessage(null), 3500);
      }
    } catch (err) {
      console.error('Kuvan kopiointi epäonnistui:', err);
      setStatusMessage('Kuvankopiointi ei onnistunut');
      setTimeout(() => setStatusMessage(null), 3000);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className="relative w-full max-w-lg bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col max-h-[92vh] overflow-hidden"
        role="dialog"
        aria-modal="true"
      >
        {/* Yläpalkki */}
        <div className="shrink-0 px-4 py-3 sm:px-5 sm:py-3.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="p-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400">
              <Share2 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm sm:text-base text-slate-900 dark:text-white leading-tight">
                Jaa ajotapakooste
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Lähetä kuvana laitteen jaolla tai kopioi tekstinä
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
            title="Sulje"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Ilmoituspalkki toiminnon valmistuttua */}
        {statusMessage && (
          <div className="shrink-0 bg-indigo-600 text-white text-xs py-1.5 px-4 text-center font-medium flex items-center justify-center space-x-1.5 animate-in fade-in duration-150">
            <Check className="w-3.5 h-3.5" />
            <span>{statusMessage}</span>
          </div>
        )}

        {/* Rullattava sisältöalue: Kortin esikatselu */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 bg-slate-50/50 dark:bg-slate-950/40">
          
          {/* Kortin visuaalinen elementti (tämä kuvataan PNG:ksi) */}
          <div 
            ref={cardRef}
            id="driving-share-card"
            className="w-full rounded-2xl bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-900 text-white p-5 sm:p-6 shadow-xl border border-indigo-500/20 space-y-4 font-sans relative overflow-hidden"
            style={{ minHeight: '440px' }}
          >
            {/* Taustan koristeheijastus */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />
            <div className="absolute bottom-0 left-0 w-56 h-56 bg-purple-500/10 rounded-full blur-3xl pointer-events-none -ml-20 -mb-20" />

            {/* Kortin ylätunniste: Brändi & Päiväys */}
            <div className="relative z-10 flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center space-x-2">
                <div className="p-1.5 rounded-lg bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  <Car className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-indigo-400 block">
                    OPETUSLUVAN AJOPÄIVÄKIRJA
                  </span>
                  <span className="text-xs font-semibold text-slate-200">
                    Ajotapa & Harjoituksen Kooste
                  </span>
                </div>
              </div>

              <div className="text-right text-[11px] text-slate-400">
                <div className="font-semibold text-slate-300">{dateFormatted}</div>
                <div>klo {timeFormatted}</div>
              </div>
            </div>

            {/* Opetusaihe & Ajoympäristö */}
            <div className="relative z-10 flex flex-wrap items-center gap-1.5">
              {topicCfg && (
                <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30">
                  Aihe {topicCfg.code}: {topicCfg.label}
                </span>
              )}
              {envCfg && (
                <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-white/10 text-slate-300 border border-white/10">
                  {envCfg.label.split(' / ')[0]}
                </span>
              )}
            </div>

            {/* 4 Päämittaria */}
            <div className="relative z-10 grid grid-cols-4 gap-2 text-center">
              <div className="p-2.5 rounded-xl bg-white/5 border border-white/10 backdrop-blur-xs">
                <div className="flex items-center justify-center space-x-1 text-[10px] text-slate-400 mb-0.5">
                  <Clock className="w-3 h-3 text-indigo-400" />
                  <span>KESTO</span>
                </div>
                <div className="text-sm sm:text-base font-extrabold text-white">
                  {durationMin} min
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-white/5 border border-white/10 backdrop-blur-xs">
                <div className="flex items-center justify-center space-x-1 text-[10px] text-slate-400 mb-0.5">
                  <Navigation className="w-3 h-3 text-indigo-400" />
                  <span>MATKA</span>
                </div>
                <div className="text-sm sm:text-base font-extrabold text-white">
                  {data.distanceKm.toFixed(1)} km
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-white/5 border border-white/10 backdrop-blur-xs">
                <div className="flex items-center justify-center space-x-1 text-[10px] text-slate-400 mb-0.5">
                  <Gauge className="w-3 h-3 text-indigo-400" />
                  <span>KESKINOP.</span>
                </div>
                <div className="text-sm sm:text-base font-extrabold text-white">
                  {Math.round(data.avgSpeedKmH)} km/h
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-white/5 border border-white/10 backdrop-blur-xs">
                <div className="flex items-center justify-center space-x-1 text-[10px] text-slate-400 mb-0.5">
                  <Sparkles className="w-3 h-3 text-amber-400" />
                  <span>ARVIO</span>
                </div>
                <div className="text-xs sm:text-sm font-extrabold text-amber-300 truncate">
                  {grade}
                </div>
              </div>
            </div>

            {/* Tasaisuusindeksi ja Tapahtumat */}
            <div className="relative z-10 p-3.5 rounded-xl bg-indigo-900/30 border border-indigo-500/30 flex items-center justify-between gap-3">
              <div>
                <span className="text-[10px] font-bold tracking-wide uppercase text-indigo-300 block mb-0.5">
                  Tasaisuusindeksi
                </span>
                <div className="flex items-baseline space-x-1.5">
                  <span className="text-3xl font-black text-sky-400">{score}</span>
                  <span className="text-xs text-slate-400 font-semibold">/ 100</span>
                </div>
              </div>

              {/* Tapahtumalaskurit */}
              <div className="flex items-center space-x-2 text-center text-xs">
                <div className="p-1.5 px-2 rounded-lg bg-black/40 border border-white/5">
                  <div className="flex items-center justify-center space-x-1 text-[10px] text-rose-400">
                    <AlertTriangle className="w-3 h-3" />
                    <span>Jarrutus</span>
                  </div>
                  <div className="font-extrabold text-sm text-white">
                    {data.behavior?.hardBrakesCount ?? 0}
                  </div>
                </div>

                <div className="p-1.5 px-2 rounded-lg bg-black/40 border border-white/5">
                  <div className="flex items-center justify-center space-x-1 text-[10px] text-amber-400">
                    <RotateCw className="w-3 h-3" />
                    <span>Mutka</span>
                  </div>
                  <div className="font-extrabold text-sm text-white">
                    {data.behavior?.hardTurnsCount ?? 0}
                  </div>
                </div>

                <div className="p-1.5 px-2 rounded-lg bg-black/40 border border-white/5">
                  <div className="flex items-center justify-center space-x-1 text-[10px] text-purple-400">
                    <PowerOff className="w-3 h-3" />
                    <span>Sammui</span>
                  </div>
                  <div className="font-extrabold text-sm text-white">
                    {data.behavior?.engineStallsCount ?? 0}
                  </div>
                </div>
              </div>
            </div>

            {/* OBD2-kulutustieto jos saatavilla */}
            {data.obdData && data.obdData.connected && data.obdData.avgFuelConsumptionL100Km && (
              <div className="relative z-10 p-2.5 rounded-xl bg-emerald-950/40 border border-emerald-500/30 flex items-center justify-between text-xs text-emerald-200">
                <div className="flex items-center space-x-2">
                  <Fuel className="w-4 h-4 text-emerald-400" />
                  <span className="font-medium text-emerald-300">OBD2 Kulutus:</span>
                  <strong className="text-white font-extrabold">{data.obdData.avgFuelConsumptionL100Km} l/100 km</strong>
                  {data.obdData.avgFuelRateLitersPerHour !== undefined && (
                    <span className="text-[11px] text-emerald-300">
                      ({data.obdData.avgFuelRateLitersPerHour} L/h{data.obdData.fuelRateSupported ? ' PID 5E' : ''})
                    </span>
                  )}
                </div>
                {data.obdData.totalFuelUsedLiters !== undefined && (
                  <span className="text-[11px] text-emerald-300">
                    Yhteensä {data.obdData.totalFuelUsedLiters} L
                  </span>
                )}
              </div>
            )}

            {/* Pedagoginen sanallinen palaute */}
            <div className="relative z-10 p-3.5 rounded-xl bg-white/5 border border-white/10 space-y-1.5">
              <div className="flex items-center space-x-1.5 text-indigo-300 text-xs font-bold">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Opettava palaute & vinkit:</span>
              </div>
              <p className="text-xs text-slate-200 leading-relaxed font-normal">
                {reportText}
              </p>
            </div>

            {/* Muistiinpanot jos kirjattu */}
            {data.notes && data.notes.trim() && (
              <div className="relative z-10 text-xs text-slate-300 bg-white/5 p-2.5 rounded-lg border border-white/5">
                <strong className="text-indigo-300 font-semibold">Harjoitukset:</strong> {data.notes.trim()}
              </div>
            )}

            {/* Alaviite */}
            <div className="relative z-10 pt-2 border-t border-white/10 flex items-center justify-between text-[10px] text-slate-400">
              <span>Opetusluvan ajopäiväkirja</span>
              <span>Traficom B-opetuskortti</span>
            </div>
          </div>

        </div>

        {/* Toimintapalkki / Jakopainikkeet */}
        <div className="shrink-0 p-3.5 sm:p-4 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 space-y-2.5">
          
          {/* Pääpainike: Laitteen natiivijako (WhatsApp, Drive, Gmail, jne.) */}
          <button
            type="button"
            onClick={handleNativeShare}
            disabled={isProcessing}
            className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white font-extrabold text-sm shadow-md shadow-indigo-600/25 transition flex items-center justify-center space-x-2 cursor-pointer active:scale-[0.98] disabled:opacity-50"
          >
            <Share2 className="w-4 h-4" />
            <span>{isProcessing ? 'Käsitellään...' : 'Jaa laitteen jako-valikon kautta (PNG)'}</span>
          </button>

          {/* Toissijaiset toiminnot: Lataa PNG & Kopioi teksti */}
          <div className="grid grid-cols-3 gap-2 text-xs">
            <button
              type="button"
              onClick={handleDownload}
              disabled={isProcessing}
              className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold transition flex items-center justify-center space-x-1.5 cursor-pointer disabled:opacity-50"
              title="Lataa PNG-kuva suoraan laitteelle"
            >
              <Download className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
              <span>Lataa PNG</span>
            </button>

            <button
              type="button"
              onClick={handleCopyText}
              className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold transition flex items-center justify-center space-x-1.5 cursor-pointer"
              title="Kopioi selkeä tekstikooste leikepöydälle"
            >
              {copiedText ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-500" />
                  <span className="text-emerald-600 dark:text-emerald-400">Kopioitu!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                  <span>Kopioi teksti</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleCopyImage}
              disabled={isProcessing}
              className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold transition flex items-center justify-center space-x-1.5 cursor-pointer disabled:opacity-50"
              title="Kopioi PNG leikepöydälle suoraa liittämistä varten"
            >
              {copiedImage ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-500" />
                  <span className="text-emerald-600 dark:text-emerald-400">Kopioitu!</span>
                </>
              ) : (
                <>
                  <ImageIcon className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
                  <span>Kopioi kuva</span>
                </>
              )}
            </button>
          </div>

        </div>

      </div>
    </div>
  );
};
