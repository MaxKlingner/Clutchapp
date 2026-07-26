/**
 * Dynamic Expo config so Dev Client and TestFlight can coexist on the same iPhone.
 * APP_VARIANT=development → CLUTCH Dev (com.maxklingner.clutch.dev)
 * otherwise → CLUTCH (com.maxklingner.clutch) for preview/production
 */
const IS_DEV = process.env.APP_VARIANT === 'development';

export default {
  expo: {
    name: IS_DEV ? 'CLUTCH Dev' : 'CLUTCH',
    slug: 'clutch',
    scheme: IS_DEV ? 'clutch-dev' : 'clutch',
    version: '1.0.0',
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
      bundleIdentifier: IS_DEV
        ? 'com.maxklingner.clutch.dev'
        : 'com.maxklingner.clutch',
      infoPlist: {
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
    },
    web: {
      favicon: './assets/icon.png',
    },
    plugins: [
      'expo-secure-store',
      'expo-dev-client',
      [
        'expo-image-picker',
        {
          photosPermission:
            'Clutch utilise ta bibliothèque photo pour ta photo de profil tuteur.',
          cameraPermission:
            'Clutch utilise la caméra pour ta photo de profil tuteur.',
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
      appVariant: IS_DEV ? 'development' : 'default',
    },
    owner: 'maxklingner',
  },
};
