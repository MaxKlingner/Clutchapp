import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '@clerk/clerk-expo';

import { useRole } from '../lib/RoleContext';
import { ROLES } from '../lib/roles';
import { MATCH_STATUS } from '../lib/tutorConstants';
import {
  acceptMatchRequest,
  declineMatchRequest,
  fetchMatches,
  fetchTutorMatchRequests,
} from '../lib/supabase';
import ChatScreen from './ChatScreen';

export default function MessagesScreen() {
  const { userId } = useAuth();
  const { role } = useRole();
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
      return;
    }

    setError(null);
    try {
      const rows = isTutor
        ? await fetchTutorMatchRequests(userId)
        : await fetchMatches(userId, {
            statuses: [MATCH_STATUS.ACCEPTED, MATCH_STATUS.PENDING],
          });
      setMatches(rows);
    } catch (err) {
      setError(err?.message ?? 'Erreur de chargement.');
      setMatches([]);
    } finally {
      setLoading(false);
    }
  }

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      loadMatches();
    }, [userId, isTutor])
  );

  async function onAccept(match) {
    if (actingId) return;
    setActingId(match.id);
    try {
      await acceptMatchRequest(match.id, userId);
      await loadMatches();
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

  if (selectedMatch) {
    return (
      <ChatScreen
        match={selectedMatch}
        onBack={() => {
          setSelectedMatch(null);
          loadMatches();
        }}
      />
    );
  }

  function renderParentMatch({ item }) {
    const pending = item.status === MATCH_STATUS.PENDING;
    const initials = (item.tutor?.name ?? '?')
      .split(' ')
      .filter(Boolean)
      .map((part) => part[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();

    return (
      <Pressable
        style={styles.row}
        onPress={() => {
          if (!pending) setSelectedMatch(item);
        }}
        disabled={pending}
      >
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
        <View style={styles.rowBody}>
          <Text style={styles.rowTitle}>{item.tutor?.name ?? 'Tuteur'}</Text>
          <Text style={styles.rowSubtitle}>
            {pending
              ? 'Demande envoyée — en attente du tuteur'
              : `${item.tutor?.subject ?? 'Match'} · Appuyer pour discuter`}
          </Text>
        </View>
      </Pressable>
    );
  }

  function renderTutorMatch({ item }) {
    const pending = item.status === MATCH_STATUS.PENDING;
    const name = item.parentName || 'Parent';
    const initials = name
      .split(' ')
      .filter(Boolean)
      .map((part) => part[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();
    const busy = actingId === item.id;

    return (
      <View style={styles.requestCard}>
        <View style={styles.requestHeader}>
          <View style={[styles.avatar, styles.tutorAvatar]}>
            <Text style={[styles.avatarText, styles.tutorAvatarText]}>
              {initials}
            </Text>
          </View>
          <View style={styles.rowBody}>
            <Text style={styles.rowTitle}>{name}</Text>
            <Text style={styles.rowSubtitle}>
              {pending
                ? 'A swipé à droite — veut un cours avec toi'
                : 'Cours accepté · Appuyer pour discuter'}
            </Text>
          </View>
        </View>

        {pending ? (
          <View style={styles.actions}>
            <Pressable
              style={[styles.acceptBtn, busy && styles.disabled]}
              onPress={() => onAccept(item)}
              disabled={busy}
            >
              {busy ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.actionLabel}>Accepter le cours</Text>
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
            <Text style={styles.actionLabel}>Ouvrir la conversation</Text>
          </Pressable>
        )}
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.container}>
        <Text style={styles.title}>
          {isTutor ? 'Demandes' : 'Messages'}
        </Text>
        <Text style={styles.subtitle}>
          {isTutor
            ? 'Parents qui ont swipé à droite sur ton profil.'
            : 'Tes matches apparaissent ici après un swipe à droite.'}
        </Text>

        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color="#1B5E3B" />
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
            ListEmptyComponent={
              <Text style={styles.emptyText}>
                {isTutor
                  ? 'Aucune demande pour l’instant. Complète ton profil pour apparaître dans le swipe.'
                  : 'Aucun match pour l’instant. Swipe à droite sur un tuteur pour démarrer une demande.'}
              </Text>
            }
          />
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
    paddingTop: 12,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#10261C',
  },
  subtitle: {
    marginTop: 8,
    marginBottom: 18,
    fontSize: 16,
    lineHeight: 24,
    color: '#4A6357',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  list: {
    paddingBottom: 24,
  },
  emptyList: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  emptyText: {
    textAlign: 'center',
    fontSize: 15,
    lineHeight: 24,
    color: '#7A9185',
    paddingHorizontal: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E2EAE5',
    gap: 12,
  },
  requestCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2EAE5',
  },
  requestHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#D8EADF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tutorAvatar: {
    backgroundColor: '#E0E7FF',
  },
  avatarText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1B5E3B',
  },
  tutorAvatarText: {
    color: '#4338CA',
  },
  rowBody: {
    flex: 1,
  },
  rowTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#10261C',
  },
  rowSubtitle: {
    marginTop: 2,
    fontSize: 14,
    color: '#4A6357',
  },
  actions: {
    marginTop: 12,
    gap: 8,
  },
  acceptBtn: {
    backgroundColor: '#1B5E3B',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  openChatBtn: {
    marginTop: 12,
    backgroundColor: '#4338CA',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  declineBtn: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#D1D5DB',
  },
  actionLabel: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 15,
  },
  declineLabel: {
    color: '#6B7280',
    fontWeight: '700',
    fontSize: 15,
  },
  disabled: {
    opacity: 0.7,
  },
  error: {
    color: '#C0392B',
    textAlign: 'center',
    paddingHorizontal: 16,
  },
  retry: {
    backgroundColor: '#1B5E3B',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 12,
  },
  retryLabel: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
});
