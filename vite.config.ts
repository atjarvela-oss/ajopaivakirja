import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Muotoillaan automaattinen build-versio muotoon 1.pvmklo (esim. 1.20260908.0945)
const now = new Date();
const pad = (n: number) => n.toString().padStart(2, '0');
const pvm = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
const klo = `${pad(now.getHours())}${pad(now.getMinutes())}`;
const appVersion = `1.${pvm}.${klo}`;

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
})

