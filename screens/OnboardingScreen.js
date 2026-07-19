import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth, useUser } from '@clerk/clerk-expo';

import { ROLES, saveUserRole } from '../lib/roles';
import { ensureTutorProfile } from '../lib/supabase';

export default function OnboardingScreen({ onRoleSelected, loadError }) {
  const { userId } = useAuth();
  const { user } = useUser();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function chooseRole(role) {
    if (!userId || saving) return;

    setSaving(true);
    setError('');

    try {
      const fullName =
        user?.fullName ||
        [user?.firstName, user?.lastName].filter(Boolean).join(' ') ||
        null;

      await saveUserRole(userId, role, fullName);
      if (role === ROLES.TUTOR) {
        await ensureTutorProfile({ clerkId: userId, fullName });
      }
      onRoleSelected?.(role);
    } catch (err) {
      setError(err?.message ?? 'Impossible d’enregistrer ton choix.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.container}>
        <Text style={styles.brand}>CLUTCH</Text>
        <Text style={styles.title}>Qui êtes-vous ?</Text>
        <Text style={styles.subtitle}>
          Ce choix personnalise ton expérience. Tu pourras le retrouver à chaque
          connexion.
        </Text>

        <Pressable
          style={[styles.card, styles.parentCard, saving && styles.disabled]}
          onPress={() => chooseRole(ROLES.PARENT)}
          disabled={saving}
        >
          <View style={[styles.iconWrap, styles.parentIcon]}>
            <Ionicons name="people" size={28} color="#1B5E3B" />
          </View>
          <Text style={styles.cardTitle}>Je cherche un tuteur</Text>
          <Text style={styles.cardSubtitle}>Parent</Text>
          <Text style={styles.cardHint}>
            Swipe, match et réserve des cours pour ton enfant.
          </Text>
        </Pressable>

        <Pressable
          style={[styles.card, styles.tutorCard, saving && styles.disabled]}
          onPress={() => chooseRole(ROLES.TUTOR)}
          disabled={saving}
        >
          <View style={[styles.iconWrap, styles.tutorIcon]}>
            <Ionicons name="school" size={28} color="#4338CA" />
          </View>
          <Text style={styles.cardTitle}>Je suis tuteur</Text>
          <Text style={styles.cardSubtitle}>Étudiant</Text>
          <Text style={styles.cardHint}>
            Gère ton profil, tes cours et retire tes gains.
          </Text>
        </Pressable>

        {saving ? (
          <ActivityIndicator
            style={styles.loader}
            size="large"
            color="#1B5E3B"
          />
        ) : null}

        {error || loadError ? (
          <Text style={styles.error}>{error || loadError}</Text>
        ) : null}
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
    paddingTop: 28,
    paddingBottom: 24,
  },
  brand: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: 2,
    color: '#0F2A1F',
  },
  title: {
    marginTop: 28,
    fontSize: 32,
    fontWeight: '800',
    color: '#10261C',
  },
  subtitle: {
    marginTop: 10,
    marginBottom: 28,
    fontSize: 16,
    lineHeight: 24,
    color: '#4A6357',
  },
  card: {
    borderRadius: 22,
    padding: 22,
    marginBottom: 14,
    borderWidth: 2,
  },
  parentCard: {
    backgroundColor: '#E8F5EE',
    borderColor: '#1B5E3B',
  },
  tutorCard: {
    backgroundColor: '#EEF2FF',
    borderColor: '#4338CA',
  },
  iconWrap: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  parentIcon: {
    backgroundColor: '#D8EFE3',
  },
  tutorIcon: {
    backgroundColor: '#E0E7FF',
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#10261C',
  },
  cardSubtitle: {
    marginTop: 4,
    fontSize: 14,
    fontWeight: '700',
    color: '#4A6357',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  cardHint: {
    marginTop: 10,
    fontSize: 15,
    lineHeight: 22,
    color: '#3D5C4C',
  },
  disabled: {
    opacity: 0.6,
  },
  loader: {
    marginTop: 18,
  },
  error: {
    marginTop: 16,
    color: '#C0392B',
    fontSize: 14,
    lineHeight: 20,
  },
});
