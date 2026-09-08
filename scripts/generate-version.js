import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');

const now = new Date();
const pad = (n) => n.toString().padStart(2, '0');
const pvm = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
const klo = `${pad(now.getHours())}${pad(now.getMinutes())}`;
const version = `1.${pvm}.${klo}`;
// versionCode: sekunteina vuodesta 2024 alkaen (positiivinen 32-bittinen kokonaisluku, kasvaa jokaisella käännöksellä)
const versionCode = Math.floor((now.getTime() - 1704067200000) / 1000);

const versionFile = path.join(root, 'version.json');
fs.writeFileSync(versionFile, JSON.stringify({ version, versionCode, updatedAt: now.toISOString() }, null, 2), 'utf8');

// Synkronoidaan myös package.json
const pkgFile = path.join(root, 'package.json');
if (fs.existsSync(pkgFile)) {
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8'));
    pkg.version = version;
    fs.writeFileSync(pkgFile, JSON.stringify(pkg, null, 2) + '\n', 'utf8');
  } catch (e) {
    console.warn('[version] package.json päivitys epäonnistui:', e);
  }
}

// Synkronoidaan myös android/app/build.gradle
const gradleFile = path.join(root, 'android', 'app', 'build.gradle');
if (fs.existsSync(gradleFile)) {
  try {
    let gradle = fs.readFileSync(gradleFile, 'utf8');
    gradle = gradle.replace(/versionName\s+["'][^"']+["']/, `versionName "${version}"`);
    gradle = gradle.replace(/versionCode\s+\d+/, `versionCode ${versionCode}`);
    fs.writeFileSync(gradleFile, gradle, 'utf8');
  } catch (e) {
    console.warn('[version] android/app/build.gradle päivitys epäonnistui:', e);
  }
}

console.log(`[version] Generated build version: ${version}`);
