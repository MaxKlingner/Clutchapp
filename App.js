import { useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import {
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

const TUTORS = [
  {
    id: '1',
    name: 'Camille Dupont',
    subject: 'Mathématiques',
    hourlyRate: 28,
    rating: 4.8,
  },
  {
    id: '2',
    name: 'Lucas Martin',
    subject: 'Physique-Chimie',
    hourlyRate: 32,
    rating: 4.6,
  },
  {
    id: '3',
    name: 'Sofia Benali',
    subject: 'Anglais',
    hourlyRate: 25,
    rating: 4.9,
  },
];

export default function App() {
  const [index, setIndex] = useState(0);
  const [liked, setLiked] = useState([]);
  const [passed, setPassed] = useState([]);

  const tutor = TUTORS[index];
  const isDone = index >= TUTORS.length;

  const goNext = (action) => {
    if (!tutor) return;

    if (action === 'like') {
      setLiked((prev) => [...prev, tutor.name]);
    } else {
      setPassed((prev) => [...prev, tutor.name]);
    }

    setIndex((prev) => prev + 1);
  };

  const reset = () => {
    setIndex(0);
    setLiked([]);
    setPassed([]);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="dark" />
      <View style={styles.container}>
        <Text style={styles.brand}>CLUTCH</Text>
        <Text style={styles.subtitle}>Trouve ton tuteur</Text>

        {isDone ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>Plus de tuteurs</Text>
            <Text style={styles.emptyText}>
              Likes : {liked.length || 0}
              {'\n'}
              Passés : {passed.length || 0}
            </Text>
            <Pressable style={styles.resetButton} onPress={reset}>
              <Text style={styles.resetLabel}>Recommencer</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.card}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {tutor.name
                  .split(' ')
                  .map((part) => part[0])
                  .join('')}
              </Text>
            </View>
            <Text style={styles.name}>{tutor.name}</Text>
            <Text style={styles.subject}>{tutor.subject}</Text>
            <View style={styles.metaRow}>
              <Text style={styles.meta}>{tutor.hourlyRate} €/h</Text>
              <Text style={styles.meta}>★ {tutor.rating.toFixed(1)}</Text>
            </View>
            <Text style={styles.counter}>
              {index + 1} / {TUTORS.length}
            </Text>
          </View>
        )}

        {!isDone && (
          <View style={styles.actions}>
            <Pressable
              style={[styles.actionButton, styles.passButton]}
              onPress={() => goNext('pass')}
              accessibilityLabel="Passer"
            >
              <Text style={styles.passIcon}>✕</Text>
            </Pressable>
            <Pressable
              style={[styles.actionButton, styles.likeButton]}
              onPress={() => goNext('like')}
              accessibilityLabel="Aimer"
            >
              <Text style={styles.likeIcon}>♥</Text>
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
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 32,
    alignItems: 'center',
  },
  brand: {
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: 2,
    color: '#0F2A1F',
  },
  subtitle: {
    marginTop: 6,
    marginBottom: 28,
    fontSize: 16,
    color: '#4A6357',
  },
  card: {
    width: '100%',
    maxWidth: 380,
    minHeight: 380,
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    padding: 28,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0F2A1F',
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4,
  },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#D8EADF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  avatarText: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1B5E3B',
  },
  name: {
    fontSize: 26,
    fontWeight: '700',
    color: '#10261C',
    textAlign: 'center',
  },
  subject: {
    marginTop: 8,
    fontSize: 18,
    color: '#3D5C4C',
  },
  metaRow: {
    flexDirection: 'row',
    gap: 18,
    marginTop: 22,
  },
  meta: {
    fontSize: 17,
    fontWeight: '600',
    color: '#1B5E3B',
  },
  counter: {
    marginTop: 28,
    fontSize: 14,
    color: '#7A9185',
  },
  actions: {
    marginTop: 36,
    flexDirection: 'row',
    gap: 28,
  },
  actionButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
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
  likeButton: {
    borderWidth: 2,
    borderColor: '#2F9E6B',
  },
  passIcon: {
    fontSize: 30,
    color: '#E35D5D',
    fontWeight: '700',
  },
  likeIcon: {
    fontSize: 30,
    color: '#2F9E6B',
  },
  emptyCard: {
    width: '100%',
    maxWidth: 380,
    minHeight: 320,
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
