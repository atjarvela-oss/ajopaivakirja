import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'fi.opetuslupa.ajopaivakirja',
  appName: 'Opetuslupalaisen ajopäiväkirja',
  webDir: 'dist',
  server: {
    androidScheme: 'https'
  },
  android: {
    allowMixedContent: true,
    backgroundColor: '#090d16',
    useLegacyBridge: true
  }
};

export default config;
