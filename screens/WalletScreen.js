import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
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
import { Ionicons } from '@expo/vector-icons';

import { colors, radii, shadows } from '../constants/theme';
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
const MINT_BAND_H = Math.round(Dimensions.get('window').height * 0.22);

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
          'Stripe pas prêt. Vérifie EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY et EXPO_PUBLIC_SUPABASE_URL (ou EXPO_PUBLIC_STRIPE_BACKEND_URL HTTPS) dans les secrets EAS preview/production, puis rebuild.'
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
          'Match un tuteur dans Découvrir avant de simuler un paiement.'
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
    <View style={styles.root}>
      <View style={[styles.mintBand, { height: MINT_BAND_H }]} />

      <SafeAreaView style={styles.safe} edges={['top']}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.topBar}>
            <Text style={styles.eyebrow}>Clutch</Text>
            <Text style={styles.title}>Portefeuille</Text>
          </View>
          <Text style={styles.subtitle}>
            {isParent
              ? 'Solde, recharges et historique des paiements'
              : 'Gains, retraits et historique des paiements'}
          </Text>

          <View style={styles.walletCard}>
            <View style={styles.walletCardHeader}>
              <View style={styles.walletIcon}>
                <Ionicons name="wallet" size={20} color={colors.mintDeep} />
              </View>
              <Text style={styles.walletEyebrow}>
                {isParent ? 'Mon solde' : 'Disponible au retrait'}
              </Text>
            </View>

            {walletLoading ? (
              <ActivityIndicator
                color={colors.mintDeep}
                style={{ marginVertical: 16 }}
              />
            ) : (
              <Text style={styles.balance}>
                {(isParent ? balance : available).toFixed(2)} €
              </Text>
            )}

            <Text style={styles.walletHint}>
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
                  placeholderTextColor={colors.mutedSoft}
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
                    <ActivityIndicator color={colors.white} />
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
                    <ActivityIndicator color={colors.white} />
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
                        style={[styles.chip, active && styles.chipActive]}
                        onPress={() => setSelectedAmount(amount)}
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
                    <ActivityIndicator color={colors.white} />
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
            <ActivityIndicator color={colors.mintDeep} />
          ) : transactions.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyHistory}>
                Aucune transaction pour le moment.
              </Text>
            </View>
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
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.page,
  },
  mintBand: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.mint,
  },
  safe: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  scroll: {
    flex: 1,
  },
  container: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 40,
  },
  topBar: {
    marginBottom: 6,
  },
  eyebrow: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.4,
    color: colors.mintDeep,
    textTransform: 'uppercase',
  },
  title: {
    marginTop: 2,
    fontSize: 28,
    fontWeight: '800',
    color: colors.ink,
  },
  subtitle: {
    marginBottom: 18,
    fontSize: 15,
    lineHeight: 22,
    color: colors.muted,
  },
  walletCard: {
    backgroundColor: colors.card,
    borderRadius: radii.card,
    padding: 20,
    marginBottom: 24,
    ...shadows.card,
  },
  walletCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  walletIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.badgeMint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  walletEyebrow: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.6,
    color: colors.mintDeep,
    textTransform: 'uppercase',
  },
  balance: {
    marginTop: 12,
    fontSize: 42,
    fontWeight: '800',
    color: colors.ink,
  },
  walletHint: {
    marginTop: 4,
    marginBottom: 16,
    fontSize: 14,
    lineHeight: 20,
    color: colors.muted,
  },
  amountLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.muted,
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
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.page,
    paddingVertical: 10,
    alignItems: 'center',
  },
  chipActive: {
    backgroundColor: colors.mintDeep,
    borderColor: colors.mintDeep,
  },
  chipLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.mintDeep,
  },
  chipLabelActive: {
    color: colors.white,
  },
  amountInput: {
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.page,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.ink,
    marginBottom: 14,
  },
  button: {
    borderRadius: radii.button,
    paddingVertical: 14,
    alignItems: 'center',
    ...shadows.soft,
  },
  topUpButton: {
    backgroundColor: colors.mintDeep,
  },
  lessonButton: {
    marginTop: 10,
    backgroundColor: '#2F6B4F',
  },
  withdrawButton: {
    backgroundColor: colors.mintDeep,
    marginTop: 4,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonLabel: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '700',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.ink,
    marginBottom: 12,
  },
  emptyCard: {
    backgroundColor: colors.card,
    borderRadius: 18,
    padding: 18,
    ...shadows.soft,
  },
  emptyHistory: {
    fontSize: 14,
    color: colors.mutedSoft,
    textAlign: 'center',
  },
  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.card,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 10,
    ...shadows.soft,
  },
  txLeft: {
    flex: 1,
    paddingRight: 12,
  },
  txStatus: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.ink,
  },
  txDate: {
    marginTop: 2,
    fontSize: 13,
    color: colors.mutedSoft,
  },
  txAmount: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.mintDeep,
  },
  txAmountMuted: {
    color: colors.mutedSoft,
  },
});
