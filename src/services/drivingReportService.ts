import type { DrivingBehavior, ObdDriveData } from '../types';

export interface DrivingReportSummary {
  title: string;
  grade: 'Erinomainen' | 'Hyvä' | 'Kohtalainen' | 'Harjoiteltavaa';
  gradeColor: string;
  fullReportText: string;
  keyObservations: string[];
  tipsForNextDrive: string[];
}

/**
 * Tuottaa pedagogisen, selkeän ja kannustavan sanallisen raportin ajokerrasta
 */
export function generateVerbalDrivingReport(
  behavior: DrivingBehavior,
  obdData?: ObdDriveData,
  driveContext?: {
    distanceKm: number;
    durationSeconds: number;
    avgSpeedKmH: number;
    environmentPrimary?: string;
    topicCode?: string;
  }
): DrivingReportSummary {
  const { smoothnessScore, hardBrakesCount, hardTurnsCount, rapidAccelsCount, engineStallsCount } = behavior;
  const observations: string[] = [];
  const tips: string[] = [];

  if (driveContext && driveContext.distanceKm > 0) {
    observations.push(`Harjoituskerran pituus oli ${driveContext.distanceKm} km ja kesto ${Math.round(driveContext.durationSeconds / 60)} minuuttia.`);
  }

  let grade: DrivingReportSummary['grade'] = 'Erinomainen';
  let gradeColor = 'text-emerald-600 dark:text-emerald-400';

  if (smoothnessScore >= 88) {
    grade = 'Erinomainen';
    gradeColor = 'text-emerald-600 dark:text-emerald-400';
  } else if (smoothnessScore >= 75) {
    grade = 'Hyvä';
    gradeColor = 'text-blue-600 dark:text-blue-400';
  } else if (smoothnessScore >= 60) {
    grade = 'Kohtalainen';
    gradeColor = 'text-amber-600 dark:text-amber-400';
  } else {
    grade = 'Harjoiteltavaa';
    gradeColor = 'text-rose-600 dark:text-rose-400';
  }

  // 1. Tasaisuus ja ennakointi
  if (smoothnessScore >= 88) {
    observations.push(`Ajo oli kiitettävän rauhallista ja ennakoivaa (Tasaisuusindeksi ${smoothnessScore}/100).`);
  } else if (smoothnessScore >= 75) {
    observations.push(`Ajo sujui pääosin tasaisesti (Tasaisuusindeksi ${smoothnessScore}/100), pienellä lisäennakoinnilla saavutetaan täysi rauhallisuus.`);
  } else {
    observations.push(`Ajossa havaittiin tavanomaista enemmän äkkinäisiä liikkeitä (Tasaisuusindeksi ${smoothnessScore}/100).`);
  }

  // 2. Äkkijarrutukset
  if (hardBrakesCount === 0) {
    observations.push('Jarrutukset olivat pehmeitä ja ennakoivia – ei yhtään äkkijarrutusta.');
  } else if (hardBrakesCount === 1) {
    observations.push('Ajossa rekisteröitiin 1 voimakas äkkijarrutus. Seuraa tilannetta kauempaa eteenpäin.');
    tips.push('Aloita hidastaminen risteystä tai valoja kohti aiemmin moottorijarrutuksella.');
  } else {
    observations.push(`Ajossa tehtiin ${hardBrakesCount} äkkijarrutusta. Turvavälin ja risteysvalmiuden riittävyys kannattaa kerrata.`);
    tips.push('Pidempi turvaväli edellä ajavaan poistaa tarpeen äkillisille jarrutuksille.');
  }

  // 3. Mutkanopeus
  if (hardTurnsCount === 0) {
    observations.push('Kaarrenopeudet ja kääntymiset risteyksissä olivat hallittuja ja turvallisia.');
  } else {
    observations.push(`Kaarteissa tai käännöksissä havaittiin ${hardTurnsCount} vauhdikasta tilannetta.`);
    tips.push('Hiljennä vauhti riittävän alhaiseksi ENNEN kaarretta tai risteyskäännöstä, ei vasta sen aikana.');
  }

  // 4. Moottorin sammumiset
  if (engineStallsCount === 0) {
    observations.push('Liikkeellelähdöt sujuivat varmasti – moottori ei sammunut kertaakaan.');
  } else if (engineStallsCount === 1) {
    observations.push('Moottori sammui kerran liikkeellelähdössä tai pysähdyksissä.');
    tips.push('Nosta kytkintä rauhallisesti vetopisteeseen asti ja anna samalla ripaus kaasua.');
  } else {
    observations.push(`Moottori sammui ${engineStallsCount} kertaa liikkeellelähdöissä.`);
    tips.push('Kytkintuntumaa ja vetopisteen hakua kannattaa harjoitella rauhallisella alueella.');
  }

  // 5. Kiihdytykset
  if (rapidAccelsCount > 2) {
    observations.push(`Mukana oli ${rapidAccelsCount} voimakasta kiihdytystä, mikä heikentää taloudellisuutta.`);
    tips.push('Kevyempi kaasujalka säästää polttoainetta ja tekee kyydistä matkustajille miellyttävämpää.');
  }

  // 6. Polttoaineen kulutus (OBD)
  if (obdData && obdData.connected && obdData.avgFuelConsumptionL100Km && obdData.avgFuelConsumptionL100Km > 0) {
    const cons = obdData.avgFuelConsumptionL100Km;
    const rateNote = obdData.avgFuelRateLitersPerHour ? ` (keskivirtaus ${obdData.avgFuelRateLitersPerHour} l/h)` : '';
    if (cons < 6.0) {
      observations.push(`Polttoaineen keskikulutus oli kiitettävän alhainen: ${cons} l/100 km${rateNote}.`);
    } else if (cons < 7.8) {
      observations.push(`Polttoaineen keskikulutus oli hyvällä tasolla: ${cons} l/100 km${rateNote}.`);
    } else {
      observations.push(`Polttoaineen keskikulutus oli ${cons} l/100 km${rateNote}. Vaihda suuremmalle vaihteelle aiemmin.`);
      tips.push('Taloudellinen ajotapa: vaihda isommalle jo noin 2000 kierroksen kohdalla.');
    }
  }

  // Muodostetaan yhtenäinen sanallinen kappale
  const fullReportText = [
    `Arvosana: ${grade}.`,
    ...observations,
    tips.length > 0 ? `Seuraavalle ajolle: ${tips.join(' ')}` : 'Jatka samaan malliin, hienoa kehitystä!',
  ].join(' ');

  return {
    title: `Ajotavan palaute: ${grade}`,
    grade,
    gradeColor,
    fullReportText,
    keyObservations: observations,
    tipsForNextDrive: tips.length > 0 ? tips : ['Erinomainen suoritus, pidä sama ajotuntuma!'],
  };
}

/**
 * Lukee raportin ääneen suomen kielellä puhesynteesillä (TTS)
 */
export function speakDrivingReport(text: string): boolean {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return false;
  }

  window.speechSynthesis.cancel(); // Pysäytetään edellinen puhe

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'fi-FI';
  utterance.rate = 0.95; // Hieman rauhallisempi tempo
  utterance.pitch = 1.0;

  // Etsitään suomenkielinen ääni jos selaimessa on useita
  const voices = window.speechSynthesis.getVoices();
  const finnishVoice = voices.find(v => v.lang.startsWith('fi') || v.name.includes('Finnish'));
  if (finnishVoice) {
    utterance.voice = finnishVoice;
  }

  window.speechSynthesis.speak(utterance);
  return true;
}

export function stopSpeakingReport() {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
}

export function isSpeakingReport(): boolean {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return false;
  return window.speechSynthesis.speaking;
}
