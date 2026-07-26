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
import { CommonActions, useNavigation } from '@react-navigation/native';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';

import { useRole } from '../lib/RoleContext';
import { ROLES } from '../lib/roles';
import { ensureTutorProfile, resetMatchesAndMessages, resetMyTutorAnnouncement } from '../lib/supabase';

export default function ProfileScreen() {
  const navigation = useNavigation();
  const { signOut, userId } = useAuth();
  const { user } = useUser();
  const { role, switching, switchRole } = useRole();
  const [signingOut, setSigningOut] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resettingAnnouncement, setResettingAnnouncement] = useState(false);

  const isParent = role !== ROLES.TUTOR;
  const canClose = navigation.canGoBack();

  function resetToHomeTabs(nextRole) {
    const homeTab = nextRole === ROLES.TUTOR ? 'TutorHome' : 'Matchs';

    // Ferme Réglages / modales et repart sur l'onglet d'accueil du rôle actuel
    // avant que le RoleGate remonte l'autre navigateur.
    navigation.dispatch(
      CommonActions.reset({
        index: 0,
        routes: [
          {
            name: 'MainTabs',
            state: {
              index: 0,
              routes: [{ name: homeTab }],
            },
          },
        ],
      })
    );
  }

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

              // Remet la stack sur Accueil/Découvrir avant le changement de rôle
              resetToHomeTabs(isParent ? ROLES.PARENT : ROLES.TUTOR);

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
    if (resetting || resettingAnnouncement) return;

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

  async function onResetMyAnnouncement() {
    if (resetting || resettingAnnouncement || !userId) return;

    Alert.alert(
      'Reset mon annonce',
      'Remet uniquement ton annonce tuteur à l’état « non publiée » (matières, bio, tarif). Les annonces des autres testeurs ne sont pas touchées.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Réinitialiser mon annonce',
          style: 'destructive',
          onPress: async () => {
            setResettingAnnouncement(true);
            try {
              await resetMyTutorAnnouncement(userId);
              Alert.alert(
                'Annonce réinitialisée',
                'Ton bouton Accueil affiche à nouveau « Créer mon annonce ».'
              );
            } catch (err) {
              Alert.alert(
                'Erreur',
                err?.message ?? 'Reset de l’annonce impossible.'
              );
            } finally {
              setResettingAnnouncement(false);
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
              (resetting || resettingAnnouncement) && styles.buttonDisabled,
            ]}
            onPress={onResetMatches}
            disabled={resetting || resettingAnnouncement || signingOut}
          >
            {resetting ? (
              <ActivityIndicator color="#7A4E00" />
            ) : (
              <Text style={styles.resetTestLabel}>
                [TEST] Reset matches & messages
              </Text>
            )}
          </Pressable>
          <Pressable
            style={[
              styles.resetTestButton,
              styles.resetAnnouncementButton,
              (resetting || resettingAnnouncement) && styles.buttonDisabled,
            ]}
            onPress={onResetMyAnnouncement}
            disabled={
              resetting || resettingAnnouncement || signingOut || !userId
            }
          >
            {resettingAnnouncement ? (
              <ActivityIndicator color="#7A4E00" />
            ) : (
              <Text style={styles.resetTestLabel}>
                [TEST] Reset mon annonce (compte actif)
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
  resetAnnouncementButton: {
    marginTop: 10,
  },
  resetTestLabel: {
    color: '#7A4E00',
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
  },
});
