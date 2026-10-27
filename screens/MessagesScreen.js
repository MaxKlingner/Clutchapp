import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useIsFocused, useNavigation, useRoute } from '@react-navigation/native';
import { useAuth } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';

import { colors, radii } from '../constants/theme';
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
  return String(fullName || '').trim().split(/\s+/)[0] || '';
}

function formatRate(rate) {
  const value = Number(rate);
  if (!Number.isFinite(value)) return null;
  return Number.isInteger(value) ? `${value}` : value.toFixed(2);
}

function formatWhen(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const minutes = Math.round((Date.now() - date.getTime()) / 60000);
  if (minutes < 1) return 'À l’instant';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} j`;
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

function subjectLine(tutor) {
  const list = (tutor?.specialties?.length ? tutor.specialties : [tutor?.subject])
    .filter((item) => item && String(item).toLowerCase() !== 'matière');
  return list.slice(0, 2).join(' · ');
}

export default function MessagesScreen() {
  const isFocused = useIsFocused();
  const { userId } = useAuth();
  const { role } = useRole();
  const navigation = useNavigation();
  const route = useRoute();
  const isTutor = role === ROLES.TUTOR;

  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actingId, setActingId] = useState(null);

  function openConversation(match) {
    if (!match) return;
    navigation.navigate('Chat', { match });
  }

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
          if (!cancelled && match) openConversation(match);
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
      openConversation(updated);
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
      await loadMatches();
    } catch (err) {
      setError(err?.message ?? 'Refus impossible.');
    } finally {
      setActingId(null);
    }
  }

  function renderParentMatch({ item }) {
    const pending = item.status === MATCH_STATUS.PENDING;
    const tutor = item.tutor;
    const name = tutor?.name ?? 'Tuteur';
    const rate = formatRate(tutor?.hourlyRate);
    const subject = subjectLine(tutor);

    return (
      <Pressable
        style={styles.card}
        onPress={() => openConversation(item)}
        accessibilityLabel={`Ouvrir la conversation avec ${firstName(name) || name}`}
      >
        <View style={styles.avatar}>
          {tutor?.avatarUrl ? (
            <Image source={{ uri: tutor.avatarUrl }} style={styles.avatarImage} />
          ) : (
            <Text style={styles.avatarText}>{getInitials(name)}</Text>
          )}
        </View>
        <View style={styles.rowBody}>
          <View style={styles.rowTitleRow}>
            <Text style={styles.rowTitle} numberOfLines={1}>
              {firstName(name) || name}
            </Text>
            {pending ? (
              <View style={styles.pendingPill}>
                <Text style={styles.pendingPillLabel}>En attente</Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.rowHeadline} numberOfLines={1}>
            {subject || 'Cours à préciser'}
          </Text>
          <Text style={styles.rowSubtitle} numberOfLines={1}>
            {tutor?.city || 'Ville à préciser'}
            {rate ? ` · ${rate} €/h` : ''}
          </Text>
        </View>
        <Text style={styles.when}>{formatWhen(item.createdAt)}</Text>
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
          onPress={() => openConversation(item)}
          accessibilityLabel={`Ouvrir la conversation avec ${name}`}
        >
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{getInitials(name)}</Text>
          </View>
          <View style={styles.rowBody}>
            <View style={styles.rowTitleRow}>
              <Text style={styles.rowTitle} numberOfLines={1}>
                {firstName(name) || name}
              </Text>
              <Text style={styles.whenInline}>{formatWhen(item.createdAt)}</Text>
              {pending ? (
                <View style={styles.newPill}>
                  <Text style={styles.newPillLabel}>Nouveau</Text>
                </View>
              ) : null}
            </View>
            <Text style={styles.rowHeadline} numberOfLines={1}>
              {pending ? 'Nouvelle demande de cours' : 'Cours accepté'}
            </Text>
            <Text style={styles.rowPreview} numberOfLines={2}>
              {pending
                ? 'Lis le message, puis accepte ou décline la demande.'
                : 'La discussion est ouverte. Appuie pour répondre.'}
            </Text>
          </View>
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
            onPress={() => openConversation(item)}
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

  const pendingCount = matches.filter(
    (item) => item.status === MATCH_STATUS.PENDING
  ).length;

  return (
    <View style={styles.root}>
      {isFocused ? <StatusBar style="light" /> : null}
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <Text style={styles.title}>{isTutor ? 'Demandes' : 'Messages'}</Text>
          <Text style={styles.subtitle}>
            {loading
              ? 'Chargement…'
              : isTutor
                ? pendingCount === 1
                  ? '1 demande en attente'
                  : `${pendingCount} demandes en attente`
                : matches.length === 1
                  ? '1 conversation'
                  : `${matches.length} conversations`}
          </Text>
        </View>
        <View style={styles.container}>
          {loading ? (
            <View style={styles.centered}>
              <ActivityIndicator size="large" color="#C7C7CC" />
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
                      color="#E8E8E8"
                    />
                  </View>
                  <Text style={styles.emptyTitle}>
                    {isTutor ? 'Aucune demande' : 'Aucune conversation'}
                  </Text>
                  <Text style={styles.emptyText}>
                    {isTutor
                      ? 'Les parents qui te contactent apparaissent ici, avec leur message et les boutons pour répondre.'
                      : 'Écris à un tuteur depuis Découvrir ou depuis un favori. La discussion et son profil resteront ici.'}
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
    backgroundColor: '#111111',
  },
  safe: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  container: {
    flex: 1,
    paddingHorizontal: 20,
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
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  list: {
    paddingBottom: 28,
  },
  emptyList: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingBottom: 40,
  },
  emptyCard: {
    backgroundColor: '#1C1C1E',
    borderRadius: 28,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    paddingVertical: 28,
    paddingHorizontal: 22,
    alignItems: 'flex-start',
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
  emptyText: {
    fontSize: 15,
    lineHeight: 23,
    color: '#C7C7CC',
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.white,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1A1C',
    borderRadius: 28,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    padding: 14,
    marginBottom: 12,
    gap: 12,
  },
  when: {
    fontSize: 12,
    fontWeight: '600',
    color: '#8E8E93',
  },
  whenInline: {
    fontSize: 12,
    fontWeight: '600',
    color: '#8E8E93',
  },
  requestCard: {
    backgroundColor: '#1A1A1C',
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    padding: 16,
    marginBottom: 12,
  },
  requestHeader: {
    flexDirection: 'row',
    alignItems: 'center',
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
    fontSize: 18,
    fontWeight: '800',
    color: colors.white,
  },
  rowHeadline: {
    marginTop: 2,
    fontSize: 14,
    fontWeight: '600',
    color: '#E8E8E8',
  },
  rowSubtitle: {
    marginTop: 2,
    fontSize: 13,
    color: '#A1A1A6',
  },
  rowPreview: {
    marginTop: 6,
    fontSize: 13,
    lineHeight: 18,
    color: '#C7C7CC',
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
    backgroundColor: '#2C2C2E',
    borderRadius: radii.pill,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  newPillLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#E8E8E8',
  },
  actions: {
    marginTop: 14,
    gap: 8,
  },
  acceptBtn: {
    backgroundColor: '#1B6B45',
    borderRadius: radii.button,
    paddingVertical: 13,
    alignItems: 'center',
  },
  openChatBtn: {
    marginTop: 14,
    backgroundColor: '#1B6B45',
    borderRadius: radii.button,
    paddingVertical: 13,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  declineBtn: {
    backgroundColor: '#1C1C1E',
    borderRadius: radii.button,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#2A2A2A',
  },
  actionLabel: {
    color: colors.white,
    fontWeight: '700',
    fontSize: 15,
  },
  declineLabel: {
    color: '#C7C7CC',
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
    backgroundColor: '#1B6B45',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: radii.button,
  },
  retryLabel: {
    color: colors.white,
    fontWeight: '700',
  },
});
