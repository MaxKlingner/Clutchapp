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
import { useAuth } from '@clerk/clerk-expo';

import { useRole } from '../lib/RoleContext';
import { ROLES } from '../lib/roles';
import {
  creditWallet,
  ensureWallet,
  fetchMatches,
  fetchPaymentTransactions,
  getTutorWithdrawableBalance,
} from '../lib/supabase';
import { openStripeCheckoutTest, stripeConfig } from '../services/stripe';

const AMOUNT_PRESETS = [20, 50, 100];
const LESSON_AMOUNT = 20;

function formatDate(value) {
  if (!value) return '';
  try {
    return new Date(value).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return '';
  }
}

function statusLabel(status) {
  if (status === 'disputed') return 'Litige';
  if (status === 'refunded') return 'Remboursé';
  return 'Payé';
}

export default function WalletScreen() {
  const { userId } = useAuth();
  const { role } = useRole();
  const isParent = role !== ROLES.TUTOR;

  const [balance, setBalance] = useState(0);
  const [frozen, setFrozen] = useState(0);
  const [available, setAvailable] = useState(0);
  const [withdrawn, setWithdrawn] = useState(0);
  const [walletLoading, setWalletLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [selectedAmount, setSelectedAmount] = useState(20);
  const [customAmount, setCustomAmount] = useState('');
  const [tutorEarnings, setTutorEarnings] = useState({});
  const [transactions, setTransactions] = useState([]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;

      async function load() {
        if (!userId) return;
        setWalletLoading(true);
        try {
          if (isParent) {
            const [wallet, txs] = await Promise.all([
              ensureWallet(userId, 50),
              fetchPaymentTransactions(userId, 'parent'),
            ]);
            if (!cancelled) {
              setBalance(wallet.balance);
              setAvailable(wallet.balance);
              setFrozen(0);
              setTransactions(txs);
            }
          } else {
            const [summary, txs] = await Promise.all([
              getTutorWithdrawableBalance(userId),
              fetchPaymentTransactions(userId, 'tutor'),
            ]);
            if (!cancelled) {
              setBalance(summary.balance);
              setFrozen(summary.frozen);
              setAvailable(summary.available);
              setTransactions(txs);
            }
          }
        } catch {
          try {
            const wallet = await ensureWallet(userId, isParent ? 50 : 0);
            if (!cancelled) {
              setBalance(wallet.balance);
              setAvailable(wallet.balance);
              setFrozen(0);
            }
          } catch {
            // ignore
          }
        } finally {
          if (!cancelled) setWalletLoading(false);
        }
      }

      load();
      return () => {
        cancelled = true;
      };
    }, [userId, isParent])
  );

  const topUpAmount = (() => {
    const custom = Number(String(customAmount).replace(',', '.'));
    if (Number.isFinite(custom) && custom >= 1) return Math.round(custom);
    return selectedAmount;
  })();

  async function onRecharge() {
    if (busy) return;

    if (!Number.isFinite(topUpAmount) || topUpAmount < 1) {
      Alert.alert('Montant invalide', 'Choisis un montant d’au moins 1 €.');
      return;
    }

    setBusy(true);
    try {
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
        setAvailable(wallet.balance);
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
          'Match un tuteur dans Matchs avant de simuler un paiement.'
        );
        return;
      }

      const match = matches[0];
      const tutorName = match.tutor?.name ?? 'Tuteur';
      const tutorId = match.tutorId;
      const nextTutorBalance = (tutorEarnings[tutorId] ?? 0) + LESSON_AMOUNT;

      setBalance((prev) => prev - LESSON_AMOUNT);
      setAvailable((prev) => prev - LESSON_AMOUNT);
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

  async function onWithdraw() {
    if (busy) return;

    if (available < selectedAmount) {
      Alert.alert(
        frozen > 0 ? 'Fonds partiellement gelés' : 'Solde insuffisant',
        frozen > 0
          ? `Disponible : ${available.toFixed(2)} €\nGelés (litiges) : ${frozen.toFixed(2)} €\nTotal wallet : ${balance.toFixed(2)} €`
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
      const result = await openStripeCheckoutTest({
        amountCents: selectedAmount * 100,
        currency: 'eur',
        parentId: userId ?? 'tutor',
      });

      if (result.paid) {
        setBalance((prev) => prev - selectedAmount);
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
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>Portefeuille</Text>
        <Text style={styles.subtitle}>
          {isParent
            ? 'Solde, recharges et historique des paiements'
            : 'Gains, retraits et historique des paiements'}
        </Text>

        <View style={[styles.walletCard, !isParent && styles.walletCardTutor]}>
          <Text
            style={[styles.walletEyebrow, !isParent && styles.walletEyebrowTutor]}
          >
            {isParent ? 'Mon solde' : 'Disponible au retrait'}
          </Text>
          {walletLoading ? (
            <ActivityIndicator
              color={isParent ? '#1B5E3B' : '#4338CA'}
              style={{ marginVertical: 16 }}
            />
          ) : (
            <Text style={[styles.balance, !isParent && styles.balanceTutor]}>
              {(isParent ? balance : available).toFixed(2)} €
            </Text>
          )}
          <Text style={[styles.walletHint, !isParent && styles.walletHintTutor]}>
            {isParent
              ? 'Recharge via Stripe Checkout (mode test — aucun vrai débit)'
              : `Solde total : ${balance.toFixed(2)} €${
                  frozen > 0 ? ` · ${frozen.toFixed(2)} € gelés` : ''
                }${withdrawn > 0 ? ` · ${withdrawn.toFixed(0)} € retirés` : ''}`}
          </Text>

          {isParent ? (
            <>
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
            </>
          ) : (
            <>
              <View style={styles.amountRow}>
                {AMOUNT_PRESETS.map((amount) => {
                  const active = selectedAmount === amount;
                  return (
                    <Pressable
                      key={amount}
                      style={[
                        styles.chip,
                        styles.chipTutor,
                        active && styles.chipActiveTutor,
                      ]}
                      onPress={() => setSelectedAmount(amount)}
                      disabled={busy}
                    >
                      <Text
                        style={[
                          styles.chipLabel,
                          styles.chipLabelTutor,
                          active && styles.chipLabelActive,
                        ]}
                      >
                        {amount} €
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <Pressable
                style={[
                  styles.button,
                  styles.withdrawButton,
                  busy && styles.buttonDisabled,
                ]}
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
            </>
          )}
        </View>

        <Text style={styles.sectionTitle}>Historique</Text>
        {walletLoading ? (
          <ActivityIndicator color="#1B5E3B" />
        ) : transactions.length === 0 ? (
          <Text style={styles.emptyHistory}>
            Aucune transaction pour le moment.
          </Text>
        ) : (
          transactions.map((tx) => (
            <View key={tx.id} style={styles.txRow}>
              <View style={styles.txLeft}>
                <Text style={styles.txStatus}>{statusLabel(tx.status)}</Text>
                <Text style={styles.txDate}>{formatDate(tx.createdAt)}</Text>
              </View>
              <Text
                style={[
                  styles.txAmount,
                  tx.status === 'refunded' && styles.txAmountMuted,
                ]}
              >
                {isParent ? '−' : '+'}
                {Number(tx.amount).toFixed(2)} €
              </Text>
            </View>
          ))
        )}
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
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#10261C',
  },
  subtitle: {
    marginTop: 6,
    marginBottom: 18,
    fontSize: 15,
    lineHeight: 22,
    color: '#4A6357',
  },
  walletCard: {
    backgroundColor: '#E8F5EE',
    borderRadius: 20,
    padding: 20,
    borderWidth: 2,
    borderColor: '#1B5E3B',
    marginBottom: 24,
  },
  walletCardTutor: {
    backgroundColor: '#EEF2FF',
    borderColor: '#4338CA',
  },
  walletEyebrow: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1,
    color: '#1B5E3B',
    textTransform: 'uppercase',
  },
  walletEyebrowTutor: {
    color: '#4338CA',
  },
  balance: {
    marginTop: 8,
    fontSize: 44,
    fontWeight: '800',
    color: '#0F2A1F',
  },
  balanceTutor: {
    color: '#1E1B4B',
    fontSize: 40,
  },
  walletHint: {
    marginTop: 4,
    marginBottom: 16,
    fontSize: 14,
    color: '#4A6357',
  },
  walletHintTutor: {
    color: '#4C1D95',
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
  chipTutor: {
    borderColor: '#C7D2FE',
  },
  chipActive: {
    backgroundColor: '#1B5E3B',
    borderColor: '#1B5E3B',
  },
  chipActiveTutor: {
    backgroundColor: '#4338CA',
    borderColor: '#4338CA',
  },
  chipLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1B5E3B',
  },
  chipLabelTutor: {
    color: '#4338CA',
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
  withdrawButton: {
    backgroundColor: '#4338CA',
    marginTop: 4,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonLabel: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#10261C',
    marginBottom: 12,
  },
  emptyHistory: {
    fontSize: 14,
    color: '#7A9185',
  },
  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E2EAE5',
  },
  txLeft: {
    flex: 1,
    paddingRight: 12,
  },
  txStatus: {
    fontSize: 15,
    fontWeight: '700',
    color: '#10261C',
  },
  txDate: {
    marginTop: 2,
    fontSize: 13,
    color: '#7A9185',
  },
  txAmount: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1B5E3B',
  },
  txAmountMuted: {
    color: '#7A9185',
  },
});
