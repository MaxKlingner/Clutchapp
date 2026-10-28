import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useIsFocused, useNavigation } from '@react-navigation/native';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';

import { colors } from '../constants/theme';
import { ABOUT_WORDS } from '../lib/tutorAbout';
import {
  formatRate,
  hasPublishedAnnouncement,
  initials,
  missingAnnouncementFields,
  PREVIEW_BIO_WORDS,
  previewBio,
  realSpecialties,
} from '../lib/tutorAnnouncement';
import { courseFormatLabel, taughtLevelGroupLabels } from '../lib/tutorConstants';
import { ensureTutorProfile } from '../lib/supabase';

function Section({ title, onPress, children, empty }) {
  return (
    <View style={styles.block}>
      <Pressable style={styles.blockHead} onPress={onPress} hitSlop={6}>
        <Text style={styles.blockTitle}>{title}</Text>
        <Ionicons name="pencil" size={16} color="#3DDC97" />
      </Pressable>
      <Pressable style={styles.blockCard} onPress={onPress}>
        {children || <Text style={styles.empty}>{empty || 'À compléter'}</Text>}
      </Pressable>
    </View>
  );
}

function Chips({ items }) {
  return (
    <View style={styles.chipWrap}>
      {items.map((item) => (
        <View key={item} style={styles.chip}>
          <Text style={styles.chipLabel}>{item}</Text>
        </View>
      ))}
    </View>
  );
}

export default function TutorAnnouncementScreen() {
  const navigation = useNavigation();
  const isFocused = useIsFocused();
  const { userId } = useAuth();
  const { user } = useUser();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [profile, setProfile] = useState(null);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      async function load() {
        if (!userId) return;
        setError('');
        try {
          const next = await ensureTutorProfile({ clerkId: userId });
          if (!cancelled) setProfile(next);
        } catch (err) {
          if (!cancelled) setError(err?.message ?? 'Impossible de charger ton annonce.');
        } finally {
          if (!cancelled) setLoading(false);
        }
      }
      load();
      return () => {
        cancelled = true;
      };
    }, [userId])
  );

  const subjects = realSpecialties(profile);
  const published = hasPublishedAnnouncement(profile);
  const photoUri = user?.imageUrl || profile?.avatarUrl || null;
  const levelLabels = taughtLevelGroupLabels(profile?.taughtLevels);
  const displayName =
    profile?.name && profile.name !== 'Tuteur'
      ? profile.name
      : user?.firstName || user?.fullName || 'Toi';
  const formatLine = courseFormatLabel(profile?.teachingFormats);
  const placeLine = [formatLine, profile?.city].filter(Boolean).join(' · ');
  const rateLine = formatRate(profile?.hourlyRate);
  const bio = profile?.bio?.trim() || '';
  const aboutTutor = profile?.aboutTutor?.trim() || '';
  const aboutCourse = profile?.aboutCourse?.trim() || '';

  function open(section) {
    navigation.navigate('EditTutorSection', { section });
  }

  function onPublish() {
    const missing = missingAnnouncementFields(profile);
    if (missing.length) {
      Alert.alert(
        'Encore un peu',
        `Il manque ${missing.join(', ')} pour publier.`
      );
      return;
    }
    navigation.goBack();
  }

  return (
    <View style={styles.root}>
      {isFocused ? <StatusBar style="light" /> : null}
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <Pressable
            style={styles.back}
            onPress={() => navigation.goBack()}
            accessibilityLabel="Retour"
            hitSlop={8}
          >
            <Ionicons name="chevron-back" size={22} color={colors.white} />
          </Pressable>
          <Text style={styles.title}>{published ? 'Mon annonce' : 'Créer mon annonce'}</Text>
        </View>

        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator color="#C7C7CC" />
          </View>
        ) : error ? (
          <View style={styles.centered}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
            <Pressable style={styles.hero} onPress={() => open('photo')}>
              <View>
                {photoUri ? (
                  <Image source={{ uri: photoUri }} style={styles.heroPhoto} />
                ) : (
                  <View style={styles.heroPhoto}>
                    <Text style={styles.heroInitials}>{initials(displayName)}</Text>
                  </View>
                )}
                <View style={styles.cameraBadge}>
                  <Ionicons name="camera" size={16} color={colors.white} />
                </View>
              </View>
              <Text style={styles.heroName}>{displayName}</Text>
              <Text style={styles.heroHint}>Touche pour changer la photo</Text>
            </Pressable>

            <Section title="Nom affiché" onPress={() => open('name')} empty="Ton prénom">
              {profile?.name && profile.name !== 'Tuteur' ? (
                <Text style={styles.body}>{profile.name}</Text>
              ) : null}
            </Section>

            <Section title="Matières" onPress={() => open('subjects')} empty="Choisis au moins une matière">
              {subjects.length ? <Chips items={subjects} /> : null}
            </Section>

            <Section title="Lieu des cours" onPress={() => open('place')} empty="Format et ville">
              {placeLine ? <Text style={styles.body}>{placeLine}</Text> : null}
            </Section>

            <Section title="Niveaux" onPress={() => open('levels')} empty="Primaire, secondaire…">
              {levelLabels.length ? <Chips items={levelLabels} /> : null}
            </Section>

            <Section title="Tarif" onPress={() => open('rate')} empty="Ton tarif horaire">
              {rateLine ? <Text style={styles.body}>{rateLine} €/h</Text> : null}
            </Section>

            <Section
              title="À propos de toi"
              onPress={() => open('about')}
              empty={`Ta présentation, ${PREVIEW_BIO_WORDS} mots max`}
            >
              {bio ? (
                <Text style={styles.bio} numberOfLines={3}>
                  {previewBio(bio)}
                </Text>
              ) : null}
            </Section>

            <Section
              title="À propos du tuteur"
              onPress={() => open('aboutTutor')}
              empty={`Qui tu es, ${ABOUT_WORDS} mots max`}
            >
              {aboutTutor ? (
                <Text style={styles.body} numberOfLines={4}>
                  {aboutTutor}
                </Text>
              ) : null}
            </Section>

            <Section
              title="À propos du cours"
              onPress={() => open('aboutCourse')}
              empty={`Comment se passe une séance, ${ABOUT_WORDS} mots max`}
            >
              {aboutCourse ? (
                <Text style={styles.body} numberOfLines={4}>
                  {aboutCourse}
                </Text>
              ) : null}
            </Section>
          </ScrollView>
        )}

        {!loading && !error ? (
          <View style={styles.footer}>
            <Pressable style={styles.publish} onPress={onPublish}>
              <Text style={styles.publishLabel}>
                {published ? 'Mettre à jour' : 'Publier'}
              </Text>
            </Pressable>
          </View>
        ) : null}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#111111' },
  safe: { flex: 1 },
  header: {
    minHeight: 56,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#111111',
  },
  back: {
    position: 'absolute',
    left: 12,
    top: 8,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2C2C2E',
    zIndex: 2,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.white,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  errorText: {
    textAlign: 'center',
    fontSize: 15,
    lineHeight: 22,
    color: '#FF8A80',
  },
  list: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 40,
  },
  hero: {
    alignItems: 'center',
    backgroundColor: '#1C1C1E',
    borderRadius: 28,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    paddingVertical: 24,
    marginBottom: 22,
  },
  heroPhoto: {
    width: 132,
    height: 132,
    borderRadius: 36,
    backgroundColor: '#2C2C2E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroInitials: { fontSize: 36, fontWeight: '800', color: colors.white },
  cameraBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1B6B45',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#1C1C1E',
  },
  heroName: {
    marginTop: 14,
    fontSize: 22,
    fontWeight: '800',
    color: colors.white,
  },
  heroHint: {
    marginTop: 4,
    fontSize: 13,
    color: '#8E8E93',
  },
  block: { marginBottom: 18 },
  blockHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    marginBottom: 8,
  },
  blockTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#8E8E93',
  },
  blockCard: {
    backgroundColor: '#1C1C1E',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    padding: 16,
    minHeight: 56,
    justifyContent: 'center',
  },
  body: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '600',
    color: '#E8E8E8',
  },
  bio: {
    fontSize: 15,
    lineHeight: 22,
    color: '#D4D4D4',
  },
  empty: {
    fontSize: 15,
    fontStyle: 'italic',
    color: '#8E8E93',
  },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderRadius: 999,
    backgroundColor: '#2C2C2E',
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  chipLabel: { fontSize: 14, fontWeight: '600', color: '#E8E8E8' },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 16,
    backgroundColor: '#111111',
  },
  publish: {
    height: 52,
    borderRadius: 26,
    backgroundColor: '#1B6B45',
    alignItems: 'center',
    justifyContent: 'center',
  },
  publishLabel: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.white,
  },
});
