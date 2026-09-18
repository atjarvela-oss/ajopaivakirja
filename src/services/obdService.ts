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
  fuelRateLitersPerHour: number;     // L/h (PID 5E, MAF PID 10 tai RPM-malli)
  fuelRateSupported: boolean;         // true jos auton ECU vastaa PID 5E -anturitiedolla
  mafSupported: boolean;              // true jos auton ECU vastaa MAF (PID 10) -tiedolla
  fuelCalculationSource: 'PID 5E' | 'MAF (PID 10)' | 'RPM-malli' | 'Simuloitu';
  instantConsumptionL100Km: number;  // L/100km (L/h / nopeus * 100)
  averageConsumptionL100Km: number;  // L/100km (kokonaiskulutus / matka * 100)
  totalFuelUsedLiters: number;       // litraa (integroitu reaaliajassa polttoainevirtauksesta)
  fuelType: 'gasoline' | 'diesel';
  connectionStatusText?: string;     // Diagnostiikkatieto käyttäjälle
  rxPacketsCount: number;            // Vastaanotettujen vastauspakettien määrä
}

// Tunnetut BLE OBD2 -sovittimien palvelu-UUID:t (ELM327 BLE, Vgate, Veepeak, Tonwon, Viecar, OBDLink, geneeriset "OBDII")
const BLE_OBD_SERVICES = [
  '0000fff0-0000-1000-8000-00805f9b34fb', // Veepeak, Tonwon, halvat kiinalaiset OBDII
  '0000ffe0-0000-1000-8000-00805f9b34fb', // HM-10 / CC2541 OBDII
  '0000fee0-0000-1000-8000-00805f9b34fb', // Telink / Beken BLE OBD
  '0000ff00-0000-1000-8000-00805f9b34fb', // Geneeriset ELM327 BLE
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2', // Vgate iCar Pro BLE / Viecar
  '49535343-fe7d-4ae5-8fa9-9fafd205e455', // ISSC Transparent Serial
  '6e400001-b5a3-f393-e0a9-e50e24dcca9e', // Nordic Semiconductor UART Service (NUS)
  '000018f0-0000-1000-8000-00805f9b34fb', // Microchip RN4020
];

class ObdBluetoothService {
  // Web Bluetooth (selaintila)
  private bluetoothDevice: any = null;
  private gattServer: any = null;
  private rxCharacteristic: any = null;
  private txCharacteristic: any = null;
  private txWithoutResponse = false;

  // Natiivi Capacitor Bluetooth LE (Android APK / iOS)
  private nativeDeviceId: string | null = null;
  private nativeServiceUuid: string | null = null;
  private nativeNotifyUuid: string | null = null;
  private nativeWriteUuid: string | null = null;
  private nativeWriteWithoutResponse = false;
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
  private coolantTempC = 88;

  // Polttoaineen kulutus: EOBD PID 5E tai MAF PID 10 tai RPM-fallback
  private currentFuelRateLh = 0;
  private maxFuelRateLh = 0;
  private fuelRateSum = 0;
  private fuelRateReadingsCount = 0;
  private fuelRateSupported = false;
  private mafSupported = false;
  private fuelCalculationSource: 'PID 5E' | 'MAF (PID 10)' | 'RPM-malli' | 'Simuloitu' = 'RPM-malli';

  // Nopeus ja matka
  private speedKmH = 0;
  private obdSpeedKmH = 0;
  private distanceKm = 0;

  // Polttoaineen kulutuksen reaaliaikainen integrointi (Litraa)
  private totalFuelUsedLiters = 0;

  // Viestintäpuskuri, jonot ja tilanhallinta
  private rxBuffer = '';
  private lastCommandSent = '';
  private isQueryInProgress = false;
  private pendingResolve: ((res: string) => void) | null = null;
  private rxPacketsCount = 0;
  private connectionStatusText = 'Ei yhdistetty';

  private isPollingActive = false;
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

  public subscribe(callback: (metrics: ObdLiveMetrics) => void): () => void {
    this.listeners.push(callback);
    callback(this.getLiveMetrics());
    return () => {
      this.listeners = this.listeners.filter(cb => cb !== callback);
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

    // Ratkaistaan tämänhetkinen polttoainevirtaus (L/h)
    let activeRateLh = 0;

    if (this.isSimulated) {
      activeRateLh = this.currentFuelRateLh;
      this.fuelCalculationSource = 'Simuloitu';
    } else if (this.fuelRateSupported && this.currentFuelRateLh > 0) {
      activeRateLh = this.currentFuelRateLh;
      this.fuelCalculationSource = 'PID 5E';
    } else if (this.mafSupported && this.currentFuelRateLh > 0) {
      activeRateLh = this.currentFuelRateLh;
      this.fuelCalculationSource = 'MAF (PID 10)';
    } else if (this.currentRpm > 0) {
      // RPM-pohjainen mallinnus heti kun moottori käy (RPM > 0)
      activeRateLh = this.getEstimatedFallbackFuelRate();
      this.fuelCalculationSource = 'RPM-malli';
    }

    // Hetkellinen kulutus liikkeellä (l/100km):
    // Formula: (Fuel Rate L/h / nopeus km/h) * 100
    let instantL100 = 0;
    const effectiveSpeed = Math.max(this.speedKmH, this.obdSpeedKmH);

    if (effectiveSpeed > 3 && activeRateLh > 0) {
      instantL100 = (activeRateLh / effectiveSpeed) * 100;
      instantL100 = Math.min(35, Math.max(0.1, instantL100));
    }

    return {
      connected: this.isConnected || this.isSimulated,
      isSimulated: this.isSimulated,
      deviceName: this.deviceName,
      rpm: this.currentRpm,
      speedKmH: effectiveSpeed,
      coolantTempC: this.isConnected || this.isSimulated ? this.coolantTempC : 0,
      fuelRateLitersPerHour: Math.round(activeRateLh * 10) / 10,
      fuelRateSupported: this.fuelRateSupported || this.isSimulated,
      mafSupported: this.mafSupported,
      fuelCalculationSource: this.fuelCalculationSource,
      instantConsumptionL100Km: Math.round(instantL100 * 10) / 10,
      averageConsumptionL100Km: avgConsumption,
      totalFuelUsedLiters: Math.round(this.totalFuelUsedLiters * 100) / 100,
      fuelType: this.fuelType,
      connectionStatusText: this.connectionStatusText,
      rxPacketsCount: this.rxPacketsCount,
    };
  }

  /**
   * Palauttaa arvioidun polttoainevirtauksen (L/h) RPM:n ja moottorityypin perusteella
   */
  private getEstimatedFallbackFuelRate(): number {
    if (this.currentRpm <= 0) return 0;

    const isDiesel = this.fuelType === 'diesel';
    if (this.currentRpm < 950) {
      // Tyhjäkäynti (tyypillisesti ~0.6-0.9 L/h)
      return isDiesel ? 0.65 : 0.85;
    }

    // Kierroslukupohjainen kulutusmalli (tyypillinen 1.4-2.0L henkilöauto)
    const baseLh = isDiesel ? 0.65 : 0.85;
    const factor = isDiesel ? 0.0022 : 0.0028;
    const estimated = baseLh + (this.currentRpm - 900) * factor;

    return Math.round(Math.min(25, Math.max(0.6, estimated)) * 100) / 100;
  }

  public updateGpsMetrics(speedKmH: number, totalDistanceKm: number) {
    this.speedKmH = Math.max(0, speedKmH);
    this.distanceKm = Math.max(0, totalDistanceKm);
  }

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
      } else if (this.mafSupported && this.currentFuelRateLh > 0) {
        rateLh = this.currentFuelRateLh;
      } else if (this.currentRpm > 0) {
        rateLh = this.getEstimatedFallbackFuelRate();
      }

      if (rateLh > 0) {
        const litersUsed = (rateLh / 3600) * dtSeconds;
        this.totalFuelUsedLiters += litersUsed;
      }

      this.emitUpdate();
    }, 1000);
  }

  /**
   * Käynnistää Bluetooth-haun ja yhdistää ELM327 BLE -laitteeseen.
   */
  public async connectBluetooth(): Promise<{ success: boolean; message: string }> {
    if (!this.isAvailable()) {
      return {
        success: false,
        message: 'Laitteesi tai selaimesi ei tue Bluetoothia. Voit kokeilla OBD-simulaattoria!',
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

      const enabled = await BleClient.isEnabled().catch(() => false);
      if (!enabled) {
        try {
          await BleClient.requestEnable();
        } catch {
          return {
            success: false,
            message: 'Bluetooth ei ole päällä. Ota Bluetooth käyttöön puhelimen pika-asetuksista.',
          };
        }
      }

      await BleClient.setDisplayStrings({
        scanning: 'Etsitään lähellä olevia OBD2 BLE -sovittimia...',
        cancel: 'Peruuta',
        availableDevices: 'Valitse OBD2-sovitin',
        noDeviceFound: 'OBD2-laitetta ei löytynyt. Varmista että auton virrat ovat päällä!',
      }).catch(() => {});

      let selectedDevice: any = null;

      try {
        selectedDevice = await BleClient.requestDevice({
          optionalServices: BLE_OBD_SERVICES,
        });
      } catch (scanErr: any) {
        const msg = scanErr?.message || String(scanErr);
        if (msg.toLowerCase().includes('cancel')) {
          return { success: false, message: 'OBD-laitteen haku peruutettiin.' };
        }

        // Kokeillaan löytyykö aiemmin paritetuista laitteista
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
        return { success: false, message: 'Laitetta ei valittu.' };
      }

      const deviceId = selectedDevice.deviceId as string;
      this.nativeDeviceId = deviceId;
      this.deviceName = selectedDevice.name || 'OBD2 BLE Sovitin';
      this.connectionStatusText = `Yhdistetään laitteeseen ${this.deviceName}...`;
      this.emitUpdate();

      // Yhdistetään GATT-palvelimeen
      await BleClient.connect(deviceId, () => {
        this.handleDisconnect();
      });

      // Haetaan kaikki laitteen tarjoamat palvelut
      const services = await BleClient.getServices(deviceId);

      let chosenService: string | null = null;
      let notifyChar: string | null = null;
      let writeChar: string | null = null;
      let writeWithoutResp = false;

      // 1. Etsitään ensisijaisesti tunnetuista OBD-palveluista palvelu,
      // jossa on SEKÄ vastaanotto (notify/indicate) ETTÄ lähetys (write/writeWithoutResponse)
      for (const s of services) {
        const norm = s.uuid.toLowerCase();
        const isKnown = BLE_OBD_SERVICES.some(k => norm.includes(k.toLowerCase()) || k.toLowerCase().includes(norm));
        if (isKnown) {
          const notC = s.characteristics.find(c => c.properties.notify || c.properties.indicate);
          const wrC = s.characteristics.find(c => c.properties.write || c.properties.writeWithoutResponse);
          if (notC && wrC) {
            chosenService = s.uuid;
            notifyChar = notC.uuid;
            writeChar = wrC.uuid;
            writeWithoutResp = !wrC.properties.write && wrC.properties.writeWithoutResponse;
            break;
          }
        }
      }

      // 2. Fallback: jos sovitin käyttää kustomoitua UUID:tä, etsitään mikä tahansa muu GATT-palvelu
      if (!chosenService || !notifyChar || !writeChar) {
        for (const s of services) {
          const norm = s.uuid.toLowerCase();
          // Ohitetaan standardit Bluetooth GAP/GATT/Device Info -palvelut
          if (norm.includes('1800') || norm.includes('1801') || norm.includes('180a')) continue;
          const notC = s.characteristics.find(c => c.properties.notify || c.properties.indicate);
          const wrC = s.characteristics.find(c => c.properties.write || c.properties.writeWithoutResponse);
          if (notC && wrC) {
            chosenService = s.uuid;
            notifyChar = notC.uuid;
            writeChar = wrC.uuid;
            writeWithoutResp = !wrC.properties.write && wrC.properties.writeWithoutResponse;
            break;
          }
        }
      }

      if (!chosenService || !notifyChar || !writeChar) {
        await BleClient.disconnect(deviceId).catch(() => {});
        return {
          success: false,
          message: 'Laitteesta ei löytynyt yhteensopivaa sarjaporttia. Varmista että laite tukee BLE ELM327 -protokollaa.',
        };
      }

      this.nativeServiceUuid = chosenService;
      this.nativeNotifyUuid = notifyChar;
      this.nativeWriteUuid = writeChar;
      this.nativeWriteWithoutResponse = writeWithoutResp;

      // Tilataan saapuva data ELM327:ltä
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
      this.rxPacketsCount = 0;

      // Alustetaan ELM327 puhtaalla sarjalla ja käynnistetään kyselysilmukka
      const initOk = await this.initElm327();
      this.startPollingLoop();
      this.emitUpdate();

      return {
        success: true,
        message: initOk
          ? `Yhdistetty onnistuneesti laitteeseen: ${this.deviceName}`
          : `Yhdistetty laitteeseen ${this.deviceName}. Odota hetki kun auton ECU vastaa...`,
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

      for (const serviceUuid of BLE_OBD_SERVICES) {
        try {
          const service = await this.gattServer.getPrimaryService(serviceUuid);
          const characteristics = await service.getCharacteristics();
          let notChar: any = null;
          let wrChar: any = null;

          for (const char of characteristics) {
            if ((char.properties.notify || char.properties.indicate) && !notChar) {
              notChar = char;
            }
            if ((char.properties.write || char.properties.writeWithoutResponse) && !wrChar) {
              wrChar = char;
            }
          }

          if (notChar && wrChar) {
            this.rxCharacteristic = notChar;
            this.txCharacteristic = wrChar;
            this.txWithoutResponse = !wrChar.properties.write && wrChar.properties.writeWithoutResponse;

            await this.rxCharacteristic.startNotifications();
            this.rxCharacteristic.addEventListener('characteristicvaluechanged', (e: any) => {
              this.handleIncomingData(e.target.value);
            });
            break;
          }
        } catch {
          // Kokeillaan seuraavaa
        }
      }

      if (!this.txCharacteristic || !this.rxCharacteristic) {
        return {
          success: false,
          message: 'Laitteesta ei löytynyt sopivaa BLE-sarjaporttia.',
        };
      }

      this.isConnected = true;
      this.isSimulated = false;
      this.rxPacketsCount = 0;

      await this.initElm327();
      this.startPollingLoop();
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
   * Lähettää raakatavun Bluetooth-karakteristiikalle huomioiden write / writeWithoutResponse -moodin
   */
  private async writeRaw(cmd: string): Promise<boolean> {
    if (!this.isConnected) return false;

    try {
      if (this.nativeDeviceId && this.nativeServiceUuid && this.nativeWriteUuid) {
        const data = textToDataView(cmd);
        if (this.nativeWriteWithoutResponse) {
          try {
            await BleClient.writeWithoutResponse(this.nativeDeviceId, this.nativeServiceUuid, this.nativeWriteUuid, data);
          } catch {
            await BleClient.write(this.nativeDeviceId, this.nativeServiceUuid, this.nativeWriteUuid, data);
          }
        } else {
          try {
            await BleClient.write(this.nativeDeviceId, this.nativeServiceUuid, this.nativeWriteUuid, data);
          } catch {
            await BleClient.writeWithoutResponse(this.nativeDeviceId, this.nativeServiceUuid, this.nativeWriteUuid, data);
          }
        }
        return true;
      } else if (this.txCharacteristic) {
        const encoder = new TextEncoder();
        const encoded = encoder.encode(cmd);
        try {
          if (this.txCharacteristic.writeValueWithoutResponse && this.txWithoutResponse) {
            await this.txCharacteristic.writeValueWithoutResponse(encoded);
          } else {
            await this.txCharacteristic.writeValue(encoded);
          }
        } catch {
          if (this.txCharacteristic.writeValueWithoutResponse) {
            await this.txCharacteristic.writeValueWithoutResponse(encoded);
          }
        }
        return true;
      }
    } catch (err) {
      console.warn('Virhe OBD-kirjoituksessa:', err);
      return false;
    }
    return false;
  }

  /**
   * Lähettää komennon ELM327:lle ja odottaa vastausta kunnes prompt '>' saapuu tai aikakatkaisu laukeaa.
   * Takaa tiukan half-duplex -toiminnan: ei koskaan kahta komentoa yhtäaikaisesti väylälle.
   */
  private async sendAndReceive(cmd: string, timeoutMs = 2000): Promise<string> {
    if (!this.isConnected) return '';

    while (this.isQueryInProgress) {
      await new Promise(r => setTimeout(r, 25));
      if (!this.isConnected) return '';
    }

    this.isQueryInProgress = true;
    this.lastCommandSent = cmd;

    return new Promise<string>(async (resolve) => {
      let timer: any = null;
      let finished = false;

      const complete = (response: string) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        this.pendingResolve = null;
        this.isQueryInProgress = false;
        resolve(response);
      };

      timer = setTimeout(() => {
        const partial = this.rxBuffer;
        this.rxBuffer = '';
        complete(partial);
      }, timeoutMs);

      this.pendingResolve = complete;
      this.rxBuffer = '';

      const ok = await this.writeRaw(cmd);
      if (!ok) {
        complete('');
      }
    });
  }

  /**
   * Käsittelee ELM327:ltä saapuvan datan ja tunnistaa vastauksen valmistumisen '>' -merkistä
   */
  private handleIncomingData(dataView: DataView) {
    const decoder = new TextDecoder('utf-8');
    const text = decoder.decode(dataView);
    this.rxBuffer += text;
    this.rxPacketsCount++;

    if (this.rxBuffer.includes('>')) {
      const full = this.rxBuffer;
      this.rxBuffer = '';
      if (this.pendingResolve) {
        this.pendingResolve(full);
      } else {
        this.parseObdFullResponse(full);
      }
    }
  }

  /**
   * Alustaa ELM327-ohjaimen peruskomennoilla ja hakee auton ECU-yhteyden
   */
  private async initElm327(): Promise<boolean> {
    this.connectionStatusText = 'Alustetaan ELM327-ohjainta...';
    this.emitUpdate();

    // 1. Reset (ATZ) - odotetaan rauhassa reboot
    await this.writeRaw('ATZ\r');
    await new Promise(r => setTimeout(r, 1200));
    this.rxBuffer = '';

    // 2. Perusasetukset
    this.connectionStatusText = 'Määritetään asetuksia (Echo off, Spaces off)...';
    this.emitUpdate();

    await this.sendAndReceive('ATE0\r', 1000);  // Echo off
    await this.sendAndReceive('ATL0\r', 800);   // Linefeed off
    await this.sendAndReceive('ATS0\r', 800);   // Spaces off (nopeuttaa BLE-tiedonsiirtoa)
    await this.sendAndReceive('ATH0\r', 800);   // Headers off
    await this.sendAndReceive('ATSP0\r', 1500); // Auto protocol

    // 3. Testataan auton ECU-yhteys: Mode 01 PID 00 (Supported PIDs)
    // Tässä vaiheessa ELM327 usein tulostaa "SEARCHING...", mikä kestää 2-4 sekuntia
    this.connectionStatusText = 'Etsitään auton protokollaa (SEARCHING...)...';
    this.emitUpdate();

    const pid00Res = await this.sendAndReceive('0100\r', 5000);
    const clean00 = pid00Res.replace(/[\s\r\n>]+/g, '').toUpperCase();

    if (clean00.includes('UNABLE') || clean00.includes('BUSINIT:ERROR') || clean00.includes('CANERROR')) {
      this.connectionStatusText = 'ECU ei vastaa. Varmista että auton sytytysvirta on päällä!';
      this.emitUpdate();
      return false;
    }

    this.connectionStatusText = 'Yhteys auton moottorinohjaimeen aktiivinen!';
    this.emitUpdate();
    return true;
  }

  /**
   * Pääkyselysilmukka: pollaa vuorotellen RPM:ää, kulutusta (PID 5E / MAF PID 10) ja nopeutta
   */
  private async startPollingLoop() {
    this.isPollingActive = true;
    this.startIntegrationTimer();

    let checkPid5ECount = 0;
    let checkMafCount = 0;

    while (this.isConnected && this.isPollingActive) {
      try {
        // 1. RPM: Mode 01 PID 0C
        const rpmRaw = await this.sendAndReceive('010C\r', 1500);
        this.parseObdFullResponse(rpmRaw);

        // 2. Polttoainevirtaus:
        // A) Jos PID 5E on tuettu tai sitä kokeillaan alussa
        if (this.fuelRateSupported || checkPid5ECount < 4) {
          const frRaw = await this.sendAndReceive('015E\r', 1500);
          this.parseObdFullResponse(frRaw);
          if (!this.fuelRateSupported) checkPid5ECount++;
        }

        // B) Jos PID 5E ei vastaa, kysytään MAF (PID 0110)
        if (!this.fuelRateSupported && (this.mafSupported || checkMafCount < 4)) {
          const mafRaw = await this.sendAndReceive('0110\r', 1500);
          this.parseObdFullResponse(mafRaw);
          if (!this.mafSupported) checkMafCount++;
        }

        // 3. Nopeus: Mode 01 PID 0D
        const spdRaw = await this.sendAndReceive('010D\r', 1200);
        this.parseObdFullResponse(spdRaw);

        // Päivitetään tilatieto
        if (this.rxPacketsCount > 0) {
          const src = this.fuelRateSupported
            ? 'PID 5E'
            : this.mafSupported
            ? 'MAF (PID 10)'
            : this.currentRpm > 0
            ? 'RPM-malli'
            : 'Odotetaan moottoria';

          this.connectionStatusText = `Yhteys aktiivinen • RPM: ${this.currentRpm} • Lähde: ${src}`;
          this.emitUpdate();
        }

        // Lyhyt tauko komentojen välillä väylän vakauden takaamiseksi
        await new Promise(r => setTimeout(r, 60));
      } catch (loopErr) {
        console.warn('Virhe pollaussilmukassa:', loopErr);
        await new Promise(r => setTimeout(r, 200));
      }
    }
  }

  /**
   * Käsittelee ja parsii ELM327:ltä saapuneen täyden vastauksen
   */
  private parseObdFullResponse(raw: string) {
    if (!raw) return;
    const clean = raw.replace(/[\s\r\n>]+/g, '').toUpperCase();

    // 1. Moottorin kierrosluku: Mode 01 PID 0C (RPM)
    // Vastaus: 410Cxxxx -> Formula: ((A * 256) + B) / 4
    const matchRpm = clean.match(/410C([0-9A-F]{4})/);
    if (matchRpm) {
      const hex = matchRpm[1];
      const valA = parseInt(hex.substring(0, 2), 16);
      const valB = parseInt(hex.substring(2, 4), 16);
      if (!isNaN(valA) && !isNaN(valB)) {
        const rpm = Math.round(((valA * 256) + valB) / 4);
        this.recordRpm(rpm);
      }
    }

    // 2. EOBD Mode 01 PID 5E: Engine Fuel Rate (L/h)
    // Vastaus: 415Exxxx -> Formula: ((A * 256) + B) * 0.05
    const match5E = clean.match(/415E([0-9A-F]{4})/);
    if (match5E) {
      const hex = match5E[1];
      const valA = parseInt(hex.substring(0, 2), 16);
      const valB = parseInt(hex.substring(2, 4), 16);
      if (!isNaN(valA) && !isNaN(valB)) {
        const rateLh = Math.round((((valA * 256) + valB) * 0.05) * 100) / 100;
        this.fuelRateSupported = true;
        this.recordFuelRate(rateLh, 'PID 5E');
      }
    } else if (clean.includes('NODATA') && this.lastCommandSent.includes('015E')) {
      this.fuelRateSupported = false;
    }

    // 3. MAF (Mass Air Flow Sensor): Mode 01 PID 10 (g/s)
    // Vastaus: 4110xxxx -> Formula: ((A * 256) + B) / 100
    const match10 = clean.match(/4110([0-9A-F]{4})/);
    if (match10) {
      const hex = match10[1];
      const valA = parseInt(hex.substring(0, 2), 16);
      const valB = parseInt(hex.substring(2, 4), 16);
      if (!isNaN(valA) && !isNaN(valB)) {
        const mafGPerSec = ((valA * 256) + valB) / 100;
        this.mafSupported = true;
        if (!this.fuelRateSupported) {
          // Bensiini ~0.328 L/h per g/s MAF, Diesel ~0.295 L/h per g/s MAF
          const factor = this.fuelType === 'diesel' ? 0.295 : 0.328;
          const calculatedFuelRateLh = Math.round((mafGPerSec * factor) * 100) / 100;
          this.recordFuelRate(calculatedFuelRateLh, 'MAF (PID 10)');
        }
      }
    } else if (clean.includes('NODATA') && this.lastCommandSent.includes('0110')) {
      this.mafSupported = false;
    }

    // 4. Auton nopeus: Mode 01 PID 0D (km/h)
    // Vastaus: 410Dxx
    const match0D = clean.match(/410D([0-9A-F]{2})/);
    if (match0D) {
      const speed = parseInt(match0D[1], 16);
      if (!isNaN(speed)) {
        this.obdSpeedKmH = speed;
        this.emitUpdate();
      }
    }

    // 5. Jäähdytysneste: Mode 01 PID 05 (°C)
    const match05 = clean.match(/4105([0-9A-F]{2})/);
    if (match05) {
      const temp = parseInt(match05[1], 16) - 40;
      if (!isNaN(temp)) {
        this.coolantTempC = temp;
        this.emitUpdate();
      }
    }

    if (clean.includes('UNABLETOCONNECT') || clean.includes('BUSINIT:ERROR') || clean.includes('CANERROR')) {
      this.connectionStatusText = 'ECU ei vastaa. Varmista että auton sytytysvirta tai moottori on päällä!';
      this.emitUpdate();
    }
  }

  private recordRpm(rpm: number) {
    this.currentRpm = rpm;
    if (rpm > this.maxRpm) this.maxRpm = rpm;
    this.rpmSum += rpm;
    this.rpmReadingsCount++;
    this.emitUpdate();
  }

  private recordFuelRate(rateLh: number, source: 'PID 5E' | 'MAF (PID 10)' | 'RPM-malli' | 'Simuloitu') {
    this.currentFuelRateLh = rateLh;
    this.fuelCalculationSource = source;
    this.fuelRateSum += rateLh;
    this.fuelRateReadingsCount++;
    if (rateLh > this.maxFuelRateLh) {
      this.maxFuelRateLh = rateLh;
    }
    this.emitUpdate();
  }

  /**
   * Käynnistää realistisen OBD-simulaattorin testikäyttöön
   */
  public startSimulator() {
    this.disconnect();
    this.isSimulated = true;
    this.isConnected = false;
    this.fuelRateSupported = true;
    this.fuelCalculationSource = 'Simuloitu';
    this.deviceName = 'OBD2 Simulaattori (EOBD PID 5E)';
    this.connectionStatusText = 'Simulaattori aktiivinen';

    let simRpm = 840;
    let increasing = true;

    this.startIntegrationTimer();

    this.simulationTimer = setInterval(() => {
      const effSpeed = Math.max(this.speedKmH, this.obdSpeedKmH);

      if (effSpeed < 3) {
        simRpm = 820 + Math.floor(Math.random() * 40);
        const idleRate = (this.fuelType === 'diesel' ? 0.65 : 0.8) + (Math.random() * 0.1 - 0.05);
        this.recordRpm(simRpm);
        this.recordFuelRate(Math.round(idleRate * 100) / 100, 'Simuloitu');
      } else {
        if (increasing) {
          simRpm += Math.floor(Math.random() * 60) + 20;
          if (simRpm > 2400) increasing = false;
        } else {
          simRpm -= Math.floor(Math.random() * 70) + 25;
          if (simRpm < 1400) increasing = true;
        }

        const isDiesel = this.fuelType === 'diesel';
        const simRate = (simRpm / 1000) * (isDiesel ? 2.2 : 2.8) + (Math.random() * 0.3 - 0.15);
        this.recordRpm(simRpm);
        this.recordFuelRate(Math.round(Math.max(1.2, simRate) * 100) / 100, 'Simuloitu');
      }
    }, 500);

    this.emitUpdate();
  }

  public disconnect() {
    this.isPollingActive = false;
    this.isConnected = false;
    this.isSimulated = false;
    this.connectionStatusText = 'Yhteys katkaistu';

    if (this.pendingResolve) {
      this.pendingResolve('');
      this.pendingResolve = null;
    }
    this.isQueryInProgress = false;

    if (this.simulationTimer) {
      clearInterval(this.simulationTimer);
      this.simulationTimer = null;
    }
    if (this.integrationTimer) {
      clearInterval(this.integrationTimer);
      this.integrationTimer = null;
    }

    if (this.nativeDeviceId && Capacitor.isNativePlatform()) {
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

    if (this.gattServer) {
      try {
        this.gattServer.disconnect();
      } catch {}
      this.gattServer = null;
      this.bluetoothDevice = null;
      this.rxCharacteristic = null;
      this.txCharacteristic = null;
    }

    this.currentRpm = 0;
    this.currentFuelRateLh = 0;
    this.emitUpdate();
  }

  private handleDisconnect() {
    this.isPollingActive = false;
    this.isConnected = false;
    this.connectionStatusText = 'Bluetooth-yhteys katkesi';
    this.emitUpdate();
  }

  public updateDistance(distanceKm: number, speedKmH?: number) {
    this.distanceKm = Math.max(0, distanceKm);
    if (speedKmH !== undefined && speedKmH >= 0) {
      this.speedKmH = speedKmH;
    }
  }

  public resetSession() {
    this.resetDriveMetrics();
  }

  public getDriveSummary(): ObdDriveData | undefined {
    if (!this.isConnected && !this.isSimulated && this.fuelRateReadingsCount === 0 && this.rpmReadingsCount === 0) {
      return undefined;
    }

    const avgRpm = this.rpmReadingsCount > 0 ? Math.round(this.rpmSum / this.rpmReadingsCount) : 0;
    const avgFuelRate = this.fuelRateReadingsCount > 0
      ? Math.round((this.fuelRateSum / this.fuelRateReadingsCount) * 10) / 10
      : 0;

    const avgConsumption = this.distanceKm > 0.05
      ? Math.round(((this.totalFuelUsedLiters * 100) / this.distanceKm) * 10) / 10
      : 0;

    return {
      connected: true,
      deviceName: this.deviceName,
      isSimulated: this.isSimulated,
      avgFuelConsumptionL100Km: avgConsumption,
      totalFuelUsedLiters: Math.round(this.totalFuelUsedLiters * 100) / 100,
      fuelRateSupported: this.fuelRateSupported || this.isSimulated,
      avgFuelRateLitersPerHour: avgFuelRate,
      maxFuelRateLitersPerHour: Math.round(this.maxFuelRateLh * 10) / 10,
      avgRpm: avgRpm,
      maxRpm: this.maxRpm,
      fuelType: this.fuelType,
    };
  }

  public getSummaryData(): ObdDriveData | undefined {
    return this.getDriveSummary();
  }

  public resetDriveMetrics() {
    this.distanceKm = 0;
    this.speedKmH = 0;
    this.obdSpeedKmH = 0;
    this.totalFuelUsedLiters = 0;
    this.fuelRateSum = 0;
    this.fuelRateReadingsCount = 0;
    this.maxFuelRateLh = 0;
    this.rpmSum = 0;
    this.rpmReadingsCount = 0;
    this.maxRpm = 0;
    this.emitUpdate();
  }
}

export const obdManager = new ObdBluetoothService();
