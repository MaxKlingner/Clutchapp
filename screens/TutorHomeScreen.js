import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useIsFocused, useNavigation } from '@react-navigation/native';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';

import TutorDiscoverCard from '../components/TutorDiscoverCard';
import { colors } from '../constants/theme';
import { hasPublishedAnnouncement } from '../lib/tutorAnnouncement';
import { ensureTutorProfile, resetMyTutorAnnouncement } from '../lib/supabase';

export default function TutorHomeScreen() {
  const navigation = useNavigation();
  const isFocused = useIsFocused();
  const { height: windowHeight } = useWindowDimensions();
  const tightScreen = windowHeight < 700;
  const { userId } = useAuth();
  const { user } = useUser();
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
  const [profile, setProfile] = useState(null);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      async function load() {
        if (!userId) return;
        setError('');
        try {
          const next = await ensureTutorProfile({ clerkId: userId });
          if (!cancelled) setProfile(next);
        } catch (err) {
          if (!cancelled) setError(err?.message ?? 'Impossible de charger ton annonce.');
        } finally {
          if (!cancelled) setLoading(false);
        }
      }
      load();
      return () => {
        cancelled = true;
      };
    }, [userId])
  );

  const published = hasPublishedAnnouncement(profile);
  const tutor = profile
    ? {
        ...profile,
        avatarUrl: user?.imageUrl || profile.avatarUrl,
        name:
          profile.name && profile.name !== 'Tuteur'
            ? profile.name
            : user?.firstName || user?.fullName || profile.name,
      }
    : null;

  function openEditor() {
    navigation.navigate('EditTutorAnnouncement');
  }

  function confirmDelete() {
    if (deleting) return;
    Alert.alert(
      'Supprimer l’annonce',
      'Elle disparaîtra de Découvrir. Tu pourras en recréer une plus tard.',
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Supprimer', style: 'destructive', onPress: onDelete },
      ]
    );
  }

  async function onDelete() {
    if (!userId || deleting) return;
    setDeleting(true);
    try {
      const next = await resetMyTutorAnnouncement(userId);
      setProfile(next);
    } catch (err) {
      Alert.alert('Annonce', err?.message ?? 'Impossible de supprimer l’annonce.');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <View style={styles.root}>
      {isFocused ? <StatusBar style="light" /> : null}
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <Text style={styles.title}>Annonce</Text>
          <Text style={styles.subtitle}>
            {loading
              ? 'Chargement…'
              : published
                ? 'Comme les parents la voient dans Découvrir'
                : 'Pas encore publiée'}
          </Text>
        </View>

        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator color="#C7C7CC" />
          </View>
        ) : error ? (
          <View style={styles.centered}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : !published ? (
          <View style={styles.centered}>
            <Pressable
              style={styles.createButton}
              onPress={openEditor}
              accessibilityLabel="Créer mon annonce"
            >
              <Ionicons name="add" size={44} color={colors.white} />
            </Pressable>
            <Text style={styles.createTitle}>Créer mon annonce</Text>
            <Text style={styles.createText}>
              Publie ton profil pour apparaître aux parents dans Découvrir.
            </Text>
          </View>
        ) : (
          <View style={styles.stage}>
            <View style={styles.cardWrap}>
              <TutorDiscoverCard tutor={tutor} tightScreen={tightScreen} />
            </View>
            <View style={styles.actions}>
              <Pressable
                style={styles.editButton}
                onPress={openEditor}
                accessibilityLabel="Modifier l’annonce"
              >
                <Text style={styles.editLabel}>Modifier</Text>
              </Pressable>
              <Pressable
                style={styles.deleteButton}
                onPress={confirmDelete}
                disabled={deleting}
                accessibilityLabel="Supprimer l’annonce"
              >
                {deleting ? (
                  <ActivityIndicator color="#FF8A80" />
                ) : (
                  <Text style={styles.deleteLabel}>Supprimer</Text>
                )}
              </Pressable>
            </View>
          </View>
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#111111' },
  safe: { flex: 1 },
  header: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 14,
    alignItems: 'center',
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
    paddingHorizontal: 32,
    paddingBottom: 60,
  },
  errorText: {
    textAlign: 'center',
    fontSize: 15,
    lineHeight: 22,
    color: '#FF8A80',
  },
  createButton: {
    width: 104,
    height: 104,
    borderRadius: 52,
    backgroundColor: '#1B6B45',
    alignItems: 'center',
    justifyContent: 'center',
  },
  createTitle: {
    marginTop: 18,
    fontSize: 20,
    fontWeight: '800',
    color: colors.white,
  },
  createText: {
    marginTop: 6,
    textAlign: 'center',
    fontSize: 15,
    lineHeight: 22,
    color: '#A1A1A6',
  },
  stage: {
    flex: 1,
    minHeight: 0,
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  cardWrap: {
    flex: 1,
    minHeight: 0,
  },
  actions: {
    flexShrink: 0,
    paddingTop: 14,
    gap: 8,
  },
  editButton: {
    height: 52,
    borderRadius: 16,
    backgroundColor: '#1B6B45',
    alignItems: 'center',
    justifyContent: 'center',
  },
  editLabel: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '800',
  },
  deleteButton: {
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteLabel: {
    color: '#FF8A80',
    fontSize: 15,
    fontWeight: '700',
  },
});
