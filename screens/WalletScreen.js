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
import { useFocusEffect, useIsFocused, useNavigation } from '@react-navigation/native';
import { useAuth } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';

import { colors } from '../constants/theme';
import { useRole } from '../lib/RoleContext';
import { ROLES } from '../lib/roles';
import {
  creditWallet,
  ensureWallet,
  fetchPaymentTransactions,
  fetchWalletTopups,
  getTutorWithdrawableBalance,
} from '../lib/supabase';
import { openStripeCheckoutTest, stripeConfig } from '../services/stripe';

const AMOUNT_PRESETS = [20, 50, 100];

function formatMoney(value) {
  const amount = Number(value);
  const safe = Number.isFinite(amount) ? amount : 0;
  return new Intl.NumberFormat('fr-BE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(safe);
}

function mergeOperations(payments, topups) {
  const byId = new Map();
  for (const item of [...payments, ...topups]) {
    if (item?.id) byId.set(item.id, item);
  }
  return [...byId.values()].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

function formatDate(value) {
  if (!value) return '';
  try {
    return new Date(value).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return '';
  }
}

export default function WalletScreen() {
  const navigation = useNavigation();
  const isFocused = useIsFocused();
  const { userId } = useAuth();
  const { role } = useRole();
  const isParent = role !== ROLES.TUTOR;

  const [balance, setBalance] = useState(0);
  const [frozen, setFrozen] = useState(0);
  const [available, setAvailable] = useState(0);
  const [walletLoading, setWalletLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [selectedAmount, setSelectedAmount] = useState(20);
  const [customAmount, setCustomAmount] = useState('');
  const [transactions, setTransactions] = useState([]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;

      async function load() {
        if (!userId) return;
        setWalletLoading(true);
        try {
          if (isParent) {
            const [wallet, txs, topups] = await Promise.all([
              ensureWallet(userId, 50),
              fetchPaymentTransactions(userId, 'parent'),
              fetchWalletTopups(userId),
            ]);
            if (!cancelled) {
              setBalance(wallet.balance);
              setAvailable(wallet.balance);
              setFrozen(0);
              setTransactions(mergeOperations(txs, topups));
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
        if (wallet.topup) {
          setTransactions((prev) =>
            mergeOperations(prev, [
              {
                id: `topup-${wallet.topup.id}`,
                amount: wallet.topup.amount,
                status: 'topup',
                isFrozen: false,
                createdAt: wallet.topup.createdAt,
              },
            ])
          );
        }
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

  const shownBalance = isParent ? balance : available;
  const subtitle = walletLoading
    ? 'Chargement…'
    : isParent
      ? 'Disponible pour régler un cours'
      : frozen > 0
        ? `${formatMoney(frozen)} € en cours de vérification`
        : 'Disponible au retrait';

  return (
    <View style={styles.root}>
      {isFocused ? <StatusBar style="light" /> : null}
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          {navigation.getState()?.type === 'stack' ? (
            <Pressable
              style={styles.backButton}
              onPress={() => navigation.goBack()}
              accessibilityLabel="Retour"
              hitSlop={8}
            >
              <Ionicons name="chevron-back" size={22} color={colors.white} />
            </Pressable>
          ) : null}
          <Text style={styles.title}>Portefeuille</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>
        </View>

        <ScrollView
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.balanceCard}>
            {walletLoading ? (
              <ActivityIndicator color="#C7C7CC" />
            ) : (
              <Text style={styles.balance}>{formatMoney(shownBalance)} €</Text>
            )}
          </View>

          <Text style={styles.notice}>
            Le paiement via Clutch accroît nettement la visibilité du professeur
            et assure la continuité de la plateforme. Il n’est cependant pas
            obligatoire.
          </Text>

          <Text style={styles.section}>{isParent ? 'Recharger' : 'Retirer'}</Text>
          <View style={styles.card}>
            <View style={styles.amountRow}>
              {AMOUNT_PRESETS.map((amount) => {
                const active = isParent
                  ? !customAmount && selectedAmount === amount
                  : selectedAmount === amount;
                return (
                  <Pressable
                    key={amount}
                    style={[styles.chip, active && styles.chipOn]}
                    onPress={() => {
                      setSelectedAmount(amount);
                      if (isParent) setCustomAmount('');
                    }}
                    disabled={busy}
                  >
                    <Text style={[styles.chipLabel, active && styles.chipLabelOn]}>
                      {amount} €
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {isParent ? (
              <TextInput
                style={styles.amountInput}
                value={customAmount}
                onChangeText={setCustomAmount}
                placeholder="Autre montant"
                placeholderTextColor="#8E8E93"
                keyboardAppearance="dark"
                keyboardType="decimal-pad"
                editable={!busy}
              />
            ) : null}

            <Pressable
              style={[styles.button, busy && styles.buttonDisabled]}
              onPress={isParent ? onRecharge : onWithdraw}
              disabled={busy}
            >
              {busy ? (
                <ActivityIndicator color={colors.white} />
              ) : (
                <Text style={styles.buttonLabel}>
                  {isParent ? `Recharger ${topUpAmount} €` : `Retirer ${selectedAmount} €`}
                </Text>
              )}
            </Pressable>
          </View>

          <Text style={styles.section}>Activité</Text>
          <View style={styles.card}>
            {walletLoading ? (
              <ActivityIndicator color="#C7C7CC" style={styles.historySpinner} />
            ) : transactions.length === 0 ? (
              <Text style={styles.empty}>Aucune opération pour l’instant.</Text>
            ) : (
              transactions.map((tx, index) => {
                const disputed = tx.status === 'disputed';
                const refunded = tx.status === 'refunded';
                const topup = tx.status === 'topup';
                const outgoing = isParent && !refunded && !topup;
                return (
                  <View
                    key={tx.id}
                    style={[styles.txRow, index < transactions.length - 1 && styles.txBorder]}
                  >
                    <View style={styles.txCopy}>
                      <Text style={styles.txTitle}>{txTitle(tx.status, isParent)}</Text>
                      <Text style={styles.txDate}>
                        {formatDate(tx.createdAt)}
                        {tx.isFrozen ? ' · Fonds gelés' : ''}
                      </Text>
                    </View>
                    <Text
                      style={[
                        styles.txAmount,
                        outgoing && styles.txAmountOut,
                        (refunded || disputed) && styles.txAmountMuted,
                      ]}
                    >
                      {outgoing ? '−' : '+'}
                      {formatMoney(tx.amount)} €
                    </Text>
                  </View>
                );
              })
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function txTitle(status, isParent) {
  if (status === 'topup') return 'Recharge';
  if (status === 'disputed') return 'Litige';
  if (status === 'refunded') return 'Remboursement';
  return isParent ? 'Cours réglé' : 'Cours encaissé';
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#111111',
  },
  safe: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 14,
    alignItems: 'center',
  },
  backButton: {
    position: 'absolute',
    left: 12,
    top: 4,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2C2C2E',
    zIndex: 2,
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
  list: {
    paddingHorizontal: 20,
    paddingBottom: 36,
  },
  balanceCard: {
    backgroundColor: '#1C1C1E',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
  },
  balance: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.white,
  },
  notice: {
    marginTop: 12,
    fontSize: 14,
    lineHeight: 20,
    color: '#A1A1A6',
  },
  section: {
    marginTop: 22,
    marginBottom: 8,
    marginLeft: 4,
    fontSize: 13,
    fontWeight: '700',
    color: '#8E8E93',
  },
  card: {
    backgroundColor: '#1C1C1E',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    padding: 14,
  },
  amountRow: {
    flexDirection: 'row',
    gap: 8,
  },
  chip: {
    flex: 1,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#2C2C2E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipOn: {
    backgroundColor: colors.white,
  },
  chipLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: '#E8E8E8',
  },
  chipLabelOn: {
    color: '#111111',
  },
  amountInput: {
    marginTop: 10,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#111111',
    paddingHorizontal: 14,
    fontSize: 16,
    color: colors.white,
  },
  button: {
    marginTop: 12,
    height: 48,
    borderRadius: 14,
    backgroundColor: '#1B6B45',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonLabel: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '700',
  },
  empty: {
    paddingVertical: 8,
    fontSize: 15,
    color: '#A1A1A6',
  },
  historySpinner: {
    marginVertical: 12,
  },
  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  txBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#2A2A2A',
  },
  txCopy: {
    flex: 1,
    paddingRight: 12,
  },
  txTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#E8E8E8',
  },
  txDate: {
    marginTop: 2,
    fontSize: 13,
    color: '#A1A1A6',
  },
  txAmount: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.white,
  },
  txAmountOut: {
    color: '#FF8A80',
  },
  txAmountMuted: {
    color: '#A1A1A6',
  },
});

