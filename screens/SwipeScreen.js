import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '@clerk/clerk-expo';

import {
  createMatch,
  fetchMatches,
  fetchTutorProfiles,
  resetMatchesAndMessages,
} from '../lib/supabase';
import { MATCH_STATUS, SWIPE_FILTERS } from '../lib/tutorConstants';

function formatRate(rate) {
  const value = Number(rate);
  if (!Number.isFinite(value)) return '—';
  return Number.isInteger(value) ? `${value}` : value.toFixed(2);
}

export default function SwipeScreen() {
  const { userId } = useAuth();
  const [allTutors, setAllTutors] = useState([]);
  const [index, setIndex] = useState(0);
  const [liked, setLiked] = useState([]);
  const [passed, setPassed] = useState([]);
  const [loading, setLoading] = useState(true);
  const [matching, setMatching] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [error, setError] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [activeFilter, setActiveFilter] = useState(null);

  async function loadTutors() {
    setLoading(true);
    setError(null);
    setActionError(null);

    try {
      // TEMP test messagerie : on inclut son propre profil pour se matcher soi-même
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
    }, [userId])
  );

  const tutors = useMemo(() => {
    if (!activeFilter) return allTutors;
    const needle = activeFilter.toLowerCase();
    return allTutors.filter((tutor) =>
      (tutor.specialties ?? []).some(
        (skill) => String(skill).toLowerCase() === needle
      )
    );
  }, [allTutors, activeFilter]);

  async function onResetMatches() {
    if (resetting) return;

    setResetting(true);
    setActionError(null);

    try {
      await resetMatchesAndMessages();
      await loadTutors();
    } catch (err) {
      setActionError(err?.message ?? 'Reset impossible.');
    } finally {
      setResetting(false);
    }
  }

  function onSelectFilter(label) {
    setActiveFilter((prev) => (prev === label ? null : label));
    setIndex(0);
    setLiked([]);
    setPassed([]);
    setActionError(null);
  }

  const tutor = tutors[index];
  const isDone = !loading && !error && index >= tutors.length;

  async function goNext(action) {
    if (!tutor || matching) return;

    setActionError(null);

    if (action === 'like') {
      if (!userId) {
        setActionError('Tu dois être connecté pour matcher.');
        return;
      }

      setMatching(true);
      try {
        await createMatch({ parentId: userId, tutorId: tutor.id });
        setLiked((prev) => [...prev, tutor.name]);
        setIndex((prev) => prev + 1);
      } catch (err) {
        setActionError(err?.message ?? 'Impossible de créer le match.');
      } finally {
        setMatching(false);
      }
      return;
    }

    setPassed((prev) => [...prev, tutor.name]);
    setIndex((prev) => prev + 1);
  }

  const reset = () => {
    setIndex(0);
    setLiked([]);
    setPassed([]);
    setActionError(null);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.container}>
        <View style={styles.filtersBlock}>
          <Text style={styles.filtersLabel}>Filtres matières</Text>
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
                  style={[styles.filterChip, active && styles.filterChipActive]}
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
        </View>

        <Pressable
          style={[styles.resetTestButton, resetting && styles.resetTestDisabled]}
          onPress={onResetMatches}
          disabled={resetting || matching}
        >
          {resetting ? (
            <ActivityIndicator color="#7A4E00" />
          ) : (
            <Text style={styles.resetTestLabel}>
              [TEST] Reset matches & messages
            </Text>
          )}
        </Pressable>

        <Text style={styles.brand}>CLUTCH</Text>
        <Text style={styles.subtitle}>
          {activeFilter
            ? `Tuteurs · ${activeFilter}`
            : 'Trouve ton tuteur'}
        </Text>

        {loading ? (
          <View style={styles.stateCard}>
            <ActivityIndicator size="large" color="#1B5E3B" />
            <Text style={styles.stateText}>Chargement des tuteurs…</Text>
          </View>
        ) : error ? (
          <View style={styles.stateCard}>
            <Text style={styles.emptyTitle}>Impossible de charger</Text>
            <Text style={styles.emptyText}>{error}</Text>
            <Pressable style={styles.resetButton} onPress={loadTutors}>
              <Text style={styles.resetLabel}>Réessayer</Text>
            </Pressable>
          </View>
        ) : isDone ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>
              {tutors.length === 0 ? 'Aucun tuteur' : 'Plus de tuteurs'}
            </Text>
            <Text style={styles.emptyText}>
              {tutors.length === 0
                ? activeFilter
                  ? `Aucun tuteur avec la spécialité « ${activeFilter} ». Essaie un autre filtre.`
                  : 'Tous les tuteurs sont déjà matchés, ou aucun profil n’est disponible.'
                : `Matches : ${liked.length || 0}\nPassés : ${passed.length || 0}\n\nRetrouve tes conversations dans Messages.`}
            </Text>
            <Pressable
              style={styles.resetButton}
              onPress={
                tutors.length === 0
                  ? activeFilter
                    ? () => onSelectFilter(null)
                    : loadTutors
                  : reset
              }
            >
              <Text style={styles.resetLabel}>
                {tutors.length === 0
                  ? activeFilter
                    ? 'Voir tous'
                    : 'Réessayer'
                  : 'Recommencer'}
              </Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.card}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {tutor.name
                  .split(' ')
                  .filter(Boolean)
                  .map((part) => part[0])
                  .join('')
                  .slice(0, 2)
                  .toUpperCase()}
              </Text>
            </View>
            <View style={styles.nameRow}>
              <Text style={styles.name}>{tutor.name}</Text>
              <Text style={styles.ratingBesideName}>
                ★ {tutor.rating.toFixed(1)}
                {tutor.reviewCount > 0 ? ` (${tutor.reviewCount})` : ''}
              </Text>
            </View>
            {tutor.studyYear ? (
              <Text style={styles.studyYear}>{tutor.studyYear}</Text>
            ) : null}

            <View style={styles.specialtyWrap}>
              {(tutor.specialties?.length
                ? tutor.specialties
                : [tutor.subject]
              ).map((skill) => (
                <View key={`${tutor.id}-${skill}`} style={styles.specialtyChip}>
                  <Text style={styles.specialtyChipLabel}>{skill}</Text>
                </View>
              ))}
            </View>

            {tutor.bio ? (
              <Text style={styles.bio} numberOfLines={4}>
                {tutor.bio}
              </Text>
            ) : (
              <Text style={styles.bioMuted}>Pas encore de bio.</Text>
            )}

            <View style={styles.metaRow}>
              <Text style={styles.meta}>
                {formatRate(tutor.hourlyRate)} €/h
              </Text>
            </View>
            <Text style={styles.counter}>
              {index + 1} / {tutors.length}
            </Text>
          </View>
        )}

        {actionError ? (
          <Text style={styles.actionError}>{actionError}</Text>
        ) : null}

        {!loading && !error && !isDone && (
          <View style={styles.actions}>
            <Pressable
              style={[styles.actionButton, styles.passButton]}
              onPress={() => goNext('pass')}
              disabled={matching}
              accessibilityLabel="Passer"
            >
              <Text style={styles.passIcon}>✕</Text>
            </Pressable>
            <Pressable
              style={[styles.actionButton, styles.likeButton]}
              onPress={() => goNext('like')}
              disabled={matching}
              accessibilityLabel="Valider"
            >
              {matching ? (
                <ActivityIndicator color="#2F9E6B" />
              ) : (
                <Text style={styles.likeIcon}>✓</Text>
              )}
            </Pressable>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#F3F6F4',
  },
  container: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 16,
    alignItems: 'center',
  },
  filtersBlock: {
    width: '100%',
    alignSelf: 'stretch',
    marginBottom: 10,
  },
  filtersLabel: {
    alignSelf: 'flex-start',
    marginBottom: 6,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.4,
    color: '#4A6357',
    textTransform: 'uppercase',
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 2,
    paddingRight: 8,
  },
  filterChip: {
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: '#1B5E3B',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  filterChipActive: {
    backgroundColor: '#1B5E3B',
    borderColor: '#1B5E3B',
  },
  filterChipLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1B5E3B',
  },
  filterChipLabelActive: {
    color: '#FFFFFF',
  },
  resetTestButton: {
    alignSelf: 'stretch',
    backgroundColor: '#FFF4D6',
    borderWidth: 1,
    borderColor: '#E6C86A',
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 8,
    alignItems: 'center',
  },
  resetTestDisabled: {
    opacity: 0.7,
  },
  resetTestLabel: {
    color: '#7A4E00',
    fontSize: 12,
    fontWeight: '700',
  },
  brand: {
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: 2,
    color: '#0F2A1F',
  },
  subtitle: {
    marginTop: 4,
    marginBottom: 16,
    fontSize: 15,
    color: '#4A6357',
  },
  card: {
    width: '100%',
    maxWidth: 380,
    minHeight: 340,
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0F2A1F',
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4,
  },
  stateCard: {
    width: '100%',
    maxWidth: 380,
    minHeight: 280,
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    padding: 28,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  stateText: {
    fontSize: 16,
    color: '#4A6357',
    textAlign: 'center',
  },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: '#D8EADF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  avatarText: {
    fontSize: 26,
    fontWeight: '700',
    color: '#1B5E3B',
  },
  name: {
    fontSize: 24,
    fontWeight: '700',
    color: '#10261C',
    textAlign: 'center',
    flexShrink: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 4,
  },
  ratingBesideName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1B5E3B',
  },
  studyYear: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: '600',
    color: '#1B5E3B',
  },
  specialtyWrap: {
    marginTop: 12,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 6,
  },
  specialtyChip: {
    backgroundColor: '#E8F5EE',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  specialtyChipLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1B5E3B',
  },
  bio: {
    marginTop: 12,
    fontSize: 14,
    lineHeight: 20,
    color: '#4A6357',
    textAlign: 'center',
    paddingHorizontal: 4,
  },
  bioMuted: {
    marginTop: 12,
    fontSize: 13,
    fontStyle: 'italic',
    color: '#7A9185',
  },
  metaRow: {
    flexDirection: 'row',
    gap: 18,
    marginTop: 18,
  },
  meta: {
    fontSize: 17,
    fontWeight: '600',
    color: '#1B5E3B',
  },
  counter: {
    marginTop: 22,
    fontSize: 14,
    color: '#7A9185',
  },
  actionError: {
    marginTop: 12,
    color: '#C0392B',
    textAlign: 'center',
    fontSize: 14,
  },
  actions: {
    marginTop: 22,
    flexDirection: 'row',
    gap: 28,
  },
  actionButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    shadowColor: '#0F2A1F',
    shadowOpacity: 0.1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  passButton: {
    borderWidth: 2,
    borderColor: '#E35D5D',
  },
  likeButton: {
    borderWidth: 2,
    borderColor: '#2F9E6B',
  },
  passIcon: {
    fontSize: 30,
    color: '#E35D5D',
    fontWeight: '700',
  },
  likeIcon: {
    fontSize: 32,
    color: '#2F9E6B',
    fontWeight: '700',
  },
  emptyCard: {
    width: '100%',
    maxWidth: 380,
    minHeight: 280,
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    padding: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#10261C',
  },
  emptyText: {
    marginTop: 12,
    fontSize: 16,
    lineHeight: 26,
    textAlign: 'center',
    color: '#4A6357',
  },
  resetButton: {
    marginTop: 24,
    backgroundColor: '#1B5E3B',
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 14,
  },
  resetLabel: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
