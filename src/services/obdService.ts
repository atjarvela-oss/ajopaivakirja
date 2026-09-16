import type { ObdDriveData } from '../types';
import { Capacitor } from '@capacitor/core';
import { BleClient, textToDataView } from '@capacitor-community/bluetooth-le';

export interface ObdLiveMetrics {
  connected: boolean;
  isSimulated: boolean;
  deviceName: string;
  rpm: number;
  speedKmH: number;
  coolantTempC: number;
  fuelRateLitersPerHour: number;     // L/h (EOBD Mode 01 PID 5E Engine Fuel Rate)
  fuelRateSupported: boolean;         // true jos auton ECU vastaa PID 5E -anturitiedolla
  instantConsumptionL100Km: number;  // L/100km (L/h / nopeus * 100)
  averageConsumptionL100Km: number;  // L/100km (kokonaiskulutus / matka * 100)
  totalFuelUsedLiters: number;       // litraa (integroitu reaaliajassa polttoainevirtauksesta)
  fuelType: 'gasoline' | 'diesel';
}

// Yleisimmät BLE OBD2 -sovittimien palvelu-UUID:t (ELM327 BLE, Vgate, OBDLink, Veepeak, iCar, Viecar)
const BLE_OBD_SERVICES = [
  '0000fff0-0000-1000-8000-00805f9b34fb',
  '0000ffe0-0000-1000-8000-00805f9b34fb',
  '000018f0-0000-1000-8000-00805f9b34fb',
  '49535343-fe7d-4ae5-8fa9-9fafd205e455', // ISSC Transparent Serial
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
];

class ObdBluetoothService {
  // Web Bluetooth (selaintila)
  private bluetoothDevice: any = null;
  private gattServer: any = null;
  private rxCharacteristic: any = null;
  private txCharacteristic: any = null;

  // Natiivi Capacitor Bluetooth LE (Android APK / iOS)
  private nativeDeviceId: string | null = null;
  private nativeServiceUuid: string | null = null;
  private nativeNotifyUuid: string | null = null;
  private nativeWriteUuid: string | null = null;
  private bleInitialized = false;

  private isConnected = false;
  private isSimulated = false;
  private deviceName = '';
  private fuelType: 'gasoline' | 'diesel' = 'gasoline';

  // Mittarit ja tilastot
  private currentRpm = 0;
  private maxRpm = 0;
  private rpmSum = 0;
  private rpmReadingsCount = 0;

  // EOBD PID 5E: Engine Fuel Rate (L/h)
  private currentFuelRateLh = 0;
  private maxFuelRateLh = 0;
  private fuelRateSum = 0;
  private fuelRateReadingsCount = 0;
  private fuelRateSupported = false; // Onko ECU vahvistanut PID 5E:n toimivuuden

  // Nopeus ja matka
  private speedKmH = 0;
  private obdSpeedKmH = 0;
  private distanceKm = 0;

  // Polttoaineen kulutuksen reaaliaikainen integrointi (Litraa)
  private totalFuelUsedLiters = 0;

  // Viestintäpuskuri ja ajastimet
  private rxBuffer = '';
  private lastCommandSent = '';
  private pollingTimer: any = null;
  private integrationTimer: any = null;
  private simulationTimer: any = null;
  private listeners: ((metrics: ObdLiveMetrics) => void)[] = [];

  constructor() {
    const savedFuel = localStorage.getItem('opetuslupa_fuel_type');
    if (savedFuel === 'diesel' || savedFuel === 'gasoline') {
      this.fuelType = savedFuel;
    }
  }

  public setFuelType(type: 'gasoline' | 'diesel') {
    this.fuelType = type;
    localStorage.setItem('opetuslupa_fuel_type', type);
    this.emitUpdate();
  }

  public getFuelType(): 'gasoline' | 'diesel' {
    return this.fuelType;
  }

  public isAvailable(): boolean {
    if (Capacitor.isNativePlatform()) return true;
    return typeof navigator !== 'undefined' && 'bluetooth' in navigator;
  }

  public isAvailableInBrowser(): boolean {
    return this.isAvailable();
  }

  public subscribe(cb: (metrics: ObdLiveMetrics) => void): () => void {
    this.listeners.push(cb);
    cb(this.getLiveMetrics());
    return () => {
      this.listeners = this.listeners.filter(l => l !== cb);
    };
  }

  private emitUpdate() {
    const metrics = this.getLiveMetrics();
    for (const cb of this.listeners) {
      cb(metrics);
    }
  }

  /**
   * Palauttaa reaaliaikaiset lukemat ja lasketut kulutukset
   */
  public getLiveMetrics(): ObdLiveMetrics {
    const avgConsumption = this.distanceKm > 0.05
      ? Math.round(((this.totalFuelUsedLiters * 100) / this.distanceKm) * 10) / 10
      : 0;

    // Ratkaistaan tämän hetkinen polttoainevirtaus (L/h)
    let activeRateLh = 0;
    if (this.fuelRateSupported || this.isSimulated) {
      activeRateLh = this.currentFuelRateLh;
    } else if (this.currentRpm > 0) {
      // Jos auto ei tue PID 5E:tä, käytetään RPM-pohjaista mallinnusta
      activeRateLh = this.getEstimatedFallbackFuelRate();
    }

    // Hetkellinen kulutus liikkeellä (l/100km):
    // Formula: (Fuel Rate L/h / nopeus km/h) * 100
    let instantL100 = 0;
    const effectiveSpeed = Math.max(this.speedKmH, this.obdSpeedKmH);

    if (effectiveSpeed > 3 && activeRateLh > 0) {
      instantL100 = (activeRateLh / effectiveSpeed) * 100;
      // Rajataan realistiseen arvoalueeseen (0 - 35 l/100km)
      instantL100 = Math.min(35, Math.max(0.1, instantL100));
    }

    return {
      connected: this.isConnected || this.isSimulated,
      isSimulated: this.isSimulated,
      deviceName: this.deviceName,
      rpm: this.currentRpm,
      speedKmH: effectiveSpeed,
      coolantTempC: this.isConnected || this.isSimulated ? 88 : 0,
      fuelRateLitersPerHour: Math.round(activeRateLh * 10) / 10,
      fuelRateSupported: this.fuelRateSupported || this.isSimulated,
      instantConsumptionL100Km: Math.round(instantL100 * 10) / 10,
      averageConsumptionL100Km: avgConsumption,
      totalFuelUsedLiters: Math.round(this.totalFuelUsedLiters * 100) / 100,
      fuelType: this.fuelType,
    };
  }

  /**
   * Fallback-arvio polttoainevirtaukselle jos auton ECU ei tue PID 5E:tä
   */
  private getEstimatedFallbackFuelRate(): number {
    if (this.currentRpm <= 0) return 0;
    const effectiveSpeed = Math.max(this.speedKmH, this.obdSpeedKmH);
    const idleRate = this.fuelType === 'diesel' ? 0.65 : 0.8;

    if (effectiveSpeed < 3) {
      return idleRate * (this.currentRpm / 800);
    } else {
      const baseConsumption = this.fuelType === 'diesel' ? 5.2 : 6.4;
      const speedFactor = effectiveSpeed > 85 ? 1.2 : effectiveSpeed < 45 ? 1.1 : 0.95;
      const l100 = baseConsumption * speedFactor * (this.currentRpm / 1800);
      return Math.max(idleRate, (l100 * effectiveSpeed) / 100);
    }
  }

  /**
   * Palauttaa koko ajon OBD-yhteenvedon tallennusta varten
   */
  public getDriveSummary(): ObdDriveData {
    const avgRpm = this.rpmReadingsCount > 0 ? Math.round(this.rpmSum / this.rpmReadingsCount) : 0;
    const avgConsumption = this.distanceKm > 0.05
      ? Math.round(((this.totalFuelUsedLiters * 100) / this.distanceKm) * 10) / 10
      : undefined;

    const avgFuelRate = this.fuelRateReadingsCount > 0
      ? Math.round((this.fuelRateSum / this.fuelRateReadingsCount) * 10) / 10
      : undefined;

    return {
      connected: this.isConnected || this.isSimulated,
      deviceName: this.deviceName,
      isSimulated: this.isSimulated,
      avgFuelConsumptionL100Km: avgConsumption,
      totalFuelUsedLiters: Math.round(this.totalFuelUsedLiters * 100) / 100,
      avgFuelRateLitersPerHour: avgFuelRate,
      maxFuelRateLitersPerHour: this.maxFuelRateLh > 0 ? Math.round(this.maxFuelRateLh * 10) / 10 : undefined,
      fuelRateSupported: this.fuelRateSupported || this.isSimulated,
      avgRpm,
      maxRpm: this.maxRpm,
      fuelType: this.fuelType,
    };
  }

  /**
   * Nollaa mittarit uutta ajokertaa varten
   */
  public resetSession() {
    this.totalFuelUsedLiters = 0;
    this.distanceKm = 0;
    this.speedKmH = 0;
    this.obdSpeedKmH = 0;
    this.currentRpm = 0;
    this.maxRpm = 0;
    this.rpmSum = 0;
    this.rpmReadingsCount = 0;
    this.currentFuelRateLh = 0;
    this.maxFuelRateLh = 0;
    this.fuelRateSum = 0;
    this.fuelRateReadingsCount = 0;
    this.emitUpdate();
  }

  /**
   * Päivittää ajoseurannasta saadun ajomatkan ja nopeuden
   */
  public updateDistance(distanceKm: number, currentSpeedKmH: number) {
    this.distanceKm = distanceKm;
    this.speedKmH = currentSpeedKmH;
  }

  /**
   * Käynnistää sekuntikohtaisen polttoaineen virtauksen integroinnin (L/h -> Litrat)
   */
  private startIntegrationTimer() {
    if (this.integrationTimer) clearInterval(this.integrationTimer);
    let lastTime = Date.now();

    this.integrationTimer = setInterval(() => {
      if (!this.isConnected && !this.isSimulated) return;

      const now = Date.now();
      const dtSeconds = Math.min(2.5, Math.max(0.1, (now - lastTime) / 1000));
      lastTime = now;

      let rateLh = 0;
      if (this.fuelRateSupported || this.isSimulated) {
        rateLh = this.currentFuelRateLh;
      } else if (this.currentRpm > 0) {
        rateLh = this.getEstimatedFallbackFuelRate();
      }

      if (rateLh > 0) {
        // Integroidaan polttoaineen kulutus: litraa = (L/h / 3600) * dt (sekunteina)
        const litersUsed = (rateLh / 3600) * dtSeconds;
        this.totalFuelUsedLiters += litersUsed;
      }

      this.emitUpdate();
    }, 1000);
  }

  /**
   * Käynnistää Bluetooth-haun ja yhdistää ELM327 BLE -laitteeseen.
   * Tukee automaattisesti sekä natiivia Android-sovellusta (Capacitor BLE)
   * että verkkoselaimia (Web Bluetooth API).
   */
  public async connectBluetooth(): Promise<{ success: boolean; message: string }> {
    if (!this.isAvailable()) {
      return {
        success: false,
        message: 'Laitteesi tai selaimesi ei tue Bluetoothia (Web Bluetooth). Voit kokeilla OBD-simulaattoria!',
      };
    }

    if (Capacitor.isNativePlatform()) {
      return await this.connectNativeBluetooth();
    }

    return await this.connectWebBluetooth();
  }

  /**
   * Natiivi Android / iOS Bluetooth LE -yhteys Capacitor BLE -laajennuksella
   */
  private async connectNativeBluetooth(): Promise<{ success: boolean; message: string }> {
    try {
      if (!this.bleInitialized) {
        await BleClient.initialize({ androidNeverForLocation: false });
        this.bleInitialized = true;
      }

      // Tarkistetaan onko Bluetooth päällä puhelimessa
      const enabled = await BleClient.isEnabled().catch(() => false);
      if (!enabled) {
        try {
          await BleClient.requestEnable();
        } catch {
          return {
            success: false,
            message: 'Bluetooth ei ole päällä. Ota Bluetooth käyttöön puhelimen asetuksista ja yritä uudelleen.',
          };
        }
      }

      // Asetetaan suomenkieliset opasteet laitevalitsindialogiin
      await BleClient.setDisplayStrings({
        scanning: 'Etsitään lähellä olevia OBD2 BLE -sovittimia...',
        cancel: 'Peruuta',
        availableDevices: 'Valitse OBD2-laite',
        noDeviceFound: 'OBD2-laitetta ei löytynyt. Varmista auton sytytysvirta!',
      }).catch(() => {});

      let selectedDevice: any = null;

      try {
        // Avataan natiivi Android BLE -laitehaku ja valintadialogi
        selectedDevice = await BleClient.requestDevice({
          optionalServices: BLE_OBD_SERVICES,
        });
      } catch (scanErr: any) {
        const msg = scanErr?.message || String(scanErr);
        if (msg.toLowerCase().includes('cancel')) {
          return {
            success: false,
            message: 'OBD-laitteen haku peruutettiin.',
          };
        }

        // Kokeillaan löytyykö paritettujen laitteiden joukosta (jos puhelimen BT-asetuksissa paritettu)
        try {
          const bonded = await BleClient.getBondedDevices();
          const candidate = bonded.find(d => /obd|vgate|v-link|icar|elm|veepeak|viecar|konnwei/i.test(d.name || ''));
          if (candidate) {
            selectedDevice = candidate;
          } else {
            throw scanErr;
          }
        } catch {
          throw scanErr;
        }
      }

      if (!selectedDevice || !selectedDevice.deviceId) {
        return {
          success: false,
          message: 'Laitetta ei valittu.',
        };
      }

      const deviceId = selectedDevice.deviceId as string;
      this.nativeDeviceId = deviceId;
      this.deviceName = selectedDevice.name || 'OBD2 BLE Sovitin';

      // Yhdistetään valittuun laitteeseen
      await BleClient.connect(deviceId, () => {
        this.handleDisconnect();
      });

      // Etsitään sopivat GATT-palvelut ja luku-/kirjoituskarakteristiikat
      const services = await BleClient.getServices(deviceId);
      let chosenService: string | null = null;
      let notifyChar: string | null = null;
      let writeChar: string | null = null;

      // 1. Ensisijaisesti tunnetut OBD2-palvelut (FFF0, FFE0, 18F0, ISSC jne.)
      for (const s of services) {
        const norm = s.uuid.toLowerCase();
        const isMatch = BLE_OBD_SERVICES.some(k => norm.includes(k.toLowerCase()) || k.toLowerCase().includes(norm));
        if (isMatch) {
          for (const c of s.characteristics) {
            if ((c.properties.notify || c.properties.indicate) && !notifyChar) {
              notifyChar = c.uuid;
              chosenService = s.uuid;
            }
            if ((c.properties.write || c.properties.writeWithoutResponse) && !writeChar) {
              writeChar = c.uuid;
              chosenService = s.uuid;
            }
          }
          if (notifyChar && writeChar) break;
        }
      }

      // 2. Fallback: jos sovitin käyttää omaa kustomoitua UUID:tä, valitaan palvelu jossa on sekä notify että write
      if (!notifyChar || !writeChar) {
        for (const s of services) {
          const norm = s.uuid.toLowerCase();
          if (norm.includes('1800') || norm.includes('1801') || norm.includes('180a')) continue;
          let localNotify: string | null = null;
          let localWrite: string | null = null;
          for (const c of s.characteristics) {
            if ((c.properties.notify || c.properties.indicate) && !localNotify) {
              localNotify = c.uuid;
            }
            if ((c.properties.write || c.properties.writeWithoutResponse) && !localWrite) {
              localWrite = c.uuid;
            }
          }
          if (localNotify && localWrite) {
            chosenService = s.uuid;
            notifyChar = localNotify;
            writeChar = localWrite;
            break;
          }
        }
      }

      if (!chosenService || !notifyChar || !writeChar) {
        await BleClient.disconnect(deviceId).catch(() => {});
        return {
          success: false,
          message: 'Laitteesta ei löytynyt OBD-sarjaporttia. Varmista että sovitin tukee BLE ELM327 -protokollaa.',
        };
      }

      this.nativeServiceUuid = chosenService;
      this.nativeNotifyUuid = notifyChar;
      this.nativeWriteUuid = writeChar;

      // Tilataan datan ilmoitukset autolta
      await BleClient.startNotifications(
        deviceId,
        chosenService,
        notifyChar,
        (value: DataView) => {
          this.handleIncomingData(value);
        }
      );

      this.isConnected = true;
      this.isSimulated = false;

      await this.initElm327();
      this.startPolling();
      this.emitUpdate();

      return {
        success: true,
        message: `Yhdistetty onnistuneesti laitteeseen: ${this.deviceName}`,
      };
    } catch (err: any) {
      console.warn('Natiivi Bluetooth LE -yhteysvirhe:', err);
      const msg = err?.message || String(err);
      if (msg.toLowerCase().includes('cancel')) {
        return { success: false, message: 'OBD-laitteen haku peruutettiin.' };
      }
      return {
        success: false,
        message: msg || 'Bluetooth-yhteyden muodostaminen epäonnistui. Varmista että auton virrat ovat päällä.',
      };
    }
  }

  /**
   * Selaimen Web Bluetooth API -yhteys (Google Chrome, Edge)
   */
  private async connectWebBluetooth(): Promise<{ success: boolean; message: string }> {
    try {
      this.bluetoothDevice = await (navigator as any).bluetooth.requestDevice({
        filters: [
          { namePrefix: 'OBD' },
          { namePrefix: 'V-LINK' },
          { namePrefix: 'Vgate' },
          { namePrefix: 'iCar' },
          { namePrefix: 'ELM' },
          { namePrefix: 'Konnwei' },
        ],
        optionalServices: BLE_OBD_SERVICES,
      });

      this.deviceName = this.bluetoothDevice.name || 'OBD2 BLE Sovitin';
      this.bluetoothDevice.addEventListener('gattserverdisconnected', () => {
        this.handleDisconnect();
      });

      this.gattServer = await this.bluetoothDevice.gatt.connect();

      // Haetaan GATT-palvelu ja karakteristiikat
      for (const serviceUuid of BLE_OBD_SERVICES) {
        try {
          const service = await this.gattServer.getPrimaryService(serviceUuid);
          const characteristics = await service.getCharacteristics();
          for (const char of characteristics) {
            if (char.properties.notify || char.properties.indicate) {
              this.rxCharacteristic = char;
              await this.rxCharacteristic.startNotifications();
              this.rxCharacteristic.addEventListener('characteristicvaluechanged', (e: any) => {
                this.handleIncomingData(e.target.value);
              });
            }
            if (char.properties.write || char.properties.writeWithoutResponse) {
              this.txCharacteristic = char;
            }
          }
          if (this.txCharacteristic && this.rxCharacteristic) break;
        } catch {
          // Kokeillaan seuraavaa UUID:tä
        }
      }

      this.isConnected = true;
      this.isSimulated = false;
      await this.initElm327();
      this.startPolling();
      this.emitUpdate();

      return {
        success: true,
        message: `Yhdistetty onnistuneesti laitteeseen: ${this.deviceName}`,
      };
    } catch (err: any) {
      console.warn('Bluetooth-yhteysvirhe:', err);
      return {
        success: false,
        message: err.message || 'Bluetooth-yhteyden muodostaminen epäonnistui.',
      };
    }
  }

  /**
   * Alustaa ELM327-ohjaimen peruskomennoilla
   */
  private async initElm327() {
    if (!this.txCharacteristic && !this.nativeDeviceId) return;
    const initCommands = [
      'ATZ\r',    // Reset ELM327
      'ATE0\r',   // Echo off
      'ATL0\r',   // Linefeeds off
      'ATH0\r',   // Headers off
      'ATSP0\r',  // Auto protocol
    ];
    for (const cmd of initCommands) {
      await this.sendCommand(cmd);
      await new Promise(r => setTimeout(r, 200));
    }
  }

  private async sendCommand(cmd: string) {
    if (!this.isConnected) return;
    this.lastCommandSent = cmd;

    try {
      if (this.nativeDeviceId && this.nativeServiceUuid && this.nativeWriteUuid) {
        const data = textToDataView(cmd);
        await BleClient.write(this.nativeDeviceId, this.nativeServiceUuid, this.nativeWriteUuid, data);
      } else if (this.txCharacteristic) {
        const encoder = new TextEncoder();
        await this.txCharacteristic.writeValue(encoder.encode(cmd));
      }
    } catch (e) {
      console.warn('Virhe OBD-komennon lähetyksessä:', e);
    }
  }

  /**
   * Pollaa vuorotellen moottorin RPM:ää (PID 010C), Fuel Ratea (PID 015E) ja nopeutta (PID 010D)
   */
  private startPolling() {
    this.startIntegrationTimer();

    // Kyselylista:
    // 010C = Moottorin kierrosluku RPM
    // 015E = EOBD Mode 01 PID 5E: Engine Fuel Rate (L/h)
    // 010D = Auton nopeus (km/h)
    const pids = ['010C\r', '015E\r', '010D\r'];
    let pidIndex = 0;

    this.pollingTimer = setInterval(async () => {
      if (!this.isConnected || (!this.txCharacteristic && !this.nativeDeviceId)) return;
      const cmd = pids[pidIndex];
      pidIndex = (pidIndex + 1) % pids.length;
      await this.sendCommand(cmd);
    }, 400); // 400ms välein -> jokainen PID kysytään noin 1.2 sekunnin sykleissä
  }

  /**
   * Käsittelee ELM327:ltä saapuvan datan ja purkaa EOBD PID 5E:n, RPM:n ja nopeuden
   */
  private handleIncomingData(dataView: DataView) {
    const decoder = new TextDecoder('utf-8');
    this.rxBuffer += decoder.decode(dataView);

    if (this.rxBuffer.includes('\r') || this.rxBuffer.includes('\n') || this.rxBuffer.includes('>')) {
      const parts = this.rxBuffer.split(/[\r\n>]+/);
      this.rxBuffer = parts.pop() || '';
      for (const line of parts) {
        if (line.trim().length > 0) {
          this.processObdResponseLine(line.trim());
        }
      }
    }
  }

  private processObdResponseLine(line: string) {
    const clean = line.replace(/\s+/g, '').toUpperCase();

    // 1. EOBD Mode 01 PID 5E: Engine Fuel Rate (L/h)
    // Vastausmuoto: 41 5E AA BB
    // Formula: ((A * 256) + B) * 0.05
    // Yksikkö: Liters per hour (L/h)
    const idx5E = clean.indexOf('415E');
    if (idx5E !== -1 && clean.length >= idx5E + 8) {
      const hexA = clean.substring(idx5E + 4, idx5E + 6);
      const hexB = clean.substring(idx5E + 6, idx5E + 8);
      const valA = parseInt(hexA, 16);
      const valB = parseInt(hexB, 16);
      if (!isNaN(valA) && !isNaN(valB)) {
        const rateLh = Math.round((((valA * 256) + valB) * 0.05) * 100) / 100;
        this.recordFuelRate(rateLh, true);
      }
    } else if (clean.includes('NODATA') && this.lastCommandSent.includes('015E')) {
      // Auton ECU ei tue standardia PID 5E -anturia, käytetään fallbackia
      this.fuelRateSupported = false;
    }

    // 2. Moottorin kierrosluku: Mode 01 PID 0C (RPM)
    // Vastausmuoto: 41 0C AA BB
    // Formula: ((A * 256) + B) / 4
    const idx0C = clean.indexOf('410C');
    if (idx0C !== -1 && clean.length >= idx0C + 8) {
      const hexA = clean.substring(idx0C + 4, idx0C + 6);
      const hexB = clean.substring(idx0C + 6, idx0C + 8);
      const valA = parseInt(hexA, 16);
      const valB = parseInt(hexB, 16);
      if (!isNaN(valA) && !isNaN(valB)) {
        const rpm = Math.round(((valA * 256) + valB) / 4);
        this.recordRpm(rpm);
      }
    }

    // 3. Auton nopeus: Mode 01 PID 0D (km/h)
    // Vastausmuoto: 41 0D AA
    // Formula: A (km/h)
    const idx0D = clean.indexOf('410D');
    if (idx0D !== -1 && clean.length >= idx0D + 6) {
      const hexA = clean.substring(idx0D + 4, idx0D + 6);
      const speed = parseInt(hexA, 16);
      if (!isNaN(speed)) {
        this.obdSpeedKmH = speed;
      }
    }
  }

  private recordRpm(rpm: number) {
    this.currentRpm = rpm;
    if (rpm > this.maxRpm) this.maxRpm = rpm;
    this.rpmSum += rpm;
    this.rpmReadingsCount++;
    this.emitUpdate();
  }

  private recordFuelRate(rateLh: number, isDirectSensor: boolean) {
    this.currentFuelRateLh = rateLh;
    if (isDirectSensor) {
      this.fuelRateSupported = true;
    }
    this.fuelRateSum += rateLh;
    this.fuelRateReadingsCount++;
    if (rateLh > this.maxFuelRateLh) {
      this.maxFuelRateLh = rateLh;
    }
    this.emitUpdate();
  }

  /**
   * Käynnistää realistisen OBD-simulaattorin (sisältää EOBD PID 5E Fuel Rate -simuloinnin)
   */
  public startSimulator() {
    this.disconnect();
    this.isSimulated = true;
    this.isConnected = false;
    this.fuelRateSupported = true; // Simuloidaan EOBD PID 5E -tukea
    this.deviceName = 'OBD2 Simulaattori (EOBD PID 5E)';

    let simRpm = 840;
    let increasing = true;

    this.startIntegrationTimer();

    this.simulationTimer = setInterval(() => {
      const effSpeed = Math.max(this.speedKmH, this.obdSpeedKmH);

      if (effSpeed < 3) {
        // Tyhjäkäynti (pysähdyksissä / liikennevaloissa)
        simRpm = 820 + Math.floor(Math.random() * 40);
        // Tyhjäkäynnin tyypillinen fuel rate: bensa ~0.7-0.9 L/h, diesel ~0.55-0.75 L/h
        const idleRate = (this.fuelType === 'diesel' ? 0.65 : 0.8) + (Math.random() * 0.1 - 0.05);
        this.recordRpm(simRpm);
        this.recordFuelRate(Math.round(idleRate * 100) / 100, true);
      } else {
        // Ajo liikkeellä: kierrosluku vaihtelee ajonopeuden ja kiihdytyksen mukaan
        if (increasing) {
          simRpm += Math.floor(Math.random() * 60) + 20;
          if (simRpm > 2400) increasing = false;
        } else {
          simRpm -= Math.floor(Math.random() * 70) + 25;
          if (simRpm < 1350) increasing = true;
        }
        this.recordRpm(simRpm);

        // Simuloidaan EOBD PID 5E Fuel Rate (L/h):
        // Formula: L/h = (L/100km * nopeus km/h) / 100
        const baseL100 = this.fuelType === 'diesel' ? 5.2 : 6.4;
        const speedFactor = effSpeed > 90 ? 1.25 : effSpeed < 45 ? 1.15 : 0.95;
        const loadFactor = (simRpm / 1800) * 0.95;
        const targetL100 = baseL100 * speedFactor * loadFactor;
        const simulatedRateLh = Math.max(1.2, (targetL100 * effSpeed) / 100);
        // Pieni realistinen satunnaisvaihtelu
        const jittered = simulatedRateLh * (0.96 + Math.random() * 0.08);
        this.recordFuelRate(Math.round(jittered * 100) / 100, true);
      }
    }, 1000);

    this.emitUpdate();
  }

  public disconnect() {
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = null;
    }
    if (this.integrationTimer) {
      clearInterval(this.integrationTimer);
      this.integrationTimer = null;
    }
    if (this.simulationTimer) {
      clearInterval(this.simulationTimer);
      this.simulationTimer = null;
    }

    if (this.nativeDeviceId) {
      const devId = this.nativeDeviceId;
      const sUuid = this.nativeServiceUuid;
      const nUuid = this.nativeNotifyUuid;
      this.nativeDeviceId = null;
      this.nativeServiceUuid = null;
      this.nativeNotifyUuid = null;
      this.nativeWriteUuid = null;

      if (sUuid && nUuid) {
        BleClient.stopNotifications(devId, sUuid, nUuid).catch(() => {});
      }
      BleClient.disconnect(devId).catch(() => {});
    }

    if (this.bluetoothDevice && this.bluetoothDevice.gatt?.connected) {
      try {
        this.bluetoothDevice.gatt.disconnect();
      } catch {}
      this.bluetoothDevice = null;
      this.gattServer = null;
      this.rxCharacteristic = null;
      this.txCharacteristic = null;
    }

    this.handleDisconnect();
  }

  private handleDisconnect() {
    this.isConnected = false;
    this.isSimulated = false;
    this.fuelRateSupported = false;
    this.deviceName = '';
    this.currentRpm = 0;
    this.currentFuelRateLh = 0;
    this.emitUpdate();
  }
}

export const obdManager = new ObdBluetoothService();
