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
import { Ionicons } from '@expo/vector-icons';

import { colors, MINT_BAND_H, radii, shadows } from '../constants/theme';
import { useRole } from '../lib/RoleContext';
import { ROLES } from '../lib/roles';
import {
  creditWallet,
  ensureWallet,
  fetchMatches,
  fetchPaymentTransactions,
  fetchWalletTopups,
  getTutorWithdrawableBalance,
} from '../lib/supabase';
import { openStripeCheckoutTest, stripeConfig } from '../services/stripe';

const AMOUNT_PRESETS = [20, 50, 100];
const LESSON_AMOUNT = 20;

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

  const shownBalance = isParent ? balance : available;
  const heroCaption = isParent
    ? 'Disponible pour régler un cours'
    : frozen > 0
      ? `${formatMoney(frozen)} € en cours de vérification`
      : 'Disponible au retrait';

  return (
    <View style={styles.root}>
      <View style={[styles.mintBand, { height: MINT_BAND_H }]} />
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <Text style={styles.title}>Portefeuille</Text>
        </View>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.notice}>
          <Ionicons
            name="information-circle-outline"
            size={20}
            color={colors.mintDeep}
          />
          <Text style={styles.noticeText}>
            Le paiement via Clutch accroît nettement la visibilité du professeur
            et assure la continuité de la plateforme. Il n’est cependant pas
            obligatoire.
          </Text>
        </View>

        <View style={styles.hero}>
          <Text style={styles.heroLabel}>
            {isParent ? 'Solde' : 'Disponible'}
          </Text>
          {walletLoading ? (
            <ActivityIndicator
              color={colors.ink}
              style={styles.heroSpinner}
            />
          ) : (
            <Text style={styles.heroAmount}>{formatMoney(shownBalance)} €</Text>
          )}
          <Text style={styles.heroCaption}>{heroCaption}</Text>
        </View>

        {!isParent ? (
          <View style={styles.statRow}>
            <View style={styles.stat}>
              <Text style={styles.statValue}>{formatMoney(balance)} €</Text>
              <Text style={styles.statLabel}>Total</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.stat}>
              <Text style={styles.statValue}>{formatMoney(frozen)} €</Text>
              <Text style={styles.statLabel}>Gelé</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.stat}>
              <Text style={styles.statValue}>{formatMoney(withdrawn)} €</Text>
              <Text style={styles.statLabel}>Retiré</Text>
            </View>
          </View>
        ) : null}

        <View style={styles.panel}>
          <Text style={styles.panelTitle}>
            {isParent ? 'Recharger' : 'Retirer'}
          </Text>
          <Text style={styles.panelHint}>
            {isParent
              ? 'Pour payer un cours dans la messagerie.'
              : 'Depuis ton solde disponible.'}
          </Text>

          <View style={styles.amountRow}>
            {AMOUNT_PRESETS.map((amount) => {
              const active = isParent
                ? !customAmount && selectedAmount === amount
                : selectedAmount === amount;
              return (
                <Pressable
                  key={amount}
                  style={[
                    styles.chip,
                    isParent && styles.chipOutline,
                    active && (isParent ? styles.chipActiveSoft : styles.chipActive),
                  ]}
                  onPress={() => {
                    setSelectedAmount(amount);
                    if (isParent) setCustomAmount('');
                  }}
                  disabled={busy}
                >
                  <Text
                    style={[
                      styles.chipLabel,
                      active &&
                        (isParent
                          ? styles.chipLabelActiveSoft
                          : styles.chipLabelActive),
                    ]}
                  >
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
              placeholderTextColor={colors.mutedSoft}
              keyboardType="decimal-pad"
              editable={!busy}
            />
          ) : null}

          <Pressable
            style={[
              styles.button,
              isParent && styles.buttonSoft,
              busy && styles.buttonDisabled,
            ]}
            onPress={isParent ? onRecharge : onWithdraw}
            disabled={busy}
          >
            {busy ? (
              <ActivityIndicator color={isParent ? colors.ink : colors.white} />
            ) : (
              <Text
                style={[
                  styles.buttonLabel,
                  isParent && styles.buttonLabelSoft,
                ]}
              >
                {isParent
                  ? `Recharger ${topUpAmount} €`
                  : `Retirer ${selectedAmount} €`}
              </Text>
            )}
          </Pressable>
        </View>

        {isParent ? (
          <Pressable
            style={styles.testLink}
            onPress={onSimulateLessonPayment}
            disabled={busy}
          >
            <Text style={styles.testLinkLabel}>
              Simuler une fin de cours (−{LESSON_AMOUNT} €)
            </Text>
          </Pressable>
        ) : null}

        <View style={styles.historyHeader}>
          <Text style={styles.sectionTitle}>Activité</Text>
          {!walletLoading ? (
            <Text style={styles.historyCount}>{transactions.length}</Text>
          ) : null}
        </View>

        {walletLoading ? (
          <ActivityIndicator color={colors.mintDeep} style={styles.historySpinner} />
        ) : transactions.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="receipt-outline" size={28} color={colors.mutedSoft} />
            <Text style={styles.emptyTitle}>Aucune opération</Text>
            <Text style={styles.emptyHistory}>
              {isParent
                ? 'Tes recharges et paiements de cours apparaîtront ici.'
                : 'Tes encaissements apparaîtront ici.'}
            </Text>
          </View>
        ) : (
          <View style={styles.historyCard}>
            {transactions.map((tx, index) => {
              const disputed = tx.status === 'disputed';
              const refunded = tx.status === 'refunded';
              const topup = tx.status === 'topup';
              const outgoing = isParent && !refunded && !topup;
              const icon = topup
                ? 'add-circle-outline'
                : disputed
                  ? 'alert-circle-outline'
                  : refunded
                    ? 'arrow-undo-outline'
                    : isParent
                      ? 'arrow-up-outline'
                      : 'arrow-down-outline';
              return (
                <View
                  key={tx.id}
                  style={[
                    styles.txRow,
                    index < transactions.length - 1 && styles.txRowBorder,
                  ]}
                >
                  <View
                    style={[
                      styles.txIcon,
                      disputed && styles.txIconWarn,
                    ]}
                  >
                    <Ionicons
                      name={icon}
                      size={18}
                      color={disputed ? '#9B1C1C' : colors.ink}
                    />
                  </View>
                  <View style={styles.txLeft}>
                    <Text style={styles.txStatus}>
                      {txTitle(tx.status, isParent)}
                    </Text>
                    <Text style={styles.txDate}>
                      {formatDate(tx.createdAt)}
                      {tx.isFrozen ? ' · Fonds gelés' : ''}
                    </Text>
                  </View>
                  <Text
                    style={[
                      styles.txAmount,
                      outgoing && styles.txAmountOut,
                      refunded && styles.txAmountMuted,
                    ]}
                  >
                    {outgoing ? '−' : '+'}
                    {formatMoney(tx.amount)} €
                  </Text>
                </View>
              );
            })}
          </View>
        )}
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
  header: {
    minHeight: 64,
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 18,
    justifyContent: 'center',
  },
  scroll: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  container: {
    paddingHorizontal: 20,
    paddingBottom: 36,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.white,
  },
  hero: {
    backgroundColor: colors.card,
    borderRadius: 28,
    paddingHorizontal: 22,
    paddingTop: 22,
    paddingBottom: 20,
    ...shadows.soft,
  },
  heroLabel: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: colors.mutedSoft,
  },
  heroSpinner: {
    marginVertical: 18,
    alignSelf: 'flex-start',
  },
  heroAmount: {
    marginTop: 8,
    fontSize: 40,
    fontWeight: '800',
    letterSpacing: -0.8,
    color: colors.ink,
  },
  heroCaption: {
    marginTop: 6,
    fontSize: 14,
    lineHeight: 20,
    color: colors.muted,
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    backgroundColor: colors.card,
    borderRadius: 18,
    paddingVertical: 14,
    ...shadows.soft,
  },
  stat: {
    flex: 1,
    alignItems: 'center',
  },
  statDivider: {
    width: 1,
    height: 28,
    backgroundColor: colors.border,
  },
  statValue: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.ink,
  },
  statLabel: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '600',
    color: colors.mutedSoft,
  },
  panel: {
    marginTop: 12,
    backgroundColor: colors.card,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 12,
    ...shadows.soft,
  },
  panelTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.ink,
  },
  panelHint: {
    marginTop: 2,
    marginBottom: 8,
    fontSize: 13,
    lineHeight: 18,
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
    marginBottom: 10,
    fontSize: 14,
    lineHeight: 20,
    color: colors.muted,
  },
  paymentNotice: {
    marginBottom: 16,
    fontSize: 13,
    lineHeight: 18,
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
    gap: 6,
    marginBottom: 8,
  },
  chip: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.page,
    paddingVertical: 6,
    alignItems: 'center',
  },
  chipActive: {
    backgroundColor: colors.ink,
    borderColor: colors.ink,
  },
  chipLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.ink,
  },
  chipLabelActive: {
    color: colors.white,
  },
  chipActiveSoft: {
    backgroundColor: colors.card,
    borderColor: colors.black,
    borderWidth: 2,
  },
  chipLabelActiveSoft: {
    color: colors.ink,
  },
  chipOutline: {
    backgroundColor: colors.card,
    borderColor: colors.black,
    borderWidth: 1,
  },
  amountInput: {
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.page,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 15,
    color: colors.ink,
    marginBottom: 8,
  },
  button: {
    backgroundColor: colors.mintDeep,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonLabel: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '700',
  },
  buttonSoft: {
    backgroundColor: colors.card,
    borderWidth: 1.5,
    borderColor: colors.black,
  },
  buttonLabelSoft: {
    color: colors.ink,
  },
  testLink: {
    alignSelf: 'center',
    marginTop: 14,
    paddingVertical: 6,
  },
  testLinkLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.mutedSoft,
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 16,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: colors.badgeMint,
  },
  noticeText: {
    flex: 1,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '600',
    color: colors.ink,
  },
  historyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 26,
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.ink,
  },
  historyCount: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.mutedSoft,
  },
  historySpinner: {
    marginTop: 12,
  },
  emptyCard: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 28,
    ...shadows.soft,
  },
  emptyTitle: {
    marginTop: 10,
    fontSize: 16,
    fontWeight: '800',
    color: colors.ink,
  },
  emptyHistory: {
    marginTop: 4,
    fontSize: 14,
    lineHeight: 20,
    color: colors.mutedSoft,
    textAlign: 'center',
  },
  historyCard: {
    backgroundColor: colors.card,
    borderRadius: 20,
    overflow: 'hidden',
    ...shadows.soft,
  },
  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  txRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  txIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    backgroundColor: colors.badge,
  },
  txIconWarn: {
    backgroundColor: '#FEF2F2',
  },
  txLeft: {
    flex: 1,
    paddingRight: 12,
  },
  txStatus: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.ink,
  },
  txDate: {
    marginTop: 2,
    fontSize: 13,
    color: colors.mutedSoft,
  },
  txAmount: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.ink,
  },
  txAmountOut: {
    color: colors.ink,
  },
  txAmountMuted: {
    color: colors.mutedSoft,
  },
});
