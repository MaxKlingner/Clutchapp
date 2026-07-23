import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth, useUser } from '@clerk/clerk-expo';

import { useRole } from '../lib/RoleContext';
import { ROLES } from '../lib/roles';
import {
  creditWallet,
  ensureTutorProfile,
  ensureWallet,
  fetchMatches,
} from '../lib/supabase';
import { openStripeCheckoutTest, stripeConfig } from '../services/stripe';
import TutorProfileEditor from './TutorProfileEditor';

const AMOUNT_PRESETS = [20, 50, 100];
const LESSON_AMOUNT = 20;

export default function ProfileScreen() {
  const { signOut, userId } = useAuth();
  const { user } = useUser();
  const { role, switching, switchRole } = useRole();
  const [signingOut, setSigningOut] = useState(false);
  const [balance, setBalance] = useState(0);
  const [walletLoading, setWalletLoading] = useState(true);
  const [tutorEarnings, setTutorEarnings] = useState({});
  const [busy, setBusy] = useState(false);
  const [selectedAmount, setSelectedAmount] = useState(20);
  const [customAmount, setCustomAmount] = useState('');

  const isParent = role !== ROLES.TUTOR;

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      async function loadWallet() {
        if (!userId) return;
        setWalletLoading(true);
        try {
          const wallet = await ensureWallet(userId, 50);
          if (!cancelled) setBalance(wallet.balance);
        } catch {
          // ignore
        } finally {
          if (!cancelled) setWalletLoading(false);
        }
      }
      loadWallet();
      return () => {
        cancelled = true;
      };
    }, [userId])
  );

  const topUpAmount = (() => {
    const custom = Number(String(customAmount).replace(',', '.'));
    if (Number.isFinite(custom) && custom >= 1) return Math.round(custom);
    return selectedAmount;
  })();

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
    if (!userId || switching || busy || signingOut) return;

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

  async function onRecharge() {
    if (busy) return;

    if (!Number.isFinite(topUpAmount) || topUpAmount < 1) {
      Alert.alert('Montant invalide', 'Choisis un montant d’au moins 1 €.');
      return;
    }

    setBusy(true);
    try {
      console.log('[wallet] recharge start', {
        topUpAmount,
        userId,
        stripeReady: stripeConfig.ready,
        backendUrl: stripeConfig.backendUrl,
        privateBackend: stripeConfig.usesPrivateBackend,
      });

      if (!stripeConfig.ready) {
        throw new Error(
          'Stripe pas prêt. Vérifie EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY et EXPO_PUBLIC_STRIPE_BACKEND_URL dans les secrets EAS (preview/production).'
        );
      }

      const result = await openStripeCheckoutTest({
        amountCents: topUpAmount * 100,
        currency: 'eur',
        parentId: userId ?? 'anonymous',
      });

      if (result.paid) {
        const wallet = await creditWallet(userId, topUpAmount);
        setBalance(wallet.balance);
        Alert.alert(
          'Paiement Stripe réussi',
          `+${topUpAmount} € crédités.\nNouveau solde : ${wallet.balance.toFixed(2)} €`
        );
      } else {
        Alert.alert(
          'Paiement non confirmé',
          'La session Checkout n’est pas payée (annulé ou incomplet).'
        );
      }
    } catch (err) {
      console.error('[wallet] recharge failed', err);
      Alert.alert('Erreur Stripe', err?.message ?? 'Recharge impossible.');
    } finally {
      setBusy(false);
    }
  }

  async function onSimulateLessonPayment() {
    if (busy) return;

    if (balance < LESSON_AMOUNT) {
      Alert.alert(
        'Solde insuffisant',
        `Il te faut au moins ${LESSON_AMOUNT} €.`
      );
      return;
    }

    if (!userId) {
      Alert.alert('Erreur', 'Tu dois être connecté.');
      return;
    }

    setBusy(true);
    try {
      const matches = await fetchMatches(userId);
      if (!matches.length) {
        Alert.alert(
          'Aucun tuteur matché',
          'Match un tuteur dans Swipe avant de simuler un paiement.'
        );
        return;
      }

      const match = matches[0];
      const tutorName = match.tutor?.name ?? 'Tuteur';
      const tutorId = match.tutorId;
      const nextTutorBalance = (tutorEarnings[tutorId] ?? 0) + LESSON_AMOUNT;

      setBalance((prev) => prev - LESSON_AMOUNT);
      setTutorEarnings((prev) => ({
        ...prev,
        [tutorId]: nextTutorBalance,
      }));

      Alert.alert(
        'Cours terminé — paiement OK',
        `${LESSON_AMOUNT} € transférés vers ${tutorName}.\nSolde tuteur : ${nextTutorBalance} €`
      );
    } catch (err) {
      Alert.alert('Erreur', err?.message ?? 'Paiement simulé impossible.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        {isParent ? (
          <View style={styles.walletCard}>
            <Text style={styles.walletEyebrow}>Mon Portefeuille</Text>
            {walletLoading ? (
              <ActivityIndicator color="#1B5E3B" style={{ marginVertical: 16 }} />
            ) : (
              <Text style={styles.balance}>{balance.toFixed(2)} €</Text>
            )}
            <Text style={styles.walletHint}>
              Recharge via Stripe Checkout (mode test — aucun vrai débit)
            </Text>

            <Text style={styles.amountLabel}>Montant à recharger</Text>
            <View style={styles.amountRow}>
              {AMOUNT_PRESETS.map((amount) => {
                const active = !customAmount && selectedAmount === amount;
                return (
                  <Pressable
                    key={amount}
                    style={[styles.chip, active && styles.chipActive]}
                    onPress={() => {
                      setSelectedAmount(amount);
                      setCustomAmount('');
                    }}
                    disabled={busy}
                  >
                    <Text
                      style={[
                        styles.chipLabel,
                        active && styles.chipLabelActive,
                      ]}
                    >
                      {amount} €
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <TextInput
              style={styles.amountInput}
              value={customAmount}
              onChangeText={setCustomAmount}
              placeholder="Ou montant personnalisé (€)"
              placeholderTextColor="#7A9185"
              keyboardType="decimal-pad"
              editable={!busy}
            />

            <Pressable
              style={[
                styles.button,
                styles.topUpButton,
                busy && styles.buttonDisabled,
              ]}
              onPress={onRecharge}
              disabled={busy}
            >
              {busy ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.buttonLabel}>
                  Recharger {topUpAmount} €
                </Text>
              )}
            </Pressable>

            <Pressable
              style={[
                styles.button,
                styles.lessonButton,
                busy && styles.buttonDisabled,
              ]}
              onPress={onSimulateLessonPayment}
              disabled={busy}
            >
              {busy ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.buttonLabel}>
                  [TEST] Fin de cours (−{LESSON_AMOUNT} €)
                </Text>
              )}
            </Pressable>
          </View>
        ) : (
          <TutorProfileEditor />
        )}

        <Text style={styles.title}>Mon Profil</Text>
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
              {isParent
                ? 'Passer côté tuteur'
                : 'Revenir côté parent'}
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
  walletCard: {
    backgroundColor: '#E8F5EE',
    borderRadius: 20,
    padding: 20,
    borderWidth: 2,
    borderColor: '#1B5E3B',
    marginBottom: 24,
  },
  roleBadge: {
    marginTop: 8,
    fontSize: 14,
    fontWeight: '700',
    color: '#1B5E3B',
  },
  walletEyebrow: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1,
    color: '#1B5E3B',
    textTransform: 'uppercase',
  },
  balance: {
    marginTop: 8,
    fontSize: 44,
    fontWeight: '800',
    color: '#0F2A1F',
  },
  walletHint: {
    marginTop: 4,
    marginBottom: 16,
    fontSize: 14,
    color: '#4A6357',
  },
  amountLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#3D5C4C',
    marginBottom: 8,
  },
  amountRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  chip: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#B7D2C3',
    backgroundColor: '#FFFFFF',
    paddingVertical: 10,
    alignItems: 'center',
  },
  chipActive: {
    backgroundColor: '#1B5E3B',
    borderColor: '#1B5E3B',
  },
  chipLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1B5E3B',
  },
  chipLabelActive: {
    color: '#FFFFFF',
  },
  amountInput: {
    borderWidth: 1,
    borderColor: '#B7D2C3',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: '#10261C',
    marginBottom: 14,
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
  topUpButton: {
    backgroundColor: '#1B5E3B',
  },
  lessonButton: {
    marginTop: 10,
    backgroundColor: '#2F6B4F',
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
});
