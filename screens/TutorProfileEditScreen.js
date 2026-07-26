import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useAuth } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';

import { ensureTutorProfile } from '../lib/supabase';
import TutorProfileEditor from './TutorProfileEditor';

function hasPublishedAnnouncement(profile) {
  if (!profile) return false;
  return (profile.specialties || [])
    .map((item) => String(item || '').trim())
    .some((item) => item && item.toLowerCase() !== 'matière');
}

export default function TutorProfileEditScreen() {
  const navigation = useNavigation();
  const { userId } = useAuth();
  const [published, setPublished] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      async function load() {
        if (!userId) return;
        try {
          const profile = await ensureTutorProfile({
            clerkId: userId,
            fullName: null,
          });
          if (!cancelled) setPublished(hasPublishedAnnouncement(profile));
        } catch {
          if (!cancelled) setPublished(false);
        }
      }
      load();
      return () => {
        cancelled = true;
      };
    }, [userId])
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>
          {published ? 'Modifier mon annonce' : 'Créer mon annonce'}
        </Text>
        <Pressable
          style={styles.closeButton}
          onPress={() => navigation.goBack()}
          accessibilityLabel="Fermer l’édition du profil"
          hitSlop={8}
        >
          <Ionicons name="close" size={24} color="#1B5E3B" />
        </Pressable>
      </View>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <TutorProfileEditor />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#F3F6F4',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 22,
    paddingTop: 8,
    paddingBottom: 4,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#10261C',
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E8F5EE',
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 22,
    paddingTop: 8,
    paddingBottom: 40,
  },
});
