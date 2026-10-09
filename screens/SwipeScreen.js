import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Image,
  Modal,
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

import { colors, radii, shadows } from '../constants/theme';
import {
  fetchMatches,
  fetchTutorProfiles,
  startTutorConversation,
} from '../lib/supabase';
import { MATCH_STATUS, SWIPE_FILTERS, TEACHING_FORMATS } from '../lib/tutorConstants';
import { DISTANCE_OPTIONS, tutorMatchesLocation } from '../lib/geo';
import { useFavoriteTutors } from '../hooks/useFavoriteTutors';

const SCREEN_W = Dimensions.get('window').width;
const SCREEN_H = Dimensions.get('window').height;
const MINT_BAND_H = Math.round(SCREEN_H * 0.22);

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
  const [allTutors, setAllTutors] = useState([]);
  const [index, setIndex] = useState(0);
  const [liked, setLiked] = useState([]);
  const [passed, setPassed] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [activeFilter, setActiveFilter] = useState(null);
  const [cityQuery, setCityQuery] = useState('');
  const [radiusKm, setRadiusKm] = useState(null);
  const [formatFilters, setFormatFilters] = useState([]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [messageModalOpen, setMessageModalOpen] = useState(false);
  const [messageDraft, setMessageDraft] = useState('');
  const [sendingRequest, setSendingRequest] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);
  const [pageWidth, setPageWidth] = useState(SCREEN_W - 40);
  const toastTimerRef = useRef(null);
  const pagerRef = useRef(null);
  const pageWidthRef = useRef(SCREEN_W - 40);

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
        excludeClerkId: null,
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

  const hasActiveFilters =
    Boolean(activeFilter) ||
    Boolean(cityQuery.trim()) ||
    radiusKm != null ||
    formatFilters.length > 0;

  const tutors = useMemo(() => {
    return allTutors.filter((tutor) => {
      if (activeFilter) {
        const needle = activeFilter.toLowerCase();
        const specialtyOk = (tutor.specialties ?? []).some(
          (skill) => String(skill).toLowerCase() === needle
        );
        if (!specialtyOk) return false;
      }

      if (!tutorMatchesLocation(tutor, cityQuery, radiusKm)) {
        return false;
      }

      if (formatFilters.length > 0) {
        const formats = tutor.teachingFormats ?? [];
        const formatOk = formatFilters.every((fmt) => formats.includes(fmt));
        if (!formatOk) return false;
      }

      return true;
    });
  }, [allTutors, activeFilter, cityQuery, radiusKm, formatFilters]);

  function scrollToTutor(next, animated = true) {
    const max = Math.max(tutors.length - 1, 0);
    const clamped = Math.max(0, Math.min(next, max));
    setIndex(clamped);
    const width = pageWidthRef.current;
    if (width > 0) {
      pagerRef.current?.scrollTo({ x: clamped * width, animated });
    }
  }

  function resetDeck() {
    setIndex(0);
    setLiked([]);
    setPassed([]);
    setActionError(null);
    pagerRef.current?.scrollTo({ x: 0, animated: false });
  }

  function onStageLayout(event) {
    const width = Math.round(event.nativeEvent.layout.width);
    if (!width || width === pageWidthRef.current) return;
    pageWidthRef.current = width;
    setPageWidth(width);
    pagerRef.current?.scrollTo({ x: index * width, animated: false });
  }

  function onTutorPageSettled(event) {
    const width = pageWidthRef.current;
    if (!width) return;
    const next = Math.round(event.nativeEvent.contentOffset.x / width);
    if (next !== index) setIndex(next);
  }

  function onSelectFilter(label) {
    setActiveFilter((prev) => (prev === label ? null : label));
    resetDeck();
  }

  function onSelectRadius(value) {
    setRadiusKm(value);
    resetDeck();
  }

  function onToggleFormatFilter(format) {
    setFormatFilters((prev) =>
      prev.includes(format)
        ? prev.filter((item) => item !== format)
        : [...prev, format]
    );
    resetDeck();
  }

  function clearAllFilters() {
    setActiveFilter(null);
    setCityQuery('');
    setRadiusKm(null);
    setFormatFilters([]);
    resetDeck();
  }

  const tutor = tutors[index];
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
                onPress={() => setFiltersOpen((open) => !open)}
                accessibilityLabel="Filtres de recherche"
                hitSlop={8}
              >
                <Ionicons
                  name={filtersOpen ? 'close' : 'options-outline'}
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
              if (!sendingRequest) setDetailOpen(false);
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
                    <View style={[styles.card, styles.detailCard]}>
                      <View style={styles.cardHeader}>
                        <View style={styles.avatar}>
                          {tutor.avatarUrl ? (
                            <Image
                              source={{ uri: tutor.avatarUrl }}
                              style={styles.avatarImage}
                            />
                          ) : (
                            <Text style={styles.avatarText}>
                              {getInitials(tutor.name)}
                            </Text>
                          )}
                        </View>
                        <View style={styles.headerMain}>
                          <View style={styles.nameRatingRow}>
                            <Text style={styles.name} numberOfLines={1}>
                              {firstName(tutor.name)}
                            </Text>
                            <Text style={styles.ratingInline}>
                              ★{' '}
                              {(tutor.rating || 0) > 0
                                ? tutor.rating.toFixed(1)
                                : '—'}
                            </Text>
                            <Pressable
                              style={styles.favoriteButton}
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
                                <ActivityIndicator
                                  size="small"
                                  color={colors.danger}
                                />
                              ) : (
                                <Ionicons
                                  name={
                                    isFavorite(tutor.id)
                                      ? 'heart'
                                      : 'heart-outline'
                                  }
                                  size={22}
                                  color={
                                    isFavorite(tutor.id)
                                      ? colors.danger
                                      : colors.mintDeep
                                  }
                                />
                              )}
                            </Pressable>
                          </View>
                          {tutor.studyYear ? (
                            <Text style={styles.studyYear}>{tutor.studyYear}</Text>
                          ) : null}
                          {tutor.city ? (
                            <Text style={styles.locationLine} numberOfLines={2}>
                              {tutor.city}
                              {tutor.postalCode ? ` (${tutor.postalCode})` : ''}
                            </Text>
                          ) : null}
                        </View>
                      </View>

                      {(tutor.teachingFormats?.length ?? 0) > 0 ? (
                        <View style={[styles.specialtyWrap, styles.detailBlock]}>
                          {tutor.teachingFormats.map((format) => (
                            <View
                              key={`${tutor.id}-detail-fmt-${format}`}
                              style={styles.formatChip}
                            >
                              <Text style={styles.formatChipLabel}>{format}</Text>
                            </View>
                          ))}
                        </View>
                      ) : null}

                      <View style={[styles.specialtyWrap, styles.detailBlock]}>
                        {(tutor.specialties?.length
                          ? tutor.specialties
                          : [tutor.subject]
                        )
                          .filter(Boolean)
                          .map((skill) => (
                            <View
                              key={`${tutor.id}-detail-${skill}`}
                              style={styles.specialtyChip}
                            >
                              <Text style={styles.specialtyChipLabel}>{skill}</Text>
                            </View>
                          ))}
                      </View>

                      <View style={styles.priceBadge}>
                        <Text style={styles.priceBadgeText}>
                          Prix : {formatRate(tutor.hourlyRate)} €/h
                        </Text>
                      </View>

                      <Text style={styles.lessonsLine}>
                        <Text style={styles.lessonsCount}>
                          {getLessonsGiven(tutor)}
                        </Text>
                        {' cours donnés avec succès'}
                      </Text>

                      <View style={styles.divider} />

                      {tutor.bio ? (
                        <Text style={styles.bio}>{tutor.bio}</Text>
                      ) : (
                        <Text style={styles.bioMuted}>Pas encore de bio.</Text>
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
            </View>
            </SafeAreaProvider>
          </Modal>

          <Modal
            visible={messageModalOpen}
            transparent
            animationType="fade"
            onRequestClose={() => {
              if (!sendingRequest) setMessageModalOpen(false);
            }}
          >
            <View style={styles.modalOverlay}>
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
                    (!messageDraft.trim() || sendingRequest) && styles.disabled,
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
          </Modal>

          {filtersOpen ? (
            <View style={styles.filtersBlock}>
              <View style={styles.filtersHeaderRow}>
                <Text style={styles.filtersLabel}>Filtres</Text>
                {hasActiveFilters ? (
                  <Pressable onPress={clearAllFilters} hitSlop={8}>
                    <Text style={styles.clearFiltersLabel}>Tout effacer</Text>
                  </Pressable>
                ) : null}
              </View>

              <Text style={styles.filterSectionLabel}>Matières</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={styles.filterRow}
              >
                <Pressable
                  style={[
                    styles.filterChip,
                    !activeFilter && styles.filterChipActive,
                  ]}
                  onPress={() => onSelectFilter(null)}
                >
                  <Text
                    style={[
                      styles.filterChipLabel,
                      !activeFilter && styles.filterChipLabelActive,
                    ]}
                  >
                    Tous
                  </Text>
                </Pressable>
                {SWIPE_FILTERS.map((label) => {
                  const active = activeFilter === label;
                  return (
                    <Pressable
                      key={label}
                      style={[
                        styles.filterChip,
                        active && styles.filterChipActive,
                      ]}
                      onPress={() => onSelectFilter(label)}
                    >
                      <Text
                        style={[
                          styles.filterChipLabel,
                          active && styles.filterChipLabelActive,
                        ]}
                      >
                        {label}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>

              <Text style={styles.filterSectionLabel}>Ville / code postal</Text>
              <TextInput
                style={styles.cityInput}
                value={cityQuery}
                onChangeText={(text) => {
                  setCityQuery(text);
                  resetDeck();
                }}
                placeholder="Ex. Ottignies-Louvain-la-Neuve ou 1348"
                placeholderTextColor={colors.mutedSoft}
                autoCapitalize="words"
                autoCorrect={false}
              />

              <Text style={styles.filterSectionLabel}>Distance</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={styles.filterRow}
              >
                {DISTANCE_OPTIONS.map((option) => {
                  const active = radiusKm === option.value;
                  return (
                    <Pressable
                      key={option.label}
                      style={[
                        styles.filterChip,
                        active && styles.filterChipActive,
                      ]}
                      onPress={() => onSelectRadius(option.value)}
                    >
                      <Text
                        style={[
                          styles.filterChipLabel,
                          active && styles.filterChipLabelActive,
                        ]}
                      >
                        {option.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>

              <Text style={styles.filterSectionLabel}>Format de cours</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={styles.filterRow}
              >
                {TEACHING_FORMATS.map((format) => {
                  const active = formatFilters.includes(format);
                  return (
                    <Pressable
                      key={format}
                      style={[
                        styles.filterChip,
                        active && styles.filterChipActive,
                      ]}
                      onPress={() => onToggleFormatFilter(format)}
                    >
                      <Text
                        style={[
                          styles.filterChipLabel,
                          active && styles.filterChipLabelActive,
                        ]}
                      >
                        {format}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          ) : null}

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
                      ? 'Aucun tuteur ne correspond à tes filtres. Élargis la ville, la distance ou le format.'
                      : 'Tous les tuteurs sont déjà matchés, ou aucun profil n’est disponible.'
                    : `Demandes : ${liked.length || 0}\nPassés : ${passed.length || 0}\n\nRetrouve tes conversations dans Messages.`}
                </Text>
                <Pressable
                  style={styles.retryButton}
                  onPress={
                    tutors.length === 0
                      ? hasActiveFilters
                        ? clearAllFilters
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
                onMomentumScrollEnd={onTutorPageSettled}
              >
                {tutors.map((item, position) => {
                  const itemFavorite = isFavorite(item.id);
                  const itemLessons = getLessonsGiven(item);
                  return (
                    <View
                      key={item.id}
                      style={[styles.page, { width: pageWidth }]}
                    >
                      <View style={styles.card}>
                        <View style={styles.cardHeader}>
                          <View style={styles.avatar}>
                            {item.avatarUrl ? (
                              <Image
                                source={{ uri: item.avatarUrl }}
                                style={styles.avatarImage}
                              />
                            ) : (
                              <Text style={styles.avatarText}>
                                {getInitials(item.name)}
                              </Text>
                            )}
                          </View>

                          <View style={styles.headerMain}>
                            <View style={styles.nameRatingRow}>
                              <Text style={styles.name} numberOfLines={1}>
                                {firstName(item.name)}
                              </Text>
                              <Text style={styles.ratingInline}>
                                ★{' '}
                                {(item.rating || 0) > 0
                                  ? item.rating.toFixed(1)
                                  : '—'}
                              </Text>
                              <Pressable
                                style={styles.favoriteButton}
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
                                    name={
                                      itemFavorite ? 'heart' : 'heart-outline'
                                    }
                                    size={22}
                                    color={
                                      itemFavorite
                                        ? colors.danger
                                        : colors.mintDeep
                                    }
                                  />
                                )}
                              </Pressable>
                            </View>
                            {item.studyYear ? (
                              <Text style={styles.studyYear}>
                                {item.studyYear}
                              </Text>
                            ) : null}
                            {item.city ? (
                              <Text
                                style={styles.locationLine}
                                numberOfLines={1}
                              >
                                <Ionicons
                                  name="location-outline"
                                  size={13}
                                  color={colors.muted}
                                />{' '}
                                {item.city}
                                {item.postalCode
                                  ? ` (${item.postalCode})`
                                  : ''}
                              </Text>
                            ) : null}
                          </View>
                        </View>

                        <ScrollView
                          style={styles.cardBody}
                          contentContainerStyle={styles.cardBodyContent}
                          showsVerticalScrollIndicator={false}
                          nestedScrollEnabled
                          directionalLockEnabled
                        >
                          <View style={styles.priceBadge}>
                            <Text style={styles.priceBadgeText}>
                              Prix : {formatRate(item.hourlyRate)} €/h
                            </Text>
                          </View>

                          <Text style={styles.lessonsLine}>
                            <Text style={styles.lessonsCount}>
                              {itemLessons}
                            </Text>
                            {' cours donnés avec succès'}
                          </Text>

                          <View style={styles.divider} />

                          {item.bio ? (
                            <Text style={styles.bio}>{item.bio}</Text>
                          ) : (
                            <Text style={styles.bioMuted}>
                              Pas encore de bio.
                            </Text>
                          )}

                        </ScrollView>
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
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.page,
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
  },
  pager: {
    flex: 1,
  },
  page: {
    height: '100%',
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
  cardBody: {
    flex: 1,
    minHeight: 0,
    marginTop: 14,
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
  detailBlock: {
    marginTop: 16,
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
