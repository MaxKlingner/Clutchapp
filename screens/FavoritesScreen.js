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
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import { useAuth } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';

import TutorProfileDetail from '../components/TutorProfileDetail';
import { colors, radii } from '../constants/theme';
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

function firstName(fullName) {
  return String(fullName || 'Tuteur').trim().split(/\s+/)[0] || 'Tuteur';
}

function formatRate(rate) {
  const value = Number(rate);
  if (!Number.isFinite(value)) return '—';
  return Number.isInteger(value) ? `${value}` : value.toFixed(2);
}

function subjectsOf(tutor) {
  const list = (tutor?.specialties?.length ? tutor.specialties : [tutor?.subject])
    .filter((item) => item && String(item).toLowerCase() !== 'matière');
  return list;
}

export default function FavoritesScreen() {
  const isFocused = useIsFocused();
  const { userId } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [removingId, setRemovingId] = useState(null);
  const [opened, setOpened] = useState(null);

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
    if (opened?.id === tutorId) setOpened(null);
    try {
      await removeFavoriteTutor(userId, tutorId);
    } catch (err) {
      setItems(previous);
      setError(err?.message ?? 'Impossible de retirer ce favori.');
    } finally {
      setRemovingId(null);
    }
  }

  const countLabel =
    items.length === 1
      ? '1 tuteur sauvegardé'
      : `${items.length} tuteurs sauvegardés`;

  return (
    <View style={styles.root}>
      {isFocused ? <StatusBar style="light" /> : null}
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <Text style={styles.title}>Favoris</Text>
          <Text style={styles.subtitle}>
            {loading ? 'Chargement…' : countLabel}
          </Text>
        </View>

        {loading ? (
          <View style={styles.stateCard}>
            <ActivityIndicator size="large" color="#C7C7CC" />
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
                tintColor="#C7C7CC"
              />
            }
          >
            {error ? <Text style={styles.inlineError}>{error}</Text> : null}

            {items.length === 0 ? (
              <View style={styles.emptyPanel}>
                <View style={styles.emptyIcon}>
                  <Ionicons name="heart" size={28} color="#3DDC97" />
                </View>
                <Text style={styles.emptyTitle}>Rien de sauvegardé</Text>
                <Text style={styles.emptyText}>
                  Les tuteurs que tu gardes apparaissent ici, avec leur tarif,
                  leur ville et leurs cours.
                </Text>
                {[
                  ['heart-outline', 'Appuie sur le cœur dans Découvrir'],
                  ['person-outline', 'Retrouve la fiche complète ici'],
                  ['chatbubble-ellipses-outline', 'Écris-lui depuis son profil'],
                ].map(([icon, label]) => (
                  <View key={label} style={styles.hintRow}>
                    <View style={styles.hintIcon}>
                      <Ionicons name={icon} size={18} color="#E8E8E8" />
                    </View>
                    <Text style={styles.hintLabel}>{label}</Text>
                  </View>
                ))}
              </View>
            ) : (
              items.map((row) => {
                const tutor = row.tutor;
                const subjects = subjectsOf(tutor);
                return (
                  <Pressable
                    key={row.id}
                    style={styles.card}
                    onPress={() => setOpened(tutor)}
                    accessibilityLabel={`Voir le profil de ${firstName(tutor.name)}`}
                  >
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
                        {firstName(tutor.name)}
                      </Text>
                      <Text style={styles.headline} numberOfLines={1}>
                        {subjects.length
                          ? subjects.slice(0, 2).join(' · ')
                          : 'Cours à préciser'}
                      </Text>
                      <Text style={styles.meta} numberOfLines={1}>
                        {tutor.city || 'Ville à préciser'}
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
                        <ActivityIndicator size="small" color="#3DDC97" />
                      ) : (
                        <Ionicons name="heart" size={20} color="#3DDC97" />
                      )}
                    </Pressable>
                  </Pressable>
                );
              })
            )}
          </ScrollView>
        )}
      </SafeAreaView>
      <TutorProfileDetail
        tutor={opened}
        visible={Boolean(opened)}
        onClose={() => {
          setOpened(null);
          loadFavorites({ soft: true });
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#111111',
  },
  safe: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 14,
  },
  title: {
    textAlign: 'center',
    fontSize: 28,
    fontWeight: '800',
    color: colors.white,
  },
  subtitle: {
    marginTop: 4,
    textAlign: 'center',
    fontSize: 15,
    color: '#A1A1A6',
  },
  list: {
    paddingHorizontal: 20,
    paddingBottom: 28,
    gap: 12,
  },
  stateCard: {
    marginHorizontal: 20,
    marginTop: 12,
    backgroundColor: '#1C1C1E',
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    padding: 28,
    alignItems: 'center',
    gap: 10,
  },
  stateText: {
    color: '#C7C7CC',
    fontSize: 14,
  },
  emptyPanel: {
    backgroundColor: '#1C1C1E',
    borderRadius: 28,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    paddingHorizontal: 20,
    paddingVertical: 28,
    gap: 12,
  },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#2C2C2E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.white,
  },
  emptyText: {
    fontSize: 15,
    lineHeight: 22,
    color: '#C7C7CC',
  },
  hintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#111111',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  hintIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#2C2C2E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  hintLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: '#E8E8E8',
  },
  retryButton: {
    marginTop: 8,
    backgroundColor: '#1B6B45',
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
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1A1C',
    borderRadius: 28,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    padding: 14,
    gap: 12,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: '#2C2C2E',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#E8E8E8',
  },
  cardMain: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.white,
  },
  headline: {
    marginTop: 2,
    fontSize: 14,
    fontWeight: '600',
    color: '#E8E8E8',
  },
  meta: {
    marginTop: 2,
    fontSize: 13,
    color: '#A1A1A6',
  },
  heartButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2C2C2E',
  },
});
