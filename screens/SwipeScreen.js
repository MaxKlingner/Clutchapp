import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Image,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { initialWindowMetrics, SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useAuth } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';

import TutorFilterFields from '../components/TutorFilterFields';
import { colors, MINT_BAND_H, radii, shadows } from '../constants/theme';
import {
  fetchMatches,
  fetchTutorProfiles,
  fetchTutorReviews,
  startTutorConversation,
} from '../lib/supabase';
import {
  MATCH_STATUS,
  FORMAT_AT_STUDENT,
  FORMAT_AT_TUTOR,
  FORMAT_ONLINE,
  TEACHING_FORMATS,
  tutorCanTravel,
} from '../lib/tutorConstants';
import { useFavoriteTutors } from '../hooks/useFavoriteTutors';
import { useParentSearch } from '../lib/ParentSearchContext';

const SLIDER_THUMB = 26;

const FORMAT_DETAILS = {
  [FORMAT_AT_STUDENT]:
    'Je me déplace chez l’élève. On s’installe au calme, avec les cours et les exercices, et j’adapte la séance à ce qui bloque.',
  [FORMAT_AT_TUTOR]:
    'Je reçois chez moi, dans un endroit tranquille. On a de quoi écrire, et je reprends les points un par un.',
  [FORMAT_ONLINE]:
    'Je donne aussi le cours en ligne, en visioconférence. On partage les exercices à l’écran et on avance ensemble.',
};

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

const SCREEN_W = Dimensions.get('window').width;
const SCREEN_H = Dimensions.get('window').height;
const FILTER_SHEET_TOP = (initialWindowMetrics?.insets?.top ?? 47) + 12;
const FILTER_SHEET_TRAVEL = SCREEN_H - FILTER_SHEET_TOP;

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

function defaultRequestMessage(tutorName) {
  return `Bonjour ${firstName(tutorName)}, je souhaite réserver un cours pour…`;
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
  if (Number.isFinite(fromProfile) && fromProfile > 0) return Math.round(fromProfile);
  const reviews = Number(tutor?.reviewCount) || 0;
  return reviews > 0 ? reviews * 6 : 0;
}

export default function SwipeScreen() {
  const { userId } = useAuth();
  const navigation = useNavigation();
  const {
    isFavorite,
    isToggling,
    toggleFavorite,
    reload: reloadFavorites,
    error: favoriteError,
  } = useFavoriteTutors();
  const { filters } = useParentSearch();
  const [allTutors, setAllTutors] = useState([]);
  const [index, setIndex] = useState(0);
  const [liked, setLiked] = useState([]);
  const [passed, setPassed] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filterSlide = useRef(new Animated.Value(FILTER_SHEET_TRAVEL)).current;
  const closeFiltersRef = useRef(() => {});
  const filterHandlePan = useRef(null);
  if (!filterHandlePan.current) {
    const springOpen = () => {
      Animated.spring(filterSlide, {
        toValue: 0,
        useNativeDriver: true,
        speed: 20,
        bounciness: 0,
      }).start();
    };
    filterHandlePan.current = PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gesture) =>
        gesture.dy > 4 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
      onPanResponderGrant: () => {
        filterSlide.stopAnimation();
      },
      onPanResponderMove: (_, gesture) => {
        filterSlide.setValue(Math.max(0, gesture.dy));
      },
      onPanResponderRelease: (_, gesture) => {
        const dy = Math.max(0, gesture.dy);
        if (dy > 80 || gesture.vy > 0.8) closeFiltersRef.current();
        else springOpen();
      },
      onPanResponderTerminate: springOpen,
    });
  }
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailReviews, setDetailReviews] = useState([]);
  const [detailReviewsLoading, setDetailReviewsLoading] = useState(false);
  const [messageModalOpen, setMessageModalOpen] = useState(false);
  const [messageDraft, setMessageDraft] = useState('');
  const [sendingRequest, setSendingRequest] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);
  const [pageWidth, setPageWidth] = useState(SCREEN_W - 40);
  const toastTimerRef = useRef(null);
  const pagerRef = useRef(null);
  const pageWidthRef = useRef(SCREEN_W - 40);
  const indexRef = useRef(0);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  function showToast(message) {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToastMessage(message);
    toastTimerRef.current = setTimeout(() => {
      setToastMessage(null);
      toastTimerRef.current = null;
    }, 3200);
  }

  async function loadTutors() {
    setLoading(true);
    setError(null);
    setActionError(null);

    try {
      const profiles = await fetchTutorProfiles({
        excludeClerkId: userId,
      });
      let available = profiles;

      if (userId) {
        const matches = await fetchMatches(userId, {
          statuses: [
            MATCH_STATUS.PENDING,
            MATCH_STATUS.ACCEPTED,
            MATCH_STATUS.DECLINED,
          ],
        });
        const matchedIds = new Set(matches.map((match) => match.tutorId));
        available = profiles.filter((tutor) => !matchedIds.has(tutor.id));
      }

      setAllTutors(available);
      indexRef.current = 0;
      setIndex(0);
      setLiked([]);
      setPassed([]);
    } catch (err) {
      setAllTutors([]);
      setError(err?.message ?? 'Erreur de chargement.');
    } finally {
      setLoading(false);
    }
  }

  useFocusEffect(
    useCallback(() => {
      loadTutors();
      reloadFavorites();
    }, [userId])
  );

  const hasActiveFilters = filters.hasActiveFilters;

  const tutors = useMemo(
    () => allTutors.filter(filters.matchesTutor),
    [allTutors, filters.matchesTutor]
  );

  function scrollToTutor(next, animated = true) {
    const max = Math.max(tutors.length - 1, 0);
    const clamped = Math.max(0, Math.min(next, max));
    indexRef.current = clamped;
    setIndex(clamped);
    const width = pageWidthRef.current;
    if (width > 0) {
      pagerRef.current?.scrollTo({ x: clamped * width, animated });
    }
  }

  function resetDeck() {
    indexRef.current = 0;
    setIndex(0);
    setLiked([]);
    setPassed([]);
    setActionError(null);
    pagerRef.current?.scrollTo({ x: 0, animated: false });
  }

  filters.onDeckReset.current = resetDeck;

  function onStageLayout(event) {
    const width = Math.round(event.nativeEvent.layout.width);
    if (!width || width === pageWidthRef.current) return;
    pageWidthRef.current = width;
    setPageWidth(width);
    pagerRef.current?.scrollTo({ x: index * width, animated: false });
  }

  function onTutorScroll(event) {
    const width = pageWidthRef.current;
    if (!width) return;
    const raw = event.nativeEvent.contentOffset.x / width;
    const next = Math.max(
      0,
      Math.min(tutors.length - 1, Math.round(raw))
    );
    if (next === indexRef.current) return;
    indexRef.current = next;
    setIndex(next);
  }

  function openFilters() {
    filterSlide.setValue(FILTER_SHEET_TRAVEL);
    setFiltersOpen(true);
  }

  useEffect(() => {
    if (!filtersOpen) return undefined;
    const animation = Animated.timing(filterSlide, {
      toValue: 0,
      duration: 280,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [filtersOpen, filterSlide]);

  function closeFilters() {
    Animated.timing(filterSlide, {
      toValue: FILTER_SHEET_TRAVEL,
      duration: 220,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) setFiltersOpen(false);
    });
  }

  closeFiltersRef.current = closeFilters;

  const tutor = tutors[index];
  const detailSubjects = (
    tutor?.specialties?.length ? tutor.specialties : [tutor?.subject]
  ).filter(Boolean);
  const detailLessons = tutor ? getLessonsGiven(tutor) : 0;
  const detailFormats = TEACHING_FORMATS.filter((format) =>
    (tutor?.teachingFormats ?? []).includes(format)
  );

  useEffect(() => {
    if (!detailOpen || !tutor?.id) return undefined;
    let cancelled = false;
    setDetailReviewsLoading(true);
    fetchTutorReviews(tutor.id)
      .then((rows) => {
        if (!cancelled) setDetailReviews(rows);
      })
      .catch(() => {
        if (!cancelled) setDetailReviews([]);
      })
      .finally(() => {
        if (!cancelled) setDetailReviewsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [detailOpen, tutor?.id]);
  const isDone = !loading && !error && tutors.length === 0;

  async function onToggleFavorite(target = tutor) {
    if (!target || isToggling(target.id)) return;
    try {
      const nowFavorite = await toggleFavorite(target.id);
      showToast(
        nowFavorite
          ? 'Tuteur ajouté à tes favoris.'
          : 'Tuteur retiré de tes favoris.'
      );
    } catch (err) {
      setActionError(err?.message ?? favoriteError ?? 'Action favori impossible.');
    }
  }

  function openDetails() {
    if (!tutor) return;
    setActionError(null);
    setDetailOpen(true);
  }

  function openMessageModal() {
    if (!tutor || sendingRequest) return;
    setActionError(null);
    setMessageDraft(defaultRequestMessage(tutor.name));
    setMessageModalOpen(true);
  }

  async function onSendRequest() {
    if (!tutor || sendingRequest) return;

    const content = messageDraft.trim();
    if (!content) {
      setActionError('Écris un message avant d’envoyer.');
      return;
    }
    if (!userId) {
      setActionError('Tu dois être connecté pour envoyer une demande.');
      return;
    }

    setSendingRequest(true);
    setActionError(null);
    try {
      await startTutorConversation({
        parentId: userId,
        tutorId: tutor.id,
        content,
        senderId: userId,
      });
      setLiked((prev) => [...prev, tutor.name]);
      setMessageModalOpen(false);
      setDetailOpen(false);
      scrollToTutor(index + 1);
      showToast(
        'Message envoyé ! Retrouve la discussion dans l’onglet Messages.'
      );
    } catch (err) {
      setActionError(err?.message ?? 'Impossible d’envoyer la demande.');
    } finally {
      setSendingRequest(false);
    }
  }

  const reset = () => {
    indexRef.current = 0;
    setIndex(0);
    setLiked([]);
    setPassed([]);
    setActionError(null);
  };

  return (
    <View style={styles.root}>
      <View style={[styles.mintBand, { height: MINT_BAND_H }]} />

      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.container}>
          {toastMessage ? (
            <View style={styles.toast} pointerEvents="none">
              <Ionicons name="checkmark-circle" size={18} color={colors.white} />
              <Text style={styles.toastText}>{toastMessage}</Text>
            </View>
          ) : null}

          <View style={styles.topBar}>
            <Text style={styles.brand} pointerEvents="none">
              Clutch
            </Text>
            <View style={[styles.topBarSide, styles.topBarSideLeft]}>
              <Pressable
                style={[
                  styles.headerIconButton,
                  (filtersOpen || hasActiveFilters) &&
                    styles.headerIconButtonActive,
                ]}
                onPress={openFilters}
                accessibilityLabel="Filtres de recherche"
                hitSlop={8}
              >
                <Ionicons
                  name="options-outline"
                  size={22}
                  color={colors.white}
                />
              </Pressable>
            </View>
            <View style={[styles.topBarSide, styles.topBarSideRight]}>
              <Pressable
                style={styles.headerIconButton}
                onPress={() => navigation.navigate('Settings')}
                accessibilityLabel="Réglages"
                hitSlop={8}
              >
                <Ionicons
                  name="settings-outline"
                  size={22}
                  color={colors.white}
                />
              </Pressable>
            </View>
          </View>

          <Modal
            visible={detailOpen}
            animationType="slide"
            statusBarTranslucent={false}
            onRequestClose={() => {
              if (sendingRequest) return;
              if (messageModalOpen) {
                setMessageModalOpen(false);
                return;
              }
              setDetailOpen(false);
            }}
          >
            <SafeAreaProvider initialMetrics={initialWindowMetrics} style={styles.detailProvider}>
            <View style={styles.root}>
              <View style={[styles.mintBand, { height: MINT_BAND_H }]} />
              <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
                <View style={styles.detailHeader}>
                  <Pressable
                    style={styles.headerIconButton}
                    onPress={() => setDetailOpen(false)}
                    disabled={sendingRequest}
                    accessibilityLabel="Retour"
                    hitSlop={8}
                  >
                    <Ionicons
                      name="chevron-back"
                      size={22}
                      color={colors.white}
                    />
                  </Pressable>
                  <Text style={styles.detailTitle}>Profil</Text>
                  <View style={styles.detailHeaderSpacer} />
                </View>

                {tutor ? (
                  <ScrollView
                    style={styles.detailScroll}
                    contentContainerStyle={styles.detailContent}
                    showsVerticalScrollIndicator={false}
                  >
                    <View style={styles.detailHeroCard}>
                      <Pressable
                        style={styles.detailHeroHeart}
                        onPress={() => onToggleFavorite(tutor)}
                        disabled={isToggling(tutor.id)}
                        accessibilityLabel={
                          isFavorite(tutor.id)
                            ? 'Retirer des favoris'
                            : 'Ajouter aux favoris'
                        }
                        hitSlop={8}
                      >
                        {isToggling(tutor.id) ? (
                          <ActivityIndicator size="small" color={colors.danger} />
                        ) : (
                          <Ionicons
                            name={
                              isFavorite(tutor.id) ? 'heart' : 'heart-outline'
                            }
                            size={22}
                            color={
                              isFavorite(tutor.id) ? colors.danger : colors.muted
                            }
                          />
                        )}
                      </Pressable>
                      <View style={styles.detailHeroAvatar}>
                        {tutor.avatarUrl ? (
                          <Image
                            source={{ uri: tutor.avatarUrl }}
                            style={styles.detailHeroImage}
                          />
                        ) : (
                          <Text style={styles.detailHeroInitials}>
                            {getInitials(tutor.name)}
                          </Text>
                        )}
                      </View>
                      <Text style={styles.detailHeroName}>
                        {firstName(tutor.name)}
                      </Text>
                      <Text style={styles.detailHeroHeadline}>
                        {detailSubjects.length
                          ? `Cours de ${detailSubjects.join(', ')}`
                          : 'Cours à préciser'}
                      </Text>
                      <Text style={styles.detailHeroCity}>
                        {tutor.city
                          ? `${tutor.city}${
                              tutor.postalCode ? ` · ${tutor.postalCode}` : ''
                            }`
                          : 'Ville à préciser'}
                      </Text>
                    </View>

                    <View style={styles.detailStats}>
                      {[
                        [
                          'Note',
                          (tutor.rating || 0) > 0
                            ? tutor.rating.toFixed(1)
                            : '—',
                        ],
                        ['Avis', String(tutor.reviewCount || detailReviews.length || 0)],
                        ['Cours', String(detailLessons)],
                      ].map(([label, value]) => (
                        <View key={label} style={styles.detailStat}>
                          <Text style={styles.detailStatValue}>{value}</Text>
                          <Text style={styles.detailStatLabel}>{label}</Text>
                        </View>
                      ))}
                    </View>

                    <View style={styles.detailBlockCard}>
                      <Text style={styles.detailBlockTitle}>Tarif</Text>
                      <Text style={styles.detailPriceHero}>
                        {formatRate(tutor.hourlyRate)} €
                        <Text style={styles.detailPriceUnit}> / heure</Text>
                      </Text>
                      <Text style={styles.detailBlockText}>
                        Le premier échange se fait par message, sans réservation
                        immédiate.
                      </Text>
                    </View>

                    <View style={styles.detailBlockCard}>
                      <Text style={styles.detailBlockTitle}>À propos</Text>
                      <Text style={tutor.bio ? styles.detailBlockText : styles.bioMuted}>
                        {tutor.bio ||
                          `${firstName(tutor.name)} n’a pas encore rédigé sa présentation.`}
                      </Text>
                    </View>

                    <View style={styles.detailBlockCard}>
                      <Text style={styles.detailBlockTitle}>Matières</Text>
                      <View style={styles.detailChipWrap}>
                        {(detailSubjects.length
                          ? detailSubjects
                          : ['À préciser']
                        ).map((subject) => (
                          <View key={`${tutor.id}-${subject}`} style={styles.detailChip}>
                            <Text style={styles.detailChipLabel}>{subject}</Text>
                          </View>
                        ))}
                      </View>
                    </View>

                    <View style={styles.detailBlockCard}>
                      <Text style={styles.detailBlockTitle}>Parcours</Text>
                      <Text style={styles.detailBlockText}>
                        {`${firstPersonLevel(tutor.studyYear)} ${
                          detailSubjects.length
                            ? `J’accompagne des élèves en ${joinSubjects(detailSubjects)}.`
                            : 'Les matières que je propose ne sont pas encore précisées.'
                        } Je reprends le chapitre en cours, je montre comment attaquer un exercice, puis on s’entraîne jusqu’à ce que la méthode soit claire.`}
                      </Text>
                    </View>

                    <View style={styles.detailBlockCard}>
                      <Text style={styles.detailBlockTitle}>
                        Où et comment se passe le cours
                      </Text>
                      <Text style={styles.detailBlockText}>
                        {tutor.city
                          ? `J’habite à ${tutor.city}.`
                          : 'Je n’ai pas encore indiqué ma ville.'}
                      </Text>
                      {detailFormats.length ? (
                        detailFormats.map((format) => (
                          <View key={format} style={styles.detailFormatCard}>
                            <Text style={styles.detailFormatTitle}>{format}</Text>
                            <Text style={styles.detailBlockText}>
                              {FORMAT_DETAILS[format]}
                            </Text>
                          </View>
                        ))
                      ) : (
                        <Text style={styles.bioMuted}>
                          Je n’ai pas encore précisé comment se passe le cours.
                        </Text>
                      )}
                    </View>

                    <View style={styles.detailBlockCard}>
                      <Text style={styles.detailBlockTitle}>Avis</Text>
                      {detailReviewsLoading ? (
                        <ActivityIndicator color={colors.mintDeep} />
                      ) : (
                        <>
                          {detailReviews.length === 0 ? (
                            <Text style={styles.detailReviewHint}>
                              Exemples, pour voir le rendu.
                            </Text>
                          ) : null}
                          {(detailReviews.length ? detailReviews : SAMPLE_REVIEWS).map(
                            (review, reviewIndex, list) => (
                              <View
                                key={review.id}
                                style={[
                                  styles.detailReview,
                                  reviewIndex === list.length - 1 &&
                                    styles.detailReviewLast,
                                ]}
                              >
                                <View style={styles.detailReviewHead}>
                                  <Text style={styles.detailReviewAuthor}>
                                    {review.author || 'Parent'}
                                  </Text>
                                  <Text style={styles.detailReviewDate}>
                                    {formatReviewDate(review.createdAt)}
                                  </Text>
                                </View>
                                <Text style={styles.detailReviewRating}>
                                  {'★'.repeat(review.rating)}
                                  {'☆'.repeat(Math.max(0, 5 - review.rating))}
                                </Text>
                                <Text style={styles.detailBlockText}>
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
              <View style={styles.detailFooter}>
                <Pressable
                  style={[
                    styles.detailMessageButton,
                    sendingRequest && styles.disabled,
                  ]}
                  onPress={openMessageModal}
                  disabled={!tutor || sendingRequest}
                  accessibilityLabel="Envoyer un message"
                >
                  {sendingRequest ? (
                    <ActivityIndicator color={colors.white} />
                  ) : (
                    <>
                      <Ionicons
                        name="chatbubble-ellipses"
                        size={18}
                        color={colors.white}
                      />
                      <Text style={styles.messageButtonLabel}>
                        Envoyer un message
                      </Text>
                    </>
                  )}
                </Pressable>
              </View>
              {messageModalOpen ? (
                <View style={styles.detailMessageOverlay}>
                  <Pressable
                    style={styles.modalBackdrop}
                    onPress={() => {
                      if (!sendingRequest) setMessageModalOpen(false);
                    }}
                  />
                  <View style={styles.modalCard}>
                    <Text style={styles.modalTitle}>Proposer un cours</Text>
                    <Text style={styles.modalSectionLabel}>
                      Message à {tutor?.name ?? 'ton tuteur'}
                    </Text>
                    <TextInput
                      style={styles.messageInput}
                      value={messageDraft}
                      onChangeText={setMessageDraft}
                      multiline
                      textAlignVertical="top"
                      placeholder="Écris ta demande…"
                      placeholderTextColor={colors.mutedSoft}
                      editable={!sendingRequest}
                    />
                    <Pressable
                      style={[
                        styles.modalPrimary,
                        (!messageDraft.trim() || sendingRequest) &&
                          styles.disabled,
                      ]}
                      onPress={onSendRequest}
                      disabled={!messageDraft.trim() || sendingRequest}
                    >
                      {sendingRequest ? (
                        <ActivityIndicator color={colors.white} />
                      ) : (
                        <Text style={styles.modalPrimaryLabel}>
                          Envoyer la demande
                        </Text>
                      )}
                    </Pressable>
                    <Pressable
                      style={styles.modalCancel}
                      onPress={() => setMessageModalOpen(false)}
                      disabled={sendingRequest}
                    >
                      <Text style={styles.modalCancelLabel}>Annuler</Text>
                    </Pressable>
                  </View>
                </View>
              ) : null}
            </View>
            </SafeAreaProvider>
          </Modal>

          <View style={styles.cardStage} onLayout={onStageLayout}>
            {loading ? (
              <View style={[styles.card, styles.stateCard]}>
                <ActivityIndicator size="large" color={colors.mintDeep} />
                <Text style={styles.stateText}>Chargement des tuteurs…</Text>
              </View>
            ) : error ? (
              <View style={[styles.card, styles.stateCard]}>
                <Text style={styles.emptyTitle}>Impossible de charger</Text>
                <Text style={styles.emptyText}>{error}</Text>
                <Pressable style={styles.retryButton} onPress={loadTutors}>
                  <Text style={styles.retryLabel}>Réessayer</Text>
                </Pressable>
              </View>
            ) : isDone ? (
              <View style={[styles.card, styles.stateCard]}>
                <Text style={styles.emptyTitle}>
                  {tutors.length === 0 ? 'Aucun tuteur' : 'Plus de tuteurs'}
                </Text>
                <Text style={styles.emptyText}>
                  {tutors.length === 0
                    ? hasActiveFilters
                      ? 'Aucun tuteur ne correspond à tes filtres. Élargis la matière, l’adresse, le prix ou le niveau.'
                      : 'Tous les tuteurs sont déjà matchés, ou aucun profil n’est disponible.'
                    : `Demandes : ${liked.length || 0}\nPassés : ${passed.length || 0}\n\nRetrouve tes conversations dans Messages.`}
                </Text>
                <Pressable
                  style={styles.retryButton}
                  onPress={
                    tutors.length === 0
                      ? hasActiveFilters
                        ? filters.clearAllFilters
                        : loadTutors
                      : reset
                  }
                >
                  <Text style={styles.retryLabel}>
                    {tutors.length === 0
                      ? hasActiveFilters
                        ? 'Effacer les filtres'
                        : 'Réessayer'
                      : 'Recommencer'}
                  </Text>
                </Pressable>
              </View>
            ) : (
              <ScrollView
                ref={pagerRef}
                horizontal
                pagingEnabled
                directionalLockEnabled
                nestedScrollEnabled
                showsHorizontalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                decelerationRate="fast"
                style={styles.pager}
                snapToInterval={pageWidth || undefined}
                snapToAlignment="start"
                disableIntervalMomentum
                scrollEventThrottle={16}
                onScroll={onTutorScroll}
              >
                {tutors.map((item) => {
                  const itemFavorite = isFavorite(item.id);
                  const itemLessons = getLessonsGiven(item);
                  const subjects = (
                    item.specialties?.length ? item.specialties : [item.subject]
                  ).filter(Boolean);
                  const cityLabel = item.city
                    ? `${item.city}${item.postalCode ? ` · ${item.postalCode}` : ''}`
                    : 'À préciser';
                  const ratingLabel =
                    (item.rating || 0) > 0 ? item.rating.toFixed(1) : '—';
                  const lessonsLabel =
                    itemLessons > 0
                      ? `${itemLessons} cours donnés avec succès`
                      : 'Pas encore de cours';
                  const travels = tutorCanTravel(item.teachingFormats);
                  return (
                    <View
                      key={item.id}
                      style={[styles.page, { width: pageWidth }]}
                    >
                      <View style={styles.recapClip}>
                      <View style={[styles.card, styles.recapCard]}>
                        <View style={styles.recapIdentity}>
                          <View style={styles.recapAvatar}>
                            {item.avatarUrl ? (
                              <Image
                                source={{ uri: item.avatarUrl }}
                                style={styles.recapAvatarImage}
                              />
                            ) : (
                              <Text style={styles.recapAvatarText}>
                                {getInitials(item.name)}
                              </Text>
                            )}
                          </View>
                          <View style={styles.recapIdentityText}>
                            <Text style={styles.recapName} numberOfLines={1}>
                              {firstName(item.name)}
                            </Text>
                            <Text style={styles.recapRating} numberOfLines={1}>
                              ★ {ratingLabel}
                            </Text>
                          </View>
                          <Pressable
                            style={styles.recapHeart}
                            onPress={() => onToggleFavorite(item)}
                            disabled={isToggling(item.id)}
                            accessibilityLabel={
                              itemFavorite
                                ? 'Retirer des favoris'
                                : 'Ajouter aux favoris'
                            }
                            hitSlop={8}
                          >
                            {isToggling(item.id) ? (
                              <ActivityIndicator
                                size="small"
                                color={colors.danger}
                              />
                            ) : (
                              <Ionicons
                                name={itemFavorite ? 'heart' : 'heart-outline'}
                                size={20}
                                color={
                                  itemFavorite ? colors.danger : colors.muted
                                }
                              />
                            )}
                          </Pressable>
                        </View>

                        <Text style={styles.recapLessons} numberOfLines={2}>
                          {lessonsLabel}
                        </Text>

                        <View style={styles.recapSplit}>
                          <View style={styles.recapSplitMain}>
                            <Text style={styles.recapLabelFloat}>Matières</Text>
                            <View style={styles.recapZoneBody}>
                              <View style={styles.recapSubjectList}>
                                {(subjects.length
                                  ? subjects
                                  : ['À préciser']
                                ).map((subject, subjectIndex) => (
                                  <Text
                                    key={`${item.id}-${subject}-${subjectIndex}`}
                                    style={styles.recapValue}
                                    numberOfLines={1}
                                  >
                                    {subject}
                                  </Text>
                                ))}
                              </View>
                            </View>
                          </View>
                          <View style={styles.recapPricePane}>
                            <Text style={[styles.recapLabelFloat, styles.recapPriceLabel]}>
                              Tarif
                            </Text>
                            <View style={styles.recapPriceBody}>
                              <Text style={styles.recapPrice} numberOfLines={2}>
                                {formatRate(item.hourlyRate)} €/h
                              </Text>
                            </View>
                          </View>
                        </View>

                        <View style={styles.recapLevelRow}>
                          <Text style={styles.recapLabelFloat}>Niveau</Text>
                          <View style={styles.recapPriceBody}>
                            <Text style={styles.recapValue} numberOfLines={1}>
                              {item.studyYear || 'À préciser'}
                            </Text>
                          </View>
                        </View>

                        <View style={styles.recapRow}>
                          <Text style={styles.recapLabel}>Ville</Text>
                          <Text style={styles.recapValue} numberOfLines={2}>
                            {cityLabel}
                          </Text>
                          <Text style={styles.recapTravel} numberOfLines={1}>
                            {travels ? 'Peut se déplacer' : 'Ne se déplace pas'}
                          </Text>
                        </View>
                      </View>
                      </View>
                    </View>
                  );
                })}
              </ScrollView>
            )}
          </View>

          {!loading && !error && tutors.length > 0 ? (
            <View style={styles.pagerIndicator}>
              {tutors.length > 12 ? (
                <View style={styles.pagerTrack}>
                  <View
                    style={[
                      styles.pagerThumb,
                      {
                        width: `${100 / tutors.length}%`,
                        left: `${(index / tutors.length) * 100}%`,
                      },
                    ]}
                  />
                </View>
              ) : (
                <View style={styles.dotRow}>
                  {tutors.map((item, position) => (
                    <View
                      key={item.id}
                      style={[
                        styles.dot,
                        position === index && styles.dotActive,
                      ]}
                    />
                  ))}
                </View>
              )}
              <Text style={styles.pagerCount}>
                {Math.min(index + 1, tutors.length)} / {tutors.length}
              </Text>
            </View>
          ) : null}

          {actionError ? (
            <Text style={styles.actionError}>{actionError}</Text>
          ) : null}

          {!loading && !error && !isDone ? (
            <Pressable
              style={styles.detailsButton}
              onPress={openDetails}
              accessibilityLabel="Voir plus de détails"
            >
              <Text style={styles.detailsButtonLabel}>Voir plus de détails</Text>
            </Pressable>
          ) : null}
        </View>
      </SafeAreaView>

      {filtersOpen ? (
        <View style={styles.filterLayer}>
          <Pressable style={styles.filterBackdrop} onPress={closeFilters} />
          <Animated.View
            style={[
              styles.filterDrawer,
              { transform: [{ translateY: filterSlide }] },
            ]}
          >
            <SafeAreaView style={styles.filterDrawerSafe} edges={['bottom']}>
              <View
                style={styles.filterHandleWrap}
                {...filterHandlePan.current.panHandlers}
              >
                <View style={styles.filterHandle} />
              </View>
              <View style={styles.filterDrawerHeader}>
                <Text pointerEvents="none" style={styles.filterDrawerTitle}>
                  Filtres
                </Text>
                <Pressable
                  style={styles.filterClose}
                  onPress={closeFilters}
                  hitSlop={8}
                  accessibilityLabel="Fermer les filtres"
                >
                  <Ionicons name="close" size={22} color={colors.ink} />
                </Pressable>
                <Pressable
                  style={styles.filterClearButton}
                  onPress={filters.clearAllFilters}
                  hitSlop={8}
                >
                  <Text style={styles.filterClear}>Effacer</Text>
                </Pressable>
              </View>

              <ScrollView
                style={styles.filterDrawerScroll}
                contentContainerStyle={styles.filterDrawerContent}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                <TutorFilterFields filters={filters} />
              </ScrollView>

              <View style={styles.filterFooter}>
                <Pressable style={styles.filterApply} onPress={closeFilters}>
                  <Text style={styles.filterApplyLabel}>
                    {tutors.length === 1
                      ? 'Voir 1 prof'
                      : `Voir ${tutors.length} profs`}
                  </Text>
                </Pressable>
              </View>
            </SafeAreaView>
          </Animated.View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.page,
  },
  filterLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 40,
  },
  filterBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(16, 38, 28, 0.45)',
  },
  filterDrawer: {
    position: 'absolute',
    top: FILTER_SHEET_TOP,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.white,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: 'hidden',
    shadowColor: '#10261C',
    shadowOpacity: 0.2,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: -8 },
    elevation: 16,
  },
  filterDrawerSafe: {
    flex: 1,
    backgroundColor: colors.white,
  },
  filterHandleWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 10,
    paddingBottom: 8,
  },
  filterHandle: {
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#D5DED9',
  },
  filterDrawerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  filterClose: {
    zIndex: 2,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.page,
  },
  filterDrawerTitle: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 0,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '800',
    color: colors.ink,
  },
  filterClearButton: {
    zIndex: 2,
  },
  filterClear: {
    minWidth: 36,
    textAlign: 'right',
    fontSize: 15,
    fontWeight: '700',
    color: colors.mintDeep,
  },
  filterDrawerScroll: {
    flex: 1,
  },
  filterDrawerContent: {
    paddingBottom: 8,
  },
  filterSection: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  filterSectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  filterSectionCopy: {
    flex: 1,
    gap: 3,
  },
  filterSectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.ink,
  },
  filterSectionSummary: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.mutedSoft,
  },
  filterSectionSummaryActive: {
    color: colors.mintDeep,
  },
  filterSectionBody: {
    paddingHorizontal: 10,
    paddingBottom: 8,
  },
  filterHint: {
    marginTop: 2,
    marginBottom: 6,
    marginHorizontal: 8,
    fontSize: 13,
    fontWeight: '700',
    color: colors.muted,
  },
  filterSlider: {
    marginHorizontal: 8,
    marginTop: 4,
    marginBottom: 10,
  },
  filterSliderCaption: {
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '700',
    color: colors.mintDeep,
    marginBottom: 8,
  },
  filterSliderHit: {
    height: 36,
    justifyContent: 'center',
  },
  filterSliderTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: '#E2EAE5',
  },
  filterSliderFill: {
    position: 'absolute',
    top: 15,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.mintDeep,
  },
  filterSliderThumb: {
    position: 'absolute',
    top: 5,
    width: SLIDER_THUMB,
    height: SLIDER_THUMB,
    borderRadius: SLIDER_THUMB / 2,
    backgroundColor: colors.white,
    borderWidth: 3,
    borderColor: colors.mintDeep,
    ...shadows.soft,
  },
  filterSliderEnds: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 6,
  },
  filterSliderEnd: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    color: colors.mutedSoft,
  },
  filterSliderEndRight: {
    textAlign: 'right',
  },
  filterChoice: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingHorizontal: 8,
    paddingVertical: 11,
    borderRadius: 12,
  },
  filterChoiceLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: colors.ink,
  },
  filterChoiceLabelActive: {
    fontWeight: '700',
    color: colors.mintDeep,
  },
  drawerInput: {
    marginHorizontal: 8,
    marginBottom: 8,
    backgroundColor: colors.page,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.ink,
  },
  suggestList: {
    marginHorizontal: 8,
    marginTop: -2,
    marginBottom: 8,
    borderRadius: 12,
    backgroundColor: colors.page,
    overflow: 'hidden',
  },
  suggestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  suggestLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: colors.ink,
  },
  originHint: {
    marginHorizontal: 8,
    marginBottom: 8,
    fontSize: 13,
    fontWeight: '700',
    color: colors.mintDeep,
  },
  filterFooter: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.white,
  },
  filterApply: {
    height: 52,
    borderRadius: 16,
    backgroundColor: colors.mintDeep,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterApplyLabel: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '800',
  },
  mintBand: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.mint,
  },
  safe: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  container: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 16,
  },
  toast: {
    position: 'absolute',
    top: 8,
    left: 20,
    right: 20,
    zIndex: 30,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.mintDeep,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    ...shadows.soft,
  },
  toastText: {
    flex: 1,
    color: colors.white,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  topBar: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    minHeight: 44,
    position: 'relative',
    zIndex: 10,
  },
  brand: {
    position: 'absolute',
    left: 0,
    right: 0,
    textAlign: 'center',
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: 0.3,
    color: colors.white,
  },
  topBarSide: {
    flex: 1,
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
  },
  topBarSideLeft: {
    justifyContent: 'flex-start',
  },
  topBarSideRight: {
    justifyContent: 'flex-end',
    gap: 4,
  },
  headerIconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.38)',
  },
  headerIconButtonActive: {
    backgroundColor: 'rgba(255,255,255,0.28)',
    borderColor: 'rgba(255,255,255,0.7)',
  },
  filtersBlock: {
    width: '100%',
    marginBottom: 8,
    zIndex: 9,
    gap: 4,
  },
  filtersHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  filtersLabel: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.4,
    color: colors.white,
    textTransform: 'uppercase',
  },
  clearFiltersLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.white,
  },
  filterSectionLabel: {
    marginTop: 8,
    marginBottom: 6,
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.82)',
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    paddingRight: 8,
  },
  cityInput: {
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderWidth: 1.5,
    borderColor: colors.mintDeep,
    borderRadius: radii.button,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.ink,
    marginBottom: 2,
  },
  filterChip: {
    borderRadius: radii.pill,
    borderWidth: 1.5,
    borderColor: colors.mintDeep,
    backgroundColor: 'rgba(255,255,255,0.85)',
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  filterChipActive: {
    backgroundColor: colors.mintDeep,
  },
  filterChipLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.mintDeep,
  },
  filterChipLabelActive: {
    color: colors.white,
  },
  favoriteButton: {
    marginLeft: 'auto',
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.badgeMint,
  },
  locationLine: {
    marginTop: 4,
    fontSize: 13,
    color: colors.muted,
  },
  formatChip: {
    backgroundColor: colors.badgeMint,
    borderRadius: radii.chip,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  formatChipLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.mintDeep,
  },
  cardStage: {
    flex: 1,
    minHeight: 0,
    paddingTop: 12,
    backgroundColor: 'transparent',
  },
  pager: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  page: {
    height: '100%',
    backgroundColor: 'transparent',
  },
  card: {
    flex: 1,
    minHeight: 0,
    backgroundColor: colors.card,
    borderRadius: radii.card,
    marginTop: 0,
    paddingTop: 16,
    paddingHorizontal: 16,
    paddingBottom: 16,
    ...shadows.card,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
  },
  avatar: {
    width: 92,
    height: 92,
    borderRadius: 18,
    marginTop: 0,
    backgroundColor: colors.mintSoft,
    borderWidth: 3,
    borderColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    ...shadows.soft,
  },
  avatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 15,
  },
  avatarText: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.mintDeep,
  },
  headerMain: {
    flex: 1,
    paddingTop: 10,
    minWidth: 0,
  },
  nameRatingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  name: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.ink,
    flexShrink: 1,
  },
  ratingInline: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.mintDeep,
  },
  studyYear: {
    marginTop: 4,
    fontSize: 14,
    fontWeight: '500',
    color: colors.mutedSoft,
  },
  recapClip: {
    flex: 1,
    minHeight: 0,
    borderRadius: radii.card,
    overflow: 'hidden',
    backgroundColor: 'transparent',
  },
  recapCard: {
    paddingTop: 0,
    overflow: 'hidden',
    backgroundColor: colors.card,
    borderRadius: radii.card,
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },
  recapIdentity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingTop: 16,
    paddingBottom: 10,
  },
  recapAvatar: {
    width: 112,
    height: 112,
    borderRadius: 24,
    backgroundColor: colors.mintSoft,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  recapAvatarImage: {
    width: '100%',
    height: '100%',
  },
  recapAvatarText: {
    fontSize: 32,
    fontWeight: '800',
    color: colors.mintDeep,
  },
  recapIdentityText: {
    flex: 1,
    minWidth: 0,
  },
  recapName: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.ink,
  },
  recapRating: {
    marginTop: 6,
    fontSize: 18,
    fontWeight: '800',
    color: colors.ink,
  },
  recapLessons: {
    marginBottom: 12,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '600',
    color: colors.muted,
  },
  recapHeart: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.chipBg,
  },
  recapSplit: {
    flexGrow: 0,
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'stretch',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  recapSplitMain: {
    flex: 1,
    minWidth: 0,
    paddingRight: 14,
  },
  recapZoneBody: {
    paddingTop: 30,
    paddingBottom: 10,
    alignItems: 'flex-start',
  },
  recapSubjectList: {
    height: 83,
    gap: 4,
    justifyContent: 'center',
    alignItems: 'flex-start',
    alignSelf: 'stretch',
  },
  recapPriceBody: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'flex-start',
    paddingTop: 18,
  },
  recapLabelFloat: {
    position: 'absolute',
    top: 12,
    left: 0,
    zIndex: 1,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: colors.mutedSoft,
  },
  recapPriceLabel: {
    left: 14,
  },
  recapPricePane: {
    width: 118,
    paddingLeft: 14,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: colors.border,
  },
  recapLevelRow: {
    flex: 1,
    minHeight: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  recapRow: {
    flex: 1,
    justifyContent: 'flex-start',
    minHeight: 0,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  recapLabel: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: colors.mutedSoft,
    marginBottom: 4,
  },
  recapValue: {
    fontSize: 19,
    lineHeight: 25,
    fontWeight: '700',
    color: colors.ink,
  },
  recapTravel: {
    marginTop: 4,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '600',
    color: colors.muted,
  },
  recapPrice: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '800',
    color: colors.ink,
  },
  cardBodyContent: {
    flexGrow: 1,
    paddingBottom: 8,
  },
  specialtyWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  specialtyChip: {
    backgroundColor: colors.chipBg,
    borderRadius: radii.chip,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  specialtyChipLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.ink,
  },
  priceBadge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.badgeMint,
    borderRadius: radii.chip,
    paddingHorizontal: 14,
    paddingVertical: 9,
    marginBottom: 14,
  },
  priceBadgeText: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.ink,
  },
  lessonsLine: {
    fontSize: 15,
    color: colors.ink,
    marginBottom: 16,
  },
  lessonsCount: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.ink,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#D8DED9',
    marginBottom: 14,
  },
  bio: {
    fontSize: 15,
    lineHeight: 23,
    color: '#3D4F45',
  },
  bioMuted: {
    fontSize: 14,
    fontStyle: 'italic',
    color: colors.mutedSoft,
  },
  pagerIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginTop: 10,
    minHeight: 18,
  },
  dotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    flexShrink: 1,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 999,
    backgroundColor: colors.mintSoft,
  },
  dotActive: {
    width: 18,
    backgroundColor: colors.mintDeep,
  },
  pagerTrack: {
    flex: 1,
    maxWidth: 180,
    height: 6,
    borderRadius: 999,
    backgroundColor: colors.mintSoft,
    overflow: 'hidden',
  },
  pagerThumb: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    borderRadius: 999,
    backgroundColor: colors.mintDeep,
  },
  pagerCount: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.mintDeep,
  },
  stateCard: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  stateText: {
    fontSize: 15,
    color: colors.muted,
    textAlign: 'center',
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.ink,
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 15,
    lineHeight: 23,
    color: colors.muted,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 8,
    backgroundColor: colors.mintDeep,
    borderRadius: radii.button,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  retryLabel: {
    color: colors.white,
    fontWeight: '700',
    fontSize: 15,
  },
  actionError: {
    marginTop: 8,
    color: colors.danger,
    textAlign: 'center',
    fontSize: 14,
  },
  actions: {
    marginTop: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  detailsButton: {
    marginTop: 14,
    height: 54,
    borderRadius: radii.button,
    backgroundColor: colors.white,
    borderWidth: 1.5,
    borderColor: colors.mintDeep,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.soft,
  },
  detailsButtonLabel: {
    color: colors.mintDeep,
    fontSize: 16,
    fontWeight: '700',
  },
  detailProvider: {
    flex: 1,
  },
  detailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 8,
    zIndex: 2,
  },
  detailTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.white,
  },
  detailHeaderSpacer: {
    width: 40,
  },
  detailScroll: {
    flex: 1,
    minHeight: 0,
  },
  detailContent: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 110,
  },
  detailCard: {
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: 'auto',
  },
  detailHeroCard: {
    backgroundColor: colors.card,
    borderRadius: radii.card,
    alignItems: 'center',
    paddingTop: 28,
    paddingBottom: 22,
    paddingHorizontal: 20,
    ...shadows.soft,
  },
  detailHeroHeart: {
    position: 'absolute',
    top: 14,
    right: 14,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.chipBg,
  },
  detailHeroAvatar: {
    width: 112,
    height: 112,
    borderRadius: 56,
    backgroundColor: colors.mintSoft,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  detailHeroImage: {
    width: '100%',
    height: '100%',
  },
  detailHeroInitials: {
    fontSize: 36,
    fontWeight: '800',
    color: colors.mintDeep,
  },
  detailHeroName: {
    marginTop: 14,
    fontSize: 28,
    fontWeight: '800',
    color: colors.ink,
  },
  detailHeroHeadline: {
    marginTop: 6,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '600',
    textAlign: 'center',
    color: colors.ink,
  },
  detailHeroCity: {
    marginTop: 6,
    fontSize: 14,
    fontWeight: '600',
    color: colors.muted,
  },
  detailStats: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  detailStat: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 8,
    ...shadows.soft,
  },
  detailStatValue: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.ink,
  },
  detailStatLabel: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: '700',
    color: colors.mutedSoft,
  },
  detailBlockCard: {
    marginTop: 12,
    backgroundColor: colors.card,
    borderRadius: radii.card,
    paddingHorizontal: 18,
    paddingVertical: 18,
    ...shadows.soft,
  },
  detailBlockTitle: {
    marginBottom: 8,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: colors.mintDeep,
  },
  detailBlockText: {
    fontSize: 16,
    lineHeight: 24,
    color: colors.ink,
  },
  detailPriceHero: {
    fontSize: 32,
    fontWeight: '800',
    color: colors.ink,
  },
  detailPriceUnit: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.muted,
  },
  detailChipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  detailChip: {
    backgroundColor: colors.badgeMint,
    borderRadius: radii.chip,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  detailChipLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.mintDeep,
  },
  detailFormatCard: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  detailFormatTitle: {
    marginBottom: 4,
    fontSize: 16,
    fontWeight: '800',
    color: colors.ink,
  },
  detailReview: {
    marginTop: 14,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  detailReviewLast: {
    paddingBottom: 0,
    borderBottomWidth: 0,
  },
  detailReviewHint: {
    marginTop: 8,
    marginBottom: 2,
    fontSize: 13,
    color: colors.mutedSoft,
  },
  detailReviewHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  detailReviewAuthor: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.ink,
  },
  detailReviewDate: {
    fontSize: 13,
    color: colors.mutedSoft,
  },
  detailReviewRating: {
    marginTop: 4,
    marginBottom: 6,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1,
    color: colors.star,
  },
  detailSection: {
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  detailSectionLabel: {
    marginBottom: 6,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: colors.mutedSoft,
  },
  detailValue: {
    fontSize: 17,
    lineHeight: 24,
    fontWeight: '700',
    color: colors.ink,
  },
  detailPrice: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '800',
    color: colors.ink,
  },
  detailFormatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  detailFormatYes: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.mintDeep,
  },
  detailFormatNo: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.mutedSoft,
  },
  detailBlock: {
    marginTop: 16,
  },
  detailMessageOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 40,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  detailFooter: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 28,
    backgroundColor: colors.page,
  },
  detailMessageButton: {
    height: 56,
    borderRadius: 16,
    backgroundColor: colors.mintDeep,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    ...shadows.soft,
  },
  messageButton: {
    flex: 1,
    height: 62,
    borderRadius: 31,
    backgroundColor: colors.mintDeep,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 16,
    ...shadows.soft,
  },
  messageButtonLabel: {
    color: colors.white,
    fontSize: 15,
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 42, 31,.45)',
  },
  modalCard: {
    backgroundColor: colors.white,
    borderRadius: radii.card,
    paddingHorizontal: 22,
    paddingTop: 24,
    paddingBottom: 20,
    zIndex: 1,
    ...shadows.card,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.ink,
    marginBottom: 16,
    textAlign: 'center',
  },
  modalSectionLabel: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.4,
    color: colors.mintDeep,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  modalBody: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.muted,
    marginBottom: 14,
  },
  messageInput: {
    minHeight: 120,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    lineHeight: 22,
    color: colors.ink,
    backgroundColor: colors.page,
    marginBottom: 14,
  },
  modalPrimary: {
    backgroundColor: colors.mintDeep,
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: 'center',
  },
  modalPrimaryLabel: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '700',
  },
  modalCancel: {
    marginTop: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  modalCancelLabel: {
    color: colors.muted,
    fontSize: 15,
    fontWeight: '600',
  },
  disabled: {
    opacity: 0.65,
  },
});
