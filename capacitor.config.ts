import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.budgy.app',
  appName: 'Budgy',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
  plugins: {
    Keyboard: {
      resize: 'body',
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
