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
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';

import { useRole } from '../lib/RoleContext';
import { ROLES } from '../lib/roles';
import { fetchTutorDashboard } from '../lib/supabase';

const MINT = '#B5E8D0';
const GREEN = '#1B5E3B';
const INK = '#10261C';
const MUTED = '#4A6357';

const TIERS = [
  { id: 'bronze', label: 'Tuteur Bronze', minCourses: 0 },
  { id: 'silver', label: 'Tuteur Silver', minCourses: 5 },
  { id: 'gold', label: 'Tuteur Gold', minCourses: 15 },
  { id: 'top', label: 'Top Tuteur', minCourses: 30 },
];

function getInitials(name) {
  return String(name || '?')
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function formatMoney(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '0 €';
  return `${amount.toFixed(amount % 1 === 0 ? 0 : 2)} €`;
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

function getStatusBadge({ rating, reviewCount, coursesDone }) {
  if (coursesDone >= 30 || (rating >= 4.8 && reviewCount >= 8)) {
    return { label: 'Top Tuteur', tone: 'gold' };
  }
  if (reviewCount >= 1 || coursesDone >= 1) {
    return { label: 'Tuteur Vérifié', tone: 'verified' };
  }
  return { label: 'Nouveau Tuteur', tone: 'new' };
}

function getTierProgress(coursesDone) {
  let current = TIERS[0];
  let next = TIERS[1];
  for (let i = 0; i < TIERS.length; i += 1) {
    if (coursesDone >= TIERS[i].minCourses) {
      current = TIERS[i];
      next = TIERS[i + 1] || null;
    }
  }

  if (!next) {
    return {
      currentLabel: current.label,
      nextLabel: null,
      remaining: 0,
      progress: 1,
      hint: 'Palier max atteint — bravo !',
    };
  }

  const span = next.minCourses - current.minCourses;
  const done = coursesDone - current.minCourses;
  const remaining = Math.max(0, next.minCourses - coursesDone);
  const progress = span > 0 ? Math.min(1, done / span) : 1;

  return {
    currentLabel: current.label,
    nextLabel: next.label,
    remaining,
    progress,
    hint:
      remaining === 1
        ? `Prochain palier : ${next.label} dans 1 cours`
        : `Prochain palier : ${next.label} dans ${remaining} cours`,
  };
}

function Stars({ rating }) {
  const value = Math.round(Number(rating) || 0);
  return (
    <View style={styles.starsRow}>
      {[1, 2, 3, 4, 5].map((star) => (
        <Ionicons
          key={star}
          name={star <= value ? 'star' : 'star-outline'}
          size={14}
          color={star <= value ? '#E6B800' : '#C5D0C9'}
        />
      ))}
    </View>
  );
}

export default function TutorHomeScreen() {
  const navigation = useNavigation();
  const { userId } = useAuth();
  const { user } = useUser();
  const { role } = useRole();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dashboard, setDashboard] = useState(null);

  const isTutor = role === ROLES.TUTOR;

  useFocusEffect(
    useCallback(() => {
      if (!isTutor) return undefined;

      let cancelled = false;
      async function load() {
        if (!userId) return;
        setLoading(true);
        setError(null);
        try {
          const data = await fetchTutorDashboard(
            userId,
            user?.fullName ||
              [user?.firstName, user?.lastName].filter(Boolean).join(' ') ||
              null
          );
          if (!cancelled) setDashboard(data);
        } catch (err) {
          if (!cancelled) {
            setError(err?.message ?? 'Impossible de charger le tableau de bord.');
          }
        } finally {
          if (!cancelled) setLoading(false);
        }
      }
      load();
      return () => {
        cancelled = true;
      };
    }, [userId, isTutor, user?.fullName, user?.firstName, user?.lastName])
  );

  const displayName =
    dashboard?.profile?.name ||
    user?.fullName ||
    user?.firstName ||
    'Tuteur';

  const coursesDone = dashboard?.coursesDone ?? 0;
  const badge = useMemo(
    () =>
      getStatusBadge({
        rating: dashboard?.rating ?? 0,
        reviewCount: dashboard?.reviewCount ?? 0,
        coursesDone,
      }),
    [dashboard?.rating, dashboard?.reviewCount, coursesDone]
  );
  const tier = useMemo(() => getTierProgress(coursesDone), [coursesDone]);

  if (!isTutor) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.centered}>
          <Text style={styles.emptyTitle}>Espace tuteur</Text>
          <Text style={styles.emptyText}>
            Cet écran est réservé aux comptes tuteur.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.topBar}>
          <Text style={styles.brand}>CLUTCH</Text>
          <Pressable
            style={styles.settingsButton}
            onPress={() => navigation.navigate('Settings')}
            accessibilityLabel="Réglages"
            hitSlop={8}
          >
            <Ionicons name="settings-outline" size={22} color={GREEN} />
          </Pressable>
        </View>

        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={GREEN} />
            <Text style={styles.loadingText}>Chargement de ton espace…</Text>
          </View>
        ) : error ? (
          <View style={styles.centered}>
            <Text style={styles.emptyTitle}>Oups</Text>
            <Text style={styles.emptyText}>{error}</Text>
          </View>
        ) : (
          <>
            <View style={styles.profileRow}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{getInitials(displayName)}</Text>
              </View>
              <View style={styles.profileText}>
                <Text style={styles.hello}>Bonjour</Text>
                <Text style={styles.name} numberOfLines={1}>
                  {displayName}
                </Text>
                <View
                  style={[
                    styles.badge,
                    badge.tone === 'gold' && styles.badgeGold,
                    badge.tone === 'new' && styles.badgeNew,
                  ]}
                >
                  <Ionicons
                    name={
                      badge.tone === 'gold'
                        ? 'trophy'
                        : badge.tone === 'verified'
                          ? 'shield-checkmark'
                          : 'leaf'
                    }
                    size={13}
                    color={
                      badge.tone === 'gold'
                        ? '#7A4E00'
                        : badge.tone === 'new'
                          ? '#4338CA'
                          : GREEN
                    }
                  />
                  <Text
                    style={[
                      styles.badgeLabel,
                      badge.tone === 'gold' && styles.badgeLabelGold,
                      badge.tone === 'new' && styles.badgeLabelNew,
                    ]}
                  >
                    {badge.label}
                  </Text>
                </View>
              </View>
            </View>

            <View style={styles.earningsCard}>
              <Text style={styles.earningsEyebrow}>Gains Clutch</Text>
              <Text style={styles.earningsMonth}>
                {formatMoney(dashboard?.monthEarnings)} gagnés ce mois-ci
              </Text>
              <Text style={styles.earningsTotal}>
                Gains totaux : {formatMoney(dashboard?.totalEarnings)}
              </Text>
              <Text style={styles.earningsHint}>
                Disponible au retrait : {formatMoney(dashboard?.available)}
                {(dashboard?.frozen || 0) > 0
                  ? ` · ${formatMoney(dashboard.frozen)} gelés`
                  : ''}
              </Text>
            </View>

            <Text style={styles.sectionTitle}>Tes performances</Text>
            <View style={styles.statsGrid}>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>{coursesDone}</Text>
                <Text style={styles.statLabel}>Cours donnés</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>
                  {dashboard?.hoursTaught ?? 0}h
                </Text>
                <Text style={styles.statLabel}>Heures enseignées</Text>
              </View>
              <View style={[styles.statCard, styles.statCardWide]}>
                <Text style={styles.statValue}>
                  {(dashboard?.rating || 0) > 0
                    ? `${dashboard.rating.toFixed(1)} / 5 ★`
                    : '— / 5 ★'}
                </Text>
                <Text style={styles.statLabel}>
                  Note globale
                  {(dashboard?.reviewCount || 0) > 0
                    ? ` · ${dashboard.reviewCount} avis`
                    : ' · aucun avis'}
                </Text>
              </View>
            </View>

            <View style={styles.progressCard}>
              <View style={styles.progressHeader}>
                <Text style={styles.progressCurrent}>{tier.currentLabel}</Text>
                {tier.nextLabel ? (
                  <Text style={styles.progressNext}>{tier.nextLabel}</Text>
                ) : null}
              </View>
              <View style={styles.progressTrack}>
                <View
                  style={[
                    styles.progressFill,
                    { width: `${Math.round(tier.progress * 100)}%` },
                  ]}
                />
              </View>
              <Text style={styles.progressHint}>{tier.hint}</Text>
            </View>

            <Text style={styles.sectionTitle}>Derniers retours & avis</Text>
            {(dashboard?.reviews?.length || 0) === 0 ? (
              <View style={styles.emptyReviews}>
                <Text style={styles.emptyReviewsText}>
                  Pas encore d’avis. Tes premiers retours apparaîtront ici après
                  tes cours payés.
                </Text>
              </View>
            ) : (
              dashboard.reviews.map((review) => (
                <View key={review.id} style={styles.reviewCard}>
                  <View style={styles.reviewHeader}>
                    <Text style={styles.reviewName}>
                      {review.reviewerFirstName}
                    </Text>
                    <Text style={styles.reviewDate}>
                      {formatReviewDate(review.createdAt)}
                    </Text>
                  </View>
                  <Stars rating={review.rating} />
                  {review.comment ? (
                    <Text style={styles.reviewComment}>{review.comment}</Text>
                  ) : (
                    <Text style={styles.reviewCommentMuted}>Sans commentaire</Text>
                  )}
                </View>
              ))
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#F3F6F4',
  },
  scroll: {
    flex: 1,
  },
  container: {
    paddingHorizontal: 22,
    paddingTop: 12,
    paddingBottom: 36,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  brand: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 1.5,
    color: INK,
  },
  settingsButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E8F5EE',
  },
  centered: {
    minHeight: 220,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 16,
  },
  loadingText: {
    color: MUTED,
    fontSize: 14,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: INK,
  },
  emptyText: {
    textAlign: 'center',
    color: MUTED,
    fontSize: 15,
    lineHeight: 22,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 18,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: MINT,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#FFFFFF',
  },
  avatarText: {
    fontSize: 24,
    fontWeight: '800',
    color: GREEN,
  },
  profileText: {
    flex: 1,
  },
  hello: {
    fontSize: 14,
    color: MUTED,
    fontWeight: '600',
  },
  name: {
    marginTop: 2,
    fontSize: 26,
    fontWeight: '800',
    color: INK,
  },
  badge: {
    marginTop: 8,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#E8F5EE',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  badgeGold: {
    backgroundColor: '#FFF4D6',
  },
  badgeNew: {
    backgroundColor: '#EEF2FF',
  },
  badgeLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: GREEN,
  },
  badgeLabelGold: {
    color: '#7A4E00',
  },
  badgeLabelNew: {
    color: '#4338CA',
  },
  earningsCard: {
    backgroundColor: MINT,
    borderRadius: 24,
    padding: 20,
    marginBottom: 22,
    shadowColor: '#0F2A1F',
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  earningsEyebrow: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.8,
    color: GREEN,
    textTransform: 'uppercase',
  },
  earningsMonth: {
    marginTop: 8,
    fontSize: 26,
    fontWeight: '800',
    color: INK,
  },
  earningsTotal: {
    marginTop: 6,
    fontSize: 15,
    fontWeight: '700',
    color: GREEN,
  },
  earningsHint: {
    marginTop: 8,
    fontSize: 13,
    color: MUTED,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: INK,
    marginBottom: 12,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 12,
  },
  statCard: {
    width: '48%',
    flexGrow: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    paddingVertical: 16,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#E2EAE5',
    shadowColor: '#0F2A1F',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 1,
  },
  statCardWide: {
    width: '100%',
  },
  statValue: {
    fontSize: 22,
    fontWeight: '800',
    color: GREEN,
  },
  statLabel: {
    marginTop: 4,
    fontSize: 13,
    color: MUTED,
    fontWeight: '600',
  },
  progressCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#E2EAE5',
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  progressCurrent: {
    fontSize: 14,
    fontWeight: '800',
    color: INK,
  },
  progressNext: {
    fontSize: 13,
    fontWeight: '600',
    color: MUTED,
  },
  progressTrack: {
    height: 10,
    borderRadius: 999,
    backgroundColor: '#E8F0EB',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: GREEN,
  },
  progressHint: {
    marginTop: 10,
    fontSize: 13,
    color: MUTED,
    fontWeight: '600',
  },
  emptyReviews: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: '#E2EAE5',
  },
  emptyReviewsText: {
    fontSize: 14,
    lineHeight: 21,
    color: MUTED,
  },
  reviewCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E2EAE5',
  },
  reviewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  reviewName: {
    fontSize: 15,
    fontWeight: '800',
    color: INK,
  },
  reviewDate: {
    fontSize: 12,
    color: '#7A9185',
  },
  starsRow: {
    flexDirection: 'row',
    gap: 2,
    marginBottom: 8,
  },
  reviewComment: {
    fontSize: 14,
    lineHeight: 21,
    color: MUTED,
  },
  reviewCommentMuted: {
    fontSize: 13,
    fontStyle: 'italic',
    color: '#9AA8A0',
  },
});
