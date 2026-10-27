/**
 * Dynamic Expo config so Dev Client and TestFlight can coexist on the same iPhone.
 *
 * APP_VARIANT=development → Clutch Dev (com.maxklingner.clutch.dev)
 * APP_VARIANT=preview     → Clutch Dev name, same bundle as store (internal/preview builds)
 * otherwise / production  → Clutch (com.maxklingner.clutch) — TestFlight / App Store
 */
const APP_VARIANT = process.env.APP_VARIANT ?? 'production';
const IS_DEV = APP_VARIANT === 'development';
const IS_PREVIEW = APP_VARIANT === 'preview';
const IS_DEV_OR_PREVIEW = IS_DEV || IS_PREVIEW;

const displayName = IS_DEV_OR_PREVIEW ? 'Clutch Dev' : 'Clutch';

export default {
  expo: {
    name: displayName,
    slug: 'clutch',
    scheme: IS_DEV ? 'clutch-dev' : 'clutch',
    version: '1.0.2',
    orientation: 'portrait',
    icon: './assets/icon.png',
    userInterfaceStyle: 'light',
    splash: {
      image: './assets/icon.png',
      resizeMode: 'contain',
      backgroundColor: '#A8E6CF',
    },
    ios: {
      supportsTablet: true,
      // buildNumber géré à distance (eas.json appVersionSource: remote + autoIncrement)
      bundleIdentifier: IS_DEV
        ? 'com.maxklingner.clutch.dev'
        : 'com.maxklingner.clutch',
      infoPlist: {
        CFBundleDisplayName: displayName,
        CFBundleName: displayName,
        ITSAppUsesNonExemptEncryption: false,
      },
    },
    android: {
      package: IS_DEV
        ? 'com.maxklingner.clutch.dev'
        : 'com.maxklingner.clutch',
      adaptiveIcon: {
        backgroundColor: '#A8E6CF',
        foregroundImage: './assets/icon.png',
      },
      label: displayName,
    },
    web: {
      favicon: './assets/icon.png',
    },
    plugins: [
      'expo-secure-store',
      'expo-dev-client',
      [
        'expo-location',
        {
          locationWhenInUsePermission:
            'Clutch utilise ta position pour trouver des tuteurs autour de toi.',
        },
      ],
      [
        'expo-image-picker',
        {
          photosPermission:
            'Clutch a besoin d’accéder à tes photos pour choisir ta photo de profil.',
          cameraPermission:
            'Clutch a besoin de l’appareil photo pour prendre ta photo de profil.',
        },
      ],
      [
        'expo-notifications',
        {
          color: '#1B5E3B',
          defaultChannel: 'default',
        },
      ],
    ],
    extra: {
      eas: {
        projectId: '4fd6a13e-183f-440b-89b9-21579c91faed',
      },
      appVariant: APP_VARIANT,
    },
    owner: 'maxklingner',
  },
};
