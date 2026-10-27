import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@clerk/clerk-expo';

import TutorProfileDetail from '../components/TutorProfileDetail';
import { useRole } from '../lib/RoleContext';
import { ROLES } from '../lib/roles';
import { MATCH_STATUS } from '../lib/tutorConstants';
import { colors, radii } from '../constants/theme';
import {
  acceptMatchRequest,
  declineMatchRequest,
  fetchMessages,
  cancelPaymentRequest,
  disputePayment,
  hasReviewForMatch,
  payPaymentRequest,
  sendMessage,
  sendPaymentRequest,
  submitReview,
  subscribeToMatchMessages,
} from '../lib/supabase';

const HOUR_PRESETS = [1, 1.5, 2, 3];

function appendUnique(prev, message) {
  if (!message?.id) return prev;
  if (prev.some((item) => item.id === message.id)) return prev;
  return [...prev, message];
}

function upsertMessage(prev, message) {
  if (!message?.id) return prev;
  const index = prev.findIndex((item) => item.id === message.id);
  if (index === -1) return [...prev, message];
  const next = [...prev];
  next[index] = message;
  return next;
}

function formatHours(hours) {
  const h = Number(hours);
  if (!Number.isFinite(h)) return '?';
  return Number.isInteger(h) ? `${h}` : String(h);
}

function formatMoney(amount) {
  const value = Number(amount);
  if (!Number.isFinite(value)) return '—';
  return value.toFixed(2);
}

function getInitials(name) {
  return String(name || '?')
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

export default function ChatScreen({ navigation, route }) {
  const match = route?.params?.match ?? null;
  const { userId } = useAuth();
  const { role } = useRole();
  const listRef = useRef(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [payingId, setPayingId] = useState(null);
  const [actingId, setActingId] = useState(null);
  const [matchActing, setMatchActing] = useState(false);
  const [error, setError] = useState(null);
  const [liveStatus, setLiveStatus] = useState('connecting');
  const [matchStatus, setMatchStatus] = useState(
    match?.status || MATCH_STATUS.PENDING
  );
  const [paymentModalVisible, setPaymentModalVisible] = useState(false);
  const [selectedHours, setSelectedHours] = useState(2);
  const [customHours, setCustomHours] = useState('');
  const [reviewModalVisible, setReviewModalVisible] = useState(false);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState('');
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  const isTutor = role === ROLES.TUTOR;
  const isPending = matchStatus === MATCH_STATUS.PENDING;
  const tutorCanWrite = isTutor ? !isPending : true;
  const senderRole = isTutor ? 'tutor' : 'parent';
  const title = isTutor
    ? match?.parentName || 'Parent'
    : match?.tutor?.name || 'Tuteur';
  const headerAvatar = isTutor ? null : match?.tutor?.avatarUrl || null;
  const canOpenProfile = !isTutor && Boolean(match?.tutor?.id);
  const subtitle = isTutor
    ? isPending
      ? 'Demande en attente de ta réponse'
      : 'Conversation avec le parent'
    : isPending
      ? 'Demande envoyée — en attente du tuteur'
      : match?.tutor?.subject || 'Conversation';
  const hourlyRate = Number(match?.tutor?.hourlyRate) || 25;
  const tutorClerkId = match?.tutor?.clerkId || null;

  useEffect(() => {
    setMatchStatus(match?.status || MATCH_STATUS.PENDING);
  }, [match?.id, match?.status]);

  const hoursToRequest = (() => {
    const custom = Number(String(customHours).replace(',', '.'));
    if (Number.isFinite(custom) && custom > 0) return custom;
    return selectedHours;
  })();

  const estimatedTotal =
    Math.round(hoursToRequest * hourlyRate * 100) / 100;

  const scrollToEnd = useCallback(() => {
    requestAnimationFrame(() => {
      listRef.current?.scrollToEnd?.({ animated: true });
    });
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadHistory() {
      if (!match?.id) return;
      setLoading(true);
      setError(null);
      try {
        const rows = await fetchMessages(match.id);
        if (!cancelled) setMessages(rows);
      } catch (err) {
        if (!cancelled) {
          setError(err?.message ?? 'Erreur de chargement.');
          setMessages([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadHistory();
    return () => {
      cancelled = true;
    };
  }, [match?.id]);

  useEffect(() => {
    if (!match?.id) return undefined;

    setLiveStatus('connecting');
    const unsubscribe = subscribeToMatchMessages(match.id, {
      onInsert: (incoming) => {
        setMessages((prev) => appendUnique(prev, incoming));
        setLiveStatus('live');
        scrollToEnd();
      },
      onUpdate: (updated) => {
        setMessages((prev) => upsertMessage(prev, updated));
        setLiveStatus('live');
      },
    });

    setLiveStatus('live');

    return () => {
      unsubscribe();
      setLiveStatus('offline');
    };
  }, [match?.id, scrollToEnd]);

  useEffect(() => {
    if (!loading && messages.length) scrollToEnd();
  }, [loading, messages.length, scrollToEnd]);

  async function onSend() {
    if (!userId || sending || !draft.trim() || !match?.id) return;
    if (isTutor && isPending) return;

    const content = draft.trim();
    setDraft('');
    setSending(true);
    setError(null);

    try {
      const created = await sendMessage({
        matchId: match.id,
        senderId: userId,
        senderRole,
        content,
      });
      setMessages((prev) => appendUnique(prev, created));
      scrollToEnd();
    } catch (err) {
      setError(err?.message ?? 'Envoi impossible.');
      setDraft(content);
    } finally {
      setSending(false);
    }
  }

  async function onAcceptMatch() {
    if (!userId || matchActing || !match?.id) return;
    setMatchActing(true);
    setError(null);
    try {
      const updated = await acceptMatchRequest(match.id, userId);
      setMatchStatus(MATCH_STATUS.ACCEPTED);
      navigation.setParams({ match: updated });
      const rows = await fetchMessages(match.id);
      setMessages(rows);
      scrollToEnd();
    } catch (err) {
      setError(err?.message ?? 'Acceptation impossible.');
      Alert.alert('Erreur', err?.message ?? 'Acceptation impossible.');
    } finally {
      setMatchActing(false);
    }
  }

  async function onDeclineMatch() {
    if (!userId || matchActing || !match?.id) return;

    Alert.alert(
      'Décliner la demande',
      'La conversation sera archivée et retirée de tes demandes.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Décliner',
          style: 'destructive',
          onPress: async () => {
            setMatchActing(true);
            try {
              await declineMatchRequest(match.id);
              navigation.goBack();
            } catch (err) {
              Alert.alert('Erreur', err?.message ?? 'Refus impossible.');
            } finally {
              setMatchActing(false);
            }
          },
        },
      ]
    );
  }

  async function onConfirmPaymentRequest() {
    if (!userId || sending || !match?.id) return;

    if (!Number.isFinite(hoursToRequest) || hoursToRequest <= 0) {
      Alert.alert('Heures invalides', 'Indique un nombre d’heures > 0.');
      return;
    }

    setSending(true);
    setError(null);
    try {
      const created = await sendPaymentRequest({
        matchId: match.id,
        senderId: userId,
        hours: hoursToRequest,
        hourlyRate,
      });
      setMessages((prev) => appendUnique(prev, created));
      setPaymentModalVisible(false);
      setCustomHours('');
      setSelectedHours(2);
      scrollToEnd();
    } catch (err) {
      setError(err?.message ?? 'Demande de paiement impossible.');
      Alert.alert('Erreur', err?.message ?? 'Demande impossible.');
    } finally {
      setSending(false);
    }
  }

  async function onPayRequest(message) {
    if (!userId || payingId) return;

    if (!tutorClerkId) {
      Alert.alert(
        'Tuteur introuvable',
        'Le wallet tuteur n’est pas lié (clerk_id manquant sur le profil).'
      );
      return;
    }

    setPayingId(message.id);
    setError(null);

    try {
      const result = await payPaymentRequest({
        messageId: message.id,
        parentClerkId: userId,
        tutorClerkId: String(tutorClerkId),
      });

      if (result.message) {
        setMessages((prev) => upsertMessage(prev, result.message));
      }

      if (!result.alreadyPaid) {
        Alert.alert(
          'Paiement réussi',
          `${formatMoney(result.amount)} € débités. Nouveau solde : ${formatMoney(result.parentBalance)} €`
        );

        try {
          const alreadyReviewed = await hasReviewForMatch(match.id);
          if (!alreadyReviewed) {
            setReviewRating(5);
            setReviewComment('');
            setReviewModalVisible(true);
          }
        } catch {
          // ignore review check errors
        }
      } else {
        Alert.alert('Paiement réussi', 'Cette demande était déjà payée.');
      }
    } catch (err) {
      if (err?.code === 'INSUFFICIENT_FUNDS') {
        Alert.alert(
          'Solde insuffisant',
          `Il te faut ${formatMoney(err.amount)} € (solde : ${formatMoney(err.balance)} €).\n\nVa dans Portefeuille pour recharger ton wallet via Stripe.`,
          [{ text: 'OK' }]
        );
      } else {
        Alert.alert('Erreur', err?.message ?? 'Paiement impossible.');
      }
    } finally {
      setPayingId(null);
    }
  }

  async function onSubmitReview() {
    if (!userId || reviewSubmitting || !match?.id || !match?.tutorId) return;

    setReviewSubmitting(true);
    try {
      await submitReview({
        matchId: match.id,
        reviewerId: userId,
        tutorId: match.tutorId,
        rating: reviewRating,
        comment: reviewComment,
      });
      setReviewModalVisible(false);
      Alert.alert('Merci !', 'Ton avis a bien été enregistré.');
    } catch (err) {
      if (err?.code === 'ALREADY_REVIEWED') {
        setReviewModalVisible(false);
        Alert.alert('Déjà noté', 'Ce cours a déjà reçu un avis.');
      } else {
        Alert.alert('Erreur', err?.message ?? 'Impossible d’envoyer l’avis.');
      }
    } finally {
      setReviewSubmitting(false);
    }
  }

  async function onCancelRequest(message) {
    if (!userId || actingId) return;

    Alert.alert(
      'Annuler la demande',
      'La demande de paiement sera annulée. Le parent ne pourra plus la payer.',
      [
        { text: 'Non', style: 'cancel' },
        {
          text: 'Annuler la demande',
          style: 'destructive',
          onPress: async () => {
            setActingId(message.id);
            try {
              const updated = await cancelPaymentRequest(message.id, userId);
              setMessages((prev) => upsertMessage(prev, updated));
            } catch (err) {
              Alert.alert('Erreur', err?.message ?? 'Annulation impossible.');
            } finally {
              setActingId(null);
            }
          },
        },
      ]
    );
  }

  async function onDispute(message) {
    if (!userId || actingId) return;

    Alert.alert(
      'Signaler un problème',
      'Un litige sera ouvert et les fonds du tuteur seront temporairement gelés le temps qu’un administrateur Clutch vérifie.',
      [
        { text: 'Retour', style: 'cancel' },
        {
          text: 'Signaler',
          style: 'destructive',
          onPress: async () => {
            setActingId(message.id);
            try {
              const result = await disputePayment({
                messageId: message.id,
                parentClerkId: userId,
              });
              if (result.message) {
                setMessages((prev) => upsertMessage(prev, result.message));
              }
              Alert.alert(
                'Demande prise en compte',
                'Ton signalement a bien été reçu par l’équipe Clutch. Les fonds concernés sont gelés le temps de la vérification.'
              );
            } catch (err) {
              Alert.alert('Erreur', err?.message ?? 'Signalement impossible.');
            } finally {
              setActingId(null);
            }
          },
        },
      ]
    );
  }

  function renderPaymentCard(item) {
    const isMine = item.senderId === userId;
    const status = item.paymentStatus;
    const paid = status === 'paid';
    const cancelled = status === 'cancelled';
    const disputed = status === 'disputed';
    const pending = status === 'pending' || (!status && !paid);
    const hoursLabel = formatHours(item.hours);
    const amountLabel = formatMoney(item.amount);
    const busy = actingId === item.id || payingId === item.id;

    let eyebrow = 'Demande de paiement';
    let title = `${hoursLabel}h de cours — ${amountLabel} €`;
    if (paid) {
      eyebrow = 'Paiement confirmé';
      title = `Payé ✓ — ${hoursLabel}h · ${amountLabel} €`;
    } else if (cancelled) {
      eyebrow = 'Demande annulée';
      title = `Annulé — ${hoursLabel}h · ${amountLabel} €`;
    } else if (disputed) {
      eyebrow = 'Litige en cours';
      title = `Signalé — ${hoursLabel}h · ${amountLabel} €`;
    }

    return (
      <View
        style={[
          styles.paymentCard,
          isMine ? styles.paymentCardMine : styles.paymentCardTheirs,
          (cancelled || disputed) && styles.paymentCardMuted,
        ]}
      >
        <Text style={styles.paymentEyebrow}>{eyebrow}</Text>
        <Text style={styles.paymentTitle}>{title}</Text>
        <Text style={styles.paymentMeta}>
          Tarif : {formatMoney(item.hourlyRate)} €/h
        </Text>

        {pending ? (
          <Text style={styles.paymentNotice}>
            Le paiement via Clutch accroît nettement la visibilité du professeur
            et assure la continuité de la plateforme. Il n’est cependant pas
            obligatoire.
          </Text>
        ) : null}

        {!isTutor && pending ? (
          <Pressable
            style={[styles.payButton, busy && styles.sendDisabled]}
            onPress={() => onPayRequest(item)}
            disabled={busy}
          >
            {payingId === item.id ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.payButtonLabel}>Valider et Payer</Text>
            )}
          </Pressable>
        ) : null}

        {isTutor && pending ? (
          <>
            <Text style={styles.paymentWaiting}>
              En attente du paiement parent…
            </Text>
            <Pressable
              style={[styles.cancelButton, busy && styles.sendDisabled]}
              onPress={() => onCancelRequest(item)}
              disabled={busy}
            >
              {actingId === item.id ? (
                <ActivityIndicator color="#FF8A80" />
              ) : (
                <Text style={styles.cancelButtonLabel}>
                  Annuler la demande
                </Text>
              )}
            </Pressable>
          </>
        ) : null}

        {!isTutor && paid ? (
          <Pressable
            style={[styles.disputeButton, busy && styles.sendDisabled]}
            onPress={() => onDispute(item)}
            disabled={busy}
          >
            {actingId === item.id ? (
              <ActivityIndicator color="#FF8A80" />
            ) : (
              <Text style={styles.disputeButtonLabel}>
                Signaler un problème
              </Text>
            )}
          </Pressable>
        ) : null}

        {disputed ? (
          <Text style={styles.disputeHint}>
            Fonds gelés — l’équipe Clutch examine le dossier.
          </Text>
        ) : null}
      </View>
    );
  }

  function renderMessage({ item }) {
    if (item.messageType === 'payment_request') {
      return renderPaymentCard(item);
    }

    const isMine = item.senderId === userId;
    return (
      <View
        style={[
          styles.bubble,
          isMine ? styles.bubbleMine : styles.bubbleTheirs,
        ]}
      >
        <Text style={[styles.bubbleText, isMine && styles.bubbleTextMine]}>
          {item.content}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      <SafeAreaView style={styles.safe} edges={['top']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={8}
      >
        <View style={styles.header}>
          <Pressable
            style={styles.backButton}
            onPress={() => navigation.goBack()}
            hitSlop={12}
            accessibilityLabel="Retour"
          >
            <Ionicons name="chevron-back" size={22} color={colors.white} />
          </Pressable>
          <Pressable
            style={styles.headerAvatar}
            onPress={() => {
              if (canOpenProfile) setProfileOpen(true);
            }}
            disabled={!canOpenProfile}
            accessibilityLabel={canOpenProfile ? 'Voir le profil' : title}
          >
            {headerAvatar ? (
              <Image source={{ uri: headerAvatar }} style={styles.headerAvatarImage} />
            ) : (
              <Text style={styles.headerAvatarText}>{getInitials(title)}</Text>
            )}
          </Pressable>
          <View style={styles.headerText}>
            <Text style={styles.title} numberOfLines={1}>
              {title}
            </Text>
            <Text style={styles.subtitle} numberOfLines={1}>
              {subtitle}
              {liveStatus === 'live' ? ' · en direct' : ''}
            </Text>
          </View>
        </View>

        {isTutor && isPending ? (
          <View style={styles.requestBanner}>
            <Text style={styles.requestBannerTitle}>Nouvelle demande</Text>
            <Text style={styles.requestBannerText}>
              Accepte pour pouvoir répondre librement. Si tu déclines, la
              conversation est archivée.
            </Text>
            <View style={styles.requestBannerActions}>
              <Pressable
                style={[
                  styles.requestAcceptBtn,
                  matchActing && styles.sendDisabled,
                ]}
                onPress={onAcceptMatch}
                disabled={matchActing}
              >
                {matchActing ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.requestAcceptLabel}>
                    Accepter la demande
                  </Text>
                )}
              </Pressable>
              <Pressable
                style={[
                  styles.requestDeclineBtn,
                  matchActing && styles.sendDisabled,
                ]}
                onPress={onDeclineMatch}
                disabled={matchActing}
              >
                <Text style={styles.requestDeclineLabel}>Décliner</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {!isTutor && isPending ? (
          <View style={styles.pendingParentBanner}>
            <Text style={styles.pendingParentText}>
              En attente de la réponse du tuteur. Tu peux encore envoyer des
              messages.
            </Text>
          </View>
        ) : null}

        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color="#C7C7CC" />
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(item) => item.id}
            renderItem={renderMessage}
            contentContainerStyle={styles.list}
            onContentSizeChange={scrollToEnd}
            ListEmptyComponent={
              <Text style={styles.empty}>
                Envoie un premier message pour démarrer.
              </Text>
            }
          />
        )}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.composer}>
          {isTutor && tutorCanWrite ? (
            <Pressable
              style={styles.payRequestIcon}
              onPress={() => setPaymentModalVisible(true)}
              disabled={sending}
              accessibilityLabel="Demander le paiement du cours"
            >
              <Ionicons name="card-outline" size={22} color="#C7C7CC" />
            </Pressable>
          ) : null}

          <TextInput
            style={[styles.input, !tutorCanWrite && styles.inputDisabled]}
            value={draft}
            onChangeText={setDraft}
            placeholder={
              isTutor && isPending
                ? 'Accepte la demande pour répondre…'
                : 'Écrire un message…'
            }
            placeholderTextColor="#8E8E93"
            keyboardAppearance="dark"
            multiline
            editable={!sending && tutorCanWrite}
          />
          <Pressable
            style={[
              styles.sendButton,
              (!draft.trim() || sending || !tutorCanWrite) &&
                styles.sendDisabled,
            ]}
            onPress={onSend}
            disabled={!draft.trim() || sending || !tutorCanWrite}
          >
            {sending ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.sendLabel}>Envoyer</Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      <Modal
        visible={paymentModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setPaymentModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Demander le paiement</Text>
            <Text style={styles.modalHint}>
              Tarif : {formatMoney(hourlyRate)} €/h
            </Text>
            <Text style={styles.modalNotice}>
              Le paiement via Clutch accroît nettement la visibilité du professeur
              et assure la continuité de la plateforme. Il n’est cependant pas
              obligatoire.
            </Text>

            <Text style={styles.modalLabel}>Nombre d’heures</Text>
            <View style={styles.hoursRow}>
              {HOUR_PRESETS.map((hours) => {
                const active =
                  !customHours && selectedHours === hours;
                return (
                  <Pressable
                    key={hours}
                    style={[styles.hourChip, active && styles.hourChipActive]}
                    onPress={() => {
                      setSelectedHours(hours);
                      setCustomHours('');
                    }}
                  >
                    <Text
                      style={[
                        styles.hourChipLabel,
                        active && styles.hourChipLabelActive,
                      ]}
                    >
                      {hours}h
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <TextInput
              style={styles.modalInput}
              value={customHours}
              onChangeText={setCustomHours}
              placeholder="Ou heures personnalisées"
              placeholderTextColor="#8E8E93"
            keyboardAppearance="dark"
              keyboardType="decimal-pad"
            />

            <Text style={styles.modalTotal}>
              Total : {formatMoney(estimatedTotal)} €
            </Text>

            <Pressable
              style={[styles.modalPrimary, sending && styles.sendDisabled]}
              onPress={onConfirmPaymentRequest}
              disabled={sending}
            >
              {sending ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.payButtonLabel}>
                  Envoyer la demande
                </Text>
              )}
            </Pressable>

            <Pressable
              style={styles.modalCancel}
              onPress={() => setPaymentModalVisible(false)}
              disabled={sending}
            >
              <Text style={styles.modalCancelLabel}>Annuler</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal
        visible={reviewModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setReviewModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Comment s’est passé votre cours ?</Text>
            <Text style={styles.modalHint}>
              Ta note aide les autres parents à choisir un tuteur.
            </Text>

            <View style={styles.starsRow}>
              {[1, 2, 3, 4, 5].map((star) => {
                const active = reviewRating >= star;
                return (
                  <Pressable
                    key={star}
                    onPress={() => setReviewRating(star)}
                    hitSlop={8}
                    disabled={reviewSubmitting}
                  >
                    <Text
                      style={[
                        styles.star,
                        active ? styles.starActive : styles.starInactive,
                      ]}
                    >
                      ★
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <TextInput
              style={[styles.modalInput, styles.reviewComment]}
              value={reviewComment}
              onChangeText={setReviewComment}
              placeholder="Commentaire (optionnel)"
              placeholderTextColor="#8E8E93"
            keyboardAppearance="dark"
              multiline
              textAlignVertical="top"
              editable={!reviewSubmitting}
            />

            <Pressable
              style={[
                styles.modalPrimary,
                reviewSubmitting && styles.sendDisabled,
              ]}
              onPress={onSubmitReview}
              disabled={reviewSubmitting}
            >
              {reviewSubmitting ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.payButtonLabel}>Envoyer mon avis</Text>
              )}
            </Pressable>

            <Pressable
              style={styles.modalCancel}
              onPress={() => setReviewModalVisible(false)}
              disabled={reviewSubmitting}
            >
              <Text style={styles.modalCancelLabel}>Plus tard</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
      </SafeAreaView>
      <TutorProfileDetail
        tutor={match?.tutor}
        visible={profileOpen}
        onClose={() => setProfileOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#111111',
  },
  safe: {
    flex: 1,
    backgroundColor: '#111111',
  },
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#2A2A2A',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2C2C2E',
  },
  headerText: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.white,
  },
  subtitle: {
    fontSize: 13,
    color: '#A1A1A6',
  },
  headerAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#2C2C2E',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  headerAvatarImage: {
    width: '100%',
    height: '100%',
  },
  headerAvatarText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#E8E8E8',
  },
  requestBanner: {
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
    backgroundColor: '#1C1C1E',
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    padding: 14,
  },
  requestBannerTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.white,
  },
  requestBannerText: {
    marginTop: 4,
    marginBottom: 12,
    fontSize: 13,
    lineHeight: 19,
    color: '#C7C7CC',
  },
  requestBannerActions: {
    gap: 8,
  },
  requestAcceptBtn: {
    backgroundColor: '#1B6B45',
    borderRadius: radii.button,
    paddingVertical: 12,
    alignItems: 'center',
  },
  requestAcceptLabel: {
    color: colors.white,
    fontWeight: '700',
    fontSize: 15,
  },
  requestDeclineBtn: {
    backgroundColor: '#1C1C1E',
    borderRadius: radii.button,
    paddingVertical: 11,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#2A2A2A',
  },
  requestDeclineLabel: {
    color: '#C7C7CC',
    fontWeight: '700',
    fontSize: 15,
  },
  pendingParentBanner: {
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
    backgroundColor: '#1C1C1E',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  pendingParentText: {
    fontSize: 13,
    lineHeight: 19,
    color: '#E8E8E8',
  },
  inputDisabled: {
    backgroundColor: '#2C2C2E',
    color: '#8E8E93',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: {
    padding: 16,
    paddingBottom: 24,
    flexGrow: 1,
  },
  empty: {
    textAlign: 'center',
    color: '#A1A1A6',
    marginTop: 40,
    fontSize: 15,
  },
  bubble: {
    maxWidth: '80%',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 10,
  },
  bubbleMine: {
    alignSelf: 'flex-end',
    backgroundColor: '#1B6B45',
  },
  bubbleTheirs: {
    alignSelf: 'flex-start',
    backgroundColor: '#1C1C1E',
    borderWidth: 1,
    borderColor: '#2A2A2A',
  },
  bubbleText: {
    fontSize: 15,
    lineHeight: 22,
    color: '#E8E8E8',
  },
  bubbleTextMine: {
    color: colors.white,
  },
  paymentCard: {
    borderRadius: 18,
    padding: 16,
    marginBottom: 12,
    maxWidth: '92%',
    borderWidth: 1,
    backgroundColor: '#1C1C1E',
    borderColor: '#2A2A2A',
  },
  paymentCardMine: {
    alignSelf: 'flex-end',
  },
  paymentCardTheirs: {
    alignSelf: 'flex-start',
  },
  paymentCardMuted: {
    opacity: 0.85,
  },
  paymentEyebrow: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: '#3DDC97',
    marginBottom: 6,
  },
  paymentTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.white,
  },
  paymentMeta: {
    marginTop: 4,
    fontSize: 13,
    color: '#A1A1A6',
  },
  paymentNotice: {
    marginTop: 10,
    fontSize: 13,
    lineHeight: 18,
    color: '#C7C7CC',
  },
  paymentWaiting: {
    marginTop: 10,
    fontSize: 13,
    fontStyle: 'italic',
    color: '#A1A1A6',
  },
  payButton: {
    marginTop: 12,
    backgroundColor: '#1B6B45',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  payButtonLabel: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 15,
  },
  cancelButton: {
    marginTop: 10,
    borderRadius: 12,
    paddingVertical: 11,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#3A2A2A',
    backgroundColor: '#2C2C2E',
  },
  cancelButtonLabel: {
    color: '#FF8A80',
    fontWeight: '700',
    fontSize: 14,
  },
  disputeButton: {
    marginTop: 12,
    paddingVertical: 8,
    alignItems: 'center',
  },
  disputeButtonLabel: {
    color: '#FF8A80',
    fontSize: 13,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  disputeHint: {
    marginTop: 10,
    fontSize: 13,
    color: '#FF8A80',
    fontStyle: 'italic',
  },
  error: {
    color: '#FF8A80',
    paddingHorizontal: 16,
    paddingBottom: 8,
    fontSize: 13,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#2A2A2A',
    backgroundColor: '#111111',
  },
  payRequestIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2C2C2E',
  },
  input: {
    flex: 1,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.white,
    backgroundColor: '#1C1C1E',
  },
  sendButton: {
    backgroundColor: '#1B6B45',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    minWidth: 88,
    alignItems: 'center',
  },
  sendDisabled: {
    opacity: 0.5,
  },
  sendLabel: {
    color: colors.white,
    fontWeight: '700',
    fontSize: 14,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  modalCard: {
    backgroundColor: '#1C1C1E',
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    padding: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.white,
  },
  modalHint: {
    marginTop: 6,
    marginBottom: 10,
    fontSize: 14,
    color: '#A1A1A6',
  },
  modalNotice: {
    marginBottom: 14,
    fontSize: 13,
    lineHeight: 18,
    color: '#C7C7CC',
  },
  modalLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#C7C7CC',
    marginBottom: 8,
  },
  hoursRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  hourChip: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: '#111111',
  },
  hourChipActive: {
    backgroundColor: '#1B6B45',
    borderColor: '#1B6B45',
  },
  hourChipLabel: {
    fontWeight: '700',
    color: '#E8E8E8',
  },
  hourChipLabelActive: {
    color: colors.white,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: '#2A2A2A',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.white,
    backgroundColor: '#111111',
    marginBottom: 12,
  },
  modalTotal: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.white,
    marginBottom: 14,
  },
  modalPrimary: {
    backgroundColor: '#1B6B45',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  modalCancel: {
    marginTop: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  modalCancelLabel: {
    color: '#C7C7CC',
    fontWeight: '600',
  },
  starsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 16,
  },
  star: {
    fontSize: 36,
  },
  starActive: {
    color: colors.star,
  },
  starInactive: {
    color: '#3A3A3C',
  },
  reviewComment: {
    minHeight: 88,
    marginBottom: 14,
  },
});
