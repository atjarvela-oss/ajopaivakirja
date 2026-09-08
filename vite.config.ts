import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

import fs from 'fs'
import path from 'path'

// Luetaan automaattinen build-versio version.json -tiedostosta
let appVersion = '1.0.0'
try {
  const versionData = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'version.json'), 'utf8'))
  if (versionData.version) {
    appVersion = versionData.version
  }
} catch {
  // Jos tiedostoa ei ole, fallback
  const now = new Date()
  const pad = (n: number) => n.toString().padStart(2, '0')
  const pvm = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`
  const klo = `${pad(now.getHours())}${pad(now.getMinutes())}`
  appVersion = `1.${pvm}.${klo}`
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  server: {
    host: '0.0.0.0',
    port: 3000,
  },
  preview: {
    host: '0.0.0.0',
    port: 3000,
  },
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
})

