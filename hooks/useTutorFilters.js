import { useCallback, useEffect, useRef, useState } from 'react';
import { NativeModules } from 'react-native';

import { suggestLocations, tutorMatchesLocation } from '../lib/geo';
import {
  STUDENT_LEVELS,
  STUDENT_LEVEL_GROUPS,
  STUDY_YEARS,
  studentLevelGroupId,
  normalizeTeachingFormats,
  tutorMatchesCourseType,
} from '../lib/tutorConstants';

export const PRICE_STEPS = [15, 20, 25, 30, 35, 40, 45, 50, null];
export const RADIUS_STEPS = [5, 10, 15, 20, 30, 50, null];
export const STUDENT_STEPS = [null, ...STUDENT_LEVELS];

function foldText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function subjectNamesMatch(name, query) {
  const left = foldText(name);
  const right = foldText(query);
  if (!left || !right) return false;
  if (left === right || left.startsWith(right) || right.startsWith(left)) return true;
  if (left.includes(right) || right.includes(left)) return true;
  const limit = Math.min(left.length, right.length);
  let shared = 0;
  while (shared < limit && left[shared] === right[shared]) shared += 1;
  return shared >= 4 || (shared >= 3 && (shared === left.length || shared === right.length));
}

function tutorMatchesSubject(tutor, query) {
  const needle = foldText(query);
  if (!needle) return true;
  return (tutor.specialties ?? []).some((skill) => subjectNamesMatch(skill, needle));
}

function nearestStepIndex(steps, value) {
  const exact = steps.findIndex((step) => Object.is(step, value));
  if (exact >= 0) return exact;
  let best = steps.length - 1;
  let bestDistance = Infinity;
  steps.forEach((step, index) => {
    if (typeof step !== 'number' || typeof value !== 'number') return;
    const distance = Math.abs(step - value);
    if (distance < bestDistance) {
      best = index;
      bestDistance = distance;
    }
  });
  return best;
}

function getLocationModule() {
  if (!NativeModules.ExpoLocation) return null;
  try {
    return require('expo-location');
  } catch {
    return null;
  }
}

function placeLabel(place, fallback) {
  if (!place) return fallback;
  const city = place.city || place.district || place.subregion || place.name;
  if (!city) return fallback;
  return place.postalCode ? `${city} ${place.postalCode}` : city;
}

async function geocodeAddress(query) {
  const Location = getLocationModule();
  if (Location) {
    try {
      const results = await Location.geocodeAsync(`${query}, Belgique`);
      const first = results?.[0];
      if (first && Number.isFinite(first.latitude) && Number.isFinite(first.longitude)) {
        let label = query;
        try {
          const reversed = await Location.reverseGeocodeAsync({
            latitude: first.latitude,
            longitude: first.longitude,
          });
          label = placeLabel(reversed?.[0], query);
        } catch {
          // keep the typed label
        }
        return [
          {
            key: `geo-${first.latitude.toFixed(4)}`,
            label,
            latitude: first.latitude,
            longitude: first.longitude,
          },
        ];
      }
    } catch {
      // fall through to the online geocoder
    }
  }

  try {
    const url =
      'https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&countrycodes=be&limit=4&q=' +
      encodeURIComponent(query);
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Clutch/1.0 (tutor search)',
      },
    });
    if (!response.ok) return [];
    const rows = await response.json();
    return (Array.isArray(rows) ? rows : [])
      .map((row) => {
        const address = row.address || {};
        const city =
          address.city ||
          address.town ||
          address.village ||
          address.municipality ||
          row.name;
        const label =
          [address.road, city].filter(Boolean).join(', ') ||
          String(row.display_name || query).split(',')[0];
        return {
          key: `osm-${row.place_id}`,
          label,
          latitude: Number(row.lat),
          longitude: Number(row.lon),
        };
      })
      .filter(
        (item) => Number.isFinite(item.latitude) && Number.isFinite(item.longitude)
      );
  } catch {
    return [];
  }
}

export function useTutorFilters() {
  const [activeFilter, setActiveFilter] = useState(null);
  const [cityQuery, setCityQuery] = useState('');
  const [searchOrigin, setSearchOrigin] = useState(null);
  const [locationSuggestions, setLocationSuggestions] = useState([]);
  const [radiusKm, setRadiusKm] = useState(null);
  const [formatFilters, setFormatFilters] = useState([]);
  const [maxHourlyRate, setMaxHourlyRate] = useState(null);
  const [studentLevelGroups, setStudentLevelGroups] = useState([]);
  const [tutorYearFilters, setTutorYearFilters] = useState([]);
  const [expandedFilter, setExpandedFilter] = useState(null);
  const radiusKmRef = useRef(null);
  const cityQueryRef = useRef('');
  const suppressGeocode = useRef(false);
  const onDeckReset = useRef(() => {});
  radiusKmRef.current = radiusKm;
  cityQueryRef.current = cityQuery;

  const resetDeck = useCallback(() => {
    onDeckReset.current();
  }, []);

  const matchesTutor = useCallback(
    (tutor) => {
      if (activeFilter && !tutorMatchesSubject(tutor, activeFilter)) {
        return false;
      }

      if (!tutorMatchesLocation(tutor, cityQuery, radiusKm, searchOrigin)) {
        return false;
      }

      if (!tutorMatchesCourseType(tutor.teachingFormats, formatFilters)) {
        return false;
      }

      if (maxHourlyRate != null && Number(tutor.hourlyRate) > maxHourlyRate) {
        return false;
      }

      if (studentLevelGroups.length > 0) {
        const accepted = new Set(
          STUDENT_LEVEL_GROUPS.filter((group) => studentLevelGroups.includes(group.id)).flatMap(
            (group) => group.levels
          )
        );
        const levels = tutor.taughtLevels ?? [];
        if (!levels.some((level) => accepted.has(level))) return false;
      }

      if (
        tutorYearFilters.length > 0 &&
        !tutorYearFilters.includes(tutor.studyYear)
      ) {
        return false;
      }

      return true;
    },
    [
      activeFilter,
      cityQuery,
      searchOrigin,
      radiusKm,
      formatFilters,
      maxHourlyRate,
      studentLevelGroups,
      tutorYearFilters,
    ]
  );

  const onSelectFilter = useCallback(
    (label) => {
      setActiveFilter((prev) => (prev === label ? null : label));
      resetDeck();
    },
    [resetDeck]
  );

  const setSubjectFilter = useCallback(
    (label) => {
      setActiveFilter(label || null);
      resetDeck();
    },
    [resetDeck]
  );

  const onSelectRadius = useCallback(
    (value) => {
      setRadiusKm(value);
      resetDeck();
    },
    [resetDeck]
  );

  const onToggleFormatFilter = useCallback(
    (format) => {
      setFormatFilters((prev) =>
        prev.includes(format)
          ? prev.filter((item) => item !== format)
          : [...prev, format]
      );
      resetDeck();
    },
    [resetDeck]
  );

  const clearFormats = useCallback(() => {
    setFormatFilters([]);
    resetDeck();
  }, [resetDeck]);

  const replaceFormatFilters = useCallback((next) => {
    setFormatFilters(Array.isArray(next) ? next : []);
    resetDeck();
  }, [resetDeck]);

  const clearAllFilters = useCallback(() => {
    setActiveFilter(null);
    setCityQuery('');
    setSearchOrigin(null);
    setLocationSuggestions([]);
    setRadiusKm(null);
    setFormatFilters([]);
    setMaxHourlyRate(null);
    setStudentLevelGroups([]);
    setTutorYearFilters([]);
    resetDeck();
  }, [resetDeck]);

  const rememberOrigin = useCallback(
    (origin) => {
      setSearchOrigin(origin);
      if (radiusKmRef.current == null) setRadiusKm(10);
      resetDeck();
    },
    [resetDeck]
  );

  const seedPlace = useCallback((place) => {
    if (cityQueryRef.current.trim()) return;
    const city = String(place?.city || '').trim();
    if (!city) return;
    const label = [city, place.postalCode].filter(Boolean).join(' ');
    suppressGeocode.current = true;
    setCityQuery(label);
    setLocationSuggestions([]);
    const latitude = Number(place.latitude);
    const longitude = Number(place.longitude);
    if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
      setSearchOrigin({ latitude, longitude, label: city });
    }
  }, []);

  const seedSearch = useCallback(
    (saved) => {
      if (saved?.subject && saved.subject !== 'Autre') setActiveFilter(saved.subject);
      if (saved?.studentLevel) {
        const groupId = studentLevelGroupId(saved.studentLevel);
        if (groupId) setStudentLevelGroups([groupId]);
      }
      if (saved?.format) setFormatFilters(normalizeTeachingFormats([saved.format]));
      resetDeck();
    },
    [resetDeck]
  );

  const selectSuggestion = useCallback(
    (item) => {
      suppressGeocode.current = true;
      setCityQuery(item.label);
      setLocationSuggestions([]);
      rememberOrigin({
        latitude: item.latitude,
        longitude: item.longitude,
        label: item.label,
      });
    },
    [rememberOrigin]
  );

  const onCityChange = useCallback(
    (text) => {
      suppressGeocode.current = false;
      setCityQuery(text);
      setSearchOrigin(null);
      resetDeck();
    },
    [resetDeck]
  );

  const toggleFilterSection = useCallback((key) => {
    setExpandedFilter((prev) => (prev === key ? null : key));
  }, []);

  const onSelectMaxPrice = useCallback(
    (value) => {
      setMaxHourlyRate(value);
      resetDeck();
    },
    [resetDeck]
  );

  const onSelectStudentLevel = useCallback(
    (level) => {
      const groupId = studentLevelGroupId(level);
      setStudentLevelGroups(groupId ? [groupId] : []);
      resetDeck();
    },
    [resetDeck]
  );

  const setLevelFilters = useCallback(
    (groups) => {
      const next = (Array.isArray(groups) ? groups : []).filter((id) =>
        STUDENT_LEVEL_GROUPS.some((group) => group.id === id)
      );
      setStudentLevelGroups(next);
      resetDeck();
    },
    [resetDeck]
  );

  const onSelectTutorSpan = useCallback(
    (lowIndex, highIndex) => {
      if (lowIndex <= 0 && highIndex >= STUDY_YEARS.length - 1) {
        setTutorYearFilters([]);
      } else {
        setTutorYearFilters(STUDY_YEARS.slice(lowIndex, highIndex + 1));
      }
      resetDeck();
    },
    [resetDeck]
  );

  useEffect(() => {
    const query = cityQuery.trim();
    if (suppressGeocode.current) {
      suppressGeocode.current = false;
      setLocationSuggestions([]);
      return undefined;
    }
    if (query.length < 2) {
      setLocationSuggestions([]);
      return undefined;
    }

    const local = suggestLocations(query).map((loc) => ({
      key: `${loc.zip}-${loc.name}`,
      label: `${loc.name} ${loc.zip}`,
      latitude: loc.latitude,
      longitude: loc.longitude,
    }));
    setLocationSuggestions(local);

    let cancelled = false;
    const timer = setTimeout(async () => {
      const remote = await geocodeAddress(query);
      if (cancelled) return;

      const detected = remote[0] || null;
      if (remote.length > 0) {
        setLocationSuggestions(
          [
            ...remote,
            ...local.filter(
              (item) =>
                !remote.some(
                  (place) =>
                    Math.abs(item.latitude - place.latitude) < 0.02 &&
                    Math.abs(item.longitude - place.longitude) < 0.02
                )
            ),
          ].slice(0, 5)
        );
      }

      const exact = local.find(
        (item) => item.label.toLowerCase() === query.toLowerCase()
      );
      const chosen = detected || exact || (local.length === 1 ? local[0] : null);
      const confident =
        Boolean(detected) ||
        Boolean(exact) ||
        (local.length === 1 && query.length >= 4);
      if (!chosen || !confident) return;

      setSearchOrigin({
        latitude: chosen.latitude,
        longitude: chosen.longitude,
        label: chosen.label,
      });
      if (radiusKmRef.current == null) setRadiusKm(10);
      onDeckReset.current();
    }, 450);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [cityQuery]);

  const priceIndex = nearestStepIndex(PRICE_STEPS, maxHourlyRate);
  const radiusIndex = nearestStepIndex(RADIUS_STEPS, radiusKm);
  const studentIndex = Math.max(
    STUDENT_STEPS.indexOf(
      STUDENT_LEVEL_GROUPS.find((group) => group.id === studentLevelGroups[0])?.levels[0] || null
    ),
    0
  );
  const tutorSpanIndexes = tutorYearFilters
    .map((year) => STUDY_YEARS.indexOf(year))
    .filter((yearIndex) => yearIndex >= 0);
  const tutorLow = tutorSpanIndexes.length ? Math.min(...tutorSpanIndexes) : 0;
  const tutorHigh = tutorSpanIndexes.length
    ? Math.max(...tutorSpanIndexes)
    : STUDY_YEARS.length - 1;
  const lieuSummary =
    [
      searchOrigin?.label || cityQuery.trim() || null,
      radiusKm != null ? `${radiusKm} km` : 'Illimité',
    ]
      .filter(Boolean)
      .join(' · ') || 'Illimité';
  const subjectSummary = activeFilter || 'Toutes';
  const formatSummary = formatFilters.length ? formatFilters.join(', ') : 'Tous';
  const priceSummary = maxHourlyRate != null ? `${maxHourlyRate} € max` : 'Tout';
  const studentSummary = studentLevelGroups.length
    ? STUDENT_LEVEL_GROUPS.filter((group) => studentLevelGroups.includes(group.id))
        .map((group) => group.label)
        .join(', ')
    : 'Tous';
  const tutorYearSummary =
    tutorLow === 0 && tutorHigh === STUDY_YEARS.length - 1
      ? 'Tous'
      : tutorLow === tutorHigh
        ? STUDY_YEARS[tutorLow]
        : `${STUDY_YEARS[tutorLow]} – ${STUDY_YEARS[tutorHigh]}`;

  const hasActiveFilters =
    Boolean(activeFilter) ||
    Boolean(cityQuery.trim()) ||
    Boolean(searchOrigin) ||
    radiusKm != null ||
    formatFilters.length > 0 ||
    maxHourlyRate != null ||
    studentLevelGroups.length > 0 ||
    tutorYearFilters.length > 0;

  return {
    onDeckReset,
    activeFilter,
    cityQuery,
    searchOrigin,
    locationSuggestions,
    radiusKm,
    maxHourlyRate,
    studentLevelGroups,
    formatFilters,
    expandedFilter,
    hasActiveFilters,
    matchesTutor,
    onSelectFilter,
    setSubjectFilter,
    onSelectRadius,
    onToggleFormatFilter,
    clearFormats,
    replaceFormatFilters,
    clearAllFilters,
    seedPlace,
    seedSearch,
    selectSuggestion,
    onCityChange,
    toggleFilterSection,
    onSelectMaxPrice,
    onSelectStudentLevel,
    setLevelFilters,
    onSelectTutorSpan,
    priceIndex,
    radiusIndex,
    studentIndex,
    tutorLow,
    tutorHigh,
    lieuSummary,
    subjectSummary,
    formatSummary,
    priceSummary,
    studentSummary,
    tutorYearSummary,
  };
}
