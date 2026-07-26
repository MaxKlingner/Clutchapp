import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Modal,
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

import { colors, radii, shadows } from '../constants/theme';
import { useRole } from '../lib/RoleContext';
import { ROLES } from '../lib/roles';
import { fetchTutorDashboard } from '../lib/supabase';

const MINT_BAND_H = Math.round(Dimensions.get('window').height * 0.22);

const TIERS = [
  { id: 'bronze', label: 'Tuteur Bronze', minCourses: 0 },
  { id: 'silver', label: 'Tuteur Silver', minCourses: 5 },
  { id: 'gold', label: 'Tuteur Gold', minCourses: 15 },
  { id: 'top', label: 'Top Tuteur', minCourses: 30 },
];

function firstName(fullName) {
  return String(fullName || 'Tuteur').trim().split(/\s+/)[0] || 'Tuteur';
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

/** Annonce en ligne = au moins une vraie matière (pas le placeholder par défaut). */
function isAnnouncementActive(profile) {
  if (!profile) return false;
  const specialties = (profile.specialties || [])
    .map((item) => String(item || '').trim())
    .filter((item) => item && item.toLowerCase() !== 'matière');
  return specialties.length > 0;
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
    remaining,
    progress,
    hint:
      remaining === 1
        ? `Prochain palier dans 1 cours`
        : `Prochain palier dans ${remaining} cours`,
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
          color={star <= value ? colors.star : '#C5D0C9'}
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
  const [aboutOpen, setAboutOpen] = useState(false);

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
  const announcementActive = isAnnouncementActive(dashboard?.profile);
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
      <View style={styles.root}>
        <SafeAreaView style={styles.safe} edges={['top']}>
          <View style={styles.centered}>
            <Text style={styles.emptyTitle}>Espace tuteur</Text>
            <Text style={styles.emptyText}>
              Cet écran est réservé aux comptes tuteur.
            </Text>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <View style={[styles.mintBand, { height: MINT_BAND_H }]} />

      <SafeAreaView style={styles.safe} edges={['top']}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.container}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.topBar}>
            <View style={styles.topBarText}>
              <Text style={styles.hello}>Bonjour</Text>
              <Text style={styles.name} numberOfLines={1}>
                {firstName(displayName)}
              </Text>
            </View>
            <View style={styles.topBarActions}>
              <Pressable
                style={styles.headerIconButton}
                onPress={() => setAboutOpen(true)}
                accessibilityLabel="À propos de Clutch"
                hitSlop={8}
              >
                <Ionicons
                  name="help-circle-outline"
                  size={24}
                  color={colors.mintDeep}
                />
              </Pressable>
              <Pressable
                style={styles.headerIconButton}
                onPress={() => navigation.navigate('Settings')}
                accessibilityLabel="Réglages"
                hitSlop={8}
              >
                <Ionicons
                  name="settings-outline"
                  size={22}
                  color={colors.mintDeep}
                />
              </Pressable>
            </View>
          </View>

          <Modal
            visible={aboutOpen}
            transparent
            animationType="fade"
            onRequestClose={() => setAboutOpen(false)}
          >
            <View style={styles.modalOverlay}>
              <Pressable
                style={styles.modalBackdrop}
                onPress={() => setAboutOpen(false)}
              />
              <View style={styles.modalCard}>
                <Text style={styles.modalTitle}>À propos de Clutch</Text>
                <Text style={styles.modalSectionLabel}>Notre mission</Text>
                <Text style={styles.modalBody}>
                  Clutch rend le soutien scolaire accessible en mettant en
                  relation directe parents, étudiants et tuteurs. Transparence
                  sur les profils, les tarifs et les avis : tu choisis le bon
                  accompagnement sans friction.
                </Text>
                <Text style={styles.modalSectionLabel}>Le projet</Text>
                <Text style={styles.modalBody}>
                  Né d’une ambition simple : fluidifier la recherche de tuteurs
                  et valoriser les étudiants qui enseignent. Clutch veut devenir
                  le réflexe pour trouver, matcher et progresser — efficacement
                  et en confiance.
                </Text>
                <Pressable
                  style={styles.modalCloseButton}
                  onPress={() => setAboutOpen(false)}
                >
                  <Text style={styles.modalCloseLabel}>Fermer</Text>
                </Pressable>
              </View>
            </View>
          </Modal>

          {loading ? (
            <View style={styles.centered}>
              <ActivityIndicator size="large" color={colors.mintDeep} />
              <Text style={styles.loadingText}>Chargement de ton espace…</Text>
            </View>
          ) : error ? (
            <View style={styles.centered}>
              <Text style={styles.emptyTitle}>Oups</Text>
              <Text style={styles.emptyText}>{error}</Text>
            </View>
          ) : (
            <>
              <Pressable
                style={[
                  styles.ctaCard,
                  announcementActive ? styles.ctaCardEdit : styles.ctaCardCreate,
                ]}
                onPress={() => navigation.navigate('EditTutorProfile')}
                accessibilityLabel={
                  announcementActive
                    ? 'Modifier mon annonce'
                    : 'Créer mon annonce'
                }
              >
                <View
                  style={[
                    styles.ctaIconWrap,
                    announcementActive
                      ? styles.ctaIconWrapEdit
                      : styles.ctaIconWrapCreate,
                  ]}
                >
                  <Ionicons
                    name={announcementActive ? 'create-outline' : 'add'}
                    size={22}
                    color={
                      announcementActive ? colors.mintDeep : colors.white
                    }
                  />
                </View>
                <View style={styles.ctaTextWrap}>
                  <Text
                    style={[
                      styles.ctaTitle,
                      !announcementActive && styles.ctaTitleOnDark,
                    ]}
                  >
                    {announcementActive
                      ? 'Modifier mon annonce'
                      : 'Créer mon annonce'}
                  </Text>
                  <Text
                    style={[
                      styles.ctaSubtitle,
                      !announcementActive && styles.ctaSubtitleOnDark,
                    ]}
                  >
                    {announcementActive
                      ? 'Tarifs, matières, bio et disponibilités'
                      : 'Publie ton profil pour apparaître aux parents'}
                  </Text>
                </View>
                <Ionicons
                  name="chevron-forward"
                  size={20}
                  color={
                    announcementActive ? colors.mintDeep : colors.white
                  }
                />
              </Pressable>

              <Text style={styles.sectionTitle}>Mes Performances</Text>
              <View style={styles.statsGrid}>
                <View style={styles.statCard}>
                  <Text style={styles.statValue}>
                    {(dashboard?.rating || 0) > 0
                      ? dashboard.rating.toFixed(1)
                      : '—'}
                  </Text>
                  <Text style={styles.statLabel}>Note globale ★</Text>
                </View>
                <View style={styles.statCard}>
                  <Text style={styles.statValue}>{coursesDone}</Text>
                  <Text style={styles.statLabel}>Cours dispensés</Text>
                </View>
                <View style={[styles.statCard, styles.statCardWide]}>
                  <Text style={styles.statValue}>
                    {dashboard?.hoursTaught ?? 0} h
                  </Text>
                  <Text style={styles.statLabel}>Heures d’enseignement</Text>
                </View>
              </View>

              <View style={styles.progressCard}>
                <View style={styles.progressHeader}>
                  <View
                    style={[
                      styles.statusBadge,
                      badge.tone === 'gold' && styles.statusBadgeGold,
                      badge.tone === 'new' && styles.statusBadgeNew,
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
                            : colors.mintDeep
                      }
                    />
                    <Text
                      style={[
                        styles.statusBadgeLabel,
                        badge.tone === 'gold' && styles.statusBadgeLabelGold,
                        badge.tone === 'new' && styles.statusBadgeLabelNew,
                      ]}
                    >
                      {badge.label}
                    </Text>
                  </View>
                  <Text style={styles.progressCurrent}>{tier.currentLabel}</Text>
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

              <Text style={styles.sectionTitle}>Derniers avis reçus</Text>
              {(dashboard?.reviews?.length || 0) === 0 ? (
                <View style={styles.emptyReviews}>
                  <Text style={styles.emptyReviewsText}>
                    Pas encore d’avis. Tes premiers retours apparaîtront ici
                    après tes cours.
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
                      <Text style={styles.reviewCommentMuted}>
                        Sans commentaire
                      </Text>
                    )}
                  </View>
                ))
              )}
            </>
          )}
        </ScrollView>
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
  scroll: {
    flex: 1,
  },
  container: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 36,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 18,
    minHeight: 52,
  },
  topBarText: {
    flex: 1,
    paddingRight: 12,
  },
  hello: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.muted,
  },
  name: {
    marginTop: 2,
    fontSize: 28,
    fontWeight: '800',
    color: colors.ink,
  },
  topBarActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  headerIconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.65)',
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 42, 31, 0.45)',
  },
  modalCard: {
    backgroundColor: colors.card,
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
  modalCloseButton: {
    marginTop: 6,
    backgroundColor: colors.mintDeep,
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: 'center',
  },
  modalCloseLabel: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '700',
  },
  centered: {
    minHeight: 220,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 16,
  },
  loadingText: {
    color: colors.muted,
    fontSize: 14,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.ink,
  },
  emptyText: {
    textAlign: 'center',
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
  },
  ctaCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderRadius: radii.card,
    paddingVertical: 18,
    paddingHorizontal: 16,
    marginBottom: 24,
    ...shadows.card,
  },
  ctaCardCreate: {
    backgroundColor: colors.mintDeep,
  },
  ctaCardEdit: {
    backgroundColor: colors.card,
  },
  ctaIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaIconWrapCreate: {
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  ctaIconWrapEdit: {
    backgroundColor: colors.badgeMint,
  },
  ctaTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  ctaTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.ink,
  },
  ctaTitleOnDark: {
    color: colors.white,
  },
  ctaSubtitle: {
    marginTop: 3,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
    color: colors.muted,
  },
  ctaSubtitleOnDark: {
    color: 'rgba(255,255,255,0.78)',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.ink,
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
    backgroundColor: colors.card,
    borderRadius: 18,
    paddingVertical: 16,
    paddingHorizontal: 14,
    ...shadows.soft,
  },
  statCardWide: {
    width: '100%',
  },
  statValue: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.mintDeep,
  },
  statLabel: {
    marginTop: 4,
    fontSize: 13,
    color: colors.muted,
    fontWeight: '600',
  },
  progressCard: {
    backgroundColor: colors.card,
    borderRadius: 18,
    padding: 16,
    marginBottom: 24,
    ...shadows.soft,
  },
  progressHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 12,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.badgeMint,
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  statusBadgeGold: {
    backgroundColor: '#FFF4D6',
  },
  statusBadgeNew: {
    backgroundColor: '#EEF2FF',
  },
  statusBadgeLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.mintDeep,
  },
  statusBadgeLabelGold: {
    color: '#7A4E00',
  },
  statusBadgeLabelNew: {
    color: '#4338CA',
  },
  progressCurrent: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.muted,
  },
  progressTrack: {
    height: 10,
    borderRadius: radii.pill,
    backgroundColor: '#E8F0EB',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: radii.pill,
    backgroundColor: colors.mintDeep,
  },
  progressHint: {
    marginTop: 10,
    fontSize: 13,
    color: colors.muted,
    fontWeight: '600',
  },
  emptyReviews: {
    backgroundColor: colors.card,
    borderRadius: 18,
    padding: 18,
    ...shadows.soft,
  },
  emptyReviewsText: {
    fontSize: 14,
    lineHeight: 21,
    color: colors.muted,
  },
  reviewCard: {
    backgroundColor: colors.card,
    borderRadius: 18,
    padding: 16,
    marginBottom: 10,
    ...shadows.soft,
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
    color: colors.ink,
  },
  reviewDate: {
    fontSize: 12,
    color: colors.mutedSoft,
  },
  starsRow: {
    flexDirection: 'row',
    gap: 2,
    marginBottom: 8,
  },
  reviewComment: {
    fontSize: 14,
    lineHeight: 21,
    color: colors.muted,
  },
  reviewCommentMuted: {
    fontSize: 13,
    fontStyle: 'italic',
    color: '#9AA8A0',
  },
});
