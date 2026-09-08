import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');

// 1. Lue versio version.jsonista
const versionFile = path.join(root, 'version.json');
let version = '';
if (fs.existsSync(versionFile)) {
  const data = JSON.parse(fs.readFileSync(versionFile, 'utf8'));
  version = data.version;
}

if (!version) {
  console.error('Ei löydetty versiota version.json -tiedostosta!');
  process.exit(1);
}

const tag = `v${version}`;
const apkPath = path.join(root, 'ajopaivakirja.apk');

if (!fs.existsSync(apkPath)) {
  console.error(`APK-tiedostoa ${apkPath} ei löydy! Käännä ensin: npm run build:apk`);
  process.exit(1);
}

const notes = process.argv[2] || `Automaattinen julkaisu versiolle ${version}`;

console.log(`Luodaan GitHub Release tagilla: ${tag}`);
execSync(`gh release create "${tag}" "${apkPath}" --title "Versio ${version}" --notes "${notes}"`, { stdio: 'inherit' });
console.log(`Julkaisu ${tag} luotu onnistuneesti!`);
