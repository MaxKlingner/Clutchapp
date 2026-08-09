import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useAuth } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';

import { colors, radii, shadows } from '../constants/theme';
import { fetchFavoriteTutors, removeFavoriteTutor } from '../lib/supabase';

function getInitials(name) {
  return String(name || '?')
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function formatRate(rate) {
  const value = Number(rate);
  if (!Number.isFinite(value)) return '—';
  return Number.isInteger(value) ? `${value}` : value.toFixed(2);
}

export default function FavoritesScreen() {
  const { userId } = useAuth();
  const navigation = useNavigation();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [removingId, setRemovingId] = useState(null);

  async function loadFavorites({ soft = false } = {}) {
    if (!userId) {
      setItems([]);
      setLoading(false);
      return;
    }

    if (!soft) setLoading(true);
    setError(null);
    try {
      const rows = await fetchFavoriteTutors(userId);
      setItems(rows);
    } catch (err) {
      setItems([]);
      setError(err?.message ?? 'Impossible de charger tes favoris.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useFocusEffect(
    useCallback(() => {
      loadFavorites();
    }, [userId])
  );

  async function onRefresh() {
    setRefreshing(true);
    await loadFavorites({ soft: true });
  }

  async function onRemove(tutorId) {
    if (!userId || removingId) return;
    setRemovingId(tutorId);
    setError(null);
    const previous = items;
    setItems((prev) => prev.filter((row) => row.tutorId !== tutorId));
    try {
      await removeFavoriteTutor(userId, tutorId);
    } catch (err) {
      setItems(previous);
      setError(err?.message ?? 'Impossible de retirer ce favori.');
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <View style={styles.root}>
      <View style={styles.mintBand} />
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <Text style={styles.title}>Mes favoris</Text>
          <Pressable
            style={styles.headerIconButton}
            onPress={() => navigation.navigate('Settings')}
            accessibilityLabel="Réglages"
            hitSlop={8}
          >
            <Ionicons name="settings-outline" size={22} color={colors.mintDeep} />
          </Pressable>
        </View>

        {loading ? (
          <View style={styles.stateCard}>
            <ActivityIndicator size="large" color={colors.mintDeep} />
            <Text style={styles.stateText}>Chargement des favoris…</Text>
          </View>
        ) : error && items.length === 0 ? (
          <View style={styles.stateCard}>
            <Text style={styles.emptyTitle}>Impossible de charger</Text>
            <Text style={styles.emptyText}>{error}</Text>
            <Pressable style={styles.retryButton} onPress={() => loadFavorites()}>
              <Text style={styles.retryLabel}>Réessayer</Text>
            </Pressable>
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={colors.mintDeep}
              />
            }
          >
            {error ? <Text style={styles.inlineError}>{error}</Text> : null}

            {items.length === 0 ? (
              <View style={styles.stateCard}>
                <Ionicons name="heart-outline" size={36} color={colors.mintDeep} />
                <Text style={styles.emptyTitle}>Aucun favori</Text>
                <Text style={styles.emptyText}>
                  Sur Découvrir, appuie sur le cœur pour sauvegarder un tuteur.
                </Text>
              </View>
            ) : (
              items.map((row) => {
                const tutor = row.tutor;
                return (
                  <View key={row.id} style={styles.card}>
                    <View style={styles.cardTop}>
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
                      <View style={styles.cardMain}>
                        <Text style={styles.name} numberOfLines={1}>
                          {tutor.name}
                        </Text>
                        {tutor.city ? (
                          <Text style={styles.meta} numberOfLines={1}>
                            {tutor.city}
                            {tutor.postalCode ? ` · ${tutor.postalCode}` : ''}
                          </Text>
                        ) : null}
                        <Text style={styles.meta}>
                          {(tutor.rating || 0) > 0
                            ? `★ ${tutor.rating.toFixed(1)}`
                            : '★ —'}
                          {' · '}
                          {formatRate(tutor.hourlyRate)} €/h
                        </Text>
                      </View>
                      <Pressable
                        style={styles.heartButton}
                        onPress={() => onRemove(tutor.id)}
                        disabled={removingId === tutor.id}
                        accessibilityLabel="Retirer des favoris"
                        hitSlop={8}
                      >
                        {removingId === tutor.id ? (
                          <ActivityIndicator size="small" color={colors.danger} />
                        ) : (
                          <Ionicons name="heart" size={22} color={colors.danger} />
                        )}
                      </Pressable>
                    </View>

                    {(tutor.teachingFormats?.length
                      ? tutor.teachingFormats
                      : []
                    ).length > 0 ? (
                      <View style={styles.chipWrap}>
                        {tutor.teachingFormats.map((format) => (
                          <View key={`${tutor.id}-${format}`} style={styles.formatChip}>
                            <Text style={styles.formatChipLabel}>{format}</Text>
                          </View>
                        ))}
                      </View>
                    ) : null}

                    <View style={styles.chipWrap}>
                      {(tutor.specialties?.length
                        ? tutor.specialties
                        : [tutor.subject]
                      )
                        .filter(Boolean)
                        .slice(0, 4)
                        .map((skill) => (
                          <View key={`${tutor.id}-${skill}`} style={styles.specialtyChip}>
                            <Text style={styles.specialtyChipLabel}>{skill}</Text>
                          </View>
                        ))}
                    </View>
                  </View>
                );
              })
            )}
          </ScrollView>
        )}
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
    height: 140,
    backgroundColor: colors.mint,
  },
  safe: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.mintDeep,
  },
  headerIconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
    ...shadows.soft,
  },
  list: {
    paddingHorizontal: 16,
    paddingBottom: 28,
    gap: 12,
  },
  stateCard: {
    marginHorizontal: 16,
    marginTop: 12,
    backgroundColor: colors.card,
    borderRadius: radii.card,
    padding: 28,
    alignItems: 'center',
    gap: 10,
    ...shadows.card,
  },
  stateText: {
    color: colors.muted,
    fontSize: 14,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.ink,
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: colors.muted,
    textAlign: 'center',
    lineHeight: 20,
  },
  retryButton: {
    marginTop: 8,
    backgroundColor: colors.mintDeep,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: radii.button,
  },
  retryLabel: {
    color: colors.white,
    fontWeight: '700',
  },
  inlineError: {
    color: colors.danger,
    fontSize: 13,
    marginBottom: 4,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radii.card,
    padding: 16,
    ...shadows.card,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: colors.mintSoft,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarText: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.mintDeep,
  },
  cardMain: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  name: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.ink,
  },
  meta: {
    fontSize: 13,
    color: colors.muted,
  },
  heartButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.badgeMint,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 12,
  },
  specialtyChip: {
    backgroundColor: colors.chipBg,
    borderRadius: radii.chip,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  specialtyChipLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.ink,
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
});
