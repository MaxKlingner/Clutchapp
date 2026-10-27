import { createContext, useContext, useEffect, useRef } from 'react';
import { useAuth } from '@clerk/clerk-expo';

import { useTutorFilters } from '../hooks/useTutorFilters';
import { clearSignupSearchFilters, fetchUserPlace } from './roles';

const ParentSearchContext = createContext(null);

export function ParentSearchProvider({ children }) {
  const filters = useTutorFilters();
  const { userId } = useAuth();
  const seeded = useRef(false);

  useEffect(() => {
    if (!userId || seeded.current) return undefined;
    let cancelled = false;
    fetchUserPlace(userId).then((place) => {
      if (cancelled || !place || seeded.current) return;
      seeded.current = true;
      if (place.city) filters.seedPlace(place);
      if (place.filters) {
        filters.seedSearch(place.filters);
        clearSignupSearchFilters(userId);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [userId, filters.seedPlace, filters.seedSearch]);

  return (
    <ParentSearchContext.Provider value={{ filters }}>
      {children}
    </ParentSearchContext.Provider>
  );
}

export function useParentSearch() {
  const value = useContext(ParentSearchContext);
  if (!value) {
    throw new Error('useParentSearch doit être utilisé dans ParentSearchProvider.');
  }
  return value;
}
