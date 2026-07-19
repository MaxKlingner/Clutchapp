import { createContext, useCallback, useContext, useMemo, useState } from 'react';

import { getUserRole, ROLES, saveUserRole } from './roles';

const RoleContext = createContext(null);

export function RoleProvider({ children }) {
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [switching, setSwitching] = useState(false);

  const loadRole = useCallback(async (clerkId) => {
    if (!clerkId) {
      setRole(null);
      setLoading(false);
      setError('');
      return null;
    }

    setLoading(true);
    setError('');

    try {
      const saved = await getUserRole(clerkId);
      setRole(saved);
      return saved;
    } catch (err) {
      setError(err?.message ?? 'Impossible de charger ton profil.');
      setRole(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const setRoleSelected = useCallback((nextRole) => {
    setRole(nextRole);
    setError('');
  }, []);

  const switchRole = useCallback(async (clerkId, nextRole, fullName = null) => {
    if (!clerkId) {
      throw new Error('Tu dois être connecté.');
    }
    if (nextRole !== ROLES.PARENT && nextRole !== ROLES.TUTOR) {
      throw new Error('Rôle invalide.');
    }

    setSwitching(true);
    try {
      await saveUserRole(clerkId, nextRole, fullName);
      setRole(nextRole);
      setError('');
      return nextRole;
    } finally {
      setSwitching(false);
    }
  }, []);

  const value = useMemo(
    () => ({
      role,
      loading,
      error,
      switching,
      loadRole,
      setRoleSelected,
      switchRole,
      ROLES,
    }),
    [role, loading, error, switching, loadRole, setRoleSelected, switchRole]
  );

  return (
    <RoleContext.Provider value={value}>{children}</RoleContext.Provider>
  );
}

export function useRole() {
  const ctx = useContext(RoleContext);
  if (!ctx) {
    throw new Error('useRole doit être utilisé dans RoleProvider.');
  }
  return ctx;
}
