import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useAuth } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';

import { colors } from '../constants/theme';
import { useFavoriteTutors } from '../hooks/useFavoriteTutors';
import { fetchTutorReviews, findTutorMatch } from '../lib/supabase';
import { aboutCourseText, aboutTutorText } from '../lib/tutorAbout';
import {
  FORMAT_IN_PERSON,
  FORMAT_REMOTE,
  taughtLevelGroupLabels,
} from '../lib/tutorConstants';

function tutorSubjects(tutor) {
  const fromList = (tutor?.specialties || [])
    .map((item) => String(item || '').trim())
    .filter((item) => item && item.toLowerCase() !== 'matière');
  if (fromList.length) return fromList;
  const subject = String(tutor?.subject || '').trim();
  if (subject && subject.toLowerCase() !== 'matière') return [subject];
  return [];
}

function placeFact(tutor) {
  const formats = tutor?.teachingFormats ?? [];
  const inPerson = formats.includes(FORMAT_IN_PERSON);
  const remote = formats.includes(FORMAT_REMOTE);
  const city = tutor?.city;

  if (inPerson && remote && city) return `À distance ou face à face depuis ${city}`;
  if (inPerson && remote) return 'À distance ou face à face';
  if (remote && city) return `À distance, basé à ${city}`;
  if (remote) return 'À distance';
  if (inPerson && city) return `Face à face à ${city}`;
  if (inPerson) return 'Face à face';
  if (city) return city;
  return 'Lieu à préciser';
}

function formatReviewDate(value) {
  if (!value) return '';
  try {
    return new Date(value).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return '';
  }
}

function formatRate(rate) {
  const value = Number(rate);
  if (!Number.isFinite(value) || value <= 0) return '—';
  return Number.isInteger(value) ? `${value}` : value.toFixed(2).replace('.', ',');
}

function firstName(fullName) {
  return String(fullName || 'le tuteur').trim().split(/\s+/)[0] || 'le tuteur';
}

function getInitials(name) {
  return String(name || '?')
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function getLessonsGiven(tutor) {
  const fromProfile = Number(tutor?.lessonsGiven ?? tutor?.coursesGiven);
  if (Number.isFinite(fromProfile) && fromProfile >= 0) return Math.round(fromProfile);
  return 0;
}

function lessonsSuccessLabel(count) {
  const n = Math.max(0, Math.round(Number(count) || 0));
  if (n === 1) return '1 cours donné avec succès';
  return `${n} cours donnés avec succès`;
}

function avisLabel(count) {
  const n = Math.max(0, Math.round(Number(count) || 0));
  if (n === 0) return 'Pas encore d’avis';
  if (n === 1) return '1 avis';
  return `${n} avis`;
}

function Stars({ value, size = 13 }) {
  const filled = Math.min(5, Math.max(0, Math.round(Number(value) || 0)));
  return (
    <Text style={[styles.stars, { fontSize: size }]}>
      {'★'.repeat(filled)}
      {'☆'.repeat(5 - filled)}
    </Text>
  );
}

function FactRow({ icon, text }) {
  if (!text) return null;
  return (
    <View style={styles.fact}>
      <Ionicons name={icon} size={20} color="#A1A1A6" />
      <Text style={styles.factText}>{text}</Text>
    </View>
  );
}

function Divider() {
  return <View style={styles.divider} />;
}

export function openTutorProfile(navigation, params) {
  navigation.navigate('TutorSession', {
    screen: 'TutorProfile',
    params,
  });
}

function navigateToChat(navigation, params) {
  let nav = navigation;
  for (let i = 0; i < 5 && nav; i += 1) {
    const names = nav.getState?.()?.routeNames;
    if (Array.isArray(names) && names.includes('Chat')) {
      if (typeof nav.push === 'function') {
        nav.push('Chat', params);
      } else {
        nav.navigate('Chat', params);
      }
      return;
    }
    nav = nav.getParent?.();
  }
  navigation.navigate('Chat', params);
}

function dismissToExistingChat(navigation) {
  let nav = navigation;
  for (let i = 0; i < 5 && nav; i += 1) {
    const state = nav.getState?.();
    const previous = state?.routes?.[state.index - 1];
    if (previous?.name === 'Chat') {
      nav.goBack();
      return true;
    }
    nav = nav.getParent?.();
  }
  return false;
}

export default function TutorProfileDetail({
  tutor: tutorProp,
  contacted: contactedProp = false,
  onClose,
}) {
  const navigation = useNavigation();
  const route = useRoute();
  const { userId } = useAuth();
  const { isFavorite, isToggling, toggleFavorite } = useFavoriteTutors();
  const tutor = tutorProp ?? route?.params?.tutor ?? null;
  const contacted = contactedProp || Boolean(route?.params?.contacted);
  const [reviews, setReviews] = useState([]);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [openingChat, setOpeningChat] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const unsub = navigation.addListener('focus', () => setOpeningChat(false));
    return unsub;
  }, [navigation]);

  useEffect(() => {
    if (!tutor?.id) return undefined;
    let cancelled = false;
    setReviewsLoading(true);
    setError(null);
    fetchTutorReviews(tutor.id)
      .then((rows) => {
        if (!cancelled) setReviews(rows);
      })
      .catch(() => {
        if (!cancelled) setReviews([]);
      })
      .finally(() => {
        if (!cancelled) setReviewsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tutor?.id]);

  const name = tutor ? firstName(tutor.name) : '';
  const subjects = tutor ? tutorSubjects(tutor) : [];
  const lessons = tutor ? getLessonsGiven(tutor) : 0;
  const levels = tutor ? taughtLevelGroupLabels(tutor.taughtLevels) : [];
  const reviewTotal = tutor?.reviewCount || reviews.length || 0;
  const hasRating = (tutor?.rating || 0) > 0;
  const aboutTutor = tutor ? aboutTutorText(tutor) : '';
  const aboutCourse = tutor ? aboutCourseText(tutor) : '';

  async function onToggleFavorite() {
    if (!tutor || isToggling(tutor.id)) return;
    setError(null);
    try {
      await toggleFavorite(tutor.id);
    } catch (err) {
      setError(err?.message ?? 'Action favori impossible.');
    }
  }

  async function openMessage() {
    if (!tutor || openingChat) return;
    if (!userId) {
      setError('Tu dois être connecté pour envoyer une demande.');
      return;
    }
    if (route.name === 'Chat' || dismissToExistingChat(navigation)) {
      onClose?.();
      return;
    }

    setOpeningChat(true);
    setError(null);
    try {
      const existing = await findTutorMatch({
        parentId: userId,
        tutorId: tutor.id,
      });
      navigateToChat(navigation, {
        match: existing,
        tutor,
        initialDraft: existing
          ? ''
          : `Bonjour ${firstName(tutor.name)}, je souhaite réserver un cours pour…`,
        focusComposer: true,
      });
    } catch (err) {
      setError(err?.message ?? 'Impossible d’ouvrir la discussion.');
      setOpeningChat(false);
    }
  }

  function requestClose() {
    if (openingChat) return;
    if (onClose) onClose();
    else navigation.goBack();
  }

  if (!tutor) return null;

  return (
        <View style={styles.root}>
          <SafeAreaView style={styles.safe} edges={['top']}>
            <View style={styles.header}>
              <Pressable
                style={styles.headerIconButton}
                onPress={requestClose}
                disabled={openingChat}
                accessibilityLabel="Retour"
                hitSlop={8}
              >
                <Ionicons name="chevron-back" size={22} color={colors.white} />
              </Pressable>
              <Pressable
                style={styles.headerIconButton}
                onPress={onToggleFavorite}
                disabled={!tutor || isToggling(tutor.id)}
                accessibilityLabel={
                  tutor && isFavorite(tutor.id)
                    ? 'Retirer des favoris'
                    : 'Ajouter aux favoris'
                }
                hitSlop={8}
              >
                {tutor && isToggling(tutor.id) ? (
                  <ActivityIndicator size="small" color="#3DDC97" />
                ) : (
                  <Ionicons
                    name={tutor && isFavorite(tutor.id) ? 'heart' : 'heart-outline'}
                    size={22}
                    color={tutor && isFavorite(tutor.id) ? '#3DDC97' : '#C7C7CC'}
                  />
                )}
              </Pressable>
            </View>

            {tutor ? (
              <ScrollView
                style={styles.scroll}
                contentContainerStyle={styles.content}
                showsVerticalScrollIndicator={false}
              >
                <View style={styles.identity}>
                  <View style={styles.avatar}>
                    {tutor.avatarUrl ? (
                      <Image source={{ uri: tutor.avatarUrl }} style={styles.avatarImage} />
                    ) : (
                      <Text style={styles.avatarInitials}>{getInitials(tutor.name)}</Text>
                    )}
                  </View>
                  <View style={styles.identityText}>
                    <Text style={styles.name}>{name}</Text>
                    <View style={styles.ratingRow}>
                      <Stars value={hasRating ? tutor.rating : 0} size={15} />
                      <Text style={styles.ratingValue}>
                        {hasRating ? tutor.rating.toFixed(1).replace('.', ',') : '—'}
                      </Text>
                    </View>
                    <Text style={styles.metaLine}>{avisLabel(reviewTotal)}</Text>
                    <Text style={styles.lessonsLine}>{lessonsSuccessLabel(lessons)}</Text>
                  </View>
                </View>

                <Text style={tutor.bio ? styles.bio : styles.bioMuted}>
                  {tutor.bio || `${name} n’a pas encore rédigé sa présentation.`}
                </Text>

                <Divider />

                <View style={styles.facts}>
                  <FactRow
                    icon="cash-outline"
                    text={`${formatRate(tutor.hourlyRate)} € / h`}
                  />
                  <FactRow icon="location-outline" text={placeFact(tutor)} />
                  <FactRow
                    icon="book-outline"
                    text={subjects.length ? subjects.join(', ') : 'Matières à préciser'}
                  />
                  <FactRow
                    icon="options-outline"
                    text={levels.length ? levels.join(', ') : 'Niveaux à préciser'}
                  />
                </View>

                {aboutTutor ? (
                  <>
                    <Divider />
                    <View style={styles.section}>
                      <Text style={styles.sectionTitle}>À propos de {name}</Text>
                      <Text style={styles.body}>{aboutTutor}</Text>
                    </View>
                  </>
                ) : null}

                {aboutCourse ? (
                  <>
                    <Divider />
                    <View style={styles.section}>
                      <Text style={styles.sectionTitle}>À propos du cours</Text>
                      <Text style={styles.body}>{aboutCourse}</Text>
                    </View>
                  </>
                ) : null}

                <Divider />
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Commentaires</Text>
                  {reviewsLoading ? (
                    <ActivityIndicator color="#C7C7CC" />
                  ) : reviews.length === 0 ? (
                    <Text style={styles.bodyMuted}>Pas encore de commentaire.</Text>
                  ) : (
                    reviews.map((review, reviewIndex) => (
                      <View
                        key={review.id}
                        style={[
                          styles.review,
                          reviewIndex === reviews.length - 1 && styles.reviewLast,
                        ]}
                      >
                        <View style={styles.reviewHead}>
                          <Text style={styles.reviewAuthor}>
                            {review.author || 'Un parent'}
                          </Text>
                          <Text style={styles.reviewDate}>
                            {formatReviewDate(review.createdAt)}
                          </Text>
                        </View>
                        <Stars value={review.rating} />
                        <Text style={styles.body}>
                          {review.comment || 'Avis sans commentaire.'}
                        </Text>
                      </View>
                    ))
                  )}
                </View>
              </ScrollView>
            ) : null}
          </SafeAreaView>

          <SafeAreaView edges={['bottom']} style={styles.footer}>
            {error ? <Text style={styles.footerError}>{error}</Text> : null}
            {contacted ? (
              <View style={styles.contactedChip}>
                <Ionicons
                  name="chatbubble-ellipses-outline"
                  size={12}
                  color="#3DDC97"
                />
                <Text style={styles.contactedChipLabel}>Déjà contacté</Text>
              </View>
            ) : null}
            <View style={styles.footerRow}>
              <Pressable
                style={[styles.messageButton, openingChat && styles.disabled]}
                onPress={openMessage}
                disabled={!tutor || openingChat}
                accessibilityLabel="Envoyer un message"
              >
                {openingChat ? (
                  <ActivityIndicator color={colors.white} />
                ) : (
                  <Text style={styles.messageLabel}>Envoyer un message</Text>
                )}
              </Pressable>
            </View>
          </SafeAreaView>
        </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#111111' },
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 8,
  },
  headerIconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2C2C2E',
  },
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 140,
  },
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 22,
  },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#2C2C2E',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: { width: '100%', height: '100%' },
  avatarInitials: { fontSize: 32, fontWeight: '800', color: '#E8E8E8' },
  identityText: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  name: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.white,
    letterSpacing: -0.5,
  },
  contactedChip: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(61, 220, 151, 0.12)',
  },
  contactedChipLabel: {
    color: '#3DDC97',
    fontSize: 11,
    fontWeight: '800',
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  ratingValue: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.white,
  },
  metaLine: {
    fontSize: 14,
    fontWeight: '600',
    color: '#A1A1A6',
  },
  lessonsLine: {
    fontSize: 14,
    fontWeight: '700',
    color: '#3DDC97',
  },
  bio: {
    fontSize: 16,
    lineHeight: 24,
    color: '#A1A1A6',
    marginBottom: 22,
  },
  bioMuted: {
    fontSize: 16,
    lineHeight: 24,
    color: '#8E8E93',
    fontStyle: 'italic',
    marginBottom: 22,
  },
  stars: {
    fontWeight: '800',
    letterSpacing: 1,
    color: colors.star,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#2C2C2E',
    marginVertical: 22,
  },
  facts: { gap: 18 },
  fact: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
  },
  factText: {
    flex: 1,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '500',
    color: colors.white,
  },
  section: { gap: 10 },
  sectionTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.white,
    letterSpacing: -0.3,
    marginBottom: 4,
  },
  body: {
    fontSize: 16,
    lineHeight: 24,
    color: '#E8E8E8',
  },
  bodyMuted: {
    fontSize: 15,
    lineHeight: 22,
    color: '#A1A1A6',
  },
  review: {
    marginTop: 14,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#2A2A2A',
    gap: 6,
  },
  reviewLast: { paddingBottom: 0, borderBottomWidth: 0 },
  reviewHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  reviewAuthor: { fontSize: 15, fontWeight: '800', color: colors.white },
  reviewDate: { fontSize: 13, color: '#A1A1A6' },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
    backgroundColor: '#111111',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#2A2A2A',
    gap: 8,
  },
  footerError: { color: colors.danger, fontSize: 13, textAlign: 'center' },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  messageButton: {
    flex: 1,
    height: 52,
    borderRadius: 999,
    backgroundColor: '#1B6B45',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  messageLabel: { color: colors.white, fontSize: 15, fontWeight: '800' },
  disabled: { opacity: 0.65 },
});
