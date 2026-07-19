import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';

import { saveExpoPushToken } from '../lib/supabase';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

function getEasProjectId() {
  return (
    Constants.expoConfig?.extra?.eas?.projectId ||
    Constants.easConfig?.projectId ||
    null
  );
}

/**
 * Demande la permission + récupère l'Expo Push Token.
 * Retourne null si refusé / simulateur / web.
 */
export async function registerForPushNotificationsAsync() {
  if (Platform.OS === 'web') {
    return null;
  }

  if (!Device.isDevice) {
    console.log('[push] Simulateur : pas de push distant.');
    return null;
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#1B5E3B',
    });
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.log('[push] Permission refusée.');
    return null;
  }

  const projectId = getEasProjectId();
  const tokenResponse = projectId
    ? await Notifications.getExpoPushTokenAsync({ projectId })
    : await Notifications.getExpoPushTokenAsync();

  return tokenResponse?.data ?? null;
}

/**
 * Permission + enregistrement du token en base pour le user Clerk.
 */
export async function setupPushNotificationsForUser(clerkId) {
  if (!clerkId) return null;

  try {
    const token = await registerForPushNotificationsAsync();
    if (!token) return null;

    await saveExpoPushToken(clerkId, token);
    return token;
  } catch (err) {
    console.warn('[push] Setup impossible:', err?.message ?? err);
    return null;
  }
}
