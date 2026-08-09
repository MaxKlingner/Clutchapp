/**
 * Géolocalisation légère (Belgique) pour filtres ville / distance.
 * Pas de dépendance PostGIS : calcul haversine côté client.
 */

export const DISTANCE_OPTIONS = [
  { label: '5 km', value: 5 },
  { label: '10 km', value: 10 },
  { label: '20 km', value: 20 },
  { label: 'Tout', value: null },
];

/** Villes / communes de référence (lat/lng WGS84). */
export const BELGIAN_LOCATIONS = [
  {
    name: 'Ottignies-Louvain-la-Neuve',
    aliases: ['louvain-la-neuve', 'lln', 'ottignies', 'ottignies-louvain-la-neuve'],
    postalCodes: ['1348', '1340', '1341', '1342'],
    latitude: 50.6681,
    longitude: 4.6115,
  },
  {
    name: 'Bruxelles',
    aliases: ['bruxelles', 'brussels', 'brussel'],
    postalCodes: ['1000', '1030', '1040', '1050', '1060', '1070', '1080', '1090', '1140', '1150', '1160', '1180', '1190', '1200'],
    latitude: 50.8503,
    longitude: 4.3517,
  },
  {
    name: 'Namur',
    aliases: ['namur'],
    postalCodes: ['5000', '5001', '5002', '5003', '5004'],
    latitude: 50.4674,
    longitude: 4.8719,
  },
  {
    name: 'Liège',
    aliases: ['liege', 'liège'],
    postalCodes: ['4000', '4020', '4030', '4031', '4032'],
    latitude: 50.6326,
    longitude: 5.5797,
  },
  {
    name: 'Charleroi',
    aliases: ['charleroi'],
    postalCodes: ['6000', '6001', '6010', '6020', '6030', '6031', '6032', '6040', '6041', '6042', '6043', '6044'],
    latitude: 50.4108,
    longitude: 4.4446,
  },
  {
    name: 'Wavre',
    aliases: ['wavre'],
    postalCodes: ['1300', '1301'],
    latitude: 50.7175,
    longitude: 4.6097,
  },
  {
    name: 'Nivelles',
    aliases: ['nivelles'],
    postalCodes: ['1400'],
    latitude: 50.5977,
    longitude: 4.3236,
  },
  {
    name: 'Louvain',
    aliases: ['louvain', 'leuven'],
    postalCodes: ['3000', '3001', '3010', '3012', '3018'],
    latitude: 50.8798,
    longitude: 4.7005,
  },
];

const EARTH_RADIUS_KM = 6371;

/**
 * Distance haversine en km entre deux points.
 */
export function haversineKm(lat1, lon1, lat2, lon2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
}

function normalizeText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * Résout une saisie ville / code postal vers des coordonnées de référence.
 * @returns {{ name: string, latitude: number, longitude: number } | null}
 */
export function resolveLocationQuery(query) {
  const raw = String(query || '').trim();
  if (!raw) return null;

  const postal = raw.replace(/\s+/g, '');
  if (/^\d{4}$/.test(postal)) {
    const byPostal = BELGIAN_LOCATIONS.find((loc) =>
      loc.postalCodes.includes(postal)
    );
    if (byPostal) {
      return {
        name: byPostal.name,
        latitude: byPostal.latitude,
        longitude: byPostal.longitude,
      };
    }
  }

  const needle = normalizeText(raw);
  const byAlias = BELGIAN_LOCATIONS.find(
    (loc) =>
      normalizeText(loc.name) === needle ||
      loc.aliases.some((alias) => normalizeText(alias) === needle) ||
      loc.aliases.some((alias) => needle.includes(normalizeText(alias))) ||
      normalizeText(loc.name).includes(needle)
  );

  if (byAlias) {
    return {
      name: byAlias.name,
      latitude: byAlias.latitude,
      longitude: byAlias.longitude,
    };
  }

  return null;
}

/**
 * Filtre un tuteur selon ville / rayon.
 * - Sans rayon : match texte sur city / postal_code (ou localisation résolue).
 * - Avec rayon : distance haversine depuis le point de référence.
 */
export function tutorMatchesLocation(tutor, cityQuery, radiusKm) {
  const query = String(cityQuery || '').trim();
  if (!query && (radiusKm == null || radiusKm === undefined)) {
    return true;
  }

  const resolved = resolveLocationQuery(query);
  const tutorCity = normalizeText(tutor?.city);
  const tutorPostal = String(tutor?.postalCode || '').trim();
  const queryNorm = normalizeText(query);
  const queryPostal = query.replace(/\s+/g, '');

  const textMatch =
    !query ||
    (tutorCity &&
      (tutorCity.includes(queryNorm) || queryNorm.includes(tutorCity))) ||
    (tutorPostal && /^\d{4}$/.test(queryPostal) && tutorPostal === queryPostal) ||
    (resolved &&
      tutorCity &&
      (tutorCity.includes(normalizeText(resolved.name)) ||
        normalizeText(resolved.name).includes(tutorCity)));

  if (radiusKm == null || radiusKm === undefined) {
    return textMatch;
  }

  const origin = resolved;
  if (!origin) {
    // Rayon demandé sans ville connue → on se rabat sur le match texte
    return textMatch;
  }

  const lat = Number(tutor?.latitude);
  const lng = Number(tutor?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return textMatch;
  }

  const distance = haversineKm(origin.latitude, origin.longitude, lat, lng);
  return distance <= Number(radiusKm);
}
