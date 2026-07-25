import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';

import { useRole } from '../lib/RoleContext';
import { ROLES } from '../lib/roles';
import { ensureTutorProfile, resetMatchesAndMessages } from '../lib/supabase';
import TutorProfileEditor from './TutorProfileEditor';

export default function ProfileScreen() {
  const navigation = useNavigation();
  const { signOut, userId } = useAuth();
  const { user } = useUser();
  const { role, switching, switchRole } = useRole();
  const [signingOut, setSigningOut] = useState(false);
  const [resetting, setResetting] = useState(false);

  const isParent = role !== ROLES.TUTOR;
  const canClose = navigation.canGoBack();

  async function onSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await signOut();
    } finally {
      setSigningOut(false);
    }
  }

  async function onSwitchRole() {
    if (!userId || switching || signingOut) return;

    const nextRole = isParent ? ROLES.TUTOR : ROLES.PARENT;
    const label =
      nextRole === ROLES.TUTOR
        ? 'passer côté tuteur'
        : 'revenir côté parent';

    Alert.alert(
      'Changer de rôle',
      `Tu vas ${label}. Ton interface sera mise à jour immédiatement.`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Confirmer',
          onPress: async () => {
            try {
              const fullName =
                user?.fullName ||
                [user?.firstName, user?.lastName].filter(Boolean).join(' ') ||
                null;
              await switchRole(userId, nextRole, fullName);
              if (nextRole === ROLES.TUTOR) {
                await ensureTutorProfile({
                  clerkId: userId,
                  fullName,
                });
              }
            } catch (err) {
              Alert.alert(
                'Erreur',
                err?.message ?? 'Impossible de changer de rôle.'
              );
            }
          },
        },
      ]
    );
  }

  async function onResetMatches() {
    if (resetting) return;

    Alert.alert(
      'Reset de test',
      'Supprimer tous les matches et messages ? Cette action est irréversible.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Réinitialiser',
          style: 'destructive',
          onPress: async () => {
            setResetting(true);
            try {
              await resetMatchesAndMessages();
              Alert.alert(
                'Reset OK',
                'Matches et messages ont été réinitialisés.'
              );
            } catch (err) {
              Alert.alert(
                'Erreur',
                err?.message ?? 'Reset impossible.'
              );
            } finally {
              setResetting(false);
            }
          },
        },
      ]
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        {canClose ? (
          <View style={styles.modalHeader}>
            <Text style={styles.modalHeaderTitle}>Réglages</Text>
            <Pressable
              style={styles.closeIconButton}
              onPress={() => navigation.goBack()}
              accessibilityLabel="Fermer les réglages"
              hitSlop={8}
            >
              <Ionicons name="close" size={24} color="#1B5E3B" />
            </Pressable>
          </View>
        ) : null}

        {!isParent ? <TutorProfileEditor /> : null}

        {canClose ? null : <Text style={styles.title}>Réglages</Text>}
        <Text style={styles.roleBadge}>
          {role === ROLES.TUTOR ? 'Rôle : Tuteur' : 'Rôle : Parent'}
        </Text>
        <Text style={styles.subtitle}>
          {user?.primaryEmailAddress?.emailAddress
            ? `Connecté : ${user.primaryEmailAddress.emailAddress}`
            : 'Compte connecté'}
        </Text>

        <Pressable
          style={[
            styles.button,
            styles.switchRoleButton,
            (switching || signingOut) && styles.buttonDisabled,
          ]}
          onPress={onSwitchRole}
          disabled={switching || signingOut}
        >
          {switching ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.buttonLabel}>
              {isParent ? 'Passer côté tuteur' : 'Revenir côté parent'}
            </Text>
          )}
        </Pressable>

        <Pressable
          style={[
            styles.button,
            styles.signOutButton,
            signingOut && styles.buttonDisabled,
          ]}
          onPress={onSignOut}
          disabled={signingOut}
        >
          {signingOut ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.buttonLabel}>Se déconnecter</Text>
          )}
        </Pressable>

        <View style={styles.devSection}>
          <Text style={styles.devTitle}>Tests / développement</Text>
          <Text style={styles.devHint}>
            Outils internes — ne pas utiliser en production.
          </Text>
          <Pressable
            style={[
              styles.resetTestButton,
              resetting && styles.buttonDisabled,
            ]}
            onPress={onResetMatches}
            disabled={resetting || signingOut}
          >
            {resetting ? (
              <ActivityIndicator color="#7A4E00" />
            ) : (
              <Text style={styles.resetTestLabel}>
                [TEST] Reset matches & messages
              </Text>
            )}
          </Pressable>
        </View>
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
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 40,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  modalHeaderTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#10261C',
  },
  closeIconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E8F5EE',
  },
  roleBadge: {
    marginTop: 8,
    fontSize: 14,
    fontWeight: '700',
    color: '#1B5E3B',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#10261C',
  },
  subtitle: {
    marginTop: 8,
    marginBottom: 20,
    fontSize: 15,
    lineHeight: 22,
    color: '#4A6357',
  },
  button: {
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  switchRoleButton: {
    backgroundColor: '#4338CA',
    marginBottom: 10,
  },
  signOutButton: {
    backgroundColor: '#3D5C4C',
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonLabel: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  devSection: {
    marginTop: 32,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: '#D8E0DB',
  },
  devTitle: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.4,
    color: '#7A4E00',
    textTransform: 'uppercase',
  },
  devHint: {
    marginTop: 4,
    marginBottom: 12,
    fontSize: 13,
    color: '#8A7A55',
  },
  resetTestButton: {
    backgroundColor: '#FFF4D6',
    borderWidth: 1,
    borderColor: '#E6C86A',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    alignItems: 'center',
  },
  resetTestLabel: {
    color: '#7A4E00',
    fontSize: 13,
    fontWeight: '700',
  },
});
