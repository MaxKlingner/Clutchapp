import * as SecureStore from 'expo-secure-store';

import { supabase } from './supabase';

export const ROLES = {
  PARENT: 'parent',
  TUTOR: 'tutor',
};

function localKey(clerkId) {
  return `clutch_user_role_${clerkId}`;
}

async function readLocalRole(clerkId) {
  try {
    const value = await SecureStore.getItemAsync(localKey(clerkId));
    if (value === ROLES.PARENT || value === ROLES.TUTOR) return value;
  } catch {
    // ignore
  }
  return null;
}

async function writeLocalRole(clerkId, role) {
  try {
    await SecureStore.setItemAsync(localKey(clerkId), role);
  } catch {
    // ignore
  }
}

/**
 * Récupère le rôle app (parent | tutor) pour un user Clerk.
 * Priorité : cache local, puis Supabase user_profiles.
 */
export async function getUserRole(clerkId) {
  if (!clerkId) return null;

  const cached = await readLocalRole(clerkId);
  if (cached) return cached;

  if (!supabase) return null;

  const { data, error } = await supabase
    .from('user_profiles')
    .select('role')
    .eq('clerk_id', clerkId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || 'Impossible de charger le rôle.');
  }

  const role = data?.role;
  if (role === ROLES.PARENT || role === ROLES.TUTOR) {
    await writeLocalRole(clerkId, role);
    return role;
  }

  return null;
}

/**
 * Enregistre le choix de rôle (onboarding) en base + localement.
 */
export async function saveUserRole(clerkId, role, fullName = null) {
  if (!clerkId) {
    throw new Error('clerkId requis.');
  }
  if (role !== ROLES.PARENT && role !== ROLES.TUTOR) {
    throw new Error('Rôle invalide.');
  }
  if (!supabase) {
    throw new Error('Supabase n’est pas configuré.');
  }

  const payload = {
    clerk_id: clerkId,
    role,
    full_name: fullName,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('user_profiles')
    .upsert(payload, { onConflict: 'clerk_id' })
    .select('clerk_id, role, full_name')
    .single();

  if (error) {
    throw new Error(error.message || 'Impossible d’enregistrer le rôle.');
  }

  await writeLocalRole(clerkId, role);
  return data;
}
