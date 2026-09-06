import type { GeoPoint, EnvironmentType, EnvironmentDistribution, DriveEnvironment } from '../types';

/**
 * Laskee kahden maantieteellisen pisteen välisen etäisyyden kilometreinä (Haversine-kaava)
 */
export function calculateDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Maapallon säde km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Analysoi GPS-reitin ja antaa sovelluksen arvion ajoympäristöstä
 * (maantie, taajama, kaupunki, pysäköinti)
 */
export function classifyEnvironment(points: GeoPoint[], durationSeconds: number): DriveEnvironment {
  if (points.length < 2 || durationSeconds < 15) {
    return {
      primary: 'taajama',
      distribution: { maantie: 0, taajama: 100, kaupunki: 0, pysakointi: 0 },
    };
  }

  let totalDistance = 0;
  let parkingSeconds = 0;
  let citySeconds = 0;
  let taajamaSeconds = 0;
  let highwaySeconds = 0;

  let minLat = points[0].lat;
  let maxLat = points[0].lat;
  let minLng = points[0].lng;
  let maxLng = points[0].lng;

  for (let i = 0; i < points.length; i++) {
    const pt = points[i];
    minLat = Math.min(minLat, pt.lat);
    maxLat = Math.max(maxLat, pt.lat);
    minLng = Math.min(minLng, pt.lng);
    maxLng = Math.max(maxLng, pt.lng);

    if (i > 0) {
      const prev = points[i - 1];
      const dist = calculateDistanceKm(prev.lat, prev.lng, pt.lat, pt.lng);
      totalDistance += dist;

      const dt = Math.max(0.5, Math.min(10, (pt.timestamp - prev.timestamp) / 1000));
      
      let speed = pt.speed;
      if (speed === null || speed === undefined || isNaN(speed)) {
        speed = (dist / (dt / 3600)); // km/h
      }

      if (speed < 12) {
        parkingSeconds += dt;
      } else if (speed >= 12 && speed < 38) {
        citySeconds += dt;
      } else if (speed >= 38 && speed < 68) {
        taajamaSeconds += dt;
      } else {
        highwaySeconds += dt;
      }
    }
  }

  const diagonalKm = calculateDistanceKm(minLat, minLng, maxLat, maxLng);
  const isManouveringArea = totalDistance > 0.4 && diagonalKm < 0.25;

  if (isManouveringArea) {
    parkingSeconds += (citySeconds + taajamaSeconds) * 0.7;
    citySeconds *= 0.3;
    taajamaSeconds *= 0.3;
  }

  const sumSeconds = Math.max(1, parkingSeconds + citySeconds + taajamaSeconds + highwaySeconds);

  let pPark = Math.round((parkingSeconds / sumSeconds) * 100);
  let pCity = Math.round((citySeconds / sumSeconds) * 100);
  let pTaaj = Math.round((taajamaSeconds / sumSeconds) * 100);
  let pHigh = Math.round((highwaySeconds / sumSeconds) * 100);

  const currentSum = pPark + pCity + pTaaj + pHigh;
  const diff = 100 - currentSum;
  pTaaj += diff;

  const distribution: EnvironmentDistribution = {
    pysakointi: Math.max(0, pPark),
    kaupunki: Math.max(0, pCity),
    taajama: Math.max(0, pTaaj),
    maantie: Math.max(0, pHigh),
  };

  let primary: EnvironmentType = 'taajama';
  let maxPercent = distribution.taajama;

  if (distribution.maantie > maxPercent) {
    primary = 'maantie';
    maxPercent = distribution.maantie;
  }
  if (distribution.kaupunki > maxPercent) {
    primary = 'kaupunki';
    maxPercent = distribution.kaupunki;
  }
  if (distribution.pysakointi > maxPercent && distribution.pysakointi > 45) {
    primary = 'pysakointi';
  }

  return {
    primary,
    distribution,
  };
}

/**
 * Suomenkieliset selitykset ja värit ympäristöille
 */
export const ENVIRONMENT_CONFIG: Record<EnvironmentType, {
  label: string;
  badgeClass: string;
  bgLight: string;
  color: string;
  description: string;
}> = {
  maantie: {
    label: 'Maantie / Moottoritie',
    badgeClass: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800',
    bgLight: '#10b981',
    color: '#047857',
    description: 'Suuremmat nopeudet (yli 65–100 km/h), liittymät ja ohitukset.',
  },
  taajama: {
    label: 'Taajama',
    badgeClass: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 border-blue-300 dark:border-blue-800',
    bgLight: '#3b82f6',
    color: '#1d4ed8',
    description: '40–60 km/h alueet, omakotitalo- ja asuinalueet, kiertoliittymät.',
  },
  kaupunki: {
    label: 'Kaupunki / Keskusta',
    badgeClass: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border-amber-300 dark:border-amber-800',
    bgLight: '#f59e0b',
    color: '#b45309',
    description: 'Keskusta-ajo, runsaasti liikennevaloja, jalankulkijoita ja risteyksiä.',
  },
  pysakointi: {
    label: 'Pysäköinti / Käsittely',
    badgeClass: 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300 border-purple-300 dark:border-purple-800',
    bgLight: '#a855f7',
    color: '#7e22ce',
    description: 'Pysäköinti, peruutus, taskuparkki, ryömintä ja ajoneuvon hallinta.',
  },
};
