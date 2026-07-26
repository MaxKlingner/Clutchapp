import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { useAuth } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';

import { colors, radii, shadows } from '../constants/theme';
import { useRole } from '../lib/RoleContext';
import { ROLES } from '../lib/roles';
import { MATCH_STATUS } from '../lib/tutorConstants';
import {
  acceptMatchRequest,
  declineMatchRequest,
  fetchMatchById,
  fetchMatches,
  fetchTutorMatchRequests,
} from '../lib/supabase';
import ChatScreen from './ChatScreen';

const MINT_BAND_H = Math.round(Dimensions.get('window').height * 0.22);

function getInitials(name) {
  return String(name || '?')
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

export default function MessagesScreen() {
  const { userId } = useAuth();
  const { role } = useRole();
  const navigation = useNavigation();
  const route = useRoute();
  const isTutor = role === ROLES.TUTOR;

  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedMatch, setSelectedMatch] = useState(null);
  const [actingId, setActingId] = useState(null);

  async function loadMatches() {
    if (!userId) {
      setMatches([]);
      setLoading(false);
      return [];
    }

    setError(null);
    try {
      const rows = isTutor
        ? await fetchTutorMatchRequests(userId)
        : await fetchMatches(userId, {
            statuses: [MATCH_STATUS.ACCEPTED, MATCH_STATUS.PENDING],
          });
      setMatches(rows);
      return rows;
    } catch (err) {
      setError(err?.message ?? 'Erreur de chargement.');
      setMatches([]);
      return [];
    } finally {
      setLoading(false);
    }
  }

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;

      async function boot() {
        setLoading(true);
        const rows = await loadMatches();
        if (cancelled) return;

        const openMatchId = route.params?.openMatchId;
        if (!openMatchId) return;

        const fromList = rows.find((item) => item.id === openMatchId);
        try {
          const match = fromList || (await fetchMatchById(openMatchId));
          if (!cancelled && match) {
            setSelectedMatch(match);
          }
        } catch (err) {
          if (!cancelled) {
            setError(err?.message ?? 'Conversation introuvable.');
          }
        } finally {
          navigation.setParams({ openMatchId: undefined });
        }
      }

      boot();
      return () => {
        cancelled = true;
      };
    }, [userId, isTutor, route.params?.openMatchId])
  );

  async function onAccept(match) {
    if (actingId) return;
    setActingId(match.id);
    try {
      const updated = await acceptMatchRequest(match.id, userId);
      await loadMatches();
      setSelectedMatch(updated);
    } catch (err) {
      setError(err?.message ?? 'Acceptation impossible.');
    } finally {
      setActingId(null);
    }
  }

  async function onDecline(match) {
    if (actingId) return;
    setActingId(match.id);
    try {
      await declineMatchRequest(match.id);
      setSelectedMatch(null);
      await loadMatches();
    } catch (err) {
      setError(err?.message ?? 'Refus impossible.');
    } finally {
      setActingId(null);
    }
  }

  if (selectedMatch) {
    return (
      <ChatScreen
        match={selectedMatch}
        onBack={() => {
          setSelectedMatch(null);
          loadMatches();
        }}
        onMatchUpdated={(updated) => {
          setSelectedMatch(updated);
          loadMatches();
        }}
        onDeclined={() => {
          setSelectedMatch(null);
          loadMatches();
        }}
      />
    );
  }

  function renderParentMatch({ item }) {
    const pending = item.status === MATCH_STATUS.PENDING;
    const name = item.tutor?.name ?? 'Tuteur';

    return (
      <Pressable style={styles.card} onPress={() => setSelectedMatch(item)}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{getInitials(name)}</Text>
        </View>
        <View style={styles.rowBody}>
          <View style={styles.rowTitleRow}>
            <Text style={styles.rowTitle} numberOfLines={1}>
              {name}
            </Text>
            {pending ? (
              <View style={styles.pendingPill}>
                <Text style={styles.pendingPillLabel}>En attente</Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.rowSubtitle} numberOfLines={2}>
            {pending
              ? 'Demande envoyée — en attente du tuteur'
              : `${item.tutor?.subject ?? 'Match'} · Appuyer pour discuter`}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.mutedSoft} />
      </Pressable>
    );
  }

  function renderTutorMatch({ item }) {
    const pending = item.status === MATCH_STATUS.PENDING;
    const name = item.parentName || 'Parent';
    const busy = actingId === item.id;

    return (
      <View style={styles.requestCard}>
        <Pressable
          style={styles.requestHeader}
          onPress={() => setSelectedMatch(item)}
        >
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{getInitials(name)}</Text>
          </View>
          <View style={styles.rowBody}>
            <View style={styles.rowTitleRow}>
              <Text style={styles.rowTitle} numberOfLines={1}>
                {name}
              </Text>
              {pending ? (
                <View style={styles.newPill}>
                  <Text style={styles.newPillLabel}>Nouveau</Text>
                </View>
              ) : null}
            </View>
            <Text style={styles.rowSubtitle} numberOfLines={2}>
              {pending
                ? 'Nouvelle demande — ouvrir pour répondre'
                : 'Cours accepté · Appuyer pour discuter'}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.mutedSoft} />
        </Pressable>

        {pending ? (
          <View style={styles.actions}>
            <Pressable
              style={[styles.acceptBtn, busy && styles.disabled]}
              onPress={() => onAccept(item)}
              disabled={busy}
            >
              {busy ? (
                <ActivityIndicator color={colors.white} />
              ) : (
                <Text style={styles.actionLabel}>Accepter la demande</Text>
              )}
            </Pressable>
            <Pressable
              style={[styles.declineBtn, busy && styles.disabled]}
              onPress={() => onDecline(item)}
              disabled={busy}
            >
              <Text style={styles.declineLabel}>Décliner</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable
            style={styles.openChatBtn}
            onPress={() => setSelectedMatch(item)}
          >
            <Ionicons
              name="chatbubble-ellipses"
              size={16}
              color={colors.white}
            />
            <Text style={styles.actionLabel}>Ouvrir la conversation</Text>
          </Pressable>
        )}
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <View style={[styles.mintBand, { height: MINT_BAND_H }]} />

      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.container}>
          <View style={styles.topBar}>
            <View style={styles.topBarText}>
              <Text style={styles.eyebrow}>Clutch</Text>
              <Text style={styles.title}>
                {isTutor ? 'Demandes' : 'Messages'}
              </Text>
            </View>
          </View>
          <Text style={styles.subtitle}>
            {isTutor
              ? 'Parents qui t’ont envoyé une demande de cours.'
              : 'Tes conversations avec les tuteurs.'}
          </Text>

          {loading ? (
            <View style={styles.centered}>
              <ActivityIndicator size="large" color={colors.mintDeep} />
            </View>
          ) : error ? (
            <View style={styles.centered}>
              <Text style={styles.error}>{error}</Text>
              <Pressable style={styles.retry} onPress={loadMatches}>
                <Text style={styles.retryLabel}>Réessayer</Text>
              </Pressable>
            </View>
          ) : (
            <FlatList
              data={matches}
              keyExtractor={(item) => item.id}
              renderItem={isTutor ? renderTutorMatch : renderParentMatch}
              contentContainerStyle={
                matches.length === 0 ? styles.emptyList : styles.list
              }
              showsVerticalScrollIndicator={false}
              ListEmptyComponent={
                <View style={styles.emptyCard}>
                  <View style={styles.emptyIcon}>
                    <Ionicons
                      name={isTutor ? 'mail-open-outline' : 'chatbubbles-outline'}
                      size={28}
                      color={colors.mintDeep}
                    />
                  </View>
                  <Text style={styles.emptyText}>
                    {isTutor
                      ? 'Aucune demande pour l’instant. Complète ton profil pour apparaître dans Découvrir.'
                      : 'Aucune conversation. Envoie un message depuis Découvrir pour démarrer.'}
                  </Text>
                </View>
              }
            />
          )}
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
    paddingTop: 8,
  },
  topBar: {
    marginBottom: 6,
    minHeight: 52,
    justifyContent: 'center',
  },
  topBarText: {
    gap: 2,
  },
  eyebrow: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.4,
    color: colors.mintDeep,
    textTransform: 'uppercase',
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.ink,
  },
  subtitle: {
    marginBottom: 18,
    fontSize: 15,
    lineHeight: 22,
    color: colors.muted,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  list: {
    paddingBottom: 28,
    paddingTop: 4,
  },
  emptyList: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingBottom: 40,
  },
  emptyCard: {
    backgroundColor: colors.card,
    borderRadius: radii.card,
    paddingVertical: 28,
    paddingHorizontal: 22,
    alignItems: 'center',
    gap: 14,
    ...shadows.card,
  },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.mintSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    textAlign: 'center',
    fontSize: 15,
    lineHeight: 23,
    color: colors.muted,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radii.card,
    padding: 16,
    marginBottom: 12,
    gap: 12,
    ...shadows.soft,
  },
  requestCard: {
    backgroundColor: colors.card,
    borderRadius: radii.card,
    padding: 16,
    marginBottom: 12,
    ...shadows.soft,
  },
  requestHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.mintSoft,
    borderWidth: 3,
    borderColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.mintDeep,
  },
  rowBody: {
    flex: 1,
    minWidth: 0,
  },
  rowTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rowTitle: {
    flexShrink: 1,
    fontSize: 17,
    fontWeight: '800',
    color: colors.ink,
  },
  rowSubtitle: {
    marginTop: 3,
    fontSize: 13,
    lineHeight: 18,
    color: colors.muted,
  },
  pendingPill: {
    backgroundColor: '#FFF4D6',
    borderRadius: radii.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  pendingPillLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#7A4E00',
  },
  newPill: {
    backgroundColor: colors.badgeMint,
    borderRadius: radii.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  newPillLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.mintDeep,
  },
  actions: {
    marginTop: 14,
    gap: 8,
  },
  acceptBtn: {
    backgroundColor: colors.mintDeep,
    borderRadius: radii.button,
    paddingVertical: 13,
    alignItems: 'center',
    ...shadows.soft,
  },
  openChatBtn: {
    marginTop: 14,
    backgroundColor: colors.mintDeep,
    borderRadius: radii.button,
    paddingVertical: 13,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    ...shadows.soft,
  },
  declineBtn: {
    backgroundColor: colors.white,
    borderRadius: radii.button,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  actionLabel: {
    color: colors.white,
    fontWeight: '700',
    fontSize: 15,
  },
  declineLabel: {
    color: colors.muted,
    fontWeight: '700',
    fontSize: 15,
  },
  disabled: {
    opacity: 0.7,
  },
  error: {
    color: colors.danger,
    textAlign: 'center',
    paddingHorizontal: 16,
    fontSize: 15,
  },
  retry: {
    backgroundColor: colors.mintDeep,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: radii.button,
  },
  retryLabel: {
    color: colors.white,
    fontWeight: '700',
  },
});
