import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'io.joinone.app',
  appName: 'One',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    iosScheme: 'https',
    url: 'https://joinone.io',
    cleartext: false,
    appendUserAgent: 'OneNativeApp',
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      androidSplashResourceName: 'splash',
      showSpinner: false,
    },
    StatusBar: {
      overlaysWebView: false,
    },
    CapacitorHttp: {
      enabled: false,
    },
  },
};

export default config;
