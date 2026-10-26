/** Spécialités sélectionnables par le tuteur et filtrables au Swipe. */
export const SPECIALTIES = [
  'Mathématiques',
  'Français',
  'Sciences',
  'Anglais',
  'Informatique',
  'Économie',
];

/** Filtres rapides affichés en haut du Swipe. */
export const SWIPE_FILTERS = [
  'Mathématiques',
  'Français',
  'Sciences',
  'Anglais',
  'Informatique',
  'Économie',
];

export const STUDY_YEARS = [
  'Secondaire',
  'Bachelier',
  'Master',
  'Doctorat',
  'Diplômé',
];

const STUDY_YEAR_ALIASES = {
  'Licence 1': 'Bachelier',
  'Licence 2': 'Bachelier',
  'Licence 3': 'Bachelier',
  'Master 1': 'Master',
  'Master 2': 'Master',
  Secondaires: 'Secondaire',
  Diplomé: 'Diplômé',
  Autre: 'Diplômé',
};

/** Anciennes années (Licence 1, Master 2, …) → niveau actuel. */
export function normalizeStudyYear(value) {
  if (value == null) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  if (STUDY_YEARS.includes(raw)) return raw;
  return STUDY_YEAR_ALIASES[raw] || raw;
}

export function studyLevelPhrase(studyYear) {
  if (studyYear === 'Diplômé') return 'est diplômé';
  if (studyYear === 'Secondaire') return 'est en secondaire';
  if (studyYear === 'Doctorat') return 'est en doctorat';
  if (studyYear === 'Bachelier') return 'est en bachelier';
  if (studyYear === 'Master') return 'est en master';
  return `est en ${studyYear}`;
}

/** Niveaux scolaires de l'élève, déclarés par le tuteur. */
export const STUDENT_LEVELS = [
  'Primaire',
  '1ère secondaire',
  '2ème secondaire',
  '3ème secondaire',
  '4ème secondaire',
  '5ème secondaire',
  '6ème secondaire',
  'Supérieur',
];

export const HOURLY_RATES = [15, 20, 25, 28, 30, 35, 40, 45, 50];

/** Formats de cours déclarés par le tuteur et filtrables au Swipe. */
export const FORMAT_AT_STUDENT = 'Chez l’élève';
export const FORMAT_AT_TUTOR = 'Chez le professeur';
export const FORMAT_ONLINE = 'En ligne';
export const TEACHING_FORMATS = [FORMAT_AT_STUDENT, FORMAT_AT_TUTOR, FORMAT_ONLINE];

const LEGACY_TEACHING_FORMATS = {
  Présentiel: FORMAT_AT_TUTOR,
  'À domicile': FORMAT_AT_STUDENT,
  'A domicile': FORMAT_AT_STUDENT,
};

/** Anciens libellés → Chez l’élève / Chez le professeur / En ligne. */
export function normalizeTeachingFormats(formats) {
  const mapped = [];
  for (const raw of formats ?? []) {
    const name = LEGACY_TEACHING_FORMATS[raw] || String(raw);
    if (!TEACHING_FORMATS.includes(name) || mapped.includes(name)) continue;
    mapped.push(name);
  }
  if (mapped.includes(FORMAT_AT_STUDENT)) return [FORMAT_AT_STUDENT];
  return mapped;
}

export function tutorCanTravel(formats) {
  return normalizeTeachingFormats(formats).includes(FORMAT_AT_STUDENT);
}

/**
 * Chez l’élève : tuteurs qui se déplacent.
 * Chez le professeur et En ligne : tuteurs qui ne se déplacent pas.
 */
export function tutorMatchesCourseType(formats, selected) {
  if (!selected?.length) return true;
  const travels = tutorCanTravel(formats);
  return selected.some((format) => {
    if (format === FORMAT_AT_STUDENT) return travels;
    if (format === FORMAT_AT_TUTOR || format === FORMAT_ONLINE) return !travels;
    return false;
  });
}

export const MATCH_STATUS = {
  PENDING: 'pending',
  ACCEPTED: 'accepted',
  DECLINED: 'declined',
};
