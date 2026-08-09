import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@clerk/clerk-expo';

import {
  fetchFavoriteTutorIds,
  toggleFavoriteTutor,
} from '../lib/supabase';

/**
 * Favoris tuteurs avec mise à jour optimiste.
 */
export function useFavoriteTutors() {
  const { userId } = useAuth();
  const [favoriteIds, setFavoriteIds] = useState(() => new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [pendingIds, setPendingIds] = useState(() => new Set());

  const reload = useCallback(async () => {
    if (!userId) {
      setFavoriteIds(new Set());
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const ids = await fetchFavoriteTutorIds(userId);
      setFavoriteIds(new Set(ids));
    } catch (err) {
      setError(err?.message ?? 'Impossible de charger les favoris.');
      setFavoriteIds(new Set());
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    reload();
  }, [reload]);

  const isFavorite = useCallback(
    (tutorId) => (tutorId ? favoriteIds.has(String(tutorId)) : false),
    [favoriteIds]
  );

  const isToggling = useCallback(
    (tutorId) => (tutorId ? pendingIds.has(String(tutorId)) : false),
    [pendingIds]
  );

  const toggleFavorite = useCallback(
    async (tutorId) => {
      if (!userId) {
        const message = 'Connecte-toi pour sauvegarder un tuteur.';
        setError(message);
        throw new Error(message);
      }
      if (!tutorId) return false;

      const id = String(tutorId);
      const wasFavorite = favoriteIds.has(id);

      setPendingIds((prev) => new Set(prev).add(id));
      setFavoriteIds((prev) => {
        const next = new Set(prev);
        if (wasFavorite) next.delete(id);
        else next.add(id);
        return next;
      });
      setError(null);

      try {
        const nowFavorite = await toggleFavoriteTutor(userId, id, wasFavorite);
        setFavoriteIds((prev) => {
          const next = new Set(prev);
          if (nowFavorite) next.add(id);
          else next.delete(id);
          return next;
        });
        return nowFavorite;
      } catch (err) {
        setFavoriteIds((prev) => {
          const next = new Set(prev);
          if (wasFavorite) next.add(id);
          else next.delete(id);
          return next;
        });
        const message = err?.message ?? 'Action favori impossible.';
        setError(message);
        throw err;
      } finally {
        setPendingIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    },
    [userId, favoriteIds]
  );

  return {
    favoriteIds,
    loading,
    error,
    isFavorite,
    isToggling,
    toggleFavorite,
    reload,
  };
}
