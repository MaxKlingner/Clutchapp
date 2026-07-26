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
  const reviewCount = Number(row.review_count ?? row.reviewCount ?? 0);

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
    reviewCount: Number.isFinite(reviewCount) ? reviewCount : 0,
    avatarUrl: row.avatar_url ? String(row.avatar_url) : null,
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
  if (!row) return null;
  return {
    id: String(row.id),
    matchId: String(row.match_id),
    senderId: String(row.sender_id),
    senderRole: row.sender_role,
    content: row.content,
    createdAt: row.created_at,
    messageType: row.message_type || 'text',
    hours: row.hours != null ? Number(row.hours) : null,
    amount: row.amount != null ? Number(row.amount) : null,
    hourlyRate: row.hourly_rate != null ? Number(row.hourly_rate) : null,
    paymentStatus: row.payment_status || null,
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
      'id, clerk_id, full_name, subject, hourly_rate, rating, review_count, role, bio, specialties, study_year, avatar_url, created_at'
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

  let avatarUrl = updates.avatarUrl;
  if (updates.localAvatarUri) {
    avatarUrl = await uploadTutorAvatar(clerkId, updates.localAvatarUri);
  }

  const payload = {
    full_name: updates.fullName?.trim() || 'Tuteur',
    bio: updates.bio?.trim() || '',
    specialties,
    subject,
    study_year: updates.studyYear || null,
    hourly_rate: Number(updates.hourlyRate) || 0,
    role: 'tutor',
  };

  if (avatarUrl !== undefined) {
    payload.avatar_url = avatarUrl || null;
  }

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
 * Upload une photo locale vers le bucket public tutor-avatars.
 * Retourne l’URL publique (avec cache-bust).
 */
export async function uploadTutorAvatar(clerkId, localUri) {
  const client = requireSupabase();

  if (!clerkId) {
    throw new Error('clerkId requis pour uploader la photo.');
  }
  if (!localUri) {
    throw new Error('Aucune photo sélectionnée.');
  }

  const clean = String(localUri).split('?')[0];
  const extMatch = clean.match(/\.([a-zA-Z0-9]+)$/);
  const ext = (extMatch?.[1] || 'jpg').toLowerCase();
  const safeExt = ['png', 'webp', 'jpg', 'jpeg'].includes(ext)
    ? ext === 'jpeg'
      ? 'jpg'
      : ext
    : 'jpg';
  const contentType =
    safeExt === 'png'
      ? 'image/png'
      : safeExt === 'webp'
        ? 'image/webp'
        : 'image/jpeg';
  const path = `${clerkId}/avatar.${safeExt}`;

  const response = await fetch(localUri);
  if (!response.ok) {
    throw new Error('Impossible de lire la photo sélectionnée.');
  }
  const arrayBuffer = await response.arrayBuffer();

  const { error } = await client.storage
    .from('tutor-avatars')
    .upload(path, arrayBuffer, {
      contentType,
      upsert: true,
    });

  if (error) {
    throw new Error(
      error.message ||
        'Upload photo impossible. Vérifie que le script supabase/tutor_avatars.sql a été exécuté.'
    );
  }

  const { data } = client.storage.from('tutor-avatars').getPublicUrl(path);
  if (!data?.publicUrl) {
    throw new Error('URL publique de la photo introuvable.');
  }

  return `${data.publicUrl}?t=${Date.now()}`;
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

/**
 * Parent : crée (ou rouvre) une demande pending et envoie le premier message.
 */
export async function startTutorConversation({
  parentId,
  tutorId,
  content,
  senderId,
}) {
  const client = requireSupabase();
  const trimmed = String(content ?? '').trim();

  if (!parentId || !tutorId) {
    throw new Error('parentId et tutorId sont requis.');
  }
  if (!trimmed) {
    throw new Error('Le message ne peut pas être vide.');
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

  let matchRow = existing;

  if (!matchRow) {
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
      throw new Error(error.message || 'Impossible de créer la demande.');
    }
    matchRow = created;
  } else if (matchRow.status === MATCH_STATUS.DECLINED) {
    const { data: reopened, error } = await client
      .from('matches')
      .update({ status: MATCH_STATUS.PENDING })
      .eq('id', matchRow.id)
      .select('id, parent_id, tutor_id, status, created_at, tutor:profiles(*)')
      .single();

    if (error) {
      throw new Error(error.message || 'Impossible de rouvrir la demande.');
    }
    matchRow = reopened;
  }

  const match = mapMatch(matchRow);

  await sendMessage({
    matchId: match.id,
    senderId: senderId || parentId,
    senderRole: 'parent',
    content: trimmed,
  });

  return match;
}

/**
 * Charge un match par id (parent ou tuteur).
 */
export async function fetchMatchById(matchId) {
  const client = requireSupabase();
  if (!matchId) return null;

  const { data, error } = await client
    .from('matches')
    .select('id, parent_id, tutor_id, status, created_at, tutor:profiles(*)')
    .eq('id', matchId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || 'Impossible de charger la conversation.');
  }
  if (!data) return null;

  const [withParent] = await attachParentProfiles([data]);
  return withParent;
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
    .select(
      'id, match_id, sender_id, sender_role, content, created_at, message_type, hours, amount, hourly_rate, payment_status'
    )
    .eq('match_id', matchId)
    .order('created_at', { ascending: true });

  if (error) {
    throw new Error(error.message || 'Impossible de charger les messages.');
  }

  return (data ?? []).map(mapMessage);
}

/**
 * Écoute INSERT + UPDATE des messages d'un match en temps réel.
 * Retourne une fonction de cleanup (unsubscribe).
 */
export function subscribeToMatchMessages(matchId, { onInsert, onUpdate } = {}) {
  const client = requireSupabase();

  if (!matchId) {
    return () => {};
  }

  const channel = client
    .channel(`messages-match-${matchId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `match_id=eq.${matchId}`,
      },
      (payload) => {
        try {
          onInsert?.(mapMessage(payload.new));
        } catch {
          // ignore
        }
      }
    )
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'messages',
        filter: `match_id=eq.${matchId}`,
      },
      (payload) => {
        try {
          onUpdate?.(mapMessage(payload.new));
        } catch {
          // ignore
        }
      }
    )
    .subscribe();

  return () => {
    client.removeChannel(channel);
  };
}

/**
 * Envoie un message texte dans un match.
 */
export async function sendMessage({ matchId, senderId, senderRole, content }) {
  const client = requireSupabase();
  const trimmed = String(content ?? '').trim();

  if (!trimmed) {
    throw new Error('Le message ne peut pas être vide.');
  }

  const role =
    senderRole === 'tutor' || senderRole === 'parent' ? senderRole : 'parent';

  const { data, error } = await client
    .from('messages')
    .insert({
      match_id: matchId,
      sender_id: senderId,
      sender_role: role,
      content: trimmed,
      message_type: 'text',
    })
    .select(
      'id, match_id, sender_id, sender_role, content, created_at, message_type, hours, amount, hourly_rate, payment_status'
    )
    .single();

  if (error) {
    throw new Error(error.message || 'Impossible d’envoyer le message.');
  }

  return mapMessage(data);
}

/**
 * Tuteur : demande de paiement (heures × tarif horaire).
 */
export async function sendPaymentRequest({
  matchId,
  senderId,
  hours,
  hourlyRate,
}) {
  const client = requireSupabase();
  const h = Number(hours);
  const rate = Number(hourlyRate);

  if (!matchId || !senderId) {
    throw new Error('matchId et senderId requis.');
  }
  if (!Number.isFinite(h) || h <= 0) {
    throw new Error('Nombre d’heures invalide.');
  }
  if (!Number.isFinite(rate) || rate < 0) {
    throw new Error('Tarif horaire invalide.');
  }

  const amount = Math.round(h * rate * 100) / 100;
  const hoursLabel = Number.isInteger(h) ? `${h}` : String(h);
  const content = `Demande de paiement : ${hoursLabel}h de cours — ${amount.toFixed(2)} €`;

  const { data, error } = await client
    .from('messages')
    .insert({
      match_id: matchId,
      sender_id: senderId,
      sender_role: 'tutor',
      content,
      message_type: 'payment_request',
      hours: h,
      amount,
      hourly_rate: rate,
      payment_status: 'pending',
    })
    .select(
      'id, match_id, sender_id, sender_role, content, created_at, message_type, hours, amount, hourly_rate, payment_status'
    )
    .single();

  if (error) {
    throw new Error(error.message || 'Impossible d’envoyer la demande.');
  }

  return mapMessage(data);
}

/**
 * Crée / charge le wallet d'un user Clerk (solde initial 50 €).
 */
export async function ensureWallet(clerkId, initialBalance = 50) {
  const client = requireSupabase();
  if (!clerkId) throw new Error('clerkId requis.');

  const { data: existing, error: existingError } = await client
    .from('wallets')
    .select('clerk_id, balance, updated_at')
    .eq('clerk_id', clerkId)
    .maybeSingle();

  if (existingError) {
    throw new Error(existingError.message || 'Impossible de charger le wallet.');
  }

  if (existing) {
    return {
      clerkId: existing.clerk_id,
      balance: Number(existing.balance) || 0,
      updatedAt: existing.updated_at,
    };
  }

  const { data: created, error } = await client
    .from('wallets')
    .insert({
      clerk_id: clerkId,
      balance: initialBalance,
    })
    .select('clerk_id, balance, updated_at')
    .single();

  if (error) {
    throw new Error(error.message || 'Impossible de créer le wallet.');
  }

  return {
    clerkId: created.clerk_id,
    balance: Number(created.balance) || 0,
    updatedAt: created.updated_at,
  };
}

/**
 * Enregistre l'Expo Push Token pour un user Clerk (user_profiles + profiles).
 */
export async function saveExpoPushToken(clerkId, token) {
  const client = requireSupabase();
  if (!clerkId || !token) {
    throw new Error('clerkId et token requis.');
  }

  const now = new Date().toISOString();

  const { data: existing, error: existingError } = await client
    .from('user_profiles')
    .select('clerk_id, role')
    .eq('clerk_id', clerkId)
    .maybeSingle();

  if (existingError) {
    throw new Error(
      existingError.message || 'Impossible de charger le profil user.'
    );
  }

  if (existing) {
    const { error } = await client
      .from('user_profiles')
      .update({ expo_push_token: token, updated_at: now })
      .eq('clerk_id', clerkId);
    if (error) {
      throw new Error(error.message || 'Impossible de sauver le push token.');
    }
  } else {
    const { error } = await client.from('user_profiles').insert({
      clerk_id: clerkId,
      role: 'parent',
      expo_push_token: token,
      updated_at: now,
    });
    if (error) {
      throw new Error(error.message || 'Impossible de créer le profil push.');
    }
  }

  // Miroir sur le profil tuteur s'il existe
  await client
    .from('profiles')
    .update({ expo_push_token: token })
    .eq('clerk_id', clerkId);

  return token;
}

/**
 * Crédite le wallet (recharge Stripe).
 */
export async function creditWallet(clerkId, amount) {
  const client = requireSupabase();
  const delta = Number(amount);
  if (!clerkId || !Number.isFinite(delta) || delta <= 0) {
    throw new Error('Montant de crédit invalide.');
  }

  const wallet = await ensureWallet(clerkId);
  const next = Math.round((wallet.balance + delta) * 100) / 100;

  const { data, error } = await client
    .from('wallets')
    .update({
      balance: next,
      updated_at: new Date().toISOString(),
    })
    .eq('clerk_id', clerkId)
    .select('clerk_id, balance, updated_at')
    .single();

  if (error) {
    throw new Error(error.message || 'Impossible de créditer le wallet.');
  }

  return {
    clerkId: data.clerk_id,
    balance: Number(data.balance) || 0,
    updatedAt: data.updated_at,
  };
}

/**
 * Parent paie une demande de cours : débite parent, crédite tuteur, marque payé.
 */
export async function payPaymentRequest({
  messageId,
  parentClerkId,
  tutorClerkId,
}) {
  const client = requireSupabase();

  if (!messageId || !parentClerkId || !tutorClerkId) {
    throw new Error('Paramètres de paiement incomplets.');
  }

  const { data: message, error: messageError } = await client
    .from('messages')
    .select(
      'id, match_id, sender_id, sender_role, content, created_at, message_type, hours, amount, hourly_rate, payment_status'
    )
    .eq('id', messageId)
    .single();

  if (messageError || !message) {
    throw new Error(messageError?.message || 'Demande introuvable.');
  }

  if (message.message_type !== 'payment_request') {
    throw new Error('Ce message n’est pas une demande de paiement.');
  }

  if (message.payment_status === 'paid') {
    return { alreadyPaid: true, message: mapMessage(message) };
  }

  if (
    message.payment_status === 'cancelled' ||
    message.payment_status === 'disputed'
  ) {
    throw new Error('Cette demande n’est plus payable.');
  }

  const amount = Number(message.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Montant invalide.');
  }

  const parentWallet = await ensureWallet(parentClerkId);
  if (parentWallet.balance < amount) {
    const err = new Error(
      `Solde insuffisant (${parentWallet.balance.toFixed(2)} €). Recharge ton wallet.`
    );
    err.code = 'INSUFFICIENT_FUNDS';
    err.balance = parentWallet.balance;
    err.amount = amount;
    throw err;
  }

  await ensureWallet(tutorClerkId, 0);

  const parentNext =
    Math.round((parentWallet.balance - amount) * 100) / 100;

  const { data: tutorWalletRow, error: tutorReadError } = await client
    .from('wallets')
    .select('balance')
    .eq('clerk_id', tutorClerkId)
    .single();

  if (tutorReadError) {
    throw new Error(tutorReadError.message || 'Wallet tuteur introuvable.');
  }

  const tutorNext =
    Math.round((Number(tutorWalletRow.balance) + amount) * 100) / 100;
  const now = new Date().toISOString();

  const { error: parentUpdateError } = await client
    .from('wallets')
    .update({ balance: parentNext, updated_at: now })
    .eq('clerk_id', parentClerkId);

  if (parentUpdateError) {
    throw new Error(parentUpdateError.message || 'Débit parent impossible.');
  }

  const { error: tutorUpdateError } = await client
    .from('wallets')
    .update({ balance: tutorNext, updated_at: now })
    .eq('clerk_id', tutorClerkId);

  if (tutorUpdateError) {
    // tentative de rollback parent
    await client
      .from('wallets')
      .update({ balance: parentWallet.balance, updated_at: now })
      .eq('clerk_id', parentClerkId);
    throw new Error(tutorUpdateError.message || 'Crédit tuteur impossible.');
  }

  const hoursLabel =
    message.hours != null
      ? Number.isInteger(Number(message.hours))
        ? `${Number(message.hours)}`
        : String(message.hours)
      : '?';
  const paidContent = `Payé ✓ — ${hoursLabel}h de cours — ${amount.toFixed(2)} €`;

  const { data: updatedMessage, error: statusError } = await client
    .from('messages')
    .update({
      payment_status: 'paid',
      content: paidContent,
    })
    .eq('id', messageId)
    .select(
      'id, match_id, sender_id, sender_role, content, created_at, message_type, hours, amount, hourly_rate, payment_status'
    )
    .single();

  if (statusError) {
    throw new Error(statusError.message || 'Statut message non mis à jour.');
  }

  const { error: txError } = await client.from('payment_transactions').upsert(
    {
      message_id: messageId,
      match_id: message.match_id,
      parent_clerk_id: parentClerkId,
      tutor_clerk_id: tutorClerkId,
      amount,
      status: 'completed',
      is_frozen: false,
    },
    { onConflict: 'message_id' }
  );

  if (txError) {
    throw new Error(
      txError.message || 'Impossible d’enregistrer la transaction.'
    );
  }

  return {
    alreadyPaid: false,
    message: mapMessage(updatedMessage),
    parentBalance: parentNext,
    tutorBalance: tutorNext,
    amount,
  };
}

/**
 * Tuteur : annule une demande de paiement encore en attente.
 */
export async function cancelPaymentRequest(messageId, tutorClerkId) {
  const client = requireSupabase();

  const { data: message, error: messageError } = await client
    .from('messages')
    .select(
      'id, match_id, sender_id, sender_role, content, created_at, message_type, hours, amount, hourly_rate, payment_status'
    )
    .eq('id', messageId)
    .single();

  if (messageError || !message) {
    throw new Error(messageError?.message || 'Demande introuvable.');
  }

  if (message.message_type !== 'payment_request') {
    throw new Error('Ce message n’est pas une demande de paiement.');
  }

  if (String(message.sender_id) !== String(tutorClerkId)) {
    throw new Error('Seul l’auteur peut annuler cette demande.');
  }

  if (message.payment_status !== 'pending') {
    throw new Error('Seule une demande en attente peut être annulée.');
  }

  const hoursLabel =
    message.hours != null
      ? Number.isInteger(Number(message.hours))
        ? `${Number(message.hours)}`
        : String(message.hours)
      : '?';
  const amount = Number(message.amount) || 0;
  const content = `Annulé — demande de ${hoursLabel}h (${amount.toFixed(2)} €)`;

  const { data, error } = await client
    .from('messages')
    .update({
      payment_status: 'cancelled',
      content,
    })
    .eq('id', messageId)
    .eq('payment_status', 'pending')
    .select(
      'id, match_id, sender_id, sender_role, content, created_at, message_type, hours, amount, hourly_rate, payment_status'
    )
    .single();

  if (error) {
    throw new Error(error.message || 'Annulation impossible.');
  }

  return mapMessage(data);
}

/**
 * Parent : signale un litige après paiement → fonds gelés côté tuteur.
 */
export async function disputePayment({
  messageId,
  parentClerkId,
  reason = null,
}) {
  const client = requireSupabase();

  const { data: message, error: messageError } = await client
    .from('messages')
    .select(
      'id, match_id, sender_id, sender_role, content, created_at, message_type, hours, amount, hourly_rate, payment_status'
    )
    .eq('id', messageId)
    .single();

  if (messageError || !message) {
    throw new Error(messageError?.message || 'Paiement introuvable.');
  }

  if (message.message_type !== 'payment_request') {
    throw new Error('Ce message n’est pas un paiement de cours.');
  }

  if (message.payment_status === 'disputed') {
    return { alreadyDisputed: true, message: mapMessage(message) };
  }

  if (message.payment_status !== 'paid') {
    throw new Error('Seuls les paiements confirmés peuvent être signalés.');
  }

  const hoursLabel =
    message.hours != null
      ? Number.isInteger(Number(message.hours))
        ? `${Number(message.hours)}`
        : String(message.hours)
      : '?';
  const amount = Number(message.amount) || 0;
  const content = `Litige — ${hoursLabel}h · ${amount.toFixed(2)} € (fonds gelés)`;
  const now = new Date().toISOString();

  const { data: updatedMessage, error: statusError } = await client
    .from('messages')
    .update({
      payment_status: 'disputed',
      content,
    })
    .eq('id', messageId)
    .select(
      'id, match_id, sender_id, sender_role, content, created_at, message_type, hours, amount, hourly_rate, payment_status'
    )
    .single();

  if (statusError) {
    throw new Error(statusError.message || 'Impossible d’ouvrir le litige.');
  }

  const { data: existingTx } = await client
    .from('payment_transactions')
    .select('id')
    .eq('message_id', messageId)
    .maybeSingle();

  if (existingTx?.id) {
    const { error: txError } = await client
      .from('payment_transactions')
      .update({
        status: 'disputed',
        is_frozen: true,
        disputed_at: now,
        dispute_reason: reason || 'Signalé par le parent via le chat',
      })
      .eq('message_id', messageId);

    if (txError) {
      throw new Error(txError.message || 'Gel des fonds impossible.');
    }
  } else {
    // Paiement antérieur sans ligne transaction : on recrée le gel
    const { error: insertError } = await client
      .from('payment_transactions')
      .insert({
        message_id: messageId,
        match_id: message.match_id,
        parent_clerk_id: parentClerkId,
        tutor_clerk_id: message.sender_id,
        amount,
        status: 'disputed',
        is_frozen: true,
        disputed_at: now,
        dispute_reason: reason || 'Signalé par le parent via le chat',
      });

    if (insertError) {
      throw new Error(insertError.message || 'Création du litige impossible.');
    }
  }

  return {
    alreadyDisputed: false,
    message: mapMessage(updatedMessage),
  };
}

/**
 * Historique des paiements pour un parent ou un tuteur.
 */
export async function fetchPaymentTransactions(clerkId, role = 'parent') {
  const client = requireSupabase();
  if (!clerkId) return [];

  const column =
    String(role).toLowerCase() === 'tutor'
      ? 'tutor_clerk_id'
      : 'parent_clerk_id';

  const { data, error } = await client
    .from('payment_transactions')
    .select(
      'id, amount, status, is_frozen, created_at, disputed_at, dispute_reason'
    )
    .eq(column, clerkId)
    .order('created_at', { ascending: false })
    .limit(30);

  if (error) {
    // Table absente sur certains environnements de test
    return [];
  }

  return (data ?? []).map((row) => ({
    id: String(row.id),
    amount: Number(row.amount) || 0,
    status: row.status || 'completed',
    isFrozen: Boolean(row.is_frozen),
    createdAt: row.created_at,
    disputedAt: row.disputed_at,
    disputeReason: row.dispute_reason || null,
  }));
}

/**
 * Solde tuteur disponible au retrait (hors montants gelés / litiges).
 */
export async function getTutorWithdrawableBalance(clerkId) {
  const client = requireSupabase();
  const wallet = await ensureWallet(clerkId, 0);

  const { data, error } = await client
    .from('payment_transactions')
    .select('amount')
    .eq('tutor_clerk_id', clerkId)
    .eq('is_frozen', true);

  if (error) {
    throw new Error(error.message || 'Impossible de charger les fonds gelés.');
  }

  const frozen = (data ?? []).reduce(
    (sum, row) => sum + (Number(row.amount) || 0),
    0
  );
  const available = Math.max(
    0,
    Math.round((wallet.balance - frozen) * 100) / 100
  );

  return {
    balance: wallet.balance,
    frozen: Math.round(frozen * 100) / 100,
    available,
  };
}

/**
 * Tableau de bord tuteur : gains, stats cours, avis récents.
 */
export async function fetchTutorDashboard(clerkId, fullName = null) {
  const client = requireSupabase();
  const profile = await ensureTutorProfile({ clerkId, fullName });
  const walletSummary = await getTutorWithdrawableBalance(clerkId);

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  let transactions = [];
  let reviewRows = [];

  {
    const { data: txRows, error: txError } = await client
      .from('payment_transactions')
      .select('amount, status, created_at, message_id')
      .eq('tutor_clerk_id', clerkId)
      .in('status', ['completed', 'disputed'])
      .order('created_at', { ascending: false });
    if (!txError) transactions = txRows ?? [];
  }

  {
    const { data: rows, error: reviewError } = await client
      .from('reviews')
      .select('id, rating, comment, created_at, reviewer_id')
      .eq('tutor_id', profile.id)
      .order('created_at', { ascending: false })
      .limit(8);
    if (!reviewError) reviewRows = rows ?? [];
  }

  const completed = transactions.filter((row) => row.status === 'completed');

  let hoursTaught = 0;
  if (completed.length) {
    const messageIds = completed
      .map((row) => row.message_id)
      .filter(Boolean);
    if (messageIds.length) {
      const { data: paidMessages, error: hoursError } = await client
        .from('messages')
        .select('id, hours')
        .in('id', messageIds);
      if (!hoursError) {
        hoursTaught = (paidMessages ?? []).reduce(
          (sum, row) => sum + (Number(row.hours) || 0),
          0
        );
      }
    }
  }

  const coursesDone = completed.length;
  const totalEarnings = Math.round(walletSummary.balance * 100) / 100;
  const monthEarnings =
    Math.round(
      completed
        .filter((row) => new Date(row.created_at) >= monthStart)
        .reduce((sum, row) => sum + (Number(row.amount) || 0), 0) * 100
    ) / 100;

  const reviewerIds = [
    ...new Set(reviewRows.map((row) => row.reviewer_id).filter(Boolean)),
  ];
  let reviewersById = new Map();
  if (reviewerIds.length) {
    const { data: reviewers, error: reviewersError } = await client
      .from('user_profiles')
      .select('clerk_id, full_name')
      .in('clerk_id', reviewerIds);
    if (!reviewersError) {
      reviewersById = new Map(
        (reviewers ?? []).map((row) => [
          row.clerk_id,
          row.full_name || 'Parent',
        ])
      );
    }
  }

  const reviews = reviewRows.map((row) => {
    const full = reviewersById.get(row.reviewer_id) || 'Parent';
    const first = String(full).trim().split(/\s+/)[0] || 'Parent';
    return {
      id: String(row.id),
      rating: Number(row.rating) || 0,
      comment: row.comment ? String(row.comment) : '',
      createdAt: row.created_at,
      reviewerFirstName: first,
    };
  });

  return {
    profile,
    available: walletSummary.available,
    frozen: walletSummary.frozen,
    totalEarnings,
    monthEarnings,
    coursesDone,
    hoursTaught: Math.round(hoursTaught * 10) / 10,
    rating: profile.rating || 0,
    reviewCount: profile.reviewCount || 0,
    reviews,
  };
}

/**
 * Vérifie si un match a déjà un avis.
 */
export async function hasReviewForMatch(matchId) {
  const client = requireSupabase();
  if (!matchId) return false;

  const { data, error } = await client
    .from('reviews')
    .select('id')
    .eq('match_id', matchId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || 'Impossible de vérifier les avis.');
  }

  return Boolean(data?.id);
}

/**
 * Recalcule la moyenne + compte d'avis d'un tuteur sur profiles.
 */
async function refreshTutorRating(tutorId) {
  const client = requireSupabase();

  const { data: rows, error } = await client
    .from('reviews')
    .select('rating')
    .eq('tutor_id', tutorId);

  if (error) {
    throw new Error(error.message || 'Impossible de recalculer la note.');
  }

  const list = rows ?? [];
  const count = list.length;
  const average =
    count === 0
      ? 0
      : Math.round(
          (list.reduce((sum, row) => sum + Number(row.rating || 0), 0) /
            count) *
            10
        ) / 10;

  const { error: updateError } = await client
    .from('profiles')
    .update({
      rating: average,
      review_count: count,
    })
    .eq('id', tutorId);

  if (updateError) {
    throw new Error(updateError.message || 'Mise à jour de la note impossible.');
  }

  return { average, count };
}

/**
 * Parent : enregistre un avis après un cours payé (1 avis / match).
 */
export async function submitReview({
  matchId,
  reviewerId,
  tutorId,
  rating,
  comment = '',
}) {
  const client = requireSupabase();
  const stars = Number(rating);

  if (!matchId || !reviewerId || !tutorId) {
    throw new Error('Paramètres d’avis incomplets.');
  }
  if (!Number.isInteger(stars) || stars < 1 || stars > 5) {
    throw new Error('La note doit être un entier entre 1 et 5.');
  }

  const already = await hasReviewForMatch(matchId);
  if (already) {
    const err = new Error('Ce cours a déjà été noté.');
    err.code = 'ALREADY_REVIEWED';
    throw err;
  }

  const trimmed = String(comment ?? '').trim();

  const { data, error } = await client
    .from('reviews')
    .insert({
      match_id: matchId,
      reviewer_id: reviewerId,
      tutor_id: tutorId,
      rating: stars,
      comment: trimmed || null,
    })
    .select('id, match_id, reviewer_id, tutor_id, rating, comment, created_at')
    .single();

  if (error) {
    if (String(error.message || '').toLowerCase().includes('duplicate')) {
      const err = new Error('Ce cours a déjà été noté.');
      err.code = 'ALREADY_REVIEWED';
      throw err;
    }
    throw new Error(error.message || 'Impossible d’enregistrer l’avis.');
  }

  const stats = await refreshTutorRating(tutorId);

  return {
    review: {
      id: String(data.id),
      matchId: String(data.match_id),
      reviewerId: String(data.reviewer_id),
      tutorId: String(data.tutor_id),
      rating: Number(data.rating),
      comment: data.comment || '',
      createdAt: data.created_at,
    },
    tutorRating: stats.average,
    reviewCount: stats.count,
  };
}

/**
 * Reset de test : vide matches + messages via l'API Supabase.
 */
export async function resetMatchesAndMessages() {
  const client = requireSupabase();

  const { error: txError } = await client
    .from('payment_transactions')
    .delete()
    .not('id', 'is', null);

  if (txError) {
    // table peut ne pas exister encore en vieux env
  }

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

/**
 * Reset de test : remet l'annonce du compte connecté à l'état "non publiée".
 * Ne touche aucun autre profil / annonce de testeur.
 */
export async function resetMyTutorAnnouncement(clerkId) {
  const client = requireSupabase();

  if (!clerkId) {
    throw new Error('Aucun compte actif pour réinitialiser l’annonce.');
  }

  const { data: existing, error: findError } = await client
    .from('profiles')
    .select('id, clerk_id')
    .eq('clerk_id', clerkId)
    .maybeSingle();

  if (findError) {
    throw new Error(
      findError.message || 'Impossible de trouver ton profil tuteur.'
    );
  }

  if (!existing) {
    throw new Error('Aucun profil tuteur pour ce compte.');
  }

  const { data, error } = await client
    .from('profiles')
    .update({
      subject: 'Matière',
      specialties: [],
      bio: '',
      study_year: 'Master 1',
      hourly_rate: 25,
      role: 'tutor',
    })
    .eq('clerk_id', clerkId)
    .select('*')
    .single();

  if (error) {
    throw new Error(
      error.message || 'Impossible de réinitialiser ton annonce.'
    );
  }

  return mapTutorProfile(data);
}
