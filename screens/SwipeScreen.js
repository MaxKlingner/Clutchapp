import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useAuth } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';

import {
  fetchMatches,
  fetchTutorProfiles,
  startTutorConversation,
} from '../lib/supabase';
import { MATCH_STATUS, SWIPE_FILTERS } from '../lib/tutorConstants';

function formatRate(rate) {
  const value = Number(rate);
  if (!Number.isFinite(value)) return '—';
  return Number.isInteger(value) ? `${value}` : value.toFixed(2);
}

function firstName(fullName) {
  return String(fullName || 'le tuteur').trim().split(/\s+/)[0] || 'le tuteur';
}

function defaultRequestMessage(tutorName) {
  return `Bonjour ${firstName(tutorName)}, je souhaite réserver un cours pour…`;
}

export default function SwipeScreen() {
  const { userId } = useAuth();
  const navigation = useNavigation();
  const [allTutors, setAllTutors] = useState([]);
  const [index, setIndex] = useState(0);
  const [liked, setLiked] = useState([]);
  const [passed, setPassed] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [activeFilter, setActiveFilter] = useState(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [messageModalOpen, setMessageModalOpen] = useState(false);
  const [messageDraft, setMessageDraft] = useState('');
  const [sendingRequest, setSendingRequest] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);
  const toastTimerRef = useRef(null);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  function showToast(message) {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToastMessage(message);
    toastTimerRef.current = setTimeout(() => {
      setToastMessage(null);
      toastTimerRef.current = null;
    }, 3200);
  }

  async function loadTutors() {
    setLoading(true);
    setError(null);
    setActionError(null);

    try {
      // TEMP test messagerie : on inclut son propre profil pour se matcher soi-même
      const profiles = await fetchTutorProfiles({
        excludeClerkId: null,
      });
      let available = profiles;

      if (userId) {
        const matches = await fetchMatches(userId, {
          statuses: [
            MATCH_STATUS.PENDING,
            MATCH_STATUS.ACCEPTED,
            MATCH_STATUS.DECLINED,
          ],
        });
        const matchedIds = new Set(matches.map((match) => match.tutorId));
        available = profiles.filter((tutor) => !matchedIds.has(tutor.id));
      }

      setAllTutors(available);
      setIndex(0);
      setLiked([]);
      setPassed([]);
    } catch (err) {
      setAllTutors([]);
      setError(err?.message ?? 'Erreur de chargement.');
    } finally {
      setLoading(false);
    }
  }

  useFocusEffect(
    useCallback(() => {
      loadTutors();
    }, [userId])
  );

  const tutors = useMemo(() => {
    if (!activeFilter) return allTutors;
    const needle = activeFilter.toLowerCase();
    return allTutors.filter((tutor) =>
      (tutor.specialties ?? []).some(
        (skill) => String(skill).toLowerCase() === needle
      )
    );
  }, [allTutors, activeFilter]);

  function onSelectFilter(label) {
    setActiveFilter((prev) => (prev === label ? null : label));
    setIndex(0);
    setLiked([]);
    setPassed([]);
    setActionError(null);
  }

  const tutor = tutors[index];
  const isDone = !loading && !error && index >= tutors.length;

  function openMessageModal() {
    if (!tutor || sendingRequest) return;
    setActionError(null);
    setMessageDraft(defaultRequestMessage(tutor.name));
    setMessageModalOpen(true);
  }

  async function onSendRequest() {
    if (!tutor || sendingRequest) return;

    const content = messageDraft.trim();
    if (!content) {
      setActionError('Écris un message avant d’envoyer.');
      return;
    }
    if (!userId) {
      setActionError('Tu dois être connecté pour envoyer une demande.');
      return;
    }

    setSendingRequest(true);
    setActionError(null);
    try {
      await startTutorConversation({
        parentId: userId,
        tutorId: tutor.id,
        content,
        senderId: userId,
      });
      setLiked((prev) => [...prev, tutor.name]);
      setMessageModalOpen(false);
      setIndex((prev) => prev + 1);
      showToast(
        'Message envoyé ! Retrouve la discussion dans l’onglet Messages.'
      );
    } catch (err) {
      setActionError(err?.message ?? 'Impossible d’envoyer la demande.');
    } finally {
      setSendingRequest(false);
    }
  }

  async function goNext(action) {
    if (!tutor || sendingRequest) return;
    if (action === 'like') {
      openMessageModal();
      return;
    }

    setActionError(null);
    setPassed((prev) => [...prev, tutor.name]);
    setIndex((prev) => prev + 1);
  }

  const reset = () => {
    setIndex(0);
    setLiked([]);
    setPassed([]);
    setActionError(null);
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.container}>
        {toastMessage ? (
          <View style={styles.toast} pointerEvents="none">
            <Ionicons name="checkmark-circle" size={18} color="#FFFFFF" />
            <Text style={styles.toastText}>{toastMessage}</Text>
          </View>
        ) : null}
        <View style={styles.topBar}>
          <Text style={styles.brand} pointerEvents="none">
            CLUTCH
          </Text>
          <View style={[styles.topBarSide, styles.topBarSideLeft]}>
            <Pressable
              style={[
                styles.headerIconButton,
                styles.filterIconButton,
                (filtersOpen || activeFilter) && styles.filterIconButtonActive,
              ]}
              onPress={() => setFiltersOpen((open) => !open)}
              accessibilityLabel="Filtres matières"
              hitSlop={8}
            >
              <Ionicons
                name={filtersOpen ? 'close' : 'search'}
                size={22}
                color={filtersOpen || activeFilter ? '#FFFFFF' : '#1B5E3B'}
              />
            </Pressable>
          </View>
          <View style={[styles.topBarSide, styles.topBarSideRight]}>
            <Pressable
              style={styles.headerIconButton}
              onPress={() => setAboutOpen(true)}
              accessibilityLabel="À propos de Clutch"
              hitSlop={8}
            >
              <Ionicons
                name="help-circle-outline"
                size={24}
                color="#1B5E3B"
              />
            </Pressable>
            <Pressable
              style={styles.headerIconButton}
              onPress={() => navigation.navigate('Settings')}
              accessibilityLabel="Réglages"
              hitSlop={8}
            >
              <Ionicons name="settings-outline" size={22} color="#1B5E3B" />
            </Pressable>
          </View>
        </View>

        <Modal
          visible={aboutOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setAboutOpen(false)}
        >
          <View style={styles.modalOverlay}>
            <Pressable
              style={styles.modalBackdrop}
              onPress={() => setAboutOpen(false)}
            />
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>À propos de Clutch</Text>
              <Text style={styles.modalSectionLabel}>Notre mission</Text>
              <Text style={styles.modalBody}>
                Clutch rend le soutien scolaire accessible en mettant en relation
                directe parents, étudiants et tuteurs. Transparence sur les
                profils, les tarifs et les avis : tu choisis le bon accompagnement
                sans friction.
              </Text>
              <Text style={styles.modalSectionLabel}>Le projet</Text>
              <Text style={styles.modalBody}>
                Né d’une ambition simple : fluidifier la recherche de tuteurs et
                valoriser les étudiants qui enseignent. Clutch veut devenir le
                réflexe pour trouver, matcher et progresser — efficacement et en
                confiance.
              </Text>
              <Pressable
                style={styles.modalCloseButton}
                onPress={() => setAboutOpen(false)}
              >
                <Text style={styles.modalCloseLabel}>Fermer</Text>
              </Pressable>
            </View>
          </View>
        </Modal>

        <Modal
          visible={messageModalOpen}
          transparent
          animationType="fade"
          onRequestClose={() => {
            if (!sendingRequest) setMessageModalOpen(false);
          }}
        >
          <View style={styles.modalOverlay}>
            <Pressable
              style={styles.modalBackdrop}
              onPress={() => {
                if (!sendingRequest) setMessageModalOpen(false);
              }}
            />
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Proposer un cours</Text>
              <Text style={styles.modalSectionLabel}>
                Message à {tutor?.name ?? 'ton tuteur'}
              </Text>
              <TextInput
                style={styles.messageInput}
                value={messageDraft}
                onChangeText={setMessageDraft}
                multiline
                textAlignVertical="top"
                placeholder="Écris ta demande…"
                placeholderTextColor="#7A9185"
                editable={!sendingRequest}
              />
              <Pressable
                style={[
                  styles.modalCloseButton,
                  (!messageDraft.trim() || sendingRequest) &&
                    styles.modalSendDisabled,
                ]}
                onPress={onSendRequest}
                disabled={!messageDraft.trim() || sendingRequest}
              >
                {sendingRequest ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.modalCloseLabel}>Envoyer la demande</Text>
                )}
              </Pressable>
              <Pressable
                style={styles.modalCancelButton}
                onPress={() => setMessageModalOpen(false)}
                disabled={sendingRequest}
              >
                <Text style={styles.modalCancelLabel}>Annuler</Text>
              </Pressable>
            </View>
          </View>
        </Modal>

        {filtersOpen ? (
          <View style={styles.filtersBlock}>
            <Text style={styles.filtersLabel}>
              Filtres matières
              {activeFilter ? ` · ${activeFilter}` : ''}
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.filterRow}
            >
              <Pressable
                style={[
                  styles.filterChip,
                  !activeFilter && styles.filterChipActive,
                ]}
                onPress={() => onSelectFilter(null)}
              >
                <Text
                  style={[
                    styles.filterChipLabel,
                    !activeFilter && styles.filterChipLabelActive,
                  ]}
                >
                  Tous
                </Text>
              </Pressable>
              {SWIPE_FILTERS.map((label) => {
                const active = activeFilter === label;
                return (
                  <Pressable
                    key={label}
                    style={[
                      styles.filterChip,
                      active && styles.filterChipActive,
                    ]}
                    onPress={() => onSelectFilter(label)}
                  >
                    <Text
                      style={[
                        styles.filterChipLabel,
                        active && styles.filterChipLabelActive,
                      ]}
                    >
                      {label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        ) : null}

        <View style={styles.cardStage}>
          {loading ? (
            <View style={styles.stateCard}>
              <ActivityIndicator size="large" color="#1B5E3B" />
              <Text style={styles.stateText}>Chargement des tuteurs…</Text>
            </View>
          ) : error ? (
            <View style={styles.stateCard}>
              <Text style={styles.emptyTitle}>Impossible de charger</Text>
              <Text style={styles.emptyText}>{error}</Text>
              <Pressable style={styles.resetButton} onPress={loadTutors}>
                <Text style={styles.resetLabel}>Réessayer</Text>
              </Pressable>
            </View>
          ) : isDone ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>
                {tutors.length === 0 ? 'Aucun tuteur' : 'Plus de tuteurs'}
              </Text>
              <Text style={styles.emptyText}>
                {tutors.length === 0
                  ? activeFilter
                    ? `Aucun tuteur avec la spécialité « ${activeFilter} ». Essaie un autre filtre.`
                    : 'Tous les tuteurs sont déjà matchés, ou aucun profil n’est disponible.'
                  : `Matches : ${liked.length || 0}\nPassés : ${passed.length || 0}\n\nRetrouve tes conversations dans Messages.`}
              </Text>
              <Pressable
                style={styles.resetButton}
                onPress={
                  tutors.length === 0
                    ? activeFilter
                      ? () => onSelectFilter(null)
                      : loadTutors
                    : reset
                }
              >
                <Text style={styles.resetLabel}>
                  {tutors.length === 0
                    ? activeFilter
                      ? 'Voir tous'
                      : 'Réessayer'
                    : 'Recommencer'}
                </Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.card}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {tutor.name
                    .split(' ')
                    .filter(Boolean)
                    .map((part) => part[0])
                    .join('')
                    .slice(0, 2)
                    .toUpperCase()}
                </Text>
              </View>
              <View style={styles.nameRow}>
                <Text style={styles.name}>{tutor.name}</Text>
                <Text style={styles.ratingBesideName}>
                  ★ {tutor.rating.toFixed(1)}
                  {tutor.reviewCount > 0 ? ` (${tutor.reviewCount})` : ''}
                </Text>
              </View>
              {tutor.studyYear ? (
                <Text style={styles.studyYear}>{tutor.studyYear}</Text>
              ) : null}

              <View style={styles.specialtyWrap}>
                {(tutor.specialties?.length
                  ? tutor.specialties
                  : [tutor.subject]
                ).map((skill) => (
                  <View
                    key={`${tutor.id}-${skill}`}
                    style={styles.specialtyChip}
                  >
                    <Text style={styles.specialtyChipLabel}>{skill}</Text>
                  </View>
                ))}
              </View>

              {tutor.bio ? (
                <Text style={styles.bio} numberOfLines={4}>
                  {tutor.bio}
                </Text>
              ) : (
                <Text style={styles.bioMuted}>Pas encore de bio.</Text>
              )}

              <View style={styles.metaRow}>
                <Text style={styles.meta}>
                  {formatRate(tutor.hourlyRate)} €/h
                </Text>
              </View>
              <Text style={styles.counter}>
                {index + 1} / {tutors.length}
              </Text>
            </View>
          )}
        </View>

        {actionError ? (
          <Text style={styles.actionError}>{actionError}</Text>
        ) : null}

        {!loading && !error && !isDone && (
          <View style={styles.actions}>
            <Pressable
              style={[styles.actionButton, styles.passButton]}
              onPress={() => goNext('pass')}
              disabled={sendingRequest}
              accessibilityLabel="Passer"
            >
              <Text style={styles.passIcon}>✕</Text>
            </Pressable>
            <Pressable
              style={[styles.messageButton, sendingRequest && styles.messageButtonDisabled]}
              onPress={openMessageModal}
              disabled={sendingRequest}
              accessibilityLabel="Envoyer un message"
            >
              {sendingRequest ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <>
                  <Ionicons name="chatbubble-ellipses" size={20} color="#FFFFFF" />
                  <Text style={styles.messageButtonLabel}>Envoyer un message</Text>
                </>
              )}
            </Pressable>
          </View>
        )}
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
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 12,
    alignItems: 'center',
  },
  toast: {
    position: 'absolute',
    top: 8,
    left: 20,
    right: 20,
    zIndex: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#1B5E3B',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    shadowColor: '#0F2A1F',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  toastText: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  topBar: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    minHeight: 44,
    position: 'relative',
  },
  brand: {
    position: 'absolute',
    left: 0,
    right: 0,
    textAlign: 'center',
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: 1.5,
    color: '#0F2A1F',
  },
  topBarSide: {
    flex: 1,
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
  },
  topBarSideLeft: {
    justifyContent: 'flex-start',
  },
  topBarSideRight: {
    justifyContent: 'flex-end',
    gap: 4,
  },
  headerIconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterIconButton: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#1B5E3B',
  },
  filterIconButtonActive: {
    backgroundColor: '#1B5E3B',
    borderColor: '#1B5E3B',
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 42, 31, 0.45)',
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    paddingHorizontal: 22,
    paddingTop: 24,
    paddingBottom: 20,
    zIndex: 1,
    shadowColor: '#0F2A1F',
    shadowOpacity: 0.16,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#10261C',
    marginBottom: 16,
    textAlign: 'center',
  },
  modalSectionLabel: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.4,
    color: '#1B5E3B',
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  modalBody: {
    fontSize: 15,
    lineHeight: 22,
    color: '#4A6357',
    marginBottom: 14,
  },
  modalCloseButton: {
    marginTop: 6,
    backgroundColor: '#1B5E3B',
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: 'center',
  },
  modalCloseLabel: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  messageInput: {
    minHeight: 120,
    borderWidth: 1,
    borderColor: '#D8E0DB',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    lineHeight: 22,
    color: '#10261C',
    backgroundColor: '#F7FAF8',
    marginBottom: 14,
  },
  modalCancelButton: {
    marginTop: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  modalCancelLabel: {
    color: '#4A6357',
    fontSize: 15,
    fontWeight: '600',
  },
  modalSendDisabled: {
    opacity: 0.6,
  },
  filtersBlock: {
    width: '100%',
    alignSelf: 'stretch',
    marginBottom: 10,
  },
  filtersLabel: {
    alignSelf: 'flex-start',
    marginBottom: 6,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.4,
    color: '#4A6357',
    textTransform: 'uppercase',
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 2,
    paddingRight: 8,
  },
  filterChip: {
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: '#1B5E3B',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  filterChipActive: {
    backgroundColor: '#1B5E3B',
    borderColor: '#1B5E3B',
  },
  filterChipLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1B5E3B',
  },
  filterChipLabelActive: {
    color: '#FFFFFF',
  },
  cardStage: {
    flex: 1,
    width: '100%',
    alignItems: 'stretch',
    minHeight: 0,
  },
  card: {
    flex: 1,
    width: '100%',
    maxWidth: 380,
    alignSelf: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0F2A1F',
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4,
  },
  stateCard: {
    flex: 1,
    width: '100%',
    maxWidth: 380,
    alignSelf: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    padding: 28,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  stateText: {
    fontSize: 16,
    color: '#4A6357',
    textAlign: 'center',
  },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: '#D8EADF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  avatarText: {
    fontSize: 26,
    fontWeight: '700',
    color: '#1B5E3B',
  },
  name: {
    fontSize: 24,
    fontWeight: '700',
    color: '#10261C',
    textAlign: 'center',
    flexShrink: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 4,
  },
  ratingBesideName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1B5E3B',
  },
  studyYear: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: '600',
    color: '#1B5E3B',
  },
  specialtyWrap: {
    marginTop: 12,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 6,
  },
  specialtyChip: {
    backgroundColor: '#E8F5EE',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  specialtyChipLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1B5E3B',
  },
  bio: {
    marginTop: 12,
    fontSize: 14,
    lineHeight: 20,
    color: '#4A6357',
    textAlign: 'center',
    paddingHorizontal: 4,
  },
  bioMuted: {
    marginTop: 12,
    fontSize: 13,
    fontStyle: 'italic',
    color: '#7A9185',
  },
  metaRow: {
    flexDirection: 'row',
    gap: 18,
    marginTop: 18,
  },
  meta: {
    fontSize: 17,
    fontWeight: '600',
    color: '#1B5E3B',
  },
  counter: {
    marginTop: 22,
    fontSize: 14,
    color: '#7A9185',
  },
  actionError: {
    marginTop: 8,
    color: '#C0392B',
    textAlign: 'center',
    fontSize: 14,
  },
  actions: {
    marginTop: 14,
    width: '100%',
    maxWidth: 380,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  actionButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    shadowColor: '#0F2A1F',
    shadowOpacity: 0.1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  passButton: {
    borderWidth: 2,
    borderColor: '#E35D5D',
  },
  messageButton: {
    flex: 1,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#1B5E3B',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 16,
    shadowColor: '#0F2A1F',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  messageButtonDisabled: {
    opacity: 0.7,
  },
  messageButtonLabel: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  passIcon: {
    fontSize: 30,
    color: '#E35D5D',
    fontWeight: '700',
  },
  emptyCard: {
    flex: 1,
    width: '100%',
    maxWidth: 380,
    alignSelf: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    padding: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#10261C',
  },
  emptyText: {
    marginTop: 12,
    fontSize: 16,
    lineHeight: 26,
    textAlign: 'center',
    color: '#4A6357',
  },
  resetButton: {
    marginTop: 24,
    backgroundColor: '#1B5E3B',
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 14,
  },
  resetLabel: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
