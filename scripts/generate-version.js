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

const versionFile = path.join(root, 'version.json');
fs.writeFileSync(versionFile, JSON.stringify({ version, updatedAt: now.toISOString() }, null, 2), 'utf8');

console.log(`[version] Generated build version: ${version}`);
