/**
 * Géolocalisation légère (Belgique) pour filtres ville / distance.
 * Pas de dépendance PostGIS : calcul haversine côté client.
 * Localités : codes postaux bpost, avec coordonnées.
 */
import POSTAL_ROWS from './postalLocalities.json';

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

/** Une entrée par localité : code postal, nom, coordonnées, commune principale. */
const POSTAL_LOCALITIES = POSTAL_ROWS.map(([zip, name, latitude, longitude, main]) => ({
  name,
  zip,
  postalCodes: [zip],
  latitude,
  longitude,
  main: main === 1,
}));

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

function foldPlace(value) {
  return normalizeText(value).replace(/[^a-z0-9]/g, '');
}

function toResolved(loc) {
  return {
    name: loc.name,
    postalCode: loc.zip,
    latitude: loc.latitude,
    longitude: loc.longitude,
  };
}

function byPostalRank(left, right) {
  if (left.main !== right.main) return left.main ? -1 : 1;
  return left.name.localeCompare(right.name, 'fr');
}

/**
 * Résout une saisie ville / code postal vers des coordonnées de référence.
 * @returns {{ name: string, latitude: number, longitude: number } | null}
 */
export function resolveLocationQuery(query) {
  const raw = String(query || '').trim();
  if (!raw) return null;

  const compact = raw.replace(/\s+/g, '');
  if (/^\d{4}$/.test(compact)) {
    const matches = POSTAL_LOCALITIES.filter((loc) => loc.zip === compact).sort(byPostalRank);
    if (matches[0]) return toResolved(matches[0]);
  }

  const named = raw.replace(/\s+\d{4}$/, '');
  const needle = foldPlace(named);
  if (needle.length < 2) return null;
  const trailingPostal = raw.match(/(\d{4})$/)?.[1];
  const exact = POSTAL_LOCALITIES.find(
    (loc) =>
      foldPlace(loc.name) === needle &&
      (!trailingPostal || loc.zip === trailingPostal)
  );
  if (exact) return toResolved(exact);

  return null;
}

/** Suggestions de localités belges, par nom ou par code postal. */
export function suggestLocations(query) {
  const raw = String(query || '').trim();
  const digits = raw.replace(/\s+/g, '');
  if (/^\d{1,4}$/.test(digits)) {
    if (digits.length < 2) return [];
    return POSTAL_LOCALITIES.filter((loc) => loc.zip.startsWith(digits))
      .sort(byPostalRank)
      .slice(0, 8);
  }

  const needle = foldPlace(raw);
  if (needle.length < 2) return [];

  return POSTAL_LOCALITIES.filter((loc) => foldPlace(loc.name).includes(needle))
    .sort((left, right) => {
      const leftStart = foldPlace(left.name).startsWith(needle) ? 0 : 1;
      const rightStart = foldPlace(right.name).startsWith(needle) ? 0 : 1;
      if (leftStart !== rightStart) return leftStart - rightStart;
      return byPostalRank(left, right);
    })
    .slice(0, 8);
}

/**
 * Filtre un tuteur selon ville / rayon.
 * - Rayon « Illimité » et adresse localisée : tout le monde, sans limite de distance.
 * - Rayon « Illimité » et adresse non localisée : match texte sur city / postal_code.
 * - Avec rayon : distance haversine depuis le point de référence.
 * originOverride permet d’utiliser la position du téléphone ou un géocodage.
 */
export function tutorMatchesLocation(tutor, cityQuery, radiusKm, originOverride = null) {
  const query = String(cityQuery || '').trim();
  const overrideLat = Number(originOverride?.latitude);
  const overrideLng = Number(originOverride?.longitude);
  const resolved =
    Number.isFinite(overrideLat) && Number.isFinite(overrideLng)
      ? {
          name: originOverride.label || query,
          latitude: overrideLat,
          longitude: overrideLng,
        }
      : resolveLocationQuery(query);

  if (!query && !resolved && (radiusKm == null || radiusKm === undefined)) {
    return true;
  }
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
    if (resolved) return true;
    return textMatch;
  }

  if (
    !resolved ||
    !Number.isFinite(resolved.latitude) ||
    !Number.isFinite(resolved.longitude)
  ) {
    return textMatch;
  }

  const lat = Number(tutor?.latitude);
  const lng = Number(tutor?.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return textMatch;
  }

  const distance = haversineKm(resolved.latitude, resolved.longitude, lat, lng);
  return distance <= Number(radiusKm);
}
