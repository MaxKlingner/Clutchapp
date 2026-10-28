import { useCallback, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useIsFocused, useNavigation } from '@react-navigation/native';
import { useAuth } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';

import { colors } from '../constants/theme';
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
  const isFocused = useIsFocused();
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
    <View style={styles.root}>
      {isFocused ? <StatusBar style="light" /> : null}
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <Pressable
            style={styles.closeButton}
            onPress={() => navigation.goBack()}
            accessibilityLabel="Fermer l’édition du profil"
            hitSlop={8}
          >
            <Ionicons name="close" size={22} color={colors.white} />
          </Pressable>
          <Text style={styles.title}>
            {published ? 'Mon annonce' : 'Créer mon annonce'}
          </Text>
          <Text style={styles.subtitle}>Ce que les parents voient dans Découvrir</Text>
        </View>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            style={styles.flex}
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            automaticallyAdjustKeyboardInsets
            showsVerticalScrollIndicator={false}
          >
            <TutorProfileEditor />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
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
  },
  flex: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 14,
    alignItems: 'center',
    zIndex: 2,
    backgroundColor: '#111111',
  },
  closeButton: {
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
  content: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
});
