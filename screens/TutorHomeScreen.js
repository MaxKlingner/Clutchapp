import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth, useUser } from '@clerk/clerk-expo';

import {
  ensureTutorProfile,
  ensureWallet,
  getTutorWithdrawableBalance,
} from '../lib/supabase';
import { openStripeCheckoutTest, stripeConfig } from '../services/stripe';

const AMOUNT_PRESETS = [20, 50, 100];

export default function TutorHomeScreen() {
  const { userId } = useAuth();
  const { user } = useUser();
  const [earnings, setEarnings] = useState(0);
  const [frozen, setFrozen] = useState(0);
  const [available, setAvailable] = useState(0);
  const [withdrawn, setWithdrawn] = useState(0);
  const [busy, setBusy] = useState(false);
  const [selectedAmount, setSelectedAmount] = useState(20);
  const [stats, setStats] = useState({
    coursesDone: 12,
    hoursTaught: 18,
    rating: 0,
    reviewCount: 0,
    pendingRequests: 3,
  });

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      async function load() {
        if (!userId) return;
        try {
          const [summary, profile] = await Promise.all([
            getTutorWithdrawableBalance(userId),
            ensureTutorProfile({
              clerkId: userId,
              fullName:
                user?.fullName ||
                [user?.firstName, user?.lastName].filter(Boolean).join(' ') ||
                null,
            }),
          ]);
          if (!cancelled) {
            setEarnings(summary.balance);
            setFrozen(summary.frozen);
            setAvailable(summary.available);
            setStats((prev) => ({
              ...prev,
              rating: profile.rating || 0,
              reviewCount: profile.reviewCount || 0,
            }));
          }
        } catch {
          try {
            const wallet = await ensureWallet(userId, 0);
            if (!cancelled) {
              setEarnings(wallet.balance);
              setFrozen(0);
              setAvailable(wallet.balance);
            }
          } catch {
            // ignore
          }
        }
      }
      load();
      return () => {
        cancelled = true;
      };
    }, [userId, user?.fullName, user?.firstName, user?.lastName])
  );

  const displayName =
    user?.firstName ||
    user?.fullName ||
    user?.primaryEmailAddress?.emailAddress ||
    'Tuteur';

  async function onWithdraw() {
    if (busy) return;

    if (available < selectedAmount) {
      Alert.alert(
        frozen > 0 ? 'Fonds partiellement gelés' : 'Solde insuffisant',
        frozen > 0
          ? `Disponible : ${available.toFixed(2)} €\nGelés (litiges) : ${frozen.toFixed(2)} €\nTotal wallet : ${earnings.toFixed(2)} €`
          : `Tu n’as que ${available.toFixed(2)} € disponibles.`
      );
      return;
    }

    if (!stripeConfig.ready) {
      Alert.alert(
        'Stripe',
        'Configure Stripe et lance npm run stripe:server pour tester un retrait.'
      );
      return;
    }

    setBusy(true);
    try {
      // Simulation : on réutilise Checkout en attendant Stripe Connect payouts
      const result = await openStripeCheckoutTest({
        amountCents: selectedAmount * 100,
        currency: 'eur',
        parentId: userId ?? 'tutor',
      });

      if (result.paid) {
        setEarnings((prev) => prev - selectedAmount);
        setAvailable((prev) => prev - selectedAmount);
        setWithdrawn((prev) => prev + selectedAmount);
        Alert.alert(
          'Retrait simulé',
          `${selectedAmount} € marqués comme retirés (flux test Stripe).`
        );
      } else {
        Alert.alert(
          'Retrait non confirmé',
          'Le paiement/test Stripe n’a pas été finalisé.'
        );
      }
    } catch (err) {
      Alert.alert('Erreur', err?.message ?? 'Retrait impossible.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.container}>
        <Text style={styles.brand}>CLUTCH</Text>
        <Text style={styles.title}>Bonjour {displayName}</Text>
        <Text style={styles.subtitle}>Espace tuteur</Text>

        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{stats.coursesDone}</Text>
            <Text style={styles.statLabel}>Cours</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{stats.hoursTaught}h</Text>
            <Text style={styles.statLabel}>Enseignées</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>
              {stats.rating > 0 ? stats.rating.toFixed(1) : '—'}
            </Text>
            <Text style={styles.statLabel}>
              Note{stats.reviewCount > 0 ? ` (${stats.reviewCount})` : ''}
            </Text>
          </View>
        </View>

        <View style={styles.walletCard}>
          <Text style={styles.walletEyebrow}>Portefeuille tuteur</Text>
          <Text style={styles.balance}>{available.toFixed(2)} €</Text>
          <Text style={styles.walletHint}>
            Disponible au retrait
            {frozen > 0
              ? ` · ${frozen.toFixed(2)} € gelés (litiges)`
              : ''}
            {withdrawn > 0 ? ` · ${withdrawn.toFixed(0)} € retirés` : ''}
          </Text>
          <Text style={styles.pending}>
            Solde total : {earnings.toFixed(2)} €
          </Text>

          <View style={styles.amountRow}>
            {AMOUNT_PRESETS.map((amount) => {
              const active = selectedAmount === amount;
              return (
                <Pressable
                  key={amount}
                  style={[styles.chip, active && styles.chipActive]}
                  onPress={() => setSelectedAmount(amount)}
                  disabled={busy}
                >
                  <Text
                    style={[styles.chipLabel, active && styles.chipLabelActive]}
                  >
                    {amount} €
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Pressable
            style={[styles.button, busy && styles.buttonDisabled]}
            onPress={onWithdraw}
            disabled={busy}
          >
            {busy ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.buttonLabel}>
                Retirer {selectedAmount} €
              </Text>
            )}
          </Pressable>
        </View>
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
    paddingTop: 16,
  },
  brand: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 1.5,
    color: '#0F2A1F',
  },
  title: {
    marginTop: 18,
    fontSize: 28,
    fontWeight: '800',
    color: '#10261C',
  },
  subtitle: {
    marginTop: 4,
    marginBottom: 20,
    fontSize: 15,
    color: '#4A6357',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2EAE5',
  },
  statValue: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1B5E3B',
  },
  statLabel: {
    marginTop: 4,
    fontSize: 12,
    color: '#4A6357',
  },
  walletCard: {
    backgroundColor: '#EEF2FF',
    borderRadius: 20,
    padding: 20,
    borderWidth: 2,
    borderColor: '#4338CA',
  },
  walletEyebrow: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1,
    color: '#4338CA',
    textTransform: 'uppercase',
  },
  balance: {
    marginTop: 8,
    fontSize: 40,
    fontWeight: '800',
    color: '#1E1B4B',
  },
  walletHint: {
    marginTop: 4,
    fontSize: 14,
    color: '#4C1D95',
  },
  pending: {
    marginTop: 10,
    marginBottom: 14,
    fontSize: 14,
    color: '#3730A3',
  },
  amountRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  chip: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#C7D2FE',
    backgroundColor: '#FFFFFF',
    paddingVertical: 10,
    alignItems: 'center',
  },
  chipActive: {
    backgroundColor: '#4338CA',
    borderColor: '#4338CA',
  },
  chipLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: '#4338CA',
  },
  chipLabelActive: {
    color: '#FFFFFF',
  },
  button: {
    backgroundColor: '#4338CA',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
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
