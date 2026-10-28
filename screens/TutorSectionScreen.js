import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useIsFocused, useNavigation, useRoute } from '@react-navigation/native';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import * as ImagePicker from 'expo-image-picker';

import { colors } from '../constants/theme';
import { resolveLocationQuery } from '../lib/geo';
import { fetchUserPlace } from '../lib/roles';
import { ABOUT_WORDS } from '../lib/tutorAbout';
import {
  announcementUpdates,
  clipToMaxWords,
  countWords,
  initials,
  PREVIEW_BIO_WORDS,
} from '../lib/tutorAnnouncement';
import {
  SPECIALTIES,
  STUDENT_LEVEL_GROUPS,
  TEACHING_FORMATS,
  taughtLevelGroupIds,
  taughtLevelsFromGroups,
} from '../lib/tutorConstants';
import {
  ensureTutorProfile,
  setTutorAvatarUrl,
  updateTutorProfile,
} from '../lib/supabase';

const COPY = {
  photo: {
    title: 'Photo',
    lead: 'C’est la même photo que celle de ton compte. Les parents la voient en premier.',
  },
  name: {
    title: 'Nom affiché',
    lead: 'Ton prénom suffit. C’est ce qui apparaît sous ta photo.',
  },
  subjects: {
    title: 'Matières',
    lead: 'Choisis ce que tu enseignes vraiment. Une matière publie ton annonce.',
  },
  place: {
    title: 'Lieu des cours',
    lead: 'Où tu donnes cours, et depuis quelle ville. Pas de rayon ni de packs : juste l’essentiel.',
  },
  levels: {
    title: 'Niveaux',
    lead: 'Les mêmes groupes que le filtre des parents.',
  },
  rate: {
    title: 'Tarif',
    lead: 'Un tarif horaire, affiché tel quel. Pas de palier caché.',
  },
  about: {
    title: 'À propos de toi',
    lead: `C’est le texte de ta fiche dans Découvrir. ${PREVIEW_BIO_WORDS} mots, pas plus.`,
  },
  aboutTutor: {
    title: 'À propos du tuteur',
    lead: `Qui tu es, au-delà de la fiche Découvrir. ${ABOUT_WORDS} mots, à la première personne.`,
  },
  aboutCourse: {
    title: 'À propos du cours',
    lead: `Comment se passe une séance, concrètement. ${ABOUT_WORDS} mots, pas plus.`,
  },
};

function Chips({ items, isActive, onPress }) {
  return (
    <View style={styles.chipWrap}>
      {items.map((item) => {
        const key = typeof item === 'object' ? item.key : item;
        const label = typeof item === 'object' ? item.label : item;
        const active = isActive(item);
        return (
          <Pressable
            key={key}
            style={[styles.chip, active && styles.chipOn]}
            onPress={() => onPress(item)}
          >
            <Text style={[styles.chipLabel, active && styles.chipLabelOn]}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function toggle(list, value) {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

export default function TutorSectionScreen() {
  const navigation = useNavigation();
  const isFocused = useIsFocused();
  const { section = 'name' } = useRoute().params || {};
  const { userId } = useAuth();
  const { user } = useUser();
  const copy = COPY[section] || COPY.name;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState(null);
  const [fullName, setFullName] = useState('');
  const [bio, setBio] = useState('');
  const [aboutTutor, setAboutTutor] = useState('');
  const [aboutCourse, setAboutCourse] = useState('');
  const [specialties, setSpecialties] = useState([]);
  const [teachingFormats, setTeachingFormats] = useState([]);
  const [taughtLevels, setTaughtLevels] = useState([]);
  const [hourlyRate, setHourlyRate] = useState('');
  const [city, setCity] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [photoPreview, setPhotoPreview] = useState(null);

  const photoUri = photoPreview || user?.imageUrl || profile?.avatarUrl || null;
  const displayName =
    fullName.trim() ||
    user?.firstName ||
    user?.fullName ||
    'Toi';

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const next = await ensureTutorProfile({ clerkId: userId });
      const clerkName =
        user?.fullName ||
        [user?.firstName, user?.lastName].filter(Boolean).join(' ') ||
        '';
      setProfile(next);
      setFullName(next?.name && next.name !== 'Tuteur' ? next.name : clerkName);
      setBio(clipToMaxWords(next?.bio || '', PREVIEW_BIO_WORDS));
      setAboutTutor(clipToMaxWords(next?.aboutTutor || '', ABOUT_WORDS));
      setAboutCourse(clipToMaxWords(next?.aboutCourse || '', ABOUT_WORDS));
      setSpecialties(next ? (next.specialties || []).filter((item) => item && item.toLowerCase() !== 'matière') : []);
      setTeachingFormats(next?.teachingFormats || []);
      setTaughtLevels(taughtLevelGroupIds(next?.taughtLevels));
      setHourlyRate(next?.hourlyRate > 0 ? String(next.hourlyRate).replace('.', ',') : '');
      if (next?.city) {
        setCity(next.city);
        setPostalCode(next.postalCode || '');
      } else {
        const place = await fetchUserPlace(userId).catch(() => null);
        setCity(place?.city || '');
        setPostalCode(place?.postalCode || '');
      }
      setPhotoPreview(null);
      if (user?.imageUrl && next && user.imageUrl !== next.avatarUrl) {
        setTutorAvatarUrl(userId, user.imageUrl).catch(() => {});
      }
    } catch (err) {
      Alert.alert('Annonce', err?.message ?? 'Impossible de charger cette partie.');
    } finally {
      setLoading(false);
    }
  }, [userId, user?.fullName, user?.firstName, user?.lastName, user?.imageUrl]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function save(patch) {
    if (!userId || saving) return false;
    setSaving(true);
    try {
      const saved = await updateTutorProfile(userId, announcementUpdates(profile, patch));
      setProfile(saved);
      return true;
    } catch (err) {
      Alert.alert('Annonce', err?.message ?? 'Impossible d’enregistrer.');
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function onSave() {
    Keyboard.dismiss();
    let patch = {};
    if (section === 'name') {
      if (!fullName.trim()) {
        Alert.alert('Nom', 'Indique le nom que les parents voient.');
        return;
      }
      patch = { fullName: fullName.trim() };
    } else if (section === 'subjects') {
      if (!specialties.length) {
        Alert.alert('Matières', 'Choisis au moins une matière pour publier ton annonce.');
        return;
      }
      patch = { specialties };
    } else if (section === 'place') {
      if (!teachingFormats.length) {
        Alert.alert('Lieu des cours', 'Choisis au moins un format : face à face ou à distance.');
        return;
      }
      if (!city.trim()) {
        Alert.alert('Ville', 'Indique ta ville pour apparaître près des parents.');
        return;
      }
      let nextCity = city.trim();
      let nextPostal = postalCode.trim();
      let nextLat = profile?.latitude ?? null;
      let nextLng = profile?.longitude ?? null;
      const resolved = resolveLocationQuery(nextCity) || resolveLocationQuery(nextPostal);
      if (resolved) {
        nextCity = resolved.name;
        nextLat = resolved.latitude;
        nextLng = resolved.longitude;
        if (!nextPostal && resolved.postalCode) nextPostal = resolved.postalCode;
      }
      patch = {
        teachingFormats,
        city: nextCity,
        postalCode: nextPostal,
        latitude: nextLat,
        longitude: nextLng,
      };
    } else if (section === 'levels') {
      patch = { taughtLevels: taughtLevelsFromGroups(taughtLevels) };
    } else if (section === 'rate') {
      const rate = Number(String(hourlyRate).replace(',', '.'));
      if (!Number.isFinite(rate) || rate <= 0) {
        Alert.alert('Tarif', 'Indique un tarif horaire en euros.');
        return;
      }
      patch = { hourlyRate: rate };
    } else if (section === 'about') {
      patch = { bio: clipToMaxWords(bio, PREVIEW_BIO_WORDS) };
    } else if (section === 'aboutTutor') {
      patch = { aboutTutor: clipToMaxWords(aboutTutor, ABOUT_WORDS) };
    } else if (section === 'aboutCourse') {
      patch = { aboutCourse: clipToMaxWords(aboutCourse, ABOUT_WORDS) };
    }

    const ok = await save({
      ...patch,
      avatarUrl: user?.imageUrl || profile?.avatarUrl || null,
    });
    if (ok) navigation.goBack();
  }

  function onPickPhoto() {
    if (saving || !user) return;
    Alert.alert('Photo de profil', 'D’où vient la photo ?', [
      { text: 'Prendre une photo', onPress: () => capturePhoto('camera') },
      { text: 'Choisir dans la galerie', onPress: () => capturePhoto('library') },
      { text: 'Annuler', style: 'cancel' },
    ]);
  }

  async function capturePhoto(source) {
    if (saving || !user) return;
    try {
      const permission =
        source === 'camera'
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          'Accès refusé',
          source === 'camera'
            ? 'Autorise l’appareil photo pour prendre ta photo de profil.'
            : 'Autorise la galerie pour choisir ta photo de profil.',
          [
            { text: 'Plus tard', style: 'cancel' },
            { text: 'Ouvrir les réglages', onPress: () => Linking.openSettings() },
          ]
        );
        return;
      }
      const options = {
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
        base64: true,
      };
      const result =
        source === 'camera'
          ? await ImagePicker.launchCameraAsync(options)
          : await ImagePicker.launchImageLibraryAsync(options);
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      setPhotoPreview(asset.uri);
      const file = asset.base64 ? `data:image/jpeg;base64,${asset.base64}` : asset.uri;
      await user.setProfileImage({ file });
      await user.reload();
      setPhotoPreview(null);
      if (userId) await setTutorAvatarUrl(userId, user.imageUrl || null);
    } catch (err) {
      Alert.alert(
        'Photo',
        err?.errors?.[0]?.message || err?.message || 'Impossible d’enregistrer la photo.'
      );
    }
  }

  function body() {
    if (section === 'photo') {
      return (
        <View style={styles.photoPage}>
          <Pressable onPress={onPickPhoto} accessibilityLabel="Modifier la photo">
            {photoUri ? (
              <Image source={{ uri: photoUri }} style={styles.heroPhoto} />
            ) : (
              <View style={styles.heroPhoto}>
                <Text style={styles.heroInitials}>{initials(displayName)}</Text>
              </View>
            )}
            <View style={styles.cameraBadge}>
              <Ionicons name="camera" size={18} color={colors.white} />
            </View>
          </Pressable>
          <Text style={styles.heroName}>{displayName}</Text>
          <Pressable style={styles.save} onPress={onPickPhoto} disabled={saving}>
            <Text style={styles.saveLabel}>{photoUri ? 'Changer de photo' : 'Ajouter une photo'}</Text>
          </Pressable>
        </View>
      );
    }

    if (section === 'name') {
      return (
        <TextInput
          style={styles.input}
          value={fullName}
          onChangeText={setFullName}
          placeholder="Ton prénom"
          placeholderTextColor="#8E8E93"
          keyboardAppearance="dark"
          autoCapitalize="words"
          returnKeyType="done"
          onSubmitEditing={Keyboard.dismiss}
        />
      );
    }

    if (section === 'subjects') {
      return (
        <Chips
          items={SPECIALTIES}
          isActive={(item) => specialties.includes(item)}
          onPress={(item) => setSpecialties((prev) => toggle(prev, item))}
        />
      );
    }

    if (section === 'place') {
      return (
        <>
          <Text style={styles.label}>Format</Text>
          <Chips
            items={TEACHING_FORMATS}
            isActive={(item) => teachingFormats.includes(item)}
            onPress={(item) => setTeachingFormats((prev) => toggle(prev, item))}
          />
          <Text style={[styles.label, styles.labelSpaced]}>Ville</Text>
          <TextInput
            style={styles.input}
            value={city}
            onChangeText={setCity}
            onBlur={() => {
              if (city.trim()) {
                const resolved = resolveLocationQuery(city);
                if (resolved) {
                  setCity(resolved.name);
                  if (resolved.postalCode) setPostalCode(resolved.postalCode);
                }
              }
            }}
            placeholder="Ex. Louvain-la-Neuve"
            placeholderTextColor="#8E8E93"
            keyboardAppearance="dark"
            returnKeyType="done"
            onSubmitEditing={Keyboard.dismiss}
          />
          <Text style={[styles.label, styles.labelSpaced]}>Code postal</Text>
          <TextInput
            style={styles.input}
            value={postalCode}
            onChangeText={setPostalCode}
            placeholder="1348"
            placeholderTextColor="#8E8E93"
            keyboardType="number-pad"
            keyboardAppearance="dark"
            returnKeyType="done"
            onSubmitEditing={Keyboard.dismiss}
          />
        </>
      );
    }

    if (section === 'levels') {
      return (
        <Chips
          items={STUDENT_LEVEL_GROUPS.map((group) => ({
            key: group.id,
            label: group.label,
            id: group.id,
          }))}
          isActive={(item) => taughtLevels.includes(item.id)}
          onPress={(item) => setTaughtLevels((prev) => toggle(prev, item.id))}
        />
      );
    }

    if (section === 'rate') {
      return (
        <View style={styles.rateField}>
          <TextInput
            style={[styles.input, styles.rateInput]}
            value={hourlyRate}
            onChangeText={setHourlyRate}
            placeholder="25"
            placeholderTextColor="#8E8E93"
            keyboardType="decimal-pad"
            keyboardAppearance="dark"
            returnKeyType="done"
            onSubmitEditing={Keyboard.dismiss}
          />
          <Text style={styles.rateSuffix}>€/h</Text>
        </View>
      );
    }

    if (section === 'about') {
      const words = countWords(bio);
      return (
        <>
          <TextInput
            style={[styles.input, styles.bioInput]}
            value={bio}
            onChangeText={(value) => setBio(clipToMaxWords(value, PREVIEW_BIO_WORDS))}
            placeholder="Ta façon de donner cours, en quelques phrases."
            placeholderTextColor="#8E8E93"
            keyboardAppearance="dark"
            multiline
            textAlignVertical="top"
          />
          <Text style={styles.counter}>
            {words}/{PREVIEW_BIO_WORDS} mots
          </Text>
        </>
      );
    }

    if (section === 'aboutTutor' || section === 'aboutCourse') {
      const value = section === 'aboutTutor' ? aboutTutor : aboutCourse;
      const setValue = section === 'aboutTutor' ? setAboutTutor : setAboutCourse;
      const placeholder =
        section === 'aboutTutor'
          ? 'Qui tu es, ce que tu as déjà vécu avec des élèves…'
          : 'Comment se passe une séance, concrètement…';
      return (
        <>
          <TextInput
            style={[styles.input, styles.bioInput]}
            value={value}
            onChangeText={(next) => setValue(clipToMaxWords(next, ABOUT_WORDS))}
            placeholder={placeholder}
            placeholderTextColor="#8E8E93"
            keyboardAppearance="dark"
            multiline
            textAlignVertical="top"
          />
          <Text style={styles.counter}>
            {countWords(value)}/{ABOUT_WORDS} mots
          </Text>
        </>
      );
    }

    return null;
  }

  return (
    <View style={styles.root}>
      {isFocused ? <StatusBar style="light" /> : null}
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <Pressable
            style={styles.back}
            onPress={() => navigation.goBack()}
            accessibilityLabel="Retour"
            hitSlop={8}
          >
            <Ionicons name="chevron-back" size={22} color={colors.white} />
          </Pressable>
          <Text style={styles.title}>{copy.title}</Text>
        </View>

        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator color="#C7C7CC" />
          </View>
        ) : (
          <KeyboardAvoidingView
            style={styles.flex}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={8}
          >
            <ScrollView
              style={styles.flex}
              contentContainerStyle={styles.page}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
              showsVerticalScrollIndicator={false}
            >
              <Pressable onPress={Keyboard.dismiss}>
                <Text style={styles.lead}>{copy.lead}</Text>
              </Pressable>
              {body()}
            </ScrollView>
            {section !== 'photo' ? (
              <SafeAreaView edges={['bottom']} style={styles.footer}>
                <Pressable
                  style={[styles.save, saving && styles.disabled]}
                  onPress={onSave}
                  disabled={saving}
                >
                  {saving ? (
                    <ActivityIndicator color={colors.white} />
                  ) : (
                    <Text style={styles.saveLabel}>Enregistrer</Text>
                  )}
                </Pressable>
              </SafeAreaView>
            ) : null}
          </KeyboardAvoidingView>
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#111111' },
  safe: { flex: 1 },
  flex: { flex: 1 },
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
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.white,
  },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  page: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 24, flexGrow: 1 },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 8,
    backgroundColor: '#111111',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#2A2A2A',
  },
  lead: {
    fontSize: 16,
    lineHeight: 22,
    color: '#C7C7CC',
    marginBottom: 22,
  },
  label: {
    marginBottom: 10,
    fontSize: 14,
    fontWeight: '700',
    color: '#E8E8E8',
  },
  labelSpaced: { marginTop: 20 },
  previewLabel: {
    marginBottom: 8,
    fontSize: 13,
    fontWeight: '700',
    color: '#8E8E93',
  },
  previewCard: {
    backgroundColor: '#1C1C1E',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    padding: 16,
  },
  previewBio: {
    fontSize: 15,
    lineHeight: 22,
    color: '#D4D4D4',
  },
  input: {
    backgroundColor: '#1C1C1E',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    paddingHorizontal: 16,
    paddingVertical: 16,
    fontSize: 16,
    fontWeight: '600',
    color: colors.white,
  },
  bioInput: { minHeight: 160, paddingTop: 16 },
  counter: {
    marginTop: 8,
    textAlign: 'right',
    fontSize: 12,
    fontWeight: '600',
    color: '#8E8E93',
  },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderRadius: 999,
    backgroundColor: '#1C1C1E',
    borderWidth: 1,
    borderColor: '#2A2A2A',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  chipOn: { backgroundColor: colors.white, borderColor: colors.white },
  chipLabel: { fontSize: 14, fontWeight: '700', color: '#E8E8E8' },
  chipLabelOn: { color: '#111111' },
  rateField: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rateInput: { flex: 1 },
  rateSuffix: { fontSize: 16, fontWeight: '700', color: '#E8E8E8' },
  photoPage: { alignItems: 'center', paddingTop: 12 },
  heroPhoto: {
    width: 168,
    height: 168,
    borderRadius: 40,
    backgroundColor: '#2C2C2E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroInitials: { fontSize: 42, fontWeight: '800', color: colors.white },
  cameraBadge: {
    position: 'absolute',
    right: 6,
    bottom: 6,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1B6B45',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#111111',
  },
  heroName: {
    marginTop: 16,
    fontSize: 22,
    fontWeight: '800',
    color: colors.white,
  },
  save: {
    height: 52,
    borderRadius: 26,
    backgroundColor: '#1B6B45',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
  },
  saveLabel: { fontSize: 16, fontWeight: '800', color: colors.white },
  disabled: { opacity: 0.6 },
});
