import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'fi.opetuslupa.ajopaivakirja',
  appName: 'Ajopäiväkirja',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  },
  android: {
    allowMixedContent: true,
    backgroundColor: '#090d16'
  }
};

export default config;
