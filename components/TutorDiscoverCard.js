import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors, shadows } from '../constants/theme';
import { PREVIEW_BIO_WORDS, limitWords } from '../lib/tutorAnnouncement';
import { courseFormatLabel } from '../lib/tutorConstants';

function formatRate(rate) {
  const value = Number(rate);
  if (!Number.isFinite(value) || value <= 0) return '—';
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

function lessonsGivenLabel(count) {
  const n = Math.max(0, Math.round(Number(count) || 0));
  return n === 1 ? '1 cours donné' : `${n} cours donnés`;
}

function placeFacts(tutor) {
  return [
    { icon: 'location-outline', text: tutor?.city || 'Lieu à préciser' },
    {
      icon: 'people-outline',
      text: courseFormatLabel(tutor?.teachingFormats) || 'Format à préciser',
    },
  ];
}

const PREVIEW_CHIPS = 3;

function previewChips(tutor) {
  const subjects = (
    tutor?.specialties?.length ? tutor.specialties : [tutor?.subject]
  ).filter((item) => item && String(item).toLowerCase() !== 'matière');
  return (subjects.length ? subjects : ['À préciser']).slice(0, PREVIEW_CHIPS);
}

export default function TutorDiscoverCard({
  tutor,
  tightScreen = false,
  favorite = false,
  favoriteBusy = false,
  contacted = false,
  onToggleFavorite,
  onOpenProfile,
}) {
  const chips = previewChips(tutor);
  const facts = placeFacts(tutor);
  const hasRating = (tutor?.rating || 0) > 0;
  const ratingLabel = hasRating
    ? `${tutor.rating.toFixed(1)} (${tutor.reviewCount || 0} avis)`
    : 'Pas encore d’avis';
  const name = firstName(tutor?.name);

  return (
    <View style={styles.previewCard}>
      <View style={[styles.previewTop, styles.previewFixed]}>
        <View style={[styles.previewAvatarWrap, tightScreen && styles.previewAvatarWrapTight]}>
          <View style={[styles.previewAvatar, tightScreen && styles.previewAvatarTight]}>
            {tutor?.avatarUrl ? (
              <Image source={{ uri: tutor.avatarUrl }} style={styles.previewAvatarImage} />
            ) : (
              <Text style={styles.previewAvatarText}>{getInitials(tutor?.name)}</Text>
            )}
          </View>
          <View style={styles.verifiedBadge}>
            <Text style={styles.verifiedBadgeText} numberOfLines={1}>
              {lessonsGivenLabel(getLessonsGiven(tutor))}
            </Text>
          </View>
        </View>
        <View style={styles.previewIdentity}>
          <Text style={styles.previewName} numberOfLines={1}>
            {name}
          </Text>
          <Text style={styles.previewRating} numberOfLines={1}>
            {hasRating ? <Text style={styles.previewStar}>★ </Text> : null}
            {ratingLabel}
          </Text>
          <Text style={styles.previewPrice}>{formatRate(tutor?.hourlyRate)} €/h</Text>
        </View>
        <Pressable
          style={styles.previewHeart}
          onPress={onToggleFavorite}
          disabled={!onToggleFavorite || favoriteBusy}
          accessibilityLabel={favorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
          hitSlop={8}
        >
          {favoriteBusy ? (
            <ActivityIndicator size="small" color="#3DDC97" />
          ) : (
            <Ionicons
              name={favorite ? 'heart' : 'heart-outline'}
              size={22}
              color={favorite ? '#3DDC97' : '#C7C7CC'}
            />
          )}
        </Pressable>
      </View>

      <View style={styles.previewFixed}>
        <View style={styles.previewDivider} />
        <Text style={styles.previewSection}>Spécialités</Text>
        <View style={[styles.previewChips, tightScreen && styles.previewChipsTight]}>
          {chips.map((chip, chipIndex) => (
            <View key={`${chip}-${chipIndex}`} style={styles.previewChip}>
              <Text style={styles.previewChipLabel}>{chip}</Text>
            </View>
          ))}
        </View>
      </View>

      <Text
        style={[tutor?.bio ? styles.previewBio : styles.bioMuted, styles.previewBioSpace]}
        numberOfLines={3}
      >
        {tutor?.bio
          ? limitWords(tutor.bio, PREVIEW_BIO_WORDS)
          : `${name} n’a pas encore rédigé sa présentation.`}
      </Text>

      <View style={styles.previewFixed}>
        {facts.map((fact, factIndex) => (
          <View
            key={fact.icon}
            style={[styles.previewFact, factIndex === facts.length - 1 && styles.previewFactLast]}
          >
            <Ionicons name={fact.icon} size={16} color="#A1A1A6" />
            <Text style={styles.previewFactText} numberOfLines={1}>
              {fact.text}
            </Text>
          </View>
        ))}
      </View>
      {onOpenProfile ? (
        <View style={styles.previewFooter}>
          {contacted ? (
            <View style={styles.contactedChip}>
              <Ionicons name="chatbubble-ellipses-outline" size={12} color="#3DDC97" />
              <Text style={styles.contactedChipLabel}>Déjà contacté</Text>
            </View>
          ) : null}
          <Pressable
            style={styles.discoverButton}
            onPress={onOpenProfile}
            delayPressIn={0}
            unstable_pressDelay={0}
            accessibilityLabel="Voir le profil"
          >
            <Text style={styles.discoverButtonLabel}>Voir le profil</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
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
  previewChipLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#E8E8E8',
  },
  previewBio: {
    flexShrink: 1,
    minHeight: 0,
    fontSize: 15,
    lineHeight: 22,
    maxHeight: 66,
    color: '#D4D4D4',
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
    gap: 10,
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
});
