/** Types partagés — le runtime reste en JS ; ces interfaces documentent le contrat. */

export type TeachingFormat = 'Présentiel' | 'À domicile' | 'En ligne';

export type DistanceRadiusKm = 5 | 10 | 20 | null;

export interface TutorProfile {
  id: string;
  clerkId: string | null;
  name: string;
  subject: string;
  specialties: string[];
  bio: string;
  studyYear: string | null;
  hourlyRate: number;
  rating: number;
  reviewCount: number;
  avatarUrl: string | null;
  city: string | null;
  postalCode: string | null;
  latitude: number | null;
  longitude: number | null;
  teachingFormats: TeachingFormat[];
}

export interface FavoriteTutorRow {
  id: string;
  userId: string;
  tutorId: string;
  createdAt: string;
  tutor: TutorProfile | null;
}

export interface TutorSearchFilters {
  specialty: string | null;
  cityQuery: string;
  radiusKm: DistanceRadiusKm;
  teachingFormats: TeachingFormat[];
}
