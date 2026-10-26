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

const PROFILE_COLUMNS =
  'clerk_id, role, active_role, visited_parent_at, visited_tutor_at, full_name';

function coordinate(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function assertRole(role) {
  if (role !== ROLES.PARENT && role !== ROLES.TUTOR) {
    throw new Error('Rôle invalide.');
  }
}

function activeSide(row) {
  if (row?.active_role === ROLES.PARENT || row?.active_role === ROLES.TUTOR) {
    return row.active_role;
  }
  if (row?.role === ROLES.PARENT || row?.role === ROLES.TUTOR) {
    return row.role;
  }
  return null;
}

function visitPatch(row, side, now) {
  if (side === ROLES.PARENT && !row?.visited_parent_at) {
    return { visited_parent_at: now };
  }
  if (side === ROLES.TUTOR && !row?.visited_tutor_at) {
    return { visited_tutor_at: now };
  }
  return {};
}

async function fetchUserProfile(clerkId) {
  const { data, error } = await supabase
    .from('user_profiles')
    .select(PROFILE_COLUMNS)
    .eq('clerk_id', clerkId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || 'Impossible de charger le profil.');
  }

  return data;
}

/**
 * Côté affiché (parent | tutor) pour un user Clerk.
 * Le rôle d'inscription reste dans user_profiles.role.
 * Priorité : cache local, puis active_role, puis role.
 */
export async function getUserRole(clerkId) {
  if (!clerkId) return null;

  const cached = await readLocalRole(clerkId);
  if (cached) return cached;

  if (!supabase) return null;

  const data = await fetchUserProfile(clerkId);
  const side = activeSide(data);
  if (side) {
    await writeLocalRole(clerkId, side);
    return side;
  }

  return null;
}

/**
 * Enregistre le choix d'inscription. N'écrase pas un rôle d'origine déjà posé.
 */
export async function saveUserRole(clerkId, role, fullName = null) {
  if (!clerkId) {
    throw new Error('clerkId requis.');
  }
  assertRole(role);
  if (!supabase) {
    throw new Error('Supabase n’est pas configuré.');
  }

  const now = new Date().toISOString();

  try {
    const existing = await fetchUserProfile(clerkId);
    const side = existing ? activeSide(existing) || role : role;
    await writeLocalRole(clerkId, existing?.role ? side : role);

    if (!existing) {
      const payload = {
        clerk_id: clerkId,
        role,
        active_role: role,
        full_name: fullName,
        updated_at: now,
        ...visitPatch(null, role, now),
      };

      const { data, error } = await supabase
        .from('user_profiles')
        .insert(payload)
        .select(PROFILE_COLUMNS)
        .single();

      if (error) {
        throw new Error(error.message || 'Impossible d’enregistrer le rôle.');
      }

      return data;
    }

    const patch = {
      updated_at: now,
      ...visitPatch(existing, existing.role ? side : role, now),
    };
    if (!existing.role) patch.role = role;
    if (!existing.active_role) patch.active_role = existing.role || role;
    if (fullName) patch.full_name = fullName;

    const { data, error } = await supabase
      .from('user_profiles')
      .update(patch)
      .eq('clerk_id', clerkId)
      .select(PROFILE_COLUMNS)
      .single();

    if (error) {
      throw new Error(error.message || 'Impossible d’enregistrer le rôle.');
    }

    return data;
  } catch (err) {
    console.warn('[role]', err?.message ?? err);
    await writeLocalRole(clerkId, role);
    return { clerk_id: clerkId, role, active_role: role, full_name: fullName };
  }
}

/**
 * Profil posé à la fin de l'inscription. Échoue si l'écriture ne passe pas,
 * pour que l'écran puisse rester ouvert et être réessayé.
 */
export async function saveSignupProfile({
  clerkId,
  role,
  firstName,
  lastName,
  seekingFor = null,
  city = null,
  postalCode = null,
  latitude = null,
  longitude = null,
  searchFilters = null,
}) {
  if (!clerkId) throw new Error('clerkId requis.');
  assertRole(role);
  if (!supabase) throw new Error('Supabase n’est pas configuré.');

  const now = new Date().toISOString();
  const fullName = [firstName, lastName].filter(Boolean).join(' ').trim() || null;
  const payload = {
    role,
    active_role: role,
    full_name: fullName,
    first_name: firstName || null,
    last_name: lastName || null,
    seeking_for: role === ROLES.PARENT ? seekingFor : null,
    city: city || null,
    postal_code: postalCode || null,
    latitude: coordinate(latitude),
    longitude: coordinate(longitude),
    search_filters: role === ROLES.PARENT ? searchFilters : null,
    updated_at: now,
  };

  const existing = await fetchUserProfile(clerkId);
  if (!existing) {
    const { error } = await supabase.from('user_profiles').insert({
      clerk_id: clerkId,
      ...payload,
      ...visitPatch(null, role, now),
    });
    if (error) {
      throw new Error(error.message || 'Impossible d’enregistrer le profil.');
    }
  } else {
    const { error } = await supabase
      .from('user_profiles')
      .update({
        ...payload,
        role: existing.role || role,
        active_role: existing.active_role || existing.role || role,
        ...visitPatch(existing, existing.role ? activeSide(existing) || role : role, now),
      })
      .eq('clerk_id', clerkId);
    if (error) {
      throw new Error(error.message || 'Impossible d’enregistrer le profil.');
    }
  }

  await writeLocalRole(clerkId, existing?.role ? activeSide(existing) || role : role);
}

export async function fetchUserPlace(clerkId) {
  if (!clerkId || !supabase) return null;
  const { data, error } = await supabase
    .from('user_profiles')
    .select('city, postal_code, latitude, longitude, search_filters')
    .eq('clerk_id', clerkId)
    .maybeSingle();
  if (error || !data || (!data.city && !data.search_filters)) return null;
  return {
    city: data.city,
    postalCode: data.postal_code || null,
    latitude: data.latitude,
    longitude: data.longitude,
    filters: data.search_filters || null,
  };
}

/**
 * Change le côté affiché sans modifier le rôle choisi à l'inscription.
 * Pose la date du premier passage sur ce côté.
 */
export async function setActiveRole(clerkId, activeRole, fullName = null) {
  if (!clerkId) {
    throw new Error('clerkId requis.');
  }
  assertRole(activeRole);
  if (!supabase) {
    throw new Error('Supabase n’est pas configuré.');
  }

  await writeLocalRole(clerkId, activeRole);
  const now = new Date().toISOString();

  try {
    const existing = await fetchUserProfile(clerkId);
    if (!existing) {
      return saveUserRole(clerkId, activeRole, fullName);
    }

    const patch = {
      active_role: activeRole,
      updated_at: now,
      ...visitPatch(existing, activeRole, now),
    };
    if (!existing.role) patch.role = activeRole;
    if (fullName) patch.full_name = fullName;

    const { data, error } = await supabase
      .from('user_profiles')
      .update(patch)
      .eq('clerk_id', clerkId)
      .select(PROFILE_COLUMNS)
      .single();

    if (error) {
      throw new Error(error.message || 'Impossible de changer de côté.');
    }

    return data;
  } catch (err) {
    console.warn('[role]', err?.message ?? err);
    return {
      clerk_id: clerkId,
      role: activeRole,
      active_role: activeRole,
      full_name: fullName,
    };
  }
}
