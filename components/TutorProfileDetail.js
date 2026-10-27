import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  initialWindowMetrics,
  SafeAreaProvider,
  SafeAreaView,
} from 'react-native-safe-area-context';
import { useAuth } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';

import { colors, radii, shadows } from '../constants/theme';
import { useFavoriteTutors } from '../hooks/useFavoriteTutors';
import { fetchTutorReviews, startTutorConversation } from '../lib/supabase';
import {
  FORMAT_IN_PERSON,
  FORMAT_REMOTE,
  TEACHING_FORMATS,
  courseFormatLabel,
} from '../lib/tutorConstants';

const FORMAT_DETAILS = {
  [FORMAT_IN_PERSON]:
    'On se retrouve face à face pour le cours, avec les exercices sous les yeux.',
  [FORMAT_REMOTE]:
    'Le cours se fait à distance, en visioconférence. On partage les exercices à l’écran et on avance ensemble.',
};

const SAMPLE_REVIEWS = [
  {
    id: 'sample-1',
    author: 'Claire',
    rating: 5,
    comment:
      'Très clair et patient. Ma fille a repris confiance en maths en quelques séances.',
    createdAt: '2026-09-12',
  },
  {
    id: 'sample-2',
    author: 'Marc',
    rating: 4,
    comment:
      'Bon suivi avant les examens. Les explications sont simples et le cours est bien préparé.',
    createdAt: '2026-08-03',
  },
  {
    id: 'sample-3',
    author: 'Inès',
    rating: 5,
    comment: 'Ponctuel et à l’écoute. On a vu la différence sur le bulletin.',
    createdAt: '2026-06-21',
  },
];

function firstPersonLevel(studyYear) {
  if (!studyYear) return 'Je n’ai pas encore précisé mon niveau d’études.';
  if (studyYear === 'Diplômé') return 'Je suis diplômé.';
  if (studyYear === 'Secondaire') return 'Je suis encore en secondaire.';
  if (studyYear === 'Doctorat') return 'Je suis en doctorat.';
  if (studyYear === 'Bachelier') return 'Je suis en bachelier.';
  if (studyYear === 'Master') return 'Je suis en master.';
  return `Je suis en ${studyYear}.`;
}

function joinSubjects(subjects) {
  if (subjects.length <= 1) return subjects[0] || '';
  return `${subjects.slice(0, -1).join(', ')} et ${subjects[subjects.length - 1]}`;
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
  if (!Number.isFinite(value)) return '—';
  return Number.isInteger(value) ? `${value}` : value.toFixed(2);
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

export default function TutorProfileDetail({
  tutor,
  visible,
  onClose,
  onConversationStarted,
}) {
  const { userId } = useAuth();
  const { isFavorite, isToggling, toggleFavorite } = useFavoriteTutors();
  const [reviews, setReviews] = useState([]);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [messageOpen, setMessageOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!visible || !tutor?.id) return undefined;
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
  }, [visible, tutor?.id]);

  useEffect(() => {
    if (!visible) {
      setMessageOpen(false);
      setSending(false);
      setError(null);
    }
  }, [visible]);

  const subjects = (
    tutor?.specialties?.length ? tutor.specialties : [tutor?.subject]
  ).filter(Boolean);
  const lessons = tutor ? getLessonsGiven(tutor) : 0;
  const formats = TEACHING_FORMATS.filter((format) =>
    (tutor?.teachingFormats ?? []).includes(format)
  );

  async function onToggleFavorite() {
    if (!tutor || isToggling(tutor.id)) return;
    setError(null);
    try {
      await toggleFavorite(tutor.id);
    } catch (err) {
      setError(err?.message ?? 'Action favori impossible.');
    }
  }

  function openMessage() {
    if (!tutor || sending) return;
    setError(null);
    setDraft(`Bonjour ${firstName(tutor.name)}, je souhaite réserver un cours pour…`);
    setMessageOpen(true);
  }

  async function onSend() {
    if (!tutor || sending) return;
    const content = draft.trim();
    if (!content) {
      setError('Écris un message avant d’envoyer.');
      return;
    }
    if (!userId) {
      setError('Tu dois être connecté pour envoyer une demande.');
      return;
    }

    setSending(true);
    setError(null);
    try {
      await startTutorConversation({
        parentId: userId,
        tutorId: tutor.id,
        content,
        senderId: userId,
      });
      setMessageOpen(false);
      onConversationStarted?.();
      onClose?.();
    } catch (err) {
      setError(err?.message ?? 'Impossible d’envoyer la demande.');
    } finally {
      setSending(false);
    }
  }

  function requestClose() {
    if (sending) return;
    if (messageOpen) {
      setMessageOpen(false);
      return;
    }
    onClose?.();
  }

  return (
    <Modal
      visible={visible && Boolean(tutor)}
      animationType="slide"
      statusBarTranslucent={false}
      onRequestClose={requestClose}
    >
      <SafeAreaProvider initialMetrics={initialWindowMetrics} style={styles.provider}>
        <View style={styles.root}>
          <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
            <View style={styles.header}>
              <Pressable
                style={styles.headerIconButton}
                onPress={requestClose}
                disabled={sending}
                accessibilityLabel="Retour"
                hitSlop={8}
              >
                <Ionicons name="chevron-back" size={22} color={colors.white} />
              </Pressable>
              <Text style={styles.title}>Profil</Text>
              <View style={styles.headerSpacer} />
            </View>

            {tutor ? (
              <ScrollView
                style={styles.scroll}
                contentContainerStyle={styles.content}
                showsVerticalScrollIndicator={false}
              >
                <View style={styles.heroCard}>
                  <Pressable
                    style={styles.heroHeart}
                    onPress={onToggleFavorite}
                    disabled={isToggling(tutor.id)}
                    accessibilityLabel={
                      isFavorite(tutor.id)
                        ? 'Retirer des favoris'
                        : 'Ajouter aux favoris'
                    }
                    hitSlop={8}
                  >
                    {isToggling(tutor.id) ? (
                      <ActivityIndicator size="small" color="#3DDC97" />
                    ) : (
                      <Ionicons
                        name={isFavorite(tutor.id) ? 'heart' : 'heart-outline'}
                        size={22}
                        color={isFavorite(tutor.id) ? '#3DDC97' : '#C7C7CC'}
                      />
                    )}
                  </Pressable>
                  <View style={styles.heroAvatar}>
                    {tutor.avatarUrl ? (
                      <Image source={{ uri: tutor.avatarUrl }} style={styles.heroImage} />
                    ) : (
                      <Text style={styles.heroInitials}>{getInitials(tutor.name)}</Text>
                    )}
                  </View>
                  <Text style={styles.heroName}>{firstName(tutor.name)}</Text>
                  <Text style={styles.heroHeadline}>
                    {subjects.length
                      ? `Cours de ${subjects.join(', ')}`
                      : 'Cours à préciser'}
                  </Text>
                  <Text style={styles.heroCity}>{tutor.city || 'Ville à préciser'}</Text>
                  <Text style={styles.heroCity}>
                    {courseFormatLabel(tutor.teachingFormats) || 'Format à préciser'}
                  </Text>
                  <Text style={styles.heroCity}>
                    {tutor.studyYear || 'Parcours à préciser'}
                  </Text>
                </View>

                <View style={styles.stats}>
                  {[
                    ['Note', (tutor.rating || 0) > 0 ? tutor.rating.toFixed(1) : '—'],
                    ['Avis', String(tutor.reviewCount || reviews.length || 0)],
                    ['Cours', String(lessons)],
                  ].map(([label, value]) => (
                    <View key={label} style={styles.stat}>
                      <Text style={styles.statValue}>{value}</Text>
                      <Text style={styles.statLabel}>{label}</Text>
                    </View>
                  ))}
                </View>

                <View style={styles.block}>
                  <Text style={styles.blockTitle}>Tarif</Text>
                  <Text style={styles.price}>
                    {formatRate(tutor.hourlyRate)} €
                    <Text style={styles.priceUnit}> / heure</Text>
                  </Text>
                  <Text style={styles.blockText}>
                    Le premier échange se fait par message, sans réservation immédiate.
                  </Text>
                </View>

                <View style={styles.block}>
                  <Text style={styles.blockTitle}>À propos</Text>
                  <Text style={tutor.bio ? styles.blockText : styles.muted}>
                    {tutor.bio ||
                      `${firstName(tutor.name)} n’a pas encore rédigé sa présentation.`}
                  </Text>
                </View>

                <View style={styles.block}>
                  <Text style={styles.blockTitle}>Matières</Text>
                  <View style={styles.chipWrap}>
                    {(subjects.length ? subjects : ['À préciser']).map((subject) => (
                      <View key={`${tutor.id}-${subject}`} style={styles.chip}>
                        <Text style={styles.chipLabel}>{subject}</Text>
                      </View>
                    ))}
                  </View>
                </View>

                <View style={styles.block}>
                  <Text style={styles.blockTitle}>Parcours</Text>
                  <Text style={styles.blockText}>
                    {`${firstPersonLevel(tutor.studyYear)} ${
                      subjects.length
                        ? `J’accompagne des élèves en ${joinSubjects(subjects)}.`
                        : 'Les matières que je propose ne sont pas encore précisées.'
                    } Je reprends le chapitre en cours, je montre comment attaquer un exercice, puis on s’entraîne jusqu’à ce que la méthode soit claire.`}
                  </Text>
                </View>

                <View style={styles.block}>
                  <Text style={styles.blockTitle}>Où et comment se passe le cours</Text>
                  <Text style={styles.blockText}>
                    {tutor.city
                      ? `J’habite à ${tutor.city}.`
                      : 'Je n’ai pas encore indiqué ma ville.'}
                  </Text>
                  {formats.length ? (
                    formats.map((format) => (
                      <View key={format} style={styles.formatCard}>
                        <Text style={styles.formatTitle}>{format}</Text>
                        <Text style={styles.blockText}>{FORMAT_DETAILS[format]}</Text>
                      </View>
                    ))
                  ) : (
                    <Text style={styles.muted}>
                      Je n’ai pas encore précisé comment se passe le cours.
                    </Text>
                  )}
                </View>

                <View style={styles.block}>
                  <Text style={styles.blockTitle}>Avis</Text>
                  {reviewsLoading ? (
                    <ActivityIndicator color="#C7C7CC" />
                  ) : (
                    <>
                      {reviews.length === 0 ? (
                        <Text style={styles.reviewHint}>Exemples, pour voir le rendu.</Text>
                      ) : null}
                      {(reviews.length ? reviews : SAMPLE_REVIEWS).map(
                        (review, reviewIndex, list) => (
                          <View
                            key={review.id}
                            style={[
                              styles.review,
                              reviewIndex === list.length - 1 && styles.reviewLast,
                            ]}
                          >
                            <View style={styles.reviewHead}>
                              <Text style={styles.reviewAuthor}>
                                {review.author || 'Parent'}
                              </Text>
                              <Text style={styles.reviewDate}>
                                {formatReviewDate(review.createdAt)}
                              </Text>
                            </View>
                            <Text style={styles.reviewRating}>
                              {'★'.repeat(review.rating)}
                              {'☆'.repeat(Math.max(0, 5 - review.rating))}
                            </Text>
                            <Text style={styles.blockText}>
                              {review.comment || 'Avis sans commentaire.'}
                            </Text>
                          </View>
                        )
                      )}
                    </>
                  )}
                </View>
              </ScrollView>
            ) : null}
          </SafeAreaView>

          <View style={styles.footer}>
            {error ? <Text style={styles.footerError}>{error}</Text> : null}
            <Pressable
              style={[styles.messageButton, sending && styles.disabled]}
              onPress={openMessage}
              disabled={!tutor || sending}
              accessibilityLabel="Envoyer un message"
            >
              {sending ? (
                <ActivityIndicator color={colors.white} />
              ) : (
                <>
                  <Ionicons name="chatbubble-ellipses" size={18} color={colors.white} />
                  <Text style={styles.messageLabel}>Envoyer un message</Text>
                </>
              )}
            </Pressable>
          </View>

          {messageOpen ? (
            <View style={styles.messageOverlay}>
              <Pressable
                style={styles.backdrop}
                onPress={() => {
                  if (!sending) setMessageOpen(false);
                }}
              />
              <View style={styles.modalCard}>
                <Text style={styles.modalTitle}>Proposer un cours</Text>
                <Text style={styles.modalSection}>
                  Message à {tutor?.name ?? 'ton tuteur'}
                </Text>
                <TextInput
                  style={styles.input}
                  value={draft}
                  onChangeText={setDraft}
                  multiline
                  textAlignVertical="top"
                  placeholder="Écris ta demande…"
                  placeholderTextColor={colors.mutedSoft}
                  editable={!sending}
                />
                <Pressable
                  style={[
                    styles.modalPrimary,
                    (!draft.trim() || sending) && styles.disabled,
                  ]}
                  onPress={onSend}
                  disabled={!draft.trim() || sending}
                >
                  {sending ? (
                    <ActivityIndicator color={colors.white} />
                  ) : (
                    <Text style={styles.modalPrimaryLabel}>Envoyer la demande</Text>
                  )}
                </Pressable>
                <Pressable
                  style={styles.modalCancel}
                  onPress={() => setMessageOpen(false)}
                  disabled={sending}
                >
                  <Text style={styles.modalCancelLabel}>Annuler</Text>
                </Pressable>
              </View>
            </View>
          ) : null}
        </View>
      </SafeAreaProvider>
    </Modal>
  );
}

const styles = StyleSheet.create({
  provider: { flex: 1 },
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
  title: { fontSize: 18, fontWeight: '800', color: colors.white },
  headerSpacer: { width: 40 },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 120 },
  heroCard: {
    backgroundColor: '#1C1C1E',
    borderRadius: radii.card,
    alignItems: 'center',
    paddingTop: 28,
    paddingBottom: 22,
    paddingHorizontal: 20,
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  heroHeart: {
    position: 'absolute',
    top: 14,
    right: 14,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2C2C2E',
  },
  heroAvatar: {
    width: 112,
    height: 112,
    borderRadius: 56,
    backgroundColor: '#2C2C2E',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  heroImage: { width: '100%', height: '100%' },
  heroInitials: { fontSize: 36, fontWeight: '800', color: '#E8E8E8' },
  heroName: { marginTop: 14, fontSize: 28, fontWeight: '800', color: colors.white },
  heroHeadline: {
    marginTop: 6,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '600',
    textAlign: 'center',
    color: '#E8E8E8',
  },
  heroCity: { marginTop: 6, fontSize: 14, fontWeight: '600', color: '#A1A1A6' },
  stats: { flexDirection: 'row', gap: 8, marginTop: 12 },
  stat: {
    flex: 1,
    backgroundColor: '#1C1C1E',
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  statValue: { fontSize: 16, fontWeight: '800', color: colors.white },
  statLabel: { marginTop: 2, fontSize: 11, fontWeight: '700', color: '#8E8E93' },
  block: {
    marginTop: 12,
    backgroundColor: '#1C1C1E',
    borderRadius: radii.card,
    paddingHorizontal: 18,
    paddingVertical: 18,
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  blockTitle: {
    marginBottom: 8,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: '#3DDC97',
  },
  blockText: { fontSize: 16, lineHeight: 24, color: '#E8E8E8' },
  muted: { fontSize: 14, fontStyle: 'italic', color: '#A1A1A6' },
  price: { fontSize: 32, fontWeight: '800', color: colors.white },
  priceUnit: { fontSize: 16, fontWeight: '600', color: '#A1A1A6' },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    backgroundColor: '#2C2C2E',
    borderRadius: radii.chip,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipLabel: { fontSize: 14, fontWeight: '700', color: '#E8E8E8' },
  formatCard: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#2A2A2A',
  },
  formatTitle: { marginBottom: 4, fontSize: 16, fontWeight: '800', color: colors.white },
  reviewHint: { marginTop: 8, marginBottom: 2, fontSize: 13, color: '#8E8E93' },
  review: {
    marginTop: 14,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#2A2A2A',
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
  reviewRating: {
    marginTop: 4,
    marginBottom: 6,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1,
    color: colors.star,
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 28,
    backgroundColor: '#111111',
    gap: 8,
  },
  footerError: { color: colors.danger, fontSize: 13, textAlign: 'center' },
  messageButton: {
    height: 56,
    borderRadius: 16,
    backgroundColor: '#1B6B45',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  messageLabel: { color: colors.white, fontSize: 15, fontWeight: '700' },
  messageOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 40,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.55)' },
  modalCard: {
    backgroundColor: '#1C1C1E',
    borderRadius: radii.card,
    paddingHorizontal: 22,
    paddingTop: 24,
    paddingBottom: 20,
    zIndex: 1,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    ...shadows.card,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.white,
    marginBottom: 16,
    textAlign: 'center',
  },
  modalSection: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.4,
    color: '#3DDC97',
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  input: {
    minHeight: 120,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    lineHeight: 22,
    color: colors.white,
    backgroundColor: '#111111',
    marginBottom: 14,
  },
  modalPrimary: {
    backgroundColor: '#1B6B45',
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: 'center',
  },
  modalPrimaryLabel: { color: colors.white, fontSize: 16, fontWeight: '700' },
  modalCancel: { marginTop: 10, paddingVertical: 10, alignItems: 'center' },
  modalCancelLabel: { color: '#C7C7CC', fontSize: 15, fontWeight: '600' },
  disabled: { opacity: 0.65 },
});
