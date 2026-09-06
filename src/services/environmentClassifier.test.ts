import { describe, it, expect } from 'vitest';
import { classifyEnvironment, calculateDistanceKm } from './environmentClassifier';
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
});
