import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useIsFocused, useNavigation } from '@react-navigation/native';
import { useAuth } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';

import TutorDiscoverCard from '../components/TutorDiscoverCard';
import { openTutorProfile } from '../components/TutorProfileDetail';
import TutorRefineBar from '../components/TutorRefineBar';
import TutorSearchSheet from '../components/TutorSearchSheet';
import { colors, radii, shadows } from '../constants/theme';
import { fetchMatches, fetchTutorProfiles } from '../lib/supabase';
import { MATCH_STATUS } from '../lib/tutorConstants';
import { useFavoriteTutors } from '../hooks/useFavoriteTutors';
import { useParentSearch } from '../lib/ParentSearchContext';

const SCREEN_W = Dimensions.get('window').width;

export default function SwipeScreen() {
  const navigation = useNavigation();
  const isFocused = useIsFocused();
  const { height: windowHeight } = useWindowDimensions();
  const tightScreen = windowHeight < 700;
  const { userId } = useAuth();
  const {
    isFavorite,
    isToggling,
    toggleFavorite,
    reload: reloadFavorites,
    error: favoriteError,
  } = useFavoriteTutors();
  const { filters } = useParentSearch();
  const [allTutors, setAllTutors] = useState([]);
  const [contactedIds, setContactedIds] = useState(() => new Set());
  const [index, setIndex] = useState(0);
  const [liked, setLiked] = useState([]);
  const [passed, setPassed] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [searchOpen, setSearchOpen] = useState(false);
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
      const [profiles, matches] = await Promise.all([
        fetchTutorProfiles({
          excludeClerkId: userId,
        }),
        userId
          ? fetchMatches(userId, {
              statuses: [MATCH_STATUS.PENDING, MATCH_STATUS.ACCEPTED],
            })
          : Promise.resolve([]),
      ]);
      setAllTutors(profiles);
      setContactedIds(new Set(matches.map((match) => match.tutorId)));
      indexRef.current = 0;
      setIndex(0);
      setLiked([]);
      setPassed([]);
    } catch (err) {
      setAllTutors([]);
      setContactedIds(new Set());
      setError(err?.message ?? 'Erreur de chargement.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadTutors();
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      reloadFavorites();
      if (!userId) {
        setContactedIds(new Set());
        return undefined;
      }
      let cancelled = false;
      fetchMatches(userId, {
        statuses: [MATCH_STATUS.PENDING, MATCH_STATUS.ACCEPTED],
      })
        .then((matches) => {
          if (!cancelled) {
            setContactedIds(new Set(matches.map((match) => match.tutorId)));
          }
        })
        .catch(() => {});
      return () => {
        cancelled = true;
      };
    }, [userId])
  );

  const hasActiveFilters = filters.hasActiveFilters;
  const placeName = String(filters.searchOrigin?.label || filters.cityQuery || '')
    .replace(/\s+\d{4}\b/, '')
    .trim();
  const searchLabel =
    filters.activeFilter && placeName
      ? `${filters.activeFilter} à ${placeName}`
      : filters.activeFilter || placeName || '';

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

  function openProfile(target) {
    if (!target) return;
    setActionError(null);
    openTutorProfile(navigation, {
      tutor: target,
      contacted: contactedIds.has(target.id),
    });
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
      {isFocused ? <StatusBar style="light" /> : null}
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.container}>
          {toastMessage ? (
            <View style={styles.toast} pointerEvents="none">
              <Ionicons name="checkmark-circle" size={18} color={colors.white} />
              <Text style={styles.toastText}>{toastMessage}</Text>
            </View>
          ) : null}

          <Text style={styles.brandMark}>Clutch</Text>
          <View style={styles.searchRow}>
            <Pressable
              style={styles.searchField}
              onPress={() => setSearchOpen(true)}
              accessibilityLabel="Rechercher une matière ou un lieu"
            >
              <Ionicons name="search" size={18} color="#8E8E93" />
              <Text
                style={searchLabel ? styles.searchValue : styles.searchPlaceholder}
                numberOfLines={1}
              >
                {searchLabel || 'Rechercher un tuteur...'}
              </Text>
            </Pressable>
            <Pressable
              style={styles.mapButton}
              onPress={() => navigation.navigate('TutorMap')}
              accessibilityLabel="Voir la carte"
            >
              <Ionicons name="map" size={20} color={colors.white} />
            </Pressable>
          </View>
          <TutorRefineBar filters={filters} />

          <TutorSearchSheet
            visible={searchOpen}
            onClose={() => setSearchOpen(false)}
            filters={filters}
            tutors={allTutors}
          />

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
                      ? 'Aucun tuteur ne correspond à ta recherche. Élargis la matière, le lieu, le prix ou le niveau.'
                      : 'Aucun profil n’est disponible pour le moment.'
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
                showsHorizontalScrollIndicator={false}
                keyboardShouldPersistTaps="always"
                decelerationRate="fast"
                style={styles.pager}
                scrollEventThrottle={16}
                onScroll={onTutorScroll}
              >
                {tutors.map((item) => (
                    <View
                      key={item.id}
                      style={[styles.page, { width: pageWidth }]}
                    >
                      <TutorDiscoverCard
                        tutor={item}
                        tightScreen={tightScreen}
                        favorite={isFavorite(item.id)}
                        favoriteBusy={isToggling(item.id)}
                        contacted={contactedIds.has(item.id)}
                        onToggleFavorite={() => onToggleFavorite(item)}
                        onOpenProfile={() => openProfile(item)}
                      />
                    </View>
                  ))}
              </ScrollView>
            )}
          </View>

          {!loading && !error && tutors.length > 0 ? (
            <View style={styles.previewProgressRow}>
              <View style={styles.previewTrack}>
                <View
                  style={[
                    styles.previewFill,
                    {
                      width: `${100 / tutors.length}%`,
                      left: `${(index / tutors.length) * 100}%`,
                    },
                  ]}
                />
              </View>
              <Text style={styles.previewCount}>
                {Math.min(index + 1, tutors.length)} sur {tutors.length}
              </Text>
            </View>
          ) : null}

          {actionError ? (
            <Text style={styles.actionError}>{actionError}</Text>
          ) : null}
        </View>
      </SafeAreaView>

    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#111111',
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
    paddingTop: 8,
    paddingBottom: 8,
  },
  brandMark: {
    textAlign: 'center',
    fontSize: 28,
    fontWeight: '800',
    color: '#3DDC97',
    marginBottom: 14,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  searchField: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 48,
    paddingHorizontal: 12,
    backgroundColor: '#1C1C1E',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2C2C2E',
  },
  mapButton: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: '#1C1C1E',
    borderWidth: 1,
    borderColor: '#2C2C2E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchValue: {
    flex: 1,
    fontSize: 15,
    color: colors.white,
  },
  searchPlaceholder: {
    flex: 1,
    fontSize: 15,
    color: '#8E8E93',
  },
  previewCard: {
    flex: 1,
    minHeight: 0,
    backgroundColor: '#1A1A1C',
    borderWidth: 1,
    borderColor: '#2A2A2A',
    borderRadius: 28,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 16,
    overflow: 'hidden',
    ...shadows.card,
  },
  previewFixed: {
    flexShrink: 0,
  },
  previewTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
  },
  previewAvatarWrapTight: {
    width: 84,
  },
  previewAvatarTight: {
    width: 84,
    height: 84,
  },
  previewAvatarWrap: {
    width: 108,
    paddingBottom: 12,
  },
  previewAvatar: {
    width: 108,
    height: 108,
    borderRadius: 22,
    backgroundColor: colors.mintSoft,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  previewAvatarImage: {
    width: '100%',
    height: '100%',
  },
  previewAvatarText: {
    fontSize: 32,
    fontWeight: '800',
    color: colors.mintDeep,
  },
  verifiedBadge: {
    position: 'absolute',
    left: 0,
    bottom: 0,
    backgroundColor: colors.mint,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: '#1A1A1C',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  verifiedBadgeText: {
    color: colors.white,
    fontSize: 10,
    fontWeight: '800',
  },
  previewIdentity: {
    flex: 1,
    minWidth: 0,
    paddingTop: 4,
    paddingRight: 28,
  },
  previewName: {
    fontSize: 26,
    fontWeight: '800',
    color: colors.white,
  },
  previewRating: {
    marginTop: 4,
    fontSize: 14,
    fontWeight: '700',
    color: '#E8E8E8',
  },
  previewStar: {
    color: colors.star,
  },
  previewPrice: {
    marginTop: 6,
    fontSize: 22,
    fontWeight: '800',
    color: colors.white,
  },
  previewHeart: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#2C2C2E',
    marginBottom: 14,
  },
  previewSection: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.white,
    marginBottom: 10,
  },
  previewChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignContent: 'flex-start',
    gap: 8,
    maxHeight: 76,
    marginBottom: 14,
    overflow: 'hidden',
  },
  previewChipsTight: {
    maxHeight: 40,
  },
  previewChip: {
    maxWidth: '100%',
    backgroundColor: '#2C2C2E',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  previewChipOn: {
    backgroundColor: '#1E3A2F',
  },
  previewChipLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#E8E8E8',
  },
  previewChipLabelOn: {
    color: '#3DDC97',
  },
  previewBio: {
    flexShrink: 1,
    minHeight: 0,
    fontSize: 15,
    lineHeight: 22,
    maxHeight: 66,
    color: '#D4D4D4',
  },
  previewBioSpace: {
    flexShrink: 1,
    minHeight: 0,
    marginBottom: 14,
    maxHeight: 66,
    overflow: 'hidden',
  },
  previewFact: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 8,
  },
  previewFactLast: {
    marginBottom: 0,
  },
  previewFactText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
    color: '#E8E8E8',
  },
  previewFooter: {
    flexShrink: 0,
    marginTop: 'auto',
    paddingTop: 16,
  },
  previewProgressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 12,
  },
  previewTrack: {
    flex: 1,
    height: 4,
    borderRadius: 999,
    backgroundColor: '#2C2C2E',
    overflow: 'hidden',
  },
  previewFill: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    borderRadius: 999,
    backgroundColor: '#3DDC97',
  },
  previewCount: {
    fontSize: 12,
    fontWeight: '700',
    color: '#A1A1A6',
  },
  discoverButton: {
    height: 52,
    borderRadius: 16,
    backgroundColor: '#1B6B45',
    alignItems: 'center',
    justifyContent: 'center',
  },
  discoverButtonLabel: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '800',
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
    paddingTop: 2,
    backgroundColor: 'transparent',
  },
  pager: {
    flex: 1,
    minHeight: 0,
    backgroundColor: 'transparent',
  },
  page: {
    height: '100%',
    backgroundColor: 'transparent',
  },
  card: {
    flex: 1,
    minHeight: 0,
    backgroundColor: '#1C1C1E',
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
    flexShrink: 1,
    minHeight: 0,
    fontSize: 14,
    lineHeight: 22,
    maxHeight: 66,
    fontStyle: 'italic',
    color: '#A1A1A6',
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
    color: '#C7C7CC',
    textAlign: 'center',
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.white,
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 15,
    lineHeight: 23,
    color: '#C7C7CC',
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
    backgroundColor: '#1C1C1E',
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
    backgroundColor: '#2C2C2E',
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
    color: colors.white,
  },
  detailHeroHeadline: {
    marginTop: 6,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '600',
    textAlign: 'center',
    color: '#E8E8E8',
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
    backgroundColor: '#1C1C1E',
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
    color: colors.white,
  },
  detailStatLabel: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: '700',
    color: colors.mutedSoft,
  },
  detailBlockCard: {
    marginTop: 12,
    backgroundColor: '#1C1C1E',
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
    color: '#3DDC97',
  },
  detailBlockText: {
    fontSize: 16,
    lineHeight: 24,
    color: '#E8E8E8',
  },
  detailPriceHero: {
    fontSize: 32,
    fontWeight: '800',
    color: colors.white,
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
    backgroundColor: '#2C2C2E',
    borderRadius: radii.chip,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  detailChipLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#E8E8E8',
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
    color: colors.white,
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
    color: colors.white,
  },
  detailReviewDate: {
    fontSize: 13,
    color: '#A1A1A6',
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
    backgroundColor: '#111111',
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
