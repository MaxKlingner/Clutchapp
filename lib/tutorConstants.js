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

/** Groupes affichés dans le filtre Niveau. */
export const STUDENT_LEVEL_GROUPS = [
  { id: 'primaire', label: 'Primaire', levels: ['Primaire'] },
  {
    id: 'secondaire',
    label: 'Secondaire',
    levels: [
      '1ère secondaire',
      '2ème secondaire',
      '3ème secondaire',
      '4ème secondaire',
      '5ème secondaire',
      '6ème secondaire',
    ],
  },
  { id: 'superieur', label: 'Enseignement Supérieur', levels: ['Supérieur'] },
  { id: 'adultes', label: 'Formation pour adultes', levels: ['Formation pour adultes'] },
];

export function studentLevelGroupId(level) {
  const name = String(level || '').trim();
  if (!name) return null;
  const group = STUDENT_LEVEL_GROUPS.find(
    (item) => item.id === name || item.levels.includes(name) || item.label === name
  );
  return group ? group.id : null;
}

export function taughtLevelGroupIds(levels) {
  const ids = [];
  for (const level of levels || []) {
    const id = studentLevelGroupId(level);
    if (id && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

export function taughtLevelsFromGroups(groupIds) {
  return STUDENT_LEVEL_GROUPS.filter((group) => (groupIds || []).includes(group.id)).flatMap(
    (group) => group.levels
  );
}

export function taughtLevelGroupLabels(levels) {
  return taughtLevelGroupIds(levels)
    .map((id) => STUDENT_LEVEL_GROUPS.find((group) => group.id === id)?.label)
    .filter(Boolean);
}

export const HOURLY_RATES = [15, 20, 25, 28, 30, 35, 40, 45, 50];

/** Formats de cours déclarés par le tuteur et filtrables au Swipe. */
export const FORMAT_IN_PERSON = 'Face à face';
export const FORMAT_REMOTE = 'À distance';
export const TEACHING_FORMATS = [FORMAT_IN_PERSON, FORMAT_REMOTE];

/** Anciens libellés encore présents en base. */
export const FORMAT_AT_STUDENT = 'Chez l’élève';
export const FORMAT_AT_TUTOR = 'Chez le professeur';
export const FORMAT_ONLINE = 'En ligne';

const IN_PERSON_FORMATS = new Set([
  FORMAT_IN_PERSON,
  FORMAT_AT_STUDENT,
  FORMAT_AT_TUTOR,
  'Présentiel',
  'À domicile',
  'A domicile',
  'En présentiel',
  'Chez moi',
]);

const REMOTE_FORMATS = new Set([
  FORMAT_REMOTE,
  FORMAT_ONLINE,
]);

/** Anciens libellés → Face à face / À distance. */
export function normalizeTeachingFormats(formats) {
  const mapped = [];
  for (const raw of formats ?? []) {
    const name = String(raw);
    if (IN_PERSON_FORMATS.has(name)) {
      if (!mapped.includes(FORMAT_IN_PERSON)) mapped.push(FORMAT_IN_PERSON);
      continue;
    }
    if (REMOTE_FORMATS.has(name) && !mapped.includes(FORMAT_REMOTE)) {
      mapped.push(FORMAT_REMOTE);
    }
  }
  return mapped;
}

export function courseFormatLabel(formats) {
  const normalized = normalizeTeachingFormats(formats);
  const inPerson = normalized.includes(FORMAT_IN_PERSON);
  const remote = normalized.includes(FORMAT_REMOTE);
  if (inPerson && remote) return 'Face à face & À distance';
  if (remote) return 'À distance';
  if (inPerson) return 'Face à face';
  return '';
}

export function tutorCanTravel(formats) {
  return normalizeTeachingFormats(formats).includes(FORMAT_IN_PERSON);
}

/** Le tuteur correspond s'il propose au moins un des formats choisis. */
export function tutorMatchesCourseType(formats, selected) {
  if (!selected?.length) return true;
  const offered = normalizeTeachingFormats(formats);
  const wanted = normalizeTeachingFormats(selected);
  if (!wanted.length) return true;
  return wanted.some((format) => offered.includes(format));
}

export const MATCH_STATUS = {
  PENDING: 'pending',
  ACCEPTED: 'accepted',
  DECLINED: 'declined',
};
