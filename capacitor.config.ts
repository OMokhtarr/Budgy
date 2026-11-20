import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.budgymoney.app',
  appName: 'Budgy',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  plugins: {
    // The launch splash stays up until the opening screen has its data (revealApp in src/shared/splash.ts),
    // then fades straight into it.
    SplashScreen: {
      launchAutoHide: false,
      launchFadeOutDuration: 250,
    },
    Keyboard: {
      resize: 'body',
    },
    // Reminders: the status bar icon (android/app/src/main/res/drawable/ic_stat_budgy.xml) and Budgy's green.
    LocalNotifications: {
      smallIcon: 'ic_stat_budgy',
      iconColor: '#10b981',
    },
    // Native sign-in (@capgo/capacitor-social-login): only Google and Apple are used. Disabled providers
    // aren't bundled, so no Facebook SDK ends up in the app. Changes need `npx cap sync`.
    SocialLogin: {
      providers: {
        google: true,
        apple: true,
        facebook: false,
        twitter: false,
      },
      logLevel: 1,
    },
  },
};

export default config;
