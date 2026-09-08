import { describe, it, expect } from 'vitest';
import { classifyEnvironment, calculateDistanceKm, mapEnvironmentToTraficomCode } from './environmentClassifier';
import { calculateOverallStats } from './localDb';
import type { GeoPoint } from '../types';

describe('environmentClassifier', () => {
  it('laskee etäisyyden oikein kahden pisteen välillä', () => {
    // Helsingin rautatieasema -> Senaatintori n. 750 metriä
    const dist = calculateDistanceKm(60.1719, 24.9414, 60.1695, 24.9523);
    expect(dist).toBeGreaterThan(0.5);
    expect(dist).toBeLessThan(1.0);
  });

  it('tunnistaa hitaan ajon ja pienen alueen pysäköinniksi / käsittelyksi', () => {
    const points: GeoPoint[] = [];
    const now = Date.now();
    for (let i = 0; i < 20; i++) {
      points.push({
        lat: 60.2000 + Math.sin(i) * 0.0001,
        lng: 24.9350 + Math.cos(i) * 0.0001,
        timestamp: now + i * 5000,
        speed: 7, // 7 km/h
        accuracy: 5,
      });
    }

    const res = classifyEnvironment(points, 100);
    expect(res.primary).toBe('pysakointi');
    expect(res.distribution.pysakointi).toBeGreaterThan(50);
  });

  it('tunnistaa kaupunkiajon nopeuksilla 20-35 km/h', () => {
    const points: GeoPoint[] = [];
    const now = Date.now();
    for (let i = 0; i < 20; i++) {
      points.push({
        lat: 60.1700 + i * 0.0005,
        lng: 24.9400 + i * 0.0003,
        timestamp: now + i * 4000,
        speed: 25, // 25 km/h
        accuracy: 5,
      });
    }

    const res = classifyEnvironment(points, 80);
    expect(res.primary).toBe('kaupunki');
    expect(res.distribution.kaupunki).toBeGreaterThan(50);
  });

  it('tunnistaa moottoritie- ja maantieajon nopeuksilla > 80 km/h', () => {
    const points: GeoPoint[] = [];
    const now = Date.now();
    for (let i = 0; i < 20; i++) {
      points.push({
        lat: 60.2000 + i * 0.002,
        lng: 24.9500 + i * 0.002,
        timestamp: now + i * 4000,
        speed: 95, // 95 km/h
        accuracy: 5,
      });
    }

    const res = classifyEnvironment(points, 80);
    expect(res.primary).toBe('maantie');
    expect(res.distribution.maantie).toBeGreaterThan(50);
  });

  it('mäppää ajoympäristöt virallisiin Traficom E505sv koodeihin (K, A, B)', () => {
    expect(mapEnvironmentToTraficomCode('pysakointi')).toBe('K');
    expect(mapEnvironmentToTraficomCode('kaupunki')).toBe('A');
    expect(mapEnvironmentToTraficomCode('taajama')).toBe('A');
    expect(mapEnvironmentToTraficomCode('maantie')).toBe('B');
  });

  it('laskee opetusluvan 50 min ajotuntien määrän oikein', () => {
    const dummyDrives = [
      {
        id: '1',
        startTime: '2026-09-01T10:00:00Z',
        endTime: '2026-09-01T10:50:00Z',
        durationSeconds: 50 * 60, // 50 min = 1.0 h
        distanceKm: 30,
        avgSpeedKmH: 36,
        maxSpeedKmH: 60,
        topicCode: 'A' as const,
        notes: 'Taajama-ajoa',
        environment: { primary: 'taajama' as const, distribution: { maantie: 0, taajama: 100, kaupunki: 0, pysakointi: 0 } },
        routePoints: [],
        createdAt: '2026-09-01T10:50:00Z',
      },
      {
        id: '2',
        startTime: '2026-09-02T10:00:00Z',
        endTime: '2026-09-02T10:25:00Z',
        durationSeconds: 25 * 60, // 25 min = 0.5 h
        distanceKm: 15,
        avgSpeedKmH: 36,
        maxSpeedKmH: 60,
        topicCode: 'B' as const,
        notes: 'Maantieajoa',
        environment: { primary: 'maantie' as const, distribution: { maantie: 100, taajama: 0, kaupunki: 0, pysakointi: 0 } },
        routePoints: [],
        createdAt: '2026-09-02T10:25:00Z',
      },
    ];

    const stats = calculateOverallStats(dummyDrives);
    expect(stats.totalDrives).toBe(2);
    expect(stats.totalDistanceKm).toBe(45);
    expect(stats.lessonHours50Min).toBe(1.5);
    expect(stats.byTopicCode.A.count).toBe(1);
    expect(stats.byTopicCode.B.count).toBe(1);
  });
});
