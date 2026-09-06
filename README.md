# Opetuslupaoppilaan Ajopäiväkirja (Driving Logbook)

Moderni, mobiilioptimoitu verkkosovellus (PWA) opetuslupaoppilaan ajokertojen tallennukseen, reaaliaikaiseen GPS-reitin seurantaan ja automaattiseen ajoympäristön arviointiin.

Sovellus täyttää Traficomin ja Ajovarman vaatimukset opetusluvalla suoritettavien ajotuntien dokumentoinnille, ajoympäristöjen erittelylle sekä opettajan kuittauksille.

---

## Ominaisuudet

1. **Google-kirjautuminen & Käyttöoikeuksien Hallinta (RBAC)**:
   - **Pääkäyttäjä**: `atjarvela@gmail.com` (saa automaattisesti järjestelmänvalvojan / opettajan oikeudet).
   - **Roolit**:
     - **Opettaja / Pääkäyttäjä (`admin`)**: Hallintapaneeli käyttäjille, voi tarkastella kaikkien oppilaiden ajopäiväkirjoja, antaa palautetta ja kuitata ajokertoja hyväksytyksi opetuslupaan.
     - **Oppilas (`student`)**: Tallentaa omia ajokertojaan ja seuraa omia tilastojaan.
   - Toimii suoraan Firebase Authenticationin Google Providerilla sekä helppokäyttöisessä demotilassa.

2. **Ajan ja Sijainnin Tallennus (GPS)**:
   - Lähtöaika, lopetusaika, kesto sekuntikellolla.
   - Ajettu matka (km), hetkellinen nopeus (km/h), keskinopeus ja huippunopeus.
   - Interaktiivinen kartta (Leaflet + OpenStreetMap) reaaliaikaisella reittiviivalla ja tarkkuusmittarilla.
   - Sisäänrakennettu **ajosimulaattori**, jolla sovellusta ja ajoympäristöjen tunnistusta voi kokeilla heti työpöydällä ilman ajamista.

3. **Automaattinen Ajoympäristön Arviointi**:
   - Sovellus analysoi ajon aikana GPS-pisteitä, nopeutta ja pysähdyksiä:
     - **Maantie / Moottoritie**: Nopeus > 65–100 km/h, vähän pysähdyksiä.
     - **Taajama**: 40–65 km/h, asuinalueet ja kiertoliittymät.
     - **Kaupunki**: 15–40 km/h, toistuvat liikennevalot ja risteykset.
     - **Pysäköinti / Käsittely**: < 15 km/h, toistuvat suunnanmuutokset ja pieni liikkuma-alue.
   - Laskee prosenttijakauman ja ehdottaa pääasiallista kategoriaa (oppilas voi myös säätää arviota).

4. **Taulukkotyylinen Listaus & Raportit**:
   - Responsiivinen taulukko: Pvm, ajat, kesto, kilometrit, nopeus, ajoympäristö, opettajan kuittaus ja muistiinpanot.
   - Reitin katselu kartalla mistä tahansa ajetusta kerrasta (lähtö- ja lopetuspisteet).
   - CSV-vienti Exceliin / Google Sheetsiin.
   - Tulostusystävällinen virallinen opetuslupalomake allekirjoituskenttineen (A4/PDF).

---

## Teknologiapino

- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS v4, Lucide Icons, Leaflet
- **Autentikointi**: Firebase Authentication (Google Auth)
- **Tietokanta**: Cloud Firestore + selaimen offline-välimuisti
- **Pilvifunktiot**: Firebase Cloud Functions v2 (`functions/`)
- **Tietoturva**: `firestore.rules` (roolipohjainen suojaus)

---

## Asennus ja Kehitys

### 1. Asenna riippuvuudet
```bash
npm install
```

### 2. Käynnistä kehityspalvelin
```bash
npm run dev
```
Avaa selain osoitteessa `http://localhost:5173`.

### 3. Aja testit
```bash
npm test
```

### 4. Rakenna tuotantoversio
```bash
npm run build
```

---

## GitHub-ohjeet

Projektissa on alustettu valmiiksi Git-repositorio `main`-haarassa ja `.gitignore` valmiina.

Voit julkaista koodin omaan GitHub-tiliisi näin:

```bash
# 1. Lisää muutokset ja tee commit
git add .
git commit -m "Initial commit: Opetuslupaoppilaan ajopäiväkirja"

# 2. Luo uusi repositorio GitHubissa (esim. nimellä ajopaivakirja)
# 3. Yhdistä paikallinen repositorio GitHubiin:
git remote add origin https://github.com/<sinun-kayttajatunnus>/<repositorion-nimi>.git
git push -u origin main
```

---

## Firebase-käyttöönotto

1. Luo ilmainen projekti osoitteessa [Firebase Console](https://console.firebase.google.com/).
2. Ota käyttöön **Authentication** -> Valitse **Google**-kirjautumismenetelmä.
3. Ota käyttöön **Cloud Firestore**.
4. Kopioi Web App -konfiguraatio joko:
   - Tiedostoon `.env` (katso mallia `.env.example`):
     ```env
     VITE_FIREBASE_API_KEY=AIzaSy...
     VITE_FIREBASE_AUTH_DOMAIN=oma-projekti.firebaseapp.com
     VITE_FIREBASE_PROJECT_ID=oma-projekti
     VITE_ADMIN_EMAIL=atjarvela@gmail.com
     ```
   - TAI suoraan sovelluksen yläpalkin rataskuvakkeesta (Asetukset -> Liitä Firebase config).
5. Ota tietoturvasäännöt käyttöön:
   ```bash
   firebase deploy --only firestore:rules
   ```
6. (Valinnainen) Ota käyttöön Hosting ja Cloud Functions:
   ```bash
   firebase deploy
   ```
