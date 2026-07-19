import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';

import { env, isSupabaseConfigured } from './env';
import { MATCH_STATUS } from './tutorConstants';

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

function requireSupabase() {
  if (!supabase) {
    throw new Error('Supabase n’est pas configuré. Vérifie ton fichier .env.');
  }
  return supabase;
}

/**
 * Normalise une ligne Supabase vers le format utilisé par l'écran Swipe.
 */
function mapTutorProfile(row) {
  if (!row) return null;

  let specialties = Array.isArray(row.specialties)
    ? row.specialties.filter(Boolean).map(String)
    : [];

  // Fallback : ancien champ subject si specialties vide
  if (!specialties.length && row.subject) {
    specialties = String(row.subject)
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);
  }

  const name = row.full_name ?? row.name ?? 'Tuteur';
  const subject =
    specialties.length > 0
      ? specialties.join(', ')
      : row.subject ?? row.matiere ?? 'Matière';
  const hourlyRate = Number(
    row.hourly_rate ?? row.hourlyRate ?? row.tarif_horaire ?? 0
  );
  const rating = Number(row.rating ?? row.note ?? 0);

  return {
    id: String(row.id),
    clerkId: row.clerk_id ? String(row.clerk_id) : null,
    name,
    subject,
    specialties,
    bio: row.bio != null ? String(row.bio) : '',
    studyYear: row.study_year ?? null,
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
  return true;
}

function mapParentSummary(row) {
  if (!row) return null;
  return {
    clerkId: String(row.clerk_id),
    fullName: row.full_name || 'Parent',
    role: row.role,
  };
}

function mapMatch(row) {
  const tutor = mapTutorProfile(row.tutor ?? row.profiles);
  const parent = mapParentSummary(row.parent_profile);
  return {
    id: String(row.id),
    parentId: String(row.parent_id),
    tutorId: String(row.tutor_id),
    status: row.status ?? MATCH_STATUS.ACCEPTED,
    createdAt: row.created_at,
    tutor,
    parent,
    parentName: parent?.fullName ?? 'Parent',
  };
}

function mapMessage(row) {
  return {
    id: String(row.id),
    matchId: String(row.match_id),
    senderId: String(row.sender_id),
    senderRole: row.sender_role,
    content: row.content,
    createdAt: row.created_at,
  };
}

/**
 * Récupère les profils des tuteurs depuis Supabase (données live).
 * @param {{ excludeClerkId?: string|null }} [options]
 */
export async function fetchTutorProfiles({ excludeClerkId } = {}) {
  const client = requireSupabase();

  let excludeProfileId = null;
  if (excludeClerkId) {
    const { data: mine } = await client
      .from('profiles')
      .select('id')
      .eq('clerk_id', excludeClerkId)
      .maybeSingle();
    if (mine?.id) excludeProfileId = String(mine.id);
  }

  const { data, error } = await client
    .from('profiles')
    .select(
      'id, clerk_id, full_name, subject, hourly_rate, rating, role, bio, specialties, study_year, created_at'
    )
    .eq('role', 'tutor')
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(error.message || 'Impossible de charger les tuteurs.');
  }

  const excludedClerk = excludeClerkId ? String(excludeClerkId) : null;

  return (data ?? [])
    .filter(isTutorRow)
    .map(mapTutorProfile)
    .filter((tutor) => {
      if (excludeProfileId && tutor.id === excludeProfileId) return false;
      if (excludedClerk && tutor.clerkId === excludedClerk) return false;
      return true;
    });
}

/**
 * Crée ou récupère la ligne profiles liée au compte Clerk tuteur.
 */
export async function ensureTutorProfile({ clerkId, fullName }) {
  const client = requireSupabase();

  if (!clerkId) {
    throw new Error('clerkId requis.');
  }

  const { data: existing, error: existingError } = await client
    .from('profiles')
    .select('*')
    .eq('clerk_id', clerkId)
    .maybeSingle();

  if (existingError) {
    throw new Error(
      existingError.message || 'Impossible de charger le profil tuteur.'
    );
  }

  if (existing) {
    return mapTutorProfile(existing);
  }

  const name = fullName?.trim() || 'Nouveau tuteur';
  const { data: created, error } = await client
    .from('profiles')
    .insert({
      clerk_id: clerkId,
      full_name: name,
      subject: 'Matière',
      specialties: [],
      bio: '',
      study_year: 'Master 1',
      hourly_rate: 25,
      rating: 5,
      role: 'tutor',
    })
    .select('*')
    .single();

  if (error) {
    throw new Error(error.message || 'Impossible de créer le profil tuteur.');
  }

  return mapTutorProfile(created);
}

/**
 * Charge le profil tuteur du user Clerk connecté.
 */
export async function fetchMyTutorProfile(clerkId) {
  return ensureTutorProfile({ clerkId, fullName: null });
}

/**
 * Met à jour le profil tuteur (visible dans le swipe parents).
 */
export async function updateTutorProfile(clerkId, updates) {
  const client = requireSupabase();

  if (!clerkId) {
    throw new Error('clerkId requis.');
  }

  const specialties = Array.isArray(updates.specialties)
    ? updates.specialties.filter(Boolean)
    : [];
  const subject =
    specialties.length > 0
      ? specialties.join(', ')
      : updates.subject?.trim() || 'Matière';

  const payload = {
    full_name: updates.fullName?.trim() || 'Tuteur',
    bio: updates.bio?.trim() || '',
    specialties,
    subject,
    study_year: updates.studyYear || null,
    hourly_rate: Number(updates.hourlyRate) || 0,
    role: 'tutor',
  };

  // S'assure que la ligne existe
  await ensureTutorProfile({
    clerkId,
    fullName: payload.full_name,
  });

  const { data, error } = await client
    .from('profiles')
    .update(payload)
    .eq('clerk_id', clerkId)
    .select('*')
    .single();

  if (error) {
    throw new Error(error.message || 'Impossible de sauvegarder le profil.');
  }

  return mapTutorProfile(data);
}

/**
 * Crée une demande de cours (match pending) parent ↔ tuteur.
 */
export async function createMatch({ parentId, tutorId }) {
  const client = requireSupabase();

  if (!parentId || !tutorId) {
    throw new Error('parentId et tutorId sont requis pour créer un match.');
  }

  const { data: existing, error: existingError } = await client
    .from('matches')
    .select('id, parent_id, tutor_id, status, created_at, tutor:profiles(*)')
    .eq('parent_id', parentId)
    .eq('tutor_id', tutorId)
    .maybeSingle();

  if (existingError) {
    throw new Error(existingError.message || 'Impossible de vérifier le match.');
  }

  if (existing) {
    return mapMatch(existing);
  }

  const { data: created, error } = await client
    .from('matches')
    .insert({
      parent_id: parentId,
      tutor_id: tutorId,
      status: MATCH_STATUS.PENDING,
    })
    .select('id, parent_id, tutor_id, status, created_at, tutor:profiles(*)')
    .single();

  if (error) {
    throw new Error(error.message || 'Impossible de créer le match.');
  }

  return mapMatch(created);
}

async function attachParentProfiles(matches) {
  if (!matches.length) return matches;

  const client = requireSupabase();
  const parentIds = [...new Set(matches.map((m) => m.parent_id).filter(Boolean))];

  const { data: parents, error } = await client
    .from('user_profiles')
    .select('clerk_id, full_name, role')
    .in('clerk_id', parentIds);

  if (error) {
    return matches.map((row) => mapMatch(row));
  }

  const byClerk = new Map((parents ?? []).map((p) => [p.clerk_id, p]));
  return matches.map((row) =>
    mapMatch({
      ...row,
      parent_profile: byClerk.get(row.parent_id) ?? null,
    })
  );
}

/**
 * Liste les matches d'un parent (acceptés par défaut pour la messagerie).
 */
export async function fetchMatches(parentId, { statuses } = {}) {
  const client = requireSupabase();
  const wanted = statuses ?? [MATCH_STATUS.ACCEPTED, MATCH_STATUS.PENDING];

  const { data, error } = await client
    .from('matches')
    .select('id, parent_id, tutor_id, status, created_at, tutor:profiles(*)')
    .eq('parent_id', parentId)
    .in('status', wanted)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(error.message || 'Impossible de charger les matches.');
  }

  return (data ?? []).map(mapMatch);
}

/**
 * Toutes les demandes / matches pour un profil tuteur (via clerk_id).
 */
export async function fetchTutorMatchRequests(clerkId) {
  const client = requireSupabase();

  const profile = await ensureTutorProfile({ clerkId, fullName: null });

  const { data, error } = await client
    .from('matches')
    .select('id, parent_id, tutor_id, status, created_at, tutor:profiles(*)')
    .eq('tutor_id', profile.id)
    .in('status', [MATCH_STATUS.PENDING, MATCH_STATUS.ACCEPTED])
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(error.message || 'Impossible de charger les demandes.');
  }

  return attachParentProfiles(data ?? []);
}

/**
 * Le tuteur accepte une demande → conversation ouverte.
 */
export async function acceptMatchRequest(matchId, tutorClerkId) {
  const client = requireSupabase();

  const { data, error } = await client
    .from('matches')
    .update({ status: MATCH_STATUS.ACCEPTED })
    .eq('id', matchId)
    .select('id, parent_id, tutor_id, status, created_at, tutor:profiles(*)')
    .single();

  if (error) {
    throw new Error(error.message || 'Impossible d’accepter la demande.');
  }

  const match = mapMatch(data);
  const tutorName = match.tutor?.name ?? 'ton tuteur';

  const { count, error: countError } = await client
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('match_id', match.id);

  if (!countError && (count ?? 0) === 0) {
    await sendMessage({
      matchId: match.id,
      senderId: tutorClerkId || match.tutorId,
      senderRole: 'tutor',
      content: `Bonjour ! Je suis ${tutorName}. J’ai accepté ta demande — dis-moi en quoi je peux t’aider.`,
    });
  }

  return match;
}

/**
 * Le tuteur décline une demande.
 */
export async function declineMatchRequest(matchId) {
  const client = requireSupabase();

  const { data, error } = await client
    .from('matches')
    .update({ status: MATCH_STATUS.DECLINED })
    .eq('id', matchId)
    .select('id, parent_id, tutor_id, status, created_at, tutor:profiles(*)')
    .single();

  if (error) {
    throw new Error(error.message || 'Impossible de décliner la demande.');
  }

  return mapMatch(data);
}

/**
 * Récupère les messages d'un match (ordre chronologique).
 */
export async function fetchMessages(matchId) {
  const client = requireSupabase();

  const { data, error } = await client
    .from('messages')
    .select('id, match_id, sender_id, sender_role, content, created_at')
    .eq('match_id', matchId)
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(error.message || 'Impossible de charger les messages.');
  }

  return (data ?? []).map(mapMessage);
}

/**
 * Envoie un message dans un match.
 */
export async function sendMessage({ matchId, senderId, senderRole, content }) {
  const client = requireSupabase();
  const trimmed = String(content ?? '').trim();

  if (!trimmed) {
    throw new Error('Le message ne peut pas être vide.');
  }

  const { data, error } = await client
    .from('messages')
    .insert({
      match_id: matchId,
      sender_id: senderId,
      sender_role: senderRole,
      content: trimmed,
    })
    .select('id, match_id, sender_id, sender_role, content, created_at')
    .single();

  if (error) {
    throw new Error(error.message || 'Impossible d’envoyer le message.');
  }

  return mapMessage(data);
}

/**
 * Reset de test : vide matches + messages via l'API Supabase.
 */
export async function resetMatchesAndMessages() {
  const client = requireSupabase();

  const { error: messagesError } = await client
    .from('messages')
    .delete()
    .not('id', 'is', null);

  if (messagesError) {
    throw new Error(
      messagesError.message || 'Impossible de vider la table messages.'
    );
  }

  const { error: matchesError } = await client
    .from('matches')
    .delete()
    .not('id', 'is', null);

  if (matchesError) {
    throw new Error(
      matchesError.message || 'Impossible de vider la table matches.'
    );
  }
}
