export const BIO_MAX = 500;
export const PREVIEW_BIO_WORDS = 24;

export function countWords(text) {
  return String(text || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

export function clipToMaxWords(text, max = PREVIEW_BIO_WORDS) {
  const raw = String(text ?? '');
  const words = raw.trim().split(/\s+/).filter(Boolean);
  if (words.length < max) return raw;
  return words.slice(0, max).join(' ');
}

export function limitWords(text, max = PREVIEW_BIO_WORDS) {
  const words = String(text || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length <= max) return words.join(' ');
  return `${words.slice(0, max).join(' ')}…`;
}

export function previewBio(text) {
  return limitWords(text, PREVIEW_BIO_WORDS);
}

export function realSpecialties(profile) {
  return (profile?.specialties || [])
    .map((item) => String(item || '').trim())
    .filter((item) => item && item.toLowerCase() !== 'matière');
}

export function hasPublishedAnnouncement(profile) {
  return realSpecialties(profile).length > 0;
}

export function missingAnnouncementFields(profile) {
  const missing = [];
  if (!profile?.name || profile.name === 'Tuteur') missing.push('ton nom');
  if (!realSpecialties(profile).length) missing.push('une matière');
  if (!profile?.teachingFormats?.length) missing.push('un format de cours');
  if (!profile?.city) missing.push('ta ville');
  if (!(Number(profile?.hourlyRate) > 0)) missing.push('ton tarif');
  if (!String(profile?.bio || '').trim()) missing.push('ta présentation');
  return missing;
}

export function formatRate(value) {
  const rate = Number(value) || 0;
  if (rate <= 0) return '';
  return Number.isInteger(rate) ? String(rate) : rate.toFixed(2).replace('.', ',');
}

export function initials(name) {
  return String(name || '?')
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

/** Construit le payload complet pour ne pas écraser les autres champs. */
export function announcementUpdates(profile, patch = {}) {
  return {
    fullName: profile?.name && profile.name !== 'Tuteur' ? profile.name : '',
    bio: profile?.bio || '',
    aboutTutor: profile?.aboutTutor || '',
    aboutCourse: profile?.aboutCourse || '',
    specialties: realSpecialties(profile),
    teachingFormats: profile?.teachingFormats || [],
    hourlyRate: profile?.hourlyRate || 0,
    studyYear: profile?.studyYear || null,
    taughtLevels: profile?.taughtLevels || [],
    city: profile?.city || '',
    postalCode: profile?.postalCode || '',
    latitude: profile?.latitude ?? null,
    longitude: profile?.longitude ?? null,
    avatarUrl: profile?.avatarUrl || null,
    ...patch,
  };
}
