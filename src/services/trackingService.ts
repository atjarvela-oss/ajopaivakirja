import { registerPlugin } from '@capacitor/core';
import type { GeoPoint } from '../types';

interface WatcherOptions {
  backgroundMessage?: string;
  backgroundTitle?: string;
  requestPermissions?: boolean;
  stale?: boolean;
  distanceFilter?: number;
}

interface BGLocation {
  latitude: number;
  longitude: number;
  accuracy: number;
  speed: number | null;
  time: number;
}

interface BackgroundGeolocationPlugin {
  addWatcher(
    options: WatcherOptions,
    callback: (location: BGLocation | null, error: { code: string } | null) => void,
  ): Promise<string>;
  removeWatcher(options: { id: string }): Promise<void>;
  openSettings(): Promise<void>;
}

const BackgroundGeolocation = registerPlugin<BackgroundGeolocationPlugin>('BackgroundGeolocation');

interface KeepAwakePlugin {
  keepAwake(): Promise<void>;
  allowSleep(): Promise<void>;
}

const KeepAwake = registerPlugin<KeepAwakePlugin>('KeepAwake');

/** Returns true when running inside a Capacitor native app (Android/iOS). */
function isNative(): boolean {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return !!(window as any).Capacitor?.isNativePlatform?.();
}

// -----------------------------------------------------------------------
// Screen Wake Lock
// -----------------------------------------------------------------------
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let wakeLockSentinel: any = null;
let _trackingActive = false;

/** Prevent the screen from dimming / turning off during a drive. */
export async function acquireWakeLock(): Promise<void> {
  if (isNative()) {
    try { await KeepAwake.keepAwake(); } catch (e) { console.warn('[WakeLock] keepAwake:', e); }
    return;
  }
  try {
    if ('wakeLock' in navigator) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      wakeLockSentinel = await (navigator as any).wakeLock.request('screen');
      wakeLockSentinel?.addEventListener('release', () => { wakeLockSentinel = null; });
    }
  } catch (e) { console.warn('[WakeLock] Browser Wake Lock:', e); }
}

/** Allow the screen to turn off normally. Call when drive ends. */
export async function releaseWakeLock(): Promise<void> {
  if (isNative()) {
    try { await KeepAwake.allowSleep(); } catch (e) { console.warn('[WakeLock] allowSleep:', e); }
    return;
  }
  try {
    await wakeLockSentinel?.release();
    wakeLockSentinel = null;
  } catch (e) { console.warn('[WakeLock] release:', e); }
}

// Re-acquire wake lock if the browser releases it when the tab is hidden then shown again.
document.addEventListener('visibilitychange', async () => {
  if (
    document.visibilityState === 'visible' &&
    wakeLockSentinel === null &&
    _trackingActive &&
    !isNative()
  ) {
    await acquireWakeLock();
  }
});

// -----------------------------------------------------------------------
// Location watcher
// -----------------------------------------------------------------------
export type LocationCallback = (point: GeoPoint) => void;
export type ErrorCallback = (err: string) => void;

let _bgWatcherId: string | null = null;
let _browserWatchId: number | null = null;

/**
 * Start tracking the user's location.
 *
 * On Capacitor Android: uses @capacitor-community/background-geolocation which
 * starts an Android Foreground Service. A persistent notification appears in
 * the status bar so the user knows tracking is active. GPS fixes continue
 * arriving even with the screen off or another app in the foreground.
 *
 * In a browser (dev): falls back to navigator.geolocation.watchPosition.
 */
export async function startLocationWatcher(
  onLocation: LocationCallback,
  onError: ErrorCallback,
): Promise<void> {
  _trackingActive = true;

  if (isNative()) {
    try {
      _bgWatcherId = await BackgroundGeolocation.addWatcher(
        {
          backgroundMessage: 'Ajo käynnissä – reittiä tallennetaan taustalla',
          backgroundTitle: 'Opetuslupalaisen ajopäiväkirja',
          requestPermissions: true,
          stale: false,
          distanceFilter: 0,
        },
        (location, error) => {
          if (error) {
            if (error.code === 'NOT_AUTHORIZED') {
              if (window.confirm(
                'Sovelluksella ei ole lupaa käyttää sijaintiasi taustalla.\n\nAvataanko asetukset?',
              )) {
                BackgroundGeolocation.openSettings();
              }
            }
            onError(error.code);
            return;
          }
          if (!location) return;
          const speedKmh = location.speed !== null && location.speed >= 0
            ? Math.round(location.speed * 3.6)
            : null;
          onLocation({
            lat: location.latitude,
            lng: location.longitude,
            timestamp: location.time,
            speed: speedKmh,
            accuracy: Math.round(location.accuracy),
          });
        },
      );
    } catch (e) {
      console.error('[Tracking] addWatcher failed:', e);
      onError(String(e));
    }
  } else {
    if (!navigator.geolocation) {
      onError('Selaimesi ei tue GPS-sijaintia.');
      return;
    }
    _browserWatchId = navigator.geolocation.watchPosition(
      (pos) => {
        const speedKmh = pos.coords.speed !== null
          ? Math.round(pos.coords.speed * 3.6)
          : null;
        onLocation({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          timestamp: pos.timestamp,
          speed: speedKmh,
          accuracy: Math.round(pos.coords.accuracy),
        });
      },
      (err) => onError(err.message),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  }
}

/** Stop location tracking and release all watcher resources. */
export async function stopLocationWatcher(): Promise<void> {
  _trackingActive = false;
  if (_bgWatcherId !== null) {
    try {
      await BackgroundGeolocation.removeWatcher({ id: _bgWatcherId });
    } catch (e) {
      console.warn('[Tracking] removeWatcher failed:', e);
    }
    _bgWatcherId = null;
  }
  if (_browserWatchId !== null) {
    navigator.geolocation.clearWatch(_browserWatchId);
    _browserWatchId = null;
  }
}
