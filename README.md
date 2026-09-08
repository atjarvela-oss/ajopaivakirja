# Opetuslupaoppilaan Ajopäiväkirja (Puhdas Android-sovellus)

Yksinkertainen, nopea ja paikallisesti toimiva Android-ajopäiväkirja opetuslupaopetukseen. Suunniteltu suoraan opettajan puhelimeen ilman käyttäjätunnuksia, kirjautumisia tai pilvitietokantoja.

Sovellus toimii helppokäyttöisenä opetuskorttina opetusluvalla suoritettavien ajotuntien dokumentoinnille, ajoympäristöjen erittelylle sekä opetuksen seurannalle.

---

## Keskeiset ominaisuudet

1. **Ei käyttäjätilejä eikä pilvitietokantoja**:
   - Sovellus aukeaa välittömästi ilman rekisteröinti- tai kirjautumisseinää.
   - Kaikki ajokerrat, reitit ja tilastot tallentuvat 100 % paikallisesti puhelimen tallennustilaan (offline-first).

2. **Automaattinen varmuuskopiointi Google Driveen**:
   - Sovellus varmuuskopioi ajopäiväkirjan automaattisesti jokaisen tallennetun ajon jälkeen (`ajopaivakirja_backup_YYYY-MM-DD.json`).
   - Avaa Androidin järjestelmäjakovalikon, josta voi valita **Tallenna Google Driveen**. Voidaan myös kytkeä pois tai käynnistää manuaalisesti asetuksista.
   - Varmuuskopion voi milloin tahansa palauttaa "Palauta"-painikkeella.

3. **PDF-vienti**:
   - **PDF-vienti**: Selkeä, valmiiksi muotoiltu A4-kokoinen opetuskortti (oppilas- ja opettajatiedot, 50 min ajotuntilaskenta, K/A/B aihekoodit ja allekirjoitukset).

4. **Ajan ja sijainnin tallennus (GPS)**:
   - Lähtöaika, lopetusaika, kesto sekuntikellolla.
   - Ajettu matka (km), hetkellinen nopeus (km/h) ja huippunopeus.
   - Interaktiivinen kartta (Leaflet + OpenStreetMap) reaaliaikaisella reittiviivalla.

5. **Automaattinen ajoympäristön arviointi**:
   - Analysoi reaaliaikaisesti ajonopeuksia, pysähdyksiä ja liikkuma-aluetta:
     - **Maantie / Moottoritie**: Nopeus > 68 km/h, vähän pysähdyksiä.
     - **Taajama**: 40–65 km/h, asuinalueet ja kiertoliittymät.
     - **Kaupunki**: 15–38 km/h, toistuvat liikennevalot ja risteykset.
     - **Pysäköinti / Käsittely**: Nopeus < 15 km/h ja tiheät suunnanmuutokset (peruutus, taskuparkki).
   - Ajon päätyttyä sovellus laskee prosenttijakauman ja ehdottaa pääasiallista kategoriaa, jonka opettaja voi vahvistaa tai säätää.

---

## Sovelluksen käynnistys ja kehitys

### 1. Asenna riippuvuudet
```bash
npm install
```

### 2. Käynnistä paikallinen esikatselu
```bash
npm run dev
```
Avaa selain osoitteessa `http://localhost:5173`.

### 3. Aja testit
```bash
npm test
```

### 4. Käännä tuotantoversio ja synkronoi Android-projektiin
```bash
npm run android:sync
```

### 5. Avaa Android Studiossa ja rakenna APK
```bash
npm run android:open
```
Android Studiossa voit ajaa sovelluksen suoraan USB-kytkettyyn Android-puhelimeesi tai valita valikosta:
`Build -> Build Bundle(s) / APK(s) -> Build APK(s)`.
Syntynyt `.apk`-tiedosto voidaan asentaa suoraan opettajan puhelimeen!

---

## Projektin rakenne

- `android/`: Täydellinen natiivi Android Studio -projekti (Gradle, AndroidManifest, Java/Kotlin).
- `src/services/localDb.ts`: Paikallinen tietokanta (IndexedDB / LocalStorage).
- `src/services/exportService.ts`: PDF-opetuskortin generointi (`jspdf`, `jspdf-autotable`).
- `src/services/driveBackup.ts`: Google Drive -varmuuskopiopalvelu ja palautus.
- `src/services/environmentClassifier.ts`: Ajoympäristön automaattinen tunnistusalgoritmi.
- `src/components/`: Käyttöliittymäkomponentit (ajotilan GPS-seuranta, Leaflet-kartta, taulukko, yhteenvedot).

---

## Valmistaja ja tekijänoikeudet

- **Valmistaja / Kehittäjä:** Ari Järvelä (`atjarvela-oss`)
- **Yhteystiedot:** atjarvela@gmail.com
- **GitHub:** [https://github.com/atjarvela-oss/ajopaivakirja](https://github.com/atjarvela-oss/ajopaivakirja)

---

## Lisenssi ja käyttöoikeus (License)

Copyright (c) 2026 Ari Järvelä. Kaikki oikeudet pidätetään kaupallisen käytön osalta.

Tämä sovellus on vapaasti käytettävissä, muokattavissa ja jaettavissa henkilökohtaiseen, opetukselliseen ja ei-kaupalliseen käyttöön.

**Sovellusta, sen koodia tai sen osia ei saa ottaa osaksi kaupallista sovellusta, tuotetta tai palvelua ilman tekijänoikeuden haltijan (Ari Järvelä) etukäteistä kirjallista lupaa.** Katso tarkemmat ehdot tiedostosta [`LICENSE.md`](LICENSE.md).

