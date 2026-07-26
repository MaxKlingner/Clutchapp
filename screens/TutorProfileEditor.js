import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  NativeModules,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';

import {
  HOURLY_RATES,
  SPECIALTIES,
  STUDY_YEARS,
} from '../lib/tutorConstants';
import {
  ensureTutorProfile,
  updateTutorProfile,
} from '../lib/supabase';

function getInitials(name) {
  return String(name || '?')
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function isLocalUri(uri) {
  if (!uri) return false;
  return (
    uri.startsWith('file:') ||
    uri.startsWith('content:') ||
    uri.startsWith('ph:') ||
    uri.startsWith('assets-library:')
  );
}

function isRemoteUri(uri) {
  if (!uri) return false;
  return /^https?:\/\//i.test(uri);
}

/** Ne crash pas si le binaire natif n’a pas encore expo-image-picker. */
function getImagePicker() {
  const native =
    NativeModules.ExponentImagePicker || NativeModules.ExpoImagePicker;
  if (!native) return null;
  try {
    // require synchrone — lève si le module natif est absent
    return require('expo-image-picker');
  } catch {
    return null;
  }
}

export default function TutorProfileEditor() {
  const { userId } = useAuth();
  const { user } = useUser();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [fullName, setFullName] = useState('');
  const [bio, setBio] = useState('');
  const [specialties, setSpecialties] = useState([]);
  const [hourlyRate, setHourlyRate] = useState(25);
  const [studyYear, setStudyYear] = useState('Master 1');
  const [avatarUri, setAvatarUri] = useState(null);
  const [avatarRemoved, setAvatarRemoved] = useState(false);
  const [avatarUrlDraft, setAvatarUrlDraft] = useState('');

  const clerkImageUrl = user?.imageUrl || null;
  const imagePickerAvailable = Boolean(
    NativeModules.ExponentImagePicker || NativeModules.ExpoImagePicker
  );

  async function loadProfile() {
    if (!userId) return;

    setLoading(true);
    setError('');
    try {
      const defaultName =
        user?.fullName ||
        [user?.firstName, user?.lastName].filter(Boolean).join(' ') ||
        'Nouveau tuteur';

      const profile = await ensureTutorProfile({
        clerkId: userId,
        fullName: defaultName,
      });

      setFullName(profile.name || defaultName);
      setBio(profile.bio || '');
      setSpecialties(profile.specialties?.length ? profile.specialties : []);
      setHourlyRate(profile.hourlyRate || 25);
      setStudyYear(profile.studyYear || 'Master 1');
      setAvatarUri(profile.avatarUrl || null);
      setAvatarUrlDraft('');
      setAvatarRemoved(false);
    } catch (err) {
      setError(err?.message ?? 'Impossible de charger le profil.');
    } finally {
      setLoading(false);
    }
  }

  useFocusEffect(
    useCallback(() => {
      loadProfile();
    }, [userId])
  );

  function toggleSpecialty(label) {
    setSpecialties((prev) =>
      prev.includes(label)
        ? prev.filter((item) => item !== label)
        : [...prev, label]
    );
  }

  async function pickAvatarFromGallery() {
    if (saving) return;

    const ImagePicker = getImagePicker();
    if (!ImagePicker) {
      Alert.alert(
        'Galerie indisponible',
        'Ton app native ne contient pas encore le module photo. Utilise « Photo du compte » ou colle une URL d’image. Pour la galerie : rebuild le Dev Client (eas build --profile development).'
      );
      return;
    }

    try {
      const permission =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          'Permission requise',
          'Autorise l’accès à tes photos pour ajouter une photo de profil.'
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (result.canceled || !result.assets?.[0]?.uri) return;

      setAvatarUri(result.assets[0].uri);
      setAvatarRemoved(false);
      setAvatarUrlDraft('');
    } catch (err) {
      Alert.alert(
        'Galerie indisponible',
        err?.message ||
          'Impossible d’ouvrir la galerie. Utilise la photo du compte ou une URL.'
      );
    }
  }

  function useClerkPhoto() {
    if (!clerkImageUrl) {
      Alert.alert(
        'Pas de photo compte',
        'Ton compte Clerk n’a pas encore de photo de profil.'
      );
      return;
    }
    setAvatarUri(clerkImageUrl);
    setAvatarRemoved(false);
    setAvatarUrlDraft('');
  }

  function applyAvatarUrl() {
    const url = avatarUrlDraft.trim();
    if (!isRemoteUri(url)) {
      Alert.alert(
        'URL invalide',
        'Colle une adresse d’image qui commence par https://'
      );
      return;
    }
    setAvatarUri(url);
    setAvatarRemoved(false);
  }

  function removeAvatar() {
    setAvatarUri(null);
    setAvatarRemoved(true);
    setAvatarUrlDraft('');
  }

  async function onSave() {
    if (!userId || saving) return;

    if (!fullName.trim()) {
      Alert.alert('Nom requis', 'Indique ton nom affiché aux parents.');
      return;
    }
    if (!specialties.length) {
      Alert.alert(
        'Spécialités',
        'Choisis au moins une matière pour apparaître dans le swipe.'
      );
      return;
    }

    setSaving(true);
    setError('');
    try {
      const updates = {
        fullName,
        bio,
        specialties,
        hourlyRate,
        studyYear,
      };

      if (avatarRemoved) {
        updates.avatarUrl = null;
      } else if (avatarUri && isLocalUri(avatarUri)) {
        updates.localAvatarUri = avatarUri;
      } else if (avatarUri && isRemoteUri(avatarUri)) {
        // Photo Clerk / URL : on stocke l’URL directement
        updates.avatarUrl = avatarUri;
      }

      const saved = await updateTutorProfile(userId, updates);
      setAvatarUri(saved.avatarUrl || null);
      setAvatarRemoved(false);
      setAvatarUrlDraft('');
      Alert.alert(
        'Profil sauvegardé',
        'Tes infos sont visibles dans le swipe des parents.'
      );
    } catch (err) {
      setError(err?.message ?? 'Sauvegarde impossible.');
      Alert.alert('Erreur', err?.message ?? 'Sauvegarde impossible.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.loadingBox}>
        <ActivityIndicator size="large" color="#1B5E3B" />
        <Text style={styles.loadingText}>Chargement du profil…</Text>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <Text style={styles.eyebrow}>Profil tuteur</Text>
      <Text style={styles.hint}>
        Ces infos apparaissent dans le flux Swipe des parents.
      </Text>

      <Text style={styles.label}>Photo de profil</Text>
      <View style={styles.avatarRow}>
        <Pressable
          style={styles.avatarButton}
          onPress={
            imagePickerAvailable ? pickAvatarFromGallery : useClerkPhoto
          }
          disabled={saving}
          accessibilityLabel="Choisir une photo de profil"
        >
          {avatarUri ? (
            <Image source={{ uri: avatarUri }} style={styles.avatarImage} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarInitials}>{getInitials(fullName)}</Text>
            </View>
          )}
          <View style={styles.avatarCamBadge}>
            <Ionicons name="camera" size={14} color="#FFFFFF" />
          </View>
        </Pressable>
        <View style={styles.avatarActions}>
          {imagePickerAvailable ? (
            <Pressable
              style={styles.avatarActionBtn}
              onPress={pickAvatarFromGallery}
              disabled={saving}
            >
              <Text style={styles.avatarActionLabel}>
                {avatarUri ? 'Choisir depuis la galerie' : 'Ajouter une photo'}
              </Text>
            </Pressable>
          ) : null}
          <Pressable
            style={[
              styles.avatarActionBtn,
              !imagePickerAvailable && styles.avatarActionBtnPrimary,
              imagePickerAvailable && styles.avatarActionBtnSecondary,
            ]}
            onPress={useClerkPhoto}
            disabled={saving || !clerkImageUrl}
          >
            <Text
              style={[
                styles.avatarActionLabel,
                imagePickerAvailable && styles.avatarActionLabelDark,
              ]}
            >
              Photo du compte
            </Text>
          </Pressable>
          {avatarUri ? (
            <Pressable
              style={styles.avatarRemoveBtn}
              onPress={removeAvatar}
              disabled={saving}
            >
              <Text style={styles.avatarRemoveLabel}>Retirer</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      {!imagePickerAvailable ? (
        <Text style={styles.fallbackHint}>
          Galerie native indisponible sur ce build. Utilise la photo du compte,
          ou colle une URL ci-dessous. (Rebuild Dev Client pour la galerie.)
        </Text>
      ) : null}

      <TextInput
        style={styles.input}
        value={avatarUrlDraft}
        onChangeText={setAvatarUrlDraft}
        placeholder="Coller une URL d’image (https://…)"
        placeholderTextColor="#7A9185"
        autoCapitalize="none"
        autoCorrect={false}
        editable={!saving}
      />
      <Pressable
        style={[styles.urlApplyBtn, saving && styles.disabled]}
        onPress={applyAvatarUrl}
        disabled={saving}
      >
        <Text style={styles.urlApplyLabel}>Utiliser cette URL</Text>
      </Pressable>

      <Text style={styles.label}>Nom affiché</Text>
      <TextInput
        style={styles.input}
        value={fullName}
        onChangeText={setFullName}
        placeholder="Ton prénom et nom"
        placeholderTextColor="#7A9185"
        editable={!saving}
      />

      <Text style={styles.label}>Spécialités</Text>
      <View style={styles.chipWrap}>
        {SPECIALTIES.map((item) => {
          const active = specialties.includes(item);
          return (
            <Pressable
              key={item}
              style={[styles.chip, active && styles.chipActive]}
              onPress={() => toggleSpecialty(item)}
              disabled={saving}
            >
              <Text
                style={[styles.chipLabel, active && styles.chipLabelActive]}
              >
                {item}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.label}>Biographie</Text>
      <TextInput
        style={[styles.input, styles.bioInput]}
        value={bio}
        onChangeText={setBio}
        placeholder="Présente-toi en quelques phrases…"
        placeholderTextColor="#7A9185"
        multiline
        textAlignVertical="top"
        editable={!saving}
      />

      <Text style={styles.label}>Tarif horaire (€/h)</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.rateRow}
      >
        {HOURLY_RATES.map((rate) => {
          const active = hourlyRate === rate;
          return (
            <Pressable
              key={rate}
              style={[styles.rateChip, active && styles.rateChipActive]}
              onPress={() => setHourlyRate(rate)}
              disabled={saving}
            >
              <Text
                style={[
                  styles.rateChipLabel,
                  active && styles.rateChipLabelActive,
                ]}
              >
                {rate} €
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <Text style={styles.label}>Année d’étude</Text>
      <View style={styles.chipWrap}>
        {STUDY_YEARS.map((year) => {
          const active = studyYear === year;
          return (
            <Pressable
              key={year}
              style={[styles.chip, active && styles.chipActive]}
              onPress={() => setStudyYear(year)}
              disabled={saving}
            >
              <Text
                style={[styles.chipLabel, active && styles.chipLabelActive]}
              >
                {year}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable
        style={[styles.saveButton, saving && styles.disabled]}
        onPress={onSave}
        disabled={saving}
      >
        {saving ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={styles.saveLabel}>Sauvegarder le profil</Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  loadingBox: {
    backgroundColor: '#E8F5EE',
    borderRadius: 20,
    padding: 24,
    borderWidth: 2,
    borderColor: '#1B5E3B',
    marginBottom: 24,
    alignItems: 'center',
    gap: 10,
  },
  loadingText: {
    color: '#1B5E3B',
    fontSize: 14,
  },
  card: {
    backgroundColor: '#E8F5EE',
    borderRadius: 20,
    padding: 20,
    borderWidth: 2,
    borderColor: '#1B5E3B',
    marginBottom: 24,
  },
  eyebrow: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1,
    color: '#1B5E3B',
    textTransform: 'uppercase',
  },
  hint: {
    marginTop: 8,
    marginBottom: 14,
    fontSize: 14,
    lineHeight: 20,
    color: '#3D5C4C',
  },
  label: {
    marginTop: 10,
    marginBottom: 8,
    fontSize: 14,
    fontWeight: '700',
    color: '#10261C',
  },
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 6,
  },
  avatarButton: {
    width: 84,
    height: 84,
    borderRadius: 42,
    position: 'relative',
  },
  avatarImage: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: '#D8F5E9',
  },
  avatarPlaceholder: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: '#D8F5E9',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  avatarInitials: {
    fontSize: 26,
    fontWeight: '800',
    color: '#1B5E3B',
  },
  avatarCamBadge: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#1B5E3B',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  avatarActions: {
    flex: 1,
    gap: 8,
  },
  avatarActionBtn: {
    alignSelf: 'flex-start',
    backgroundColor: '#1B5E3B',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  avatarActionBtnPrimary: {
    backgroundColor: '#1B5E3B',
  },
  avatarActionBtnSecondary: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#1B5E3B',
  },
  avatarActionLabel: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  avatarActionLabelDark: {
    color: '#1B5E3B',
  },
  avatarRemoveBtn: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  avatarRemoveLabel: {
    color: '#7A9185',
    fontSize: 13,
    fontWeight: '600',
  },
  fallbackHint: {
    marginBottom: 10,
    fontSize: 12,
    lineHeight: 18,
    color: '#7A4E00',
  },
  urlApplyBtn: {
    alignSelf: 'flex-start',
    marginTop: 8,
    marginBottom: 4,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#1B5E3B',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  urlApplyLabel: {
    color: '#1B5E3B',
    fontSize: 13,
    fontWeight: '700',
  },
  input: {
    borderWidth: 1,
    borderColor: '#B7D2C3',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: '#10261C',
  },
  bioInput: {
    minHeight: 100,
    paddingTop: 12,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#B7D2C3',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipActive: {
    backgroundColor: '#1B5E3B',
    borderColor: '#1B5E3B',
  },
  chipLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1B5E3B',
  },
  chipLabelActive: {
    color: '#FFFFFF',
  },
  rateRow: {
    gap: 8,
    paddingBottom: 4,
  },
  rateChip: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#B7D2C3',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  rateChipActive: {
    backgroundColor: '#1B5E3B',
    borderColor: '#1B5E3B',
  },
  rateChipLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1B5E3B',
  },
  rateChipLabelActive: {
    color: '#FFFFFF',
  },
  error: {
    marginTop: 12,
    color: '#C0392B',
    fontSize: 14,
  },
  saveButton: {
    marginTop: 18,
    backgroundColor: '#1B5E3B',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  disabled: {
    opacity: 0.7,
  },
  saveLabel: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
