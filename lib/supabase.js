import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';

import { env, isSupabaseConfigured } from './env';

const ExpoSecureStoreAdapter = {
  getItem: (key) => SecureStore.getItemAsync(key),
  setItem: (key, value) => SecureStore.setItemAsync(key, value),
  removeItem: (key) => SecureStore.deleteItemAsync(key),
};

export const supabase = isSupabaseConfigured
  ? createClient(env.supabaseUrl, env.supabaseAnonKey, {
      auth: {
        storage: ExpoSecureStoreAdapter,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    })
  : null;

/**
 * Normalise une ligne Supabase vers le format utilisé par l'écran Swipe.
 * Attendu (table `profiles`, role = tutor) :
 * id, full_name, subject, hourly_rate, rating
 */
function mapTutorProfile(row) {
  const name = row.full_name ?? row.name ?? 'Tuteur';
  const subject = row.subject ?? row.matiere ?? 'Matière';
  const hourlyRate = Number(row.hourly_rate ?? row.hourlyRate ?? row.tarif_horaire ?? 0);
  const rating = Number(row.rating ?? row.note ?? 0);

  return {
    id: String(row.id),
    name,
    subject,
    hourlyRate: Number.isFinite(hourlyRate) ? hourlyRate : 0,
    rating: Number.isFinite(rating) ? rating : 0,
  };
}

function isTutorRow(row) {
  if (row.role != null) {
    return String(row.role).toLowerCase() === 'tutor';
  }
  if (typeof row.is_tutor === 'boolean') {
    return row.is_tutor;
  }
  // Table dédiée aux tuteurs (pas de colonne role)
  return true;
}

/**
 * Récupère les profils des tuteurs depuis Supabase.
 * @returns {Promise<Array<{ id: string, name: string, subject: string, hourlyRate: number, rating: number }>>}
 */
export async function fetchTutorProfiles() {
  if (!supabase) {
    throw new Error('Supabase n’est pas configuré. Vérifie ton fichier .env.');
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('id', { ascending: true });

  if (error) {
    throw new Error(error.message || 'Impossible de charger les tuteurs.');
  }

  return (data ?? []).filter(isTutorRow).map(mapTutorProfile);
}
