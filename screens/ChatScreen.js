import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@clerk/clerk-expo';

import { fetchMessages, sendMessage } from '../lib/supabase';

const TUTOR_REPLIES = [
  'Parfait, on peut organiser une première séance cette semaine.',
  'Merci pour ton message ! Quelle est la classe de ton enfant ?',
  'Je suis dispo en soirée. Tu préfères visio ou présentiel ?',
  'Super question — je te prépare un petit plan de révision.',
];

export default function ChatScreen({ match, onBack }) {
  const { userId } = useAuth();
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);

  const tutorName = match?.tutor?.name ?? 'Tuteur';

  async function loadMessages() {
    setError(null);
    try {
      const rows = await fetchMessages(match.id);
      setMessages(rows);
    } catch (err) {
      setError(err?.message ?? 'Erreur de chargement.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadMessages();
  }, [match.id]);

  async function onSend() {
    if (!userId || sending || !draft.trim()) return;

    const content = draft.trim();
    setDraft('');
    setSending(true);
    setError(null);

    try {
      const parentMessage = await sendMessage({
        matchId: match.id,
        senderId: userId,
        senderRole: 'parent',
        content,
      });
      setMessages((prev) => [...prev, parentMessage]);

      // Réponse simulée du tuteur
      const reply =
        TUTOR_REPLIES[Math.floor(Math.random() * TUTOR_REPLIES.length)];
      const tutorMessage = await sendMessage({
        matchId: match.id,
        senderId: match.tutorId,
        senderRole: 'tutor',
        content: reply,
      });
      setMessages((prev) => [...prev, tutorMessage]);
    } catch (err) {
      setError(err?.message ?? 'Envoi impossible.');
      setDraft(content);
    } finally {
      setSending(false);
    }
  }

  function renderMessage({ item }) {
    const isMine = item.senderRole === 'parent';
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
    <SafeAreaView style={styles.safe} edges={['top']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={8}
      >
        <View style={styles.header}>
          <Pressable onPress={onBack} hitSlop={12}>
            <Text style={styles.back}>← Retour</Text>
          </Pressable>
          <View style={styles.headerText}>
            <Text style={styles.title} numberOfLines={1}>
              {tutorName}
            </Text>
            <Text style={styles.subtitle} numberOfLines={1}>
              {match?.tutor?.subject ?? 'Conversation'}
            </Text>
          </View>
        </View>

        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color="#1B5E3B" />
          </View>
        ) : (
          <FlatList
            data={messages}
            keyExtractor={(item) => item.id}
            renderItem={renderMessage}
            contentContainerStyle={styles.list}
            ListEmptyComponent={
              <Text style={styles.empty}>
                Envoie un premier message pour démarrer.
              </Text>
            }
          />
        )}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.composer}>
          <TextInput
            style={styles.input}
            value={draft}
            onChangeText={setDraft}
            placeholder="Écrire un message…"
            placeholderTextColor="#7A9185"
            multiline
          />
          <Pressable
            style={[
              styles.sendButton,
              (!draft.trim() || sending) && styles.sendDisabled,
            ]}
            onPress={onSend}
            disabled={!draft.trim() || sending}
          >
            {sending ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.sendLabel}>Envoyer</Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#F3F6F4',
  },
  flex: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E2EAE5',
    backgroundColor: '#FFFFFF',
  },
  back: {
    fontSize: 16,
    color: '#1B5E3B',
    fontWeight: '600',
    marginBottom: 6,
  },
  headerText: {
    gap: 2,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#10261C',
  },
  subtitle: {
    fontSize: 14,
    color: '#4A6357',
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
    color: '#7A9185',
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
    backgroundColor: '#1B5E3B',
  },
  bubbleTheirs: {
    alignSelf: 'flex-start',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2EAE5',
  },
  bubbleText: {
    fontSize: 15,
    lineHeight: 22,
    color: '#10261C',
  },
  bubbleTextMine: {
    color: '#FFFFFF',
  },
  error: {
    color: '#C0392B',
    paddingHorizontal: 16,
    paddingBottom: 8,
    fontSize: 13,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#E2EAE5',
    backgroundColor: '#FFFFFF',
  },
  input: {
    flex: 1,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: '#D7E3DC',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: '#10261C',
    backgroundColor: '#F8FBF9',
  },
  sendButton: {
    backgroundColor: '#1B5E3B',
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
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
});
