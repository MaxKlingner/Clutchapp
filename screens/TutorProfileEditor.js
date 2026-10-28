import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';

import {
  SPECIALTIES,
  STUDENT_LEVEL_GROUPS,
  STUDY_YEARS,
  TEACHING_FORMATS,
  taughtLevelGroupIds,
  taughtLevelsFromGroups,
} from '../lib/tutorConstants';
import { colors } from '../constants/theme';
import { resolveLocationQuery } from '../lib/geo';
import { fetchUserPlace } from '../lib/roles';
import {
  ensureTutorProfile,
  setTutorAvatarUrl,
  updateTutorProfile,
} from '../lib/supabase';

const BIO_MAX = 200;

function getInitials(name) {
  return String(name || '?')
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
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
  const [teachingFormats, setTeachingFormats] = useState([]);
  const [taughtLevels, setTaughtLevels] = useState([]);
  const [hourlyRate, setHourlyRate] = useState('');
  const [studyYear, setStudyYear] = useState('Master');
  const [city, setCity] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [latitude, setLatitude] = useState(null);
  const [longitude, setLongitude] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);

  const photoUri = photoPreview || user?.imageUrl || null;

  async function loadProfile() {
    if (!userId) return;

    setLoading(true);
    setError('');
    try {
      const defaultName =
        user?.fullName ||
        [user?.firstName, user?.lastName].filter(Boolean).join(' ') ||
        'Nouveau tuteur';

      const profile = await ensureTutorProfile({ clerkId: userId });

      if (!profile) {
        const place = await fetchUserPlace(userId);
        setFullName(defaultName === 'Nouveau tuteur' ? '' : defaultName);
        setBio('');
        setSpecialties([]);
        setTeachingFormats([]);
        setTaughtLevels([]);
        setHourlyRate('');
        setStudyYear('Master');
        setCity(place?.city || '');
        setPostalCode(place?.postalCode || '');
        setLatitude(place?.latitude ?? null);
        setLongitude(place?.longitude ?? null);
        setPhotoPreview(null);
        return;
      }

      setFullName(profile.name || defaultName);
      setBio(String(profile.bio || '').slice(0, BIO_MAX));
      setSpecialties(profile.specialties?.length ? profile.specialties : []);
      setTeachingFormats(
        profile.teachingFormats?.length ? profile.teachingFormats : []
      );
      setTaughtLevels(taughtLevelGroupIds(profile.taughtLevels));
      setHourlyRate(
        profile.hourlyRate > 0 ? String(profile.hourlyRate).replace('.', ',') : ''
      );
      setStudyYear(profile.studyYear || 'Master');
      setCity(profile.city || '');
      setPostalCode(profile.postalCode || '');
      setLatitude(profile.latitude ?? null);
      setLongitude(profile.longitude ?? null);
      setPhotoPreview(null);
      if (user?.imageUrl && user.imageUrl !== profile.avatarUrl) {
        setTutorAvatarUrl(userId, user.imageUrl).catch(() => {});
      }
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

  function toggleTaughtLevel(groupId) {
    setTaughtLevels((prev) =>
      prev.includes(groupId)
        ? prev.filter((item) => item !== groupId)
        : [...prev, groupId]
    );
  }

  function toggleTeachingFormat(label) {
    setTeachingFormats((prev) =>
      prev.includes(label) ? prev.filter((item) => item !== label) : [...prev, label]
    );
  }

  function applyResolvedLocation(query) {
    const resolved = resolveLocationQuery(query);
    if (!resolved) return false;
    setCity(resolved.name);
    if (resolved.postalCode) setPostalCode(resolved.postalCode);
    setLatitude(resolved.latitude);
    setLongitude(resolved.longitude);
    return true;
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
    if (!teachingFormats.length) {
      Alert.alert(
        'Formats de cours',
        'Choisis au moins un format : face à face ou à distance.'
      );
      return;
    }
    if (!city.trim()) {
      Alert.alert(
        'Ville requise',
        'Indique ta ville pour apparaître dans les filtres de proximité.'
      );
      return;
    }
    const rate = Number(String(hourlyRate).replace(',', '.'));
    if (!Number.isFinite(rate) || rate <= 0) {
      Alert.alert('Tarif horaire', 'Indique un tarif horaire en euros.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      let nextLat = latitude;
      let nextLng = longitude;
      let nextCity = city.trim();
      let nextPostal = postalCode.trim();

      const resolved = resolveLocationQuery(nextCity) || resolveLocationQuery(nextPostal);
      if (resolved) {
        nextCity = resolved.name;
        nextLat = resolved.latitude;
        nextLng = resolved.longitude;
        if (!nextPostal && resolved.postalCode) {
          nextPostal = resolved.postalCode;
        }
      }

      const updates = {
        fullName,
        bio: bio.slice(0, BIO_MAX),
        specialties,
        teachingFormats,
        hourlyRate: rate,
        studyYear,
        taughtLevels: taughtLevelsFromGroups(taughtLevels),
        city: nextCity,
        postalCode: nextPostal,
        latitude: nextLat,
        longitude: nextLng,
        avatarUrl: user?.imageUrl || null,
      };

      const saved = await updateTutorProfile(userId, updates);
      setCity(saved.city || nextCity);
      setPostalCode(saved.postalCode || nextPostal);
      setLatitude(saved.latitude ?? nextLat);
      setLongitude(saved.longitude ?? nextLng);
      setTeachingFormats(saved.teachingFormats || teachingFormats);
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

  function renderChips({ items, isActive, onPress }) {
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
              disabled={saving}
            >
              <Text style={[styles.chipLabel, active && styles.chipLabelOn]}>{label}</Text>
            </Pressable>
          );
        })}
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.loadingBox}>
        <ActivityIndicator color="#C7C7CC" />
        <Text style={styles.loadingText}>Chargement du profil…</Text>
      </View>
    );
  }

  return (
    <View>
      <Text style={styles.section}>Photo</Text>
      <View style={styles.card}>
        <View style={styles.avatarRow}>
          <View>
            {photoUri ? (
              <Image source={{ uri: photoUri }} style={styles.avatarImage} />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Text style={styles.avatarInitials}>{getInitials(fullName)}</Text>
              </View>
            )}
            <Pressable
              style={styles.editPhoto}
              onPress={onPickPhoto}
              disabled={saving}
              accessibilityLabel="Modifier la photo"
            >
              <Ionicons name="pencil" size={14} color={colors.white} />
            </Pressable>
          </View>
          <View style={styles.avatarActions}>
            <Pressable
              style={[styles.pill, styles.pillPrimary]}
              onPress={onPickPhoto}
              disabled={saving}
            >
              <Text style={[styles.pillLabel, styles.pillLabelPrimary]}>
                {photoUri ? 'Changer de photo' : 'Ajouter une photo'}
              </Text>
            </Pressable>
            <Text style={styles.photoHint}>
              C’est la même photo que celle de ton compte.
            </Text>
          </View>
        </View>
      </View>

      <Text style={styles.section}>Identité</Text>
      <View style={styles.card}>
        <Text style={styles.label}>Nom affiché</Text>
        <TextInput
          style={styles.input}
          value={fullName}
          onChangeText={setFullName}
          placeholder="Ton prénom et nom"
          placeholderTextColor="#8E8E93"
          keyboardAppearance="dark"
          editable={!saving}
        />
        <Text style={[styles.label, styles.labelSpaced]}>Biographie</Text>
        <TextInput
          style={[styles.input, styles.bioInput]}
          value={bio}
          onChangeText={(value) => setBio(value.slice(0, BIO_MAX))}
          placeholder="Présente-toi en quelques phrases…"
          placeholderTextColor="#8E8E93"
          keyboardAppearance="dark"
          multiline
          maxLength={BIO_MAX}
          textAlignVertical="top"
          editable={!saving}
        />
        <Text style={styles.counter}>
          {bio.length}/{BIO_MAX}
        </Text>
      </View>

      <Text style={styles.section}>Cours</Text>
      <View style={styles.card}>
        <Text style={styles.label}>Matières</Text>
        {renderChips({
          items: SPECIALTIES,
          isActive: (item) => specialties.includes(item),
          onPress: toggleSpecialty,
        })}
        <Text style={[styles.label, styles.labelSpaced]}>Formats</Text>
        {renderChips({
          items: TEACHING_FORMATS,
          isActive: (item) => teachingFormats.includes(item),
          onPress: toggleTeachingFormat,
        })}
        <Text style={[styles.label, styles.labelSpaced]}>Niveaux d’élèves</Text>
        {renderChips({
          items: STUDENT_LEVEL_GROUPS.map((group) => ({
            key: group.id,
            label: group.label,
            id: group.id,
          })),
          isActive: (item) => taughtLevels.includes(item.id),
          onPress: (item) => toggleTaughtLevel(item.id),
        })}
      </View>

      <Text style={styles.section}>Tarif horaire</Text>
      <View style={styles.card}>
        <View style={styles.rateField}>
          <TextInput
            style={[styles.input, styles.rateInput]}
            value={hourlyRate}
            onChangeText={setHourlyRate}
            placeholder="25"
            placeholderTextColor="#8E8E93"
            keyboardType="decimal-pad"
            keyboardAppearance="dark"
            editable={!saving}
          />
          <Text style={styles.rateSuffix}>€/h</Text>
        </View>
      </View>

      <Text style={styles.section}>Localisation</Text>
      <View style={styles.card}>
        <View style={styles.placeRow}>
          <View style={styles.placeCity}>
            <Text style={styles.label}>Ville</Text>
            <TextInput
              style={styles.input}
              value={city}
              onChangeText={setCity}
              onBlur={() => {
                if (city.trim()) applyResolvedLocation(city);
              }}
              placeholder="Ex. Louvain-la-Neuve"
              placeholderTextColor="#8E8E93"
              keyboardAppearance="dark"
              editable={!saving}
            />
          </View>
          <View style={styles.placePostal}>
            <Text style={styles.label}>Code postal</Text>
            <TextInput
              style={styles.input}
              value={postalCode}
              onChangeText={setPostalCode}
              onBlur={() => {
                if (postalCode.trim()) applyResolvedLocation(postalCode);
              }}
              placeholder="1348"
              placeholderTextColor="#8E8E93"
              keyboardType="number-pad"
              keyboardAppearance="dark"
              editable={!saving}
            />
          </View>
        </View>
      </View>

      <Text style={styles.section}>Ton parcours</Text>
      <View style={styles.card}>
        <Text style={styles.label}>Niveau d’études</Text>
        {renderChips({
          items: STUDY_YEARS,
          isActive: (item) => studyYear === item,
          onPress: setStudyYear,
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
          <Text style={styles.saveLabel}>Enregistrer l’annonce</Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  loadingBox: {
    backgroundColor: '#1C1C1E',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    padding: 28,
    marginTop: 8,
    alignItems: 'center',
    gap: 10,
  },
  loadingText: {
    color: '#A1A1A6',
    fontSize: 14,
  },
  section: {
    marginTop: 22,
    marginBottom: 8,
    marginLeft: 4,
    fontSize: 13,
    fontWeight: '700',
    color: '#8E8E93',
  },
  card: {
    backgroundColor: '#1C1C1E',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    padding: 14,
  },
  label: {
    marginBottom: 8,
    fontSize: 14,
    fontWeight: '700',
    color: '#E8E8E8',
  },
  labelSpaced: {
    marginTop: 16,
  },
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  avatarImage: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: '#2C2C2E',
  },
  avatarPlaceholder: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: '#2C2C2E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: {
    fontSize: 26,
    fontWeight: '800',
    color: colors.white,
  },
  editPhoto: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FF5A6A',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#1C1C1E',
  },
  avatarActions: {
    flex: 1,
    gap: 8,
    alignItems: 'flex-start',
  },
  pill: {
    backgroundColor: '#2C2C2E',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  pillPrimary: {
    backgroundColor: colors.white,
  },
  pillLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#E8E8E8',
  },
  pillLabelPrimary: {
    color: '#111111',
  },
  photoHint: {
    fontSize: 13,
    lineHeight: 18,
    color: '#8E8E93',
  },
  input: {
    backgroundColor: '#111111',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.white,
  },
  bioInput: {
    minHeight: 134,
    paddingTop: 12,
  },
  counter: {
    marginTop: 8,
    textAlign: 'right',
    fontSize: 12,
    fontWeight: '600',
    color: '#8E8E93',
  },
  placeRow: {
    flexDirection: 'row',
    gap: 10,
  },
  placeCity: {
    flex: 1.6,
  },
  placePostal: {
    flex: 1,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    borderRadius: 999,
    backgroundColor: '#2C2C2E',
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  chipOn: {
    backgroundColor: colors.white,
  },
  chipLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#E8E8E8',
  },
  chipLabelOn: {
    color: '#111111',
  },
  rateField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  rateInput: {
    flex: 1,
  },
  rateSuffix: {
    fontSize: 16,
    fontWeight: '700',
    color: '#E8E8E8',
  },
  error: {
    marginTop: 14,
    marginLeft: 4,
    fontSize: 14,
    fontWeight: '600',
    color: '#FF8A80',
  },
  saveButton: {
    marginTop: 24,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#1B6B45',
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: {
    opacity: 0.5,
  },
  saveLabel: {
    color: colors.white,
    fontSize: 16,
    fontWeight: '800',
  },
});
