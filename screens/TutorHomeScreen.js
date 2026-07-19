import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth, useUser } from '@clerk/clerk-expo';

import { openStripeCheckoutTest, stripeConfig } from '../services/stripe';

const INITIAL_EARNINGS = 120;
const AMOUNT_PRESETS = [20, 50, 100];

export default function TutorHomeScreen() {
  const { userId } = useAuth();
  const { user } = useUser();
  const [earnings, setEarnings] = useState(INITIAL_EARNINGS);
  const [withdrawn, setWithdrawn] = useState(40);
  const [busy, setBusy] = useState(false);
  const [selectedAmount, setSelectedAmount] = useState(20);
  const [stats] = useState({
    coursesDone: 12,
    hoursTaught: 18,
    rating: 4.8,
    pendingRequests: 3,
  });

  const displayName =
    user?.firstName ||
    user?.fullName ||
    user?.primaryEmailAddress?.emailAddress ||
    'Tuteur';

  async function onWithdraw() {
    if (busy) return;

    if (earnings < selectedAmount) {
      Alert.alert(
        'Solde insuffisant',
        `Tu n’as que ${earnings.toFixed(2)} € disponibles.`
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
            <Text style={styles.statValue}>{stats.rating.toFixed(1)}</Text>
            <Text style={styles.statLabel}>Note</Text>
          </View>
        </View>

        <View style={styles.walletCard}>
          <Text style={styles.walletEyebrow}>Portefeuille tuteur</Text>
          <Text style={styles.balance}>{earnings.toFixed(2)} €</Text>
          <Text style={styles.walletHint}>
            Disponible · {withdrawn.toFixed(0)} € déjà retirés (simulé)
          </Text>
          <Text style={styles.pending}>
            {stats.pendingRequests} demandes de cours en attente
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
